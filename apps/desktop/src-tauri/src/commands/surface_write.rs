use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use super::fs_scope::is_home_or_ancestor;

/// The user-scope write allowlist, generated from the TypeScript surface
/// registry (apps/desktop/scripts/generate-write-scope.mjs).
///
/// This command is reachable from any webview JS, so it cannot accept an
/// allowlist from its caller — validating in Rust against a caller-supplied
/// list would be no validation at all. The list is embedded at build time
/// instead, and a TS test asserts the checked-in file still matches the
/// registry.
const WRITE_SCOPE_JSON: &str = include_str!("../../generated/write-scope.json");

#[derive(Debug, Deserialize)]
struct PlatformScope {
    files: Vec<String>,
    directories: Vec<String>,
}

fn scope() -> &'static HashMap<String, PlatformScope> {
    static SCOPE: OnceLock<HashMap<String, PlatformScope>> = OnceLock::new();
    SCOPE.get_or_init(|| {
        serde_json::from_str(WRITE_SCOPE_JSON).expect("generated write-scope.json must parse")
    })
}

fn current_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "windows") {
        "win32"
    } else {
        "linux"
    }
}

/// Whether a home-relative path is a config store the registry declares.
/// Segment-aware in both directions: ".claude.json.bak" is not ".claude.json",
/// and ".claude/skillsets/x" is not inside ".claude/skills".
pub(crate) fn is_declared_store(relative: &str) -> bool {
    let normalized = relative.replace('\\', "/");
    if normalized.is_empty() || normalized.starts_with('/') || normalized.starts_with('~') {
        return false;
    }
    if normalized.split('/').any(|segment| segment == "..") {
        return false;
    }
    let Some(platform) = scope().get(current_platform()) else {
        return false;
    };
    if platform.files.iter().any(|file| file == &normalized) {
        return true;
    }
    platform
        .directories
        .iter()
        .any(|directory| normalized.starts_with(&format!("{}/", directory)))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceFileWrite {
    /// Home-relative path of a registry-declared config store.
    pub relative_path: String,
    /// New content, or null to delete the file.
    pub content: Option<String>,
}

/// Write user-scope config files, accepting only registry-declared stores.
///
/// Deliberately separate from `sync_write_files`, which is project-scoped:
/// giving that command a home root would turn a project-scoped primitive into
/// a general home-directory writer (AC-36).
#[tauri::command]
pub fn apply_surface_transaction(files: Vec<SurfaceFileWrite>) -> Result<Vec<String>, String> {
    let home = dirs::home_dir().ok_or("Could not resolve home directory")?;
    let canonical_home = home.canonicalize().unwrap_or_else(|_| home.clone());

    // Validate every path before mutating any of them.
    let mut targets: Vec<(PathBuf, Option<String>)> = Vec::new();
    for file in &files {
        if !is_declared_store(&file.relative_path) {
            return Err(format!(
                "Refusing to write '{}': not a config store the surface registry declares",
                file.relative_path
            ));
        }
        let dest = canonical_home.join(&file.relative_path);
        // Belt and braces: the segment check above already rejects traversal,
        // but a symlinked ancestor could still land outside home.
        if let Some(parent) = dest.parent() {
            if let Ok(canonical_parent) = parent.canonicalize() {
                if !canonical_parent.starts_with(&canonical_home)
                    || is_home_or_ancestor(&canonical_parent, &canonical_home)
                {
                    return Err(format!(
                        "Refusing to write '{}': resolves outside the home directory",
                        file.relative_path
                    ));
                }
            }
        }
        targets.push((dest, file.content.clone()));
    }

    let mut written = Vec::new();
    for (dest, content) in targets {
        match content {
            Some(text) => {
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create directory: {}", e))?;
                }
                fs::write(&dest, &text)
                    .map_err(|e| format!("Failed to write {}: {}", dest.display(), e))?;
            }
            None => {
                if Path::new(&dest).exists() {
                    fs::remove_file(&dest)
                        .map_err(|e| format!("Failed to remove {}: {}", dest.display(), e))?;
                }
            }
        }
        written.push(dest.to_string_lossy().into_owned());
    }
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_declared_store() {
        assert!(is_declared_store(".claude.json"));
        assert!(is_declared_store(".codex/config.toml"));
    }

    #[test]
    fn accepts_a_file_beneath_a_declared_directory() {
        assert!(is_declared_store(".claude/skills/review/SKILL.md"));
    }

    #[test]
    fn rejects_an_undeclared_path() {
        assert!(!is_declared_store(".zshrc"));
        assert!(!is_declared_store(".ssh/id_rsa"));
        assert!(!is_declared_store(".claude/settings.local.json"));
    }

    #[test]
    fn rejects_a_shared_string_prefix() {
        // Segment-aware, not string-prefix.
        assert!(!is_declared_store(".claude.json.bak"));
        assert!(!is_declared_store(".claude/skillsets/x.md"));
    }

    #[test]
    fn rejects_traversal_and_absolute_forms() {
        for path in ["../.ssh/id_rsa", "/etc/passwd", "~/.zshrc", ".claude/../../x", ""] {
            assert!(!is_declared_store(path), "{} should be rejected", path);
        }
    }

    #[test]
    fn write_is_refused_for_an_undeclared_path() {
        let result = apply_surface_transaction(vec![SurfaceFileWrite {
            relative_path: ".harness-kit-surface-probe".to_string(),
            content: Some("should never be written".to_string()),
        }]);
        let err = result.unwrap_err();
        assert!(err.contains("not a config store"));
        assert!(!dirs::home_dir().unwrap().join(".harness-kit-surface-probe").exists());
    }

    #[test]
    fn a_single_bad_path_blocks_the_whole_batch() {
        // Validation happens before any mutation, so a mixed batch writes
        // nothing rather than partially applying.
        let result = apply_surface_transaction(vec![
            SurfaceFileWrite {
                relative_path: ".claude.json".to_string(),
                content: Some("{}".to_string()),
            },
            SurfaceFileWrite {
                relative_path: ".zshrc".to_string(),
                content: Some("pwned".to_string()),
            },
        ]);
        assert!(result.is_err());
    }
}
