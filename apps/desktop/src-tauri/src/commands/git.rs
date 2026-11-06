use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

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

/// The checkout this binary was compiled from: `CARGO_MANIFEST_DIR` is
/// `<repo>/apps/desktop/src-tauri`. A shipped build points at a CI path that
/// does not exist on the user's machine, so rebuild is refused there.
fn build_checkout() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..")
}

/// `repo_path` comes from the webview, so it is not trusted: the only
/// directory the build may run in is the checkout this binary was built from.
/// Anything else would let webview JS run `pnpm install:desktop` (a package
/// script, so arbitrary code) in a directory of its choosing.
fn validate_rebuild_path(repo_path: &str, checkout: &Path) -> Result<PathBuf, String> {
    let requested = Path::new(repo_path)
        .canonicalize()
        .map_err(|e| format!("Repo path is not accessible: {}", e))?;
    let expected = checkout
        .canonicalize()
        .map_err(|_| "This build was not made from a local checkout".to_string())?;
    if requested != expected {
        return Err("Refusing to rebuild: not the checkout this app was built from".to_string());
    }
    Ok(requested)
}

/// Run `pnpm install:desktop` in the background and restart the app when done.
/// No Terminal window — build runs silently, app relaunches automatically on success.
#[tauri::command]
pub async fn trigger_rebuild(app: AppHandle, repo_path: String) -> Result<(), String> {
    let repo_path = validate_rebuild_path(&repo_path, &build_checkout())?;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rebuild_accepts_only_the_build_checkout() {
        let tmp = tempfile::tempdir().unwrap();
        let checkout = tmp.path().join("checkout");
        let other = tmp.path().join("other");
        std::fs::create_dir_all(&checkout).unwrap();
        std::fs::create_dir_all(&other).unwrap();

        assert!(validate_rebuild_path(checkout.to_str().unwrap(), &checkout).is_ok());
        let err = validate_rebuild_path(other.to_str().unwrap(), &checkout).unwrap_err();
        assert!(err.contains("not the checkout"), "{err}");
        // A `..` route to a different directory resolves before the comparison.
        let sneaky = format!("{}/../other", checkout.display());
        assert!(validate_rebuild_path(&sneaky, &checkout).is_err());
    }

    #[test]
    fn rebuild_refused_when_checkout_is_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let gone = tmp.path().join("gone");
        let err = validate_rebuild_path(tmp.path().to_str().unwrap(), &gone).unwrap_err();
        assert!(err.contains("local checkout"), "{err}");
    }
}
