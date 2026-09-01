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

/// The trust check `grant_project_scope` enforces: reject `candidate` when it
/// is the home directory or an ancestor of it. Both paths must already be
/// canonicalized. Taking `home` as a parameter keeps this testable without
/// touching the process-global `HOME`.
fn is_home_or_ancestor(candidate: &Path, home: &Path) -> bool {
    home.starts_with(candidate)
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
        if is_home_or_ancestor(&canonical, &canonical_home) {
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
    fn home_dir_itself_is_rejected() {
        let home: PathBuf = "/Users/example".into();
        assert!(is_home_or_ancestor(&home, &home));
    }

    #[test]
    fn ancestors_of_home_are_rejected() {
        let home: PathBuf = "/Users/example".into();
        for ancestor in ["/", "/Users"] {
            assert!(
                is_home_or_ancestor(Path::new(ancestor), &home),
                "{} should be rejected as an ancestor of home",
                ancestor
            );
        }
    }

    #[test]
    fn directories_under_home_are_allowed() {
        let home: PathBuf = "/Users/example".into();
        for allowed in ["/Users/example/repos/foo", "/Users/example/repos", "/tmp/scratch"] {
            assert!(
                !is_home_or_ancestor(Path::new(allowed), &home),
                "{} should be allowed",
                allowed
            );
        }
    }

    #[test]
    fn sibling_with_shared_name_prefix_is_allowed() {
        // /Users/exampleother must not be treated as an ancestor of
        // /Users/example — component-wise comparison, not string prefix.
        let home: PathBuf = "/Users/example".into();
        assert!(!is_home_or_ancestor(Path::new("/Users/exampleother"), &home));
    }
}
