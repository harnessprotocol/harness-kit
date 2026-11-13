use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;
use tauri_plugin_fs::FsExt;

/// Canonical project roots the user has granted this session.
///
/// `sync.rs`'s bridge writes with `std::fs`, bypassing the Tauri FS plugin
/// scope entirely, so the plugin grant alone does not constrain it. Refusing
/// only "home and its ancestors" there left every home *subdirectory* usable
/// as a project root — `~/.ssh`, `~/Library/LaunchAgents`, `~/.claude` — which
/// is an unguarded door beside the guarded one. The bridge now requires the
/// root to be one the user actually picked.
fn granted_roots() -> &'static Mutex<HashSet<PathBuf>> {
    static ROOTS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
    ROOTS.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Whether `candidate` is a granted root or lives inside one.
pub(crate) fn is_granted_root(candidate: &Path) -> bool {
    granted_root_for(candidate).is_some()
}

/// The outermost granted root that is `candidate` or contains it. Two paths
/// with the same outermost root lie inside one granted root, which is the
/// test a move between them has to pass.
pub(crate) fn granted_root_for(candidate: &Path) -> Option<PathBuf> {
    let roots = granted_roots().lock().ok()?;
    roots
        .iter()
        .filter(|root| candidate == root.as_path() || candidate.starts_with(root))
        .min_by_key(|root| root.components().count())
        .cloned()
}

/// Record a canonical root as granted. Test-visible so the sync bridge's
/// tests can exercise the allowed path without a running Tauri app.
pub(crate) fn remember_granted_root(canonical: PathBuf) {
    if let Ok(mut roots) = granted_roots().lock() {
        roots.insert(canonical);
    }
}

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
pub(crate) fn is_home_or_ancestor(candidate: &Path, home: &Path) -> bool {
    home.starts_with(candidate)
}

/// Grant the webview's Tauri FS plugin scope read/write access to a single,
/// user-chosen project directory for the rest of this app session.
///
/// The static capability (capabilities/default.json) only ever lists known
/// harness config roots under `$HOME` — it intentionally does not grant
/// `$HOME/**`. The project scope of Machine, Drift and Compile is an arbitrary
/// directory the user picked in the title bar's native folder dialog (see
/// `choose_project_dir` and `getCurrentProjectDir()`), so it can't be listed
/// ahead of time. This
/// command extends the runtime scope to cover exactly that directory
/// (not retroactively trusting any other path). The scope itself lasts one
/// launch, so this must be called again each launch before the project scope
/// is used; the user's pick is what persists: `picked-project-roots.json`
/// in the app data directory keeps it with no expiry, and a later grant of
/// that directory or one inside it is accepted without the dialog.
///
/// This command is reachable from any webview JS, so it can't just trust the
/// caller: it's the trust boundary the static scope tightening above exists
/// to enforce. Reject any target that is the home directory or an ancestor
/// of it (`/`, `/Users`, `~`, etc.) — granting one of those would silently
/// recreate the `$HOME/**` grant this change removes, or worse.
///
/// It also refuses any directory the user did not pick in the native folder
/// dialog (`choose_project_dir`, which opens that dialog from Rust). A webview
/// that could name any non-home directory would otherwise grant itself
/// `~/.ssh` or `~/Library`. A pick is remembered for the session and in the
/// app data directory, so a remembered project still works after a restart;
/// the webview cannot write that file.
#[tauri::command]
pub fn grant_project_scope(app: AppHandle, path: String) -> Result<(), String> {
    let canonical = canonical_project_dir(&path)?;
    let picked = picked_roots_file(&app).map(|f| load_picked(&f)).unwrap_or_default();
    if !is_granted_root(&canonical) && !is_under_pick(&canonical, &picked) {
        return Err(
            "Refusing to grant scope over a directory that was not chosen in the folder dialog"
                .to_string(),
        );
    }
    allow_and_remember(&app, canonical)
}

/// Open the native folder dialog from Rust and grant scope to the pick.
/// The directory never passes through the webview before it is trusted.
/// Resolves `None` when the user cancels.
#[tauri::command]
pub async fn choose_project_dir(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("Select project directory")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let shown = path.to_string_lossy().into_owned();
    let canonical = canonical_project_dir(&shown)?;
    if let Some(file) = picked_roots_file(&app) {
        persist_pick(&file, &canonical);
    }
    allow_and_remember(&app, canonical)?;
    Ok(Some(shown))
}

/// Canonical, existing directory that is not the home directory or an ancestor.
fn canonical_project_dir(path: &str) -> Result<PathBuf, String> {
    let expanded = expand_tilde(path);
    let canonical: PathBuf = Path::new(&expanded)
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
    Ok(canonical)
}

fn allow_and_remember(app: &AppHandle, canonical: PathBuf) -> Result<(), String> {
    app.fs_scope()
        .allow_directory(&canonical, true)
        .map_err(|e| format!("Failed to grant project scope: {}", e))?;
    remember_granted_root(canonical);
    Ok(())
}

fn picked_roots_file(app: &AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("picked-project-roots.json"))
}

fn load_picked(file: &Path) -> Vec<PathBuf> {
    std::fs::read_to_string(file)
        .ok()
        .and_then(|text| serde_json::from_str::<Vec<PathBuf>>(&text).ok())
        .unwrap_or_default()
}

/// Best effort: a failed write only means the user re-picks next launch.
fn persist_pick(file: &Path, canonical: &Path) {
    let mut picked = load_picked(file);
    if picked.iter().any(|p| p == canonical) {
        return;
    }
    picked.push(canonical.to_path_buf());
    if let Some(parent) = file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(text) = serde_json::to_string(&picked) {
        let _ = std::fs::write(file, text);
    }
}

fn is_under_pick(candidate: &Path, picked: &[PathBuf]) -> bool {
    picked.iter().any(|root| candidate.starts_with(root))
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
    fn only_dialog_picked_directories_may_be_granted() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path().canonicalize().unwrap();
        let picked_dir = base.join("project");
        let sub = picked_dir.join("packages/app");
        let other = base.join("projectile");
        let file = base.join("state/picked.json");

        assert!(load_picked(&file).is_empty());
        persist_pick(&file, &picked_dir);
        persist_pick(&file, &picked_dir); // idempotent
        let picked = load_picked(&file);
        assert_eq!(picked, vec![picked_dir.clone()]);

        assert!(is_under_pick(&picked_dir, &picked));
        assert!(is_under_pick(&sub, &picked));
        assert!(!is_under_pick(&other, &picked), "name-prefix sibling is not under the pick");
        assert!(!is_under_pick(&base.join(".ssh"), &picked));
        assert!(!is_under_pick(&picked_dir, &[]));
    }

    #[test]
    fn corrupt_pick_file_grants_nothing() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("picked.json");
        std::fs::write(&file, "not json").unwrap();
        assert!(load_picked(&file).is_empty());
    }

    #[test]
    fn sibling_with_shared_name_prefix_is_allowed() {
        // /Users/exampleother must not be treated as an ancestor of
        // /Users/example — component-wise comparison, not string prefix.
        let home: PathBuf = "/Users/example".into();
        assert!(!is_home_or_ancestor(Path::new("/Users/exampleother"), &home));
    }
}
