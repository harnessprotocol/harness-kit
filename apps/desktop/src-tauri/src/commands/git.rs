use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

pub use super::types::FileDiffEntry;

// ── Types ───────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoInfo {
    pub is_git_repo: bool,
    pub current_commit: Option<String>,
    pub branch: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeResult {
    pub panel_id: String,
    pub worktree_path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub local_sha: String,
    pub remote_sha: String,
    pub commits_behind: u32,
    pub up_to_date: bool,
    /// Human-readable error if the check failed (e.g. no network, not a git repo)
    pub error: Option<String>,
}

// ── Commands ────────────────────────────────────────────────

#[tauri::command]
pub async fn check_git_repo(app: AppHandle, dir: String) -> Result<GitRepoInfo, String> {
    let shell = app.shell();

    // Check if inside a git repo
    let is_git = shell.command("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(&dir)
        .output()
        .await;

    match is_git {
        Ok(out) if out.status.success() => {}
        _ => return Ok(GitRepoInfo { is_git_repo: false, current_commit: None, branch: None }),
    }

    // Get current commit
    let commit_out = shell.command("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(&dir)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let current_commit = if commit_out.status.success() {
        Some(String::from_utf8_lossy(&commit_out.stdout).trim().to_string())
    } else {
        None
    };

    // Get current branch
    let branch_out = shell.command("git")
        .args(["branch", "--show-current"])
        .current_dir(&dir)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let branch = if branch_out.status.success() {
        let b = String::from_utf8_lossy(&branch_out.stdout).trim().to_string();
        if b.is_empty() { None } else { Some(b) }
    } else {
        None
    };

    Ok(GitRepoInfo { is_git_repo: true, current_commit, branch })
}

#[tauri::command]
pub async fn create_worktrees(
    app: AppHandle,
    repo_dir: String,
    comparison_id: String,
    panel_ids: Vec<String>,
    commit: String,
) -> Result<Vec<WorktreeResult>, String> {
    let base_dir = format!("{}/.comparator-worktrees/{}", repo_dir, comparison_id);
    let shell = app.shell();

    let mut results = Vec::new();
    for panel_id in &panel_ids {
        let worktree_path = format!("{}/{}", base_dir, panel_id);

        let output = shell.command("git")
            .args(["worktree", "add", "-d", &worktree_path, &commit])
            .current_dir(&repo_dir)
            .output()
            .await
            .map_err(|e| format!("Failed to create worktree for {}: {}", panel_id, e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to create worktree for {}: {}", panel_id, stderr));
        }

        results.push(WorktreeResult {
            panel_id: panel_id.clone(),
            worktree_path,
        });
    }

    Ok(results)
}


#[tauri::command]
pub async fn remove_worktrees(
    app: AppHandle,
    repo_dir: String,
    comparison_id: String,
) -> Result<(), String> {
    let base_dir = format!("{}/.comparator-worktrees/{}", repo_dir, comparison_id);
    let shell = app.shell();

    // List all worktrees and remove ones in our directory
    let list_out = shell.command("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&repo_dir)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if list_out.status.success() {
        let output = String::from_utf8_lossy(&list_out.stdout);
        for line in output.lines() {
            if let Some(path) = line.strip_prefix("worktree ") {
                if path.starts_with(&base_dir) {
                    let _ = shell.command("git")
                        .args(["worktree", "remove", "--force", path])
                        .current_dir(&repo_dir)
                        .output()
                        .await;
                }
            }
        }
    }

    // Clean up directory
    let _ = std::fs::remove_dir_all(&base_dir);

    // Also try to remove parent .comparator-worktrees if empty
    let parent = format!("{}/.comparator-worktrees", repo_dir);
    let _ = std::fs::remove_dir(&parent);

    Ok(())
}

#[tauri::command]
pub async fn get_diff_against_commit(
    app: AppHandle,
    worktree_path: String,
    base_commit: String,
) -> Result<Vec<FileDiffEntry>, String> {
    // Validate base_commit to prevent flag injection (e.g. "--output=/tmp/evil")
    if base_commit.starts_with('-') || !base_commit.chars().all(|c| c.is_alphanumeric() || "~^-_/.".contains(c)) {
        return Err("Invalid base_commit reference".to_string());
    }

    let shell = app.shell();

    // Get list of changed files
    let name_status = shell.command("git")
        .args(["diff", &base_commit, "--name-status"])
        .current_dir(&worktree_path)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !name_status.status.success() {
        return Ok(vec![]);
    }

    let output = String::from_utf8_lossy(&name_status.stdout);
    let mut results = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }

        let parts: Vec<&str> = line.splitn(2, '\t').collect();
        if parts.len() < 2 { continue; }

        let change_type = match parts[0].chars().next() {
            Some('A') => "added",
            Some('M') => "modified",
            Some('D') => "deleted",
            Some('R') => "renamed",
            _ => "modified",
        };

        let file_path = parts[1].to_string();

        // Get the actual diff for this file
        let diff_out = shell.command("git")
            .args(["diff", &base_commit, "--", &file_path])
            .current_dir(&worktree_path)
            .output()
            .await
            .map_err(|e| e.to_string())?;

        let diff_text = if diff_out.status.success() {
            String::from_utf8_lossy(&diff_out.stdout).to_string()
        } else {
            String::new()
        };

        results.push(FileDiffEntry { file_path, diff_text, change_type: change_type.to_string() });
    }

    Ok(results)
}

/// Check whether a newer release is available on GitHub.
///
/// Hits the GitHub Releases API — no local git repo required.
/// Works in shipped .app builds where VITE_REPO_PATH / VITE_GIT_SHA are unavailable.
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> UpdateStatus {
    let current = app.package_info().version.to_string();

    let client = match reqwest::Client::builder()
        .user_agent("harness-kit-desktop")
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => return UpdateStatus {
            local_sha: current,
            remote_sha: String::new(),
            commits_behind: 0,
            up_to_date: true,
            error: Some(e.to_string()),
        },
    };

    let resp = client
        .get("https://api.github.com/repos/harnessprotocol/harness-kit/releases/latest")
        .send()
        .await;

    let body = match resp {
        Ok(r) if r.status().is_success() => match r.json::<serde_json::Value>().await {
            Ok(v) => v,
            Err(e) => return UpdateStatus {
                local_sha: current,
                remote_sha: String::new(),
                commits_behind: 0,
                up_to_date: true,
                error: Some(format!("Parse error: {}", e)),
            },
        },
        Ok(r) => return UpdateStatus {
            local_sha: current,
            remote_sha: String::new(),
            commits_behind: 0,
            up_to_date: true,
            error: Some(format!("GitHub API returned {}", r.status())),
        },
        Err(e) => return UpdateStatus {
            local_sha: current,
            remote_sha: String::new(),
            commits_behind: 0,
            up_to_date: true,
            error: Some(e.to_string()),
        },
    };

    let latest_tag = body["tag_name"].as_str().unwrap_or("").trim_start_matches('v');
    let up_to_date = latest_tag.is_empty() || latest_tag == current;

    UpdateStatus {
        local_sha: current,
        remote_sha: latest_tag.to_string(),
        commits_behind: if up_to_date { 0 } else { 1 },
        up_to_date,
        error: None,
    }
}

/// Run `pnpm install:desktop` in the background and restart the app when done.
/// No Terminal window — build runs silently, app relaunches automatically on success.
#[tauri::command]
pub async fn trigger_rebuild(app: AppHandle, repo_path: String) -> Result<(), String> {
    // macOS GUI apps launch with a minimal PATH that omits Homebrew, nvm, pnpm, etc.
    // Use a login shell so the user's full shell environment (including pnpm) is available.
    // Use .current_dir() instead of interpolating the path into the shell string — this
    // eliminates any shell injection surface from the repo path entirely.
    let output = tokio::process::Command::new("/bin/sh")
        .args(["-lc", "pnpm install:desktop"])
        .current_dir(&repo_path)
        .output()
        .await
        .map_err(|e| format!("Failed to start build: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        return Err(format!("Build failed:\n{}{}", stdout, stderr));
    }

    // New binary is in place — restart the app.
    // Spawn a fresh instance from the same exe path (now pointing at the new binary),
    // then exit this process.
    let exe = std::env::current_exe()
        .map_err(|e| format!("Could not locate app binary: {}", e))?;

    std::process::Command::new(&exe)
        .spawn()
        .map_err(|e| format!("Failed to relaunch: {}", e))?;

    app.exit(0);

    Ok(()) // unreachable but satisfies the return type
}
