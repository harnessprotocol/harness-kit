//! Share (UX AC-25): save a sanitized harness.yaml or an agent prompt to a
//! file the user picks.
//!
//! The webview is untrusted and has no fs write of its own. Like
//! `choose_project_dir`, this command opens the native Save dialog from Rust,
//! so the path always comes from the user and never from the page. The page
//! only supplies the text, a suggested file name (reduced to a bare stem) and
//! which of the two kinds of file it is.

use std::path::{Path, PathBuf};

use serde::Deserialize;
use tauri::AppHandle;

/// Largest text a share may save. A harness.yaml is a few kilobytes; this
/// only stops a compromised page filling a disk through the dialog.
const MAX_SHARE_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ShareKind {
    HarnessYaml,
    AgentPrompt,
}

impl ShareKind {
    fn extension(self) -> &'static str {
        match self {
            ShareKind::HarnessYaml => "yaml",
            ShareKind::AgentPrompt => "md",
        }
    }

    fn filter_name(self) -> &'static str {
        match self {
            ShareKind::HarnessYaml => "YAML",
            ShareKind::AgentPrompt => "Markdown",
        }
    }

    fn title(self) -> &'static str {
        match self {
            ShareKind::HarnessYaml => "Save shared harness.yaml",
            ShareKind::AgentPrompt => "Save agent prompt",
        }
    }
}

/// A suggested name reduced to a safe stem: no directories, no extension, no
/// leading dots, only `[A-Za-z0-9._-]`. Falls back to "harness".
fn file_stem(suggested: &str) -> String {
    let base = suggested.rsplit(['/', '\\']).next().unwrap_or("");
    let base = match base.rfind('.') {
        Some(dot) if dot > 0 => &base[..dot],
        _ => base,
    };
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned
        .trim_matches(|c| c == '.' || c == '-')
        .chars()
        .take(80)
        .collect::<String>();
    if trimmed.is_empty() {
        "harness".to_string()
    } else {
        trimmed
    }
}

/// Write through the same atomic, mode-preserving path Compile uses, so a
/// failed write never leaves a half-written file under the chosen name.
fn write_atomically(path: &Path, contents: &str) -> Result<(), String> {
    super::sync::write_file_atomically(path, contents.as_bytes())
        .map_err(|e| format!("Could not save: {e}"))
}

fn check_contents(contents: &str) -> Result<(), String> {
    if contents.len() > MAX_SHARE_BYTES {
        return Err(format!(
            "Refusing to save more than {} KiB",
            MAX_SHARE_BYTES / 1024
        ));
    }
    Ok(())
}

/// Open the native Save dialog and write `contents` where the user chose.
/// Resolves the saved path, or `None` when the user cancels.
#[tauri::command]
pub async fn save_share_file(
    app: AppHandle,
    kind: ShareKind,
    suggested_name: String,
    contents: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    check_contents(&contents)?;
    let name = format!("{}.{}", file_stem(&suggested_name), kind.extension());
    let Some(picked) = app
        .dialog()
        .file()
        .set_title(kind.title())
        .set_file_name(&name)
        .add_filter(kind.filter_name(), &[kind.extension()])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path: PathBuf = picked.into_path().map_err(|e| e.to_string())?;
    write_atomically(&path, &contents)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_stem_drops_directories_and_extensions() {
        assert_eq!(file_stem("../../etc/passwd"), "passwd");
        assert_eq!(file_stem("C:\\Users\\x\\team.yaml"), "team");
        assert_eq!(file_stem("alice setup.yaml"), "alice-setup");
        assert_eq!(file_stem(".bashrc"), "bashrc");
        assert_eq!(file_stem(""), "harness");
        assert_eq!(file_stem("///"), "harness");
    }

    #[test]
    fn file_stem_is_bounded() {
        assert_eq!(file_stem(&"a".repeat(500)).len(), 80);
    }

    #[test]
    fn kinds_parse_from_kebab_case() {
        let yaml: ShareKind = serde_json::from_str("\"harness-yaml\"").unwrap();
        let prompt: ShareKind = serde_json::from_str("\"agent-prompt\"").unwrap();
        assert_eq!(yaml.extension(), "yaml");
        assert_eq!(prompt.extension(), "md");
        assert!(serde_json::from_str::<ShareKind>("\"anything\"").is_err());
    }

    #[test]
    fn oversized_contents_are_refused() {
        assert!(check_contents(&"x".repeat(MAX_SHARE_BYTES + 1)).is_err());
        assert!(check_contents("version: '1'\n").is_ok());
    }

    #[test]
    fn atomic_write_replaces_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("team.yaml");
        std::fs::write(&path, "old").unwrap();
        write_atomically(&path, "new").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }
}
