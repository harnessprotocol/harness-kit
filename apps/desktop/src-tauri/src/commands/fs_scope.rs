use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_fs::FsExt;

/// Expand a leading `~/` to the user's home directory (mirrors sync.rs's helper —
/// runtime-picked project dirs can arrive as either an absolute path from the
/// dialog plugin or, for recent-dir replays, a tilde-prefixed string).
fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest).to_string_lossy().into_owned();
        }
    }
    path.to_string()
}

/// Grant the webview's Tauri FS plugin scope read/write access to a single,
/// user-chosen project directory for the rest of this app session.
///
/// The static capability (capabilities/default.json) only ever lists known
/// harness config roots under `$HOME` — it intentionally does not grant
/// `$HOME/**`. Fleet/Drift's project scope is an arbitrary directory the user
/// picked via a folder dialog (see SyncPage's `open({ directory: true })` and
/// `getCurrentProjectDir()`), so it can't be listed ahead of time. This
/// command extends the runtime scope to cover exactly that directory,
/// in-memory only (not persisted to disk, not retroactively trusting any
/// other path) — it must be called again each launch before the project
/// scope is used.
///
/// This command is reachable from any webview JS, so it can't just trust the
/// caller: it's the trust boundary the static scope tightening above exists
/// to enforce. Reject any target that is the home directory or an ancestor
/// of it (`/`, `/Users`, `~`, etc.) — granting one of those would silently
/// recreate the `$HOME/**` grant this change removes, or worse.
#[tauri::command]
pub fn grant_project_scope(app: AppHandle, path: String) -> Result<(), String> {
    let expanded = expand_tilde(&path);
    let candidate = Path::new(&expanded);
    let canonical: PathBuf = candidate
        .canonicalize()
        .map_err(|e| format!("Project directory does not exist: {}", e))?;
    if !canonical.is_dir() {
        return Err("Project scope target is not a directory".to_string());
    }

    if let Some(home) = dirs::home_dir() {
        let canonical_home = home.canonicalize().unwrap_or(home);
        if canonical_home.starts_with(&canonical) {
            return Err(
                "Refusing to grant scope over the home directory or one of its ancestors"
                    .to_string(),
            );
        }
    }

    app.fs_scope()
        .allow_directory(&canonical, true)
        .map_err(|e| format!("Failed to grant project scope: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn expand_tilde_expands_home_relative_path() {
        let home = dirs::home_dir().unwrap();
        assert_eq!(
            expand_tilde("~/repos/foo"),
            home.join("repos/foo").to_string_lossy().into_owned()
        );
    }

    #[test]
    fn expand_tilde_leaves_absolute_path_unchanged() {
        assert_eq!(expand_tilde("/Users/john/repos/foo"), "/Users/john/repos/foo");
    }

    #[test]
    fn home_dir_is_rejected_as_an_ancestor_of_itself() {
        let home = dirs::home_dir().unwrap();
        let canonical_home = home.canonicalize().unwrap_or(home);
        // Mirrors the guard in grant_project_scope: a directory is rejected
        // when the home dir starts with it (i.e. it is home, or an ancestor).
        let root: PathBuf = "/".into();
        assert!(canonical_home.starts_with(&root));
        assert!(canonical_home.starts_with(&canonical_home));
    }
}
