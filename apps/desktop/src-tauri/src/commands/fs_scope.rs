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

    app.fs_scope()
        .allow_directory(&canonical, true)
        .map_err(|e| format!("Failed to grant project scope: {}", e))
}
