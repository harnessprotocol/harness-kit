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
