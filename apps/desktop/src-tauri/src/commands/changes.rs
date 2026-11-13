//! The "Changes" list in Settings › Activity: what the app changed on this
//! machine, newest first, with Undo for each change that can still be undone.
//!
//! The ledger (`transactions` in harness.db) is an index; the rollback data is
//! the manifest the transaction engine wrote at `~/.harness/backups/<id>/
//! transaction.json`, which holds every file's content before and after.
//!
//! The webview is not trusted, so both commands take as little from it as
//! possible. `list_changes` takes a row limit. `undo_change` takes a
//! transaction id and nothing else: the paths, the contents and the
//! preconditions all come from the ledger row and the manifest it names, and
//! every one is checked here before any file is touched:
//!
//! - the row's manifest must sit at `.harness/backups/<id>/transaction.json`
//!   under the real home directory, with no symlink on the way and a size cap;
//! - the manifest must be committed (not already undone, not half-applied);
//! - every file must be home-rooted and a config store the surface registry
//!   declares (`is_declared_store`), the same allowlist `apply_surface_
//!   transaction` enforces, and never anything under `.harness/`;
//! - every file must still hold exactly what the change left there. A file
//!   edited since is refused with the write command's own "changed on disk"
//!   message, and because the writes go through `apply_surface_transaction_in`
//!   all preconditions are checked before the first file is written.
//!
//! A forged ledger row or manifest therefore buys an attacker nothing the
//! webview could not already do with `apply_surface_transaction`: the same
//! allowlist applies, plus a digest that must match what is on disk.

use super::harness_state::{list_transactions_at, state_path, TransactionRecord};
use super::surface_write::{
    apply_surface_transaction_in, is_declared_store, precondition_digest, SurfaceFileWrite,
    ABSENT_SENTINEL,
};
use crate::db::Db;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 200;
const MAX_MANIFEST_BYTES: u64 = 8 * 1024 * 1024;
const MAX_FILES_PER_CHANGE: usize = 256;
const MAX_ID_BYTES: usize = 4096;

const PROJECT_CHANGE: &str =
    "This change was made in a project folder. Undo it from that project.";

/// One row of the Changes list.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeEntry {
    pub transaction_id: String,
    pub applied_at: String,
    pub surfaces: Vec<String>,
    pub kinds: Vec<String>,
    pub identity_keys: Vec<String>,
    /// Home-relative paths the change touched.
    pub files: Vec<String>,
    /// The surface a Machine copy came from, when this change was one.
    pub copied_from: Option<String>,
    /// `applied`, `undone`, or `unavailable` (the manifest cannot be read).
    pub status: String,
    pub undoable: bool,
    /// Why `undoable` is false, in words for the user.
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoOutcome {
    pub transaction_id: String,
    /// Home-relative paths put back.
    pub files: Vec<String>,
    /// Set when the files were restored but the change could not be marked as
    /// undone, so the list may still offer Undo for it.
    pub warning: Option<String>,
}

/// An audit entry's text, built in Rust from structured fields.
#[derive(Debug)]
pub(crate) struct AuditDraft {
    pub summary: String,
    pub details: String,
}

#[derive(Deserialize)]
struct Manifest {
    version: u8,
    status: String,
    #[serde(default)]
    changes: Vec<ManifestChange>,
}

#[derive(Deserialize)]
struct ManifestChange {
    #[serde(default)]
    root: Option<String>,
    path: String,
    before: Option<String>,
    after: Option<String>,
}

#[tauri::command]
pub fn list_changes(limit: Option<i64>) -> Result<Vec<ChangeEntry>, String> {
    let home = dirs::home_dir().ok_or("Could not resolve home directory")?;
    list_changes_at(&state_path()?, &home, limit)
}

#[tauri::command]
pub fn undo_change(db: State<'_, Db>, transaction_id: String) -> Result<UndoOutcome, String> {
    let home = dirs::home_dir().ok_or("Could not resolve home directory")?;
    let (outcome, audit) = undo_change_at(&state_path()?, &home, &transaction_id)?;
    super::security::log_audit(
        &db,
        "change_undone",
        "changes",
        &audit.summary,
        Some(&audit.details),
        "user",
    );
    Ok(outcome)
}

/// Path-taking core of [`list_changes`]. A missing database is an empty list,
/// not a reason to create one: this is a read.
pub(crate) fn list_changes_at(
    db_path: &Path,
    home: &Path,
    limit: Option<i64>,
) -> Result<Vec<ChangeEntry>, String> {
    if !db_path.exists() {
        return Ok(Vec::new());
    }
    let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(0, MAX_LIMIT);
    let records = list_transactions_at(db_path, Some(limit))?;
    Ok(records
        .into_iter()
        .map(|record| entry_for(home, record))
        .collect())
}

fn entry_for(home: &Path, record: TransactionRecord) -> ChangeEntry {
    let (status, undoable, reason, files) = match read_manifest(home, &record) {
        Ok((manifest, _)) => {
            let files = manifest.changes.iter().map(|c| c.path.clone()).collect();
            match undo_plan(&manifest) {
                Ok(_) => ("applied", true, None, files),
                Err(why) if manifest.status == "rolled-back" => ("undone", false, Some(why), files),
                Err(why) => ("applied", false, Some(why), files),
            }
        }
        Err(why) => ("unavailable", false, Some(why), Vec::new()),
    };
    ChangeEntry {
        transaction_id: record.transaction_id,
        applied_at: record.applied_at,
        surfaces: record.surfaces,
        kinds: record.kinds,
        identity_keys: record.identity_keys,
        files,
        copied_from: record.copied_from,
        status: status.to_string(),
        undoable,
        reason,
    }
}

/// The manifest a ledger row points at, with the bytes it was read from.
fn read_manifest(home: &Path, record: &TransactionRecord) -> Result<(Manifest, Vec<u8>), String> {
    let relative = manifest_relative(home, record)?;
    let canonical_home = home
        .canonicalize()
        .map_err(|e| format!("Could not resolve the home directory: {}", e))?;
    // No symlink at any component, the file itself included: the manifest is
    // read as the source of what to write, so a planted link must not choose it.
    let mut walked = canonical_home;
    for segment in relative.split('/') {
        walked = walked.join(segment);
        match std::fs::symlink_metadata(&walked) {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err("The record for this change is not a regular file.".to_string());
            }
            Ok(_) => {}
            Err(_) => return Err("The backup for this change is no longer on disk.".to_string()),
        }
    }
    let meta = std::fs::metadata(&walked)
        .map_err(|_| "The backup for this change is no longer on disk.".to_string())?;
    if !meta.is_file() || meta.len() > MAX_MANIFEST_BYTES {
        return Err("The record for this change is not a regular file of a sane size.".to_string());
    }
    let bytes = std::fs::read(&walked)
        .map_err(|e| format!("Could not read the backup for this change: {}", e))?;
    let manifest: Manifest = serde_json::from_slice(&bytes)
        .map_err(|_| "The backup for this change could not be read.".to_string())?;
    Ok((manifest, bytes))
}

/// The home-relative manifest path, after checking the row's claim about it.
fn manifest_relative(home: &Path, record: &TransactionRecord) -> Result<String, String> {
    let canonical_home = home
        .canonicalize()
        .map_err(|e| format!("Could not resolve the home directory: {}", e))?;
    let root = Path::new(&record.manifest_root)
        .canonicalize()
        .map_err(|_| PROJECT_CHANGE.to_string())?;
    if root != canonical_home {
        return Err(PROJECT_CHANGE.to_string());
    }
    let relative = record.manifest_path.replace('\\', "/");
    let parts: Vec<&str> = relative.split('/').collect();
    let shaped = parts.len() == 4
        && parts[0] == ".harness"
        && parts[1] == "backups"
        && parts[3] == "transaction.json";
    if !shaped || !is_declared_store(&relative) {
        return Err("The record for this change points outside the app's backup folder.".to_string());
    }
    Ok(relative)
}

/// The writes that put every file back, or why this change cannot be undone.
/// Each write carries the digest of what the change left on disk, so a file
/// edited since refuses the whole undo.
fn undo_plan(manifest: &Manifest) -> Result<Vec<SurfaceFileWrite>, String> {
    match manifest.status.as_str() {
        "committed" => {}
        "rolled-back" => return Err("Already undone.".to_string()),
        _ => return Err("This change did not finish, so there is nothing to undo.".to_string()),
    }
    if manifest.version != 1 && manifest.version != 2 {
        return Err("This change was made by a newer version of the app.".to_string());
    }
    if manifest.changes.is_empty() {
        return Err("This change touched no files.".to_string());
    }
    if manifest.changes.len() > MAX_FILES_PER_CHANGE {
        return Err("This change touched too many files to undo here.".to_string());
    }
    let mut writes = Vec::with_capacity(manifest.changes.len());
    for change in &manifest.changes {
        // A v1 manifest has no root: every file in it was project-rooted.
        if change.root.as_deref() != Some("home") {
            return Err(PROJECT_CHANGE.to_string());
        }
        let path = change.path.replace('\\', "/");
        if path.starts_with(".harness/") || !is_declared_store(&path) {
            return Err(format!(
                "{} is not a config store the app manages, so it will not be touched.",
                change.path
            ));
        }
        writes.push(SurfaceFileWrite {
            relative_path: path,
            content: change.before.clone(),
            expected_sha256: Some(match &change.after {
                Some(after) => precondition_digest(after.as_bytes()),
                None => ABSENT_SENTINEL.to_string(),
            }),
        });
    }
    Ok(writes)
}

/// Path-taking core of [`undo_change`].
pub(crate) fn undo_change_at(
    db_path: &Path,
    home: &Path,
    transaction_id: &str,
) -> Result<(UndoOutcome, AuditDraft), String> {
    if transaction_id.trim().is_empty() || transaction_id.len() > MAX_ID_BYTES {
        return Err("No recorded change has that id.".to_string());
    }
    if !db_path.exists() {
        return Err("No recorded change has that id.".to_string());
    }
    let record = list_transactions_at(db_path, None)?
        .into_iter()
        .find(|record| record.transaction_id == transaction_id)
        .ok_or_else(|| "No recorded change has that id.".to_string())?;

    let (manifest, bytes) = read_manifest(home, &record)?;
    let writes = undo_plan(&manifest)?;
    let files: Vec<String> = writes.iter().map(|w| w.relative_path.clone()).collect();
    apply_surface_transaction_in(home, writes)?;

    // Mark the manifest so the list stops offering Undo. The digest is of the
    // bytes read above: a manifest rewritten in between is left alone.
    let warning = mark_undone(home, &record, &bytes).err().map(|why| {
        format!("The files were restored, but the change could not be marked as undone: {}", why)
    });

    let audit = undo_audit_entry(&record, &files);
    Ok((
        UndoOutcome { transaction_id: record.transaction_id, files, warning },
        audit,
    ))
}

fn mark_undone(home: &Path, record: &TransactionRecord, bytes: &[u8]) -> Result<(), String> {
    let relative = manifest_relative(home, record)?;
    let mut document: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    document["status"] = serde_json::Value::String("rolled-back".to_string());
    let text = format!(
        "{}\n",
        serde_json::to_string_pretty(&document).map_err(|e| e.to_string())?
    );
    apply_surface_transaction_in(
        home,
        vec![SurfaceFileWrite {
            relative_path: relative,
            content: Some(text),
            expected_sha256: Some(precondition_digest(bytes)),
        }],
    )
    .map(|_| ())
}

// ── Audit text ─────────────────────────────────────────────────
//
// Built here from structured fields. The webview supplies ids (surface,
// kind, name) that are length-checked and stripped of control characters;
// it never supplies a sentence.

const MAX_AUDIT_TOKEN: usize = 120;

fn clean(text: &str) -> String {
    text.chars()
        .filter(|c| !c.is_control())
        .take(MAX_AUDIT_TOKEN)
        .collect()
}

fn is_surface_id(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 64
        && text
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

/// The surface registry's ids (`SURFACE_IDS` in packages/core/src/surfaces/
/// types.ts). Rust cannot read the TypeScript registry, so a vitest test
/// (`surface-ids-rust.test.ts`) fails if this list drifts from it.
pub(crate) const SURFACE_IDS: [&str; 11] = [
    "claude-code",
    "claude-desktop",
    "copilot-vscode",
    "copilot-cli",
    "codex",
    "cursor",
    "pi",
    "opencode",
    "windsurf",
    "gemini",
    "junie",
];

/// Every surface a webview-supplied record names must be a registry id.
pub(crate) fn check_surfaces(record: &TransactionRecord) -> Result<(), String> {
    let known = |id: &str| SURFACE_IDS.contains(&id);
    if let Some(from) = &record.copied_from {
        if !known(from) {
            return Err("copiedFrom is not a surface the registry declares".to_string());
        }
    }
    if record.surfaces.iter().any(|s| !known(s)) {
        return Err("surfaces names a surface the registry does not declare".to_string());
    }
    Ok(())
}

/// A copy's audit entry is written only when the engine's manifest for this
/// transaction is on disk and committed. The row's own claims are checked with
/// the same pinned-path rules Undo uses, and the manifest must sit in the
/// folder named for the transaction, so one real manifest cannot back a
/// second, invented transaction id.
pub(crate) fn require_committed_manifest(home: &Path, record: &TransactionRecord) -> Result<(), String> {
    let relative = manifest_relative(home, record)?;
    let folder = relative.split('/').nth(2).unwrap_or_default();
    if folder != record.transaction_id {
        return Err("The manifest does not belong to this transaction.".to_string());
    }
    let (manifest, _) = read_manifest(home, record)?;
    if manifest.status != "committed" {
        return Err("The transaction is not committed, so no copy is recorded.".to_string());
    }
    Ok(())
}

/// What a change was about, for a sentence: `mcp-server github`, or a count.
fn describe(record: &TransactionRecord) -> String {
    let names: Vec<String> = record
        .identity_keys
        .iter()
        .map(|key| clean(&key.replacen(':', " ", 1)))
        .collect();
    match names.len() {
        0 => "a resource".to_string(),
        1..=3 => names.join(", "),
        n => format!("{}, and {} more", names[..3].join(", "), n - 3),
    }
}

fn targets(record: &TransactionRecord) -> String {
    let surfaces: Vec<String> = record.surfaces.iter().map(|s| clean(s)).collect();
    surfaces.join(", ")
}

/// The audit entry for a Machine copy, or `None` when the record is not one.
/// A record that names a source but is not shaped like a copy is an error, so
/// the log never says something the app did not do.
pub(crate) fn copy_audit_entry(record: &TransactionRecord) -> Result<Option<AuditDraft>, String> {
    let Some(from) = &record.copied_from else {
        return Ok(None);
    };
    if !is_surface_id(from) {
        return Err("copiedFrom must be a surface id".to_string());
    }
    if record.surfaces.is_empty() {
        return Err("a copy must name the surface it went to".to_string());
    }
    let to = targets(record);
    Ok(Some(AuditDraft {
        summary: format!("Copied {} from {} to {}", describe(record), from, to),
        details: serde_json::json!({
            "transactionId": record.transaction_id,
            "from": from,
            "to": record.surfaces,
            "kinds": record.kinds,
            "identityKeys": record.identity_keys,
            "appliedAt": record.applied_at,
        })
        .to_string(),
    }))
}

fn undo_audit_entry(record: &TransactionRecord, files: &[String]) -> AuditDraft {
    let on = targets(record);
    let summary = if on.is_empty() {
        format!("Undid the change to {}", describe(record))
    } else {
        format!("Undid the change to {} on {}", describe(record), on)
    };
    AuditDraft {
        summary,
        details: serde_json::json!({
            "transactionId": record.transaction_id,
            "appliedAt": record.applied_at,
            "files": files,
        })
        .to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::harness_state::{record_transaction_at, record_transaction_audited};
    use crate::commands::surface_write::{apply_and_note_commits, set_test_home, CommittedTransactions};
    use std::fs;
    use std::path::PathBuf;

    /// `record_transaction_audited` for a record whose apply "happened" in this
    /// session: its id is in the committed set.
    fn audited(db: &Db, f: &Fixture, row: TransactionRecord) -> Result<(), String> {
        let committed = CommittedTransactions::default();
        committed.insert(&row.transaction_id);
        record_transaction_audited(db, &committed, f.home.path(), &f.db, row)
    }

    struct Fixture {
        home: tempfile::TempDir,
        db: PathBuf,
    }

    fn fixture() -> Fixture {
        let home = tempfile::tempdir().unwrap();
        set_test_home(home.path());
        let db = home.path().join("state.db");
        Fixture { home, db }
    }

    fn record(f: &Fixture, id: &str, applied_at: &str) -> TransactionRecord {
        TransactionRecord {
            transaction_id: id.to_string(),
            applied_at: applied_at.to_string(),
            roots: vec!["home".to_string()],
            manifest_path: format!(".harness/backups/{id}/transaction.json"),
            manifest_root: f.home.path().to_string_lossy().into_owned(),
            backup_dir: format!(".harness/backups/{id}"),
            surfaces: vec!["codex".to_string()],
            kinds: vec!["mcp-server".to_string()],
            identity_keys: vec!["mcp-server:github".to_string()],
            copied_from: None,
        }
    }

    fn write(f: &Fixture, relative: &str, content: &str) {
        let path = f.home.path().join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn read(f: &Fixture, relative: &str) -> Option<String> {
        fs::read_to_string(f.home.path().join(relative)).ok()
    }

    /// A committed change: the manifest on disk, the file holding `after`, and
    /// the ledger row.
    fn commit(f: &Fixture, id: &str, applied_at: &str, path: &str, before: Option<&str>, after: &str) {
        let manifest = serde_json::json!({
            "version": 2,
            "timestamp": id,
            "status": "committed",
            "changes": [{ "root": "home", "path": path, "before": before, "after": after }],
        });
        write(f, &format!(".harness/backups/{id}/transaction.json"), &manifest.to_string());
        write(f, path, after);
        record_transaction_at(&f.db, record(f, id, applied_at)).unwrap();
    }

    #[test]
    fn lists_changes_newest_first_with_their_files() {
        let f = fixture();
        commit(&f, "a", "2026-11-01T10:00:00.000Z", ".claude.json", Some("{}"), "{\"a\":1}");
        commit(&f, "b", "2026-11-02T10:00:00.000Z", ".codex/config.toml", None, "x = 1\n");

        let listed = list_changes_at(&f.db, f.home.path(), None).unwrap();
        let ids: Vec<&str> = listed.iter().map(|e| e.transaction_id.as_str()).collect();
        assert_eq!(ids, ["b", "a"]);
        assert_eq!(listed[0].files, [".codex/config.toml"]);
        assert_eq!(listed[0].surfaces, ["codex"]);
        assert_eq!(listed[0].status, "applied");
        assert!(listed[0].undoable);
        assert!(listed[0].reason.is_none());
    }

    #[test]
    fn a_limit_caps_the_list() {
        let f = fixture();
        commit(&f, "a", "2026-11-01T10:00:00.000Z", ".claude.json", Some("{}"), "{\"a\":1}");
        commit(&f, "b", "2026-11-02T10:00:00.000Z", ".claude.json", Some("{\"a\":1}"), "{\"a\":2}");
        assert_eq!(list_changes_at(&f.db, f.home.path(), Some(1)).unwrap().len(), 1);
        assert!(list_changes_at(&f.db, f.home.path(), Some(-5)).unwrap().is_empty());
    }

    #[test]
    fn listing_without_a_database_is_empty_and_creates_nothing() {
        let f = fixture();
        assert!(list_changes_at(&f.db, f.home.path(), None).unwrap().is_empty());
        assert!(!f.db.exists(), "a read created the state database");
    }

    #[test]
    fn a_change_whose_backup_is_gone_is_listed_as_unavailable() {
        let f = fixture();
        record_transaction_at(&f.db, record(&f, "gone", "2026-11-01T10:00:00.000Z")).unwrap();
        let listed = list_changes_at(&f.db, f.home.path(), None).unwrap();
        assert_eq!(listed[0].status, "unavailable");
        assert!(!listed[0].undoable);
        assert!(listed[0].reason.as_deref().unwrap().contains("no longer on disk"));
    }

    #[test]
    fn a_project_change_is_listed_but_not_undoable_here() {
        let f = fixture();
        let elsewhere = tempfile::tempdir().unwrap();
        let mut row = record(&f, "proj", "2026-11-01T10:00:00.000Z");
        row.manifest_root = elsewhere.path().to_string_lossy().into_owned();
        record_transaction_at(&f.db, row).unwrap();
        let listed = list_changes_at(&f.db, f.home.path(), None).unwrap();
        assert!(!listed[0].undoable);
        assert_eq!(listed[0].reason.as_deref(), Some(PROJECT_CHANGE));
    }

    #[test]
    fn undo_puts_the_file_back_and_marks_the_change_undone() {
        let f = fixture();
        commit(&f, "a", "2026-11-01T10:00:00.000Z", ".claude.json", Some("{\"old\":true}"), "{\"new\":true}");

        let (outcome, audit) = undo_change_at(&f.db, f.home.path(), "a").unwrap();
        assert_eq!(read(&f, ".claude.json").as_deref(), Some("{\"old\":true}"));
        assert_eq!(outcome.files, [".claude.json"]);
        assert!(outcome.warning.is_none());
        assert!(audit.summary.contains("mcp-server github"), "{}", audit.summary);

        let listed = list_changes_at(&f.db, f.home.path(), None).unwrap();
        assert_eq!(listed[0].status, "undone");
        assert!(!listed[0].undoable);

        // A second Undo is refused and writes nothing.
        let again = undo_change_at(&f.db, f.home.path(), "a").unwrap_err();
        assert!(again.contains("Already undone"), "{again}");
        assert_eq!(read(&f, ".claude.json").as_deref(), Some("{\"old\":true}"));
    }

    #[test]
    fn undo_removes_a_file_the_change_created() {
        let f = fixture();
        commit(&f, "c", "2026-11-01T10:00:00.000Z", ".codex/config.toml", None, "x = 1\n");
        undo_change_at(&f.db, f.home.path(), "c").unwrap();
        assert_eq!(read(&f, ".codex/config.toml"), None);
    }

    #[test]
    fn undo_refuses_when_the_file_changed_since_and_writes_nothing() {
        let f = fixture();
        commit(&f, "a", "2026-11-01T10:00:00.000Z", ".claude.json", Some("{\"old\":true}"), "{\"new\":true}");
        write(&f, ".claude.json", "{\"edited\":\"by hand\"}");

        let error = undo_change_at(&f.db, f.home.path(), "a").unwrap_err();
        assert!(error.contains("changed on disk"), "{error}");
        assert_eq!(read(&f, ".claude.json").as_deref(), Some("{\"edited\":\"by hand\"}"));
        // Still offered: the user can fix the file and try again.
        let listed = list_changes_at(&f.db, f.home.path(), None).unwrap();
        assert_eq!(listed[0].status, "applied");
    }

    #[test]
    fn one_changed_file_stops_the_undo_of_every_file() {
        let f = fixture();
        let manifest = serde_json::json!({
            "version": 2, "timestamp": "m", "status": "committed",
            "changes": [
                { "root": "home", "path": ".claude.json", "before": "{}", "after": "{\"a\":1}" },
                { "root": "home", "path": ".codex/config.toml", "before": "", "after": "x = 1\n" },
            ],
        });
        write(&f, ".harness/backups/m/transaction.json", &manifest.to_string());
        write(&f, ".claude.json", "{\"a\":1}");
        write(&f, ".codex/config.toml", "x = 2\n");
        record_transaction_at(&f.db, record(&f, "m", "2026-11-01T10:00:00.000Z")).unwrap();

        assert!(undo_change_at(&f.db, f.home.path(), "m").is_err());
        assert_eq!(read(&f, ".claude.json").as_deref(), Some("{\"a\":1}"));
    }

    #[test]
    fn undo_refuses_an_unknown_or_empty_id() {
        let f = fixture();
        commit(&f, "a", "2026-11-01T10:00:00.000Z", ".claude.json", Some("{}"), "{\"a\":1}");
        for id in ["nope", "", "  ", &"x".repeat(MAX_ID_BYTES + 1)] {
            let error = undo_change_at(&f.db, f.home.path(), id).unwrap_err();
            assert!(error.contains("No recorded change"), "{id:?}: {error}");
        }
        assert_eq!(read(&f, ".claude.json").as_deref(), Some("{\"a\":1}"));
    }

    #[test]
    fn undo_with_no_database_is_refused() {
        let f = fixture();
        assert!(undo_change_at(&f.db, f.home.path(), "a").is_err());
        assert!(!f.db.exists());
    }

    #[test]
    fn undo_refuses_a_row_whose_manifest_path_leaves_the_backup_folder() {
        let f = fixture();
        write(&f, "outside/transaction.json", "{}");
        for (i, path) in [
            "../outside/transaction.json",
            ".harness/backups/../../outside/transaction.json",
            ".harness/harness.db",
            "outside/transaction.json",
            ".harness/backups/a/b/transaction.json",
        ]
        .iter()
        .enumerate()
        {
            let id = format!("evil{i}");
            let mut row = record(&f, &id, "2026-11-01T10:00:00.000Z");
            row.manifest_path = path.to_string();
            record_transaction_at(&f.db, row).unwrap();
            let error = undo_change_at(&f.db, f.home.path(), &id).unwrap_err();
            assert!(error.contains("outside the app's backup folder"), "{path}: {error}");
        }
    }

    #[test]
    fn undo_refuses_a_manifest_that_names_a_file_the_app_does_not_manage() {
        let f = fixture();
        for path in [".ssh/authorized_keys", ".harness/harness.db", "../escape", ".zshrc"] {
            let manifest = serde_json::json!({
                "version": 2, "timestamp": "e", "status": "committed",
                "changes": [{ "root": "home", "path": path, "before": "evil", "after": "x" }],
            });
            write(&f, ".harness/backups/e/transaction.json", &manifest.to_string());
            record_transaction_at(&f.db, record(&f, "e", "2026-11-01T10:00:00.000Z")).unwrap();
            let error = undo_change_at(&f.db, f.home.path(), "e").unwrap_err();
            assert!(error.contains("will not be touched"), "{path}: {error}");
        }
        assert_eq!(read(&f, ".ssh/authorized_keys"), None);
    }

    #[test]
    fn undo_refuses_a_project_rooted_manifest() {
        let f = fixture();
        let manifest = serde_json::json!({
            "version": 1, "timestamp": "p", "status": "committed",
            "changes": [{ "path": ".claude.json", "before": "{}", "after": "{\"a\":1}" }],
        });
        write(&f, ".harness/backups/p/transaction.json", &manifest.to_string());
        write(&f, ".claude.json", "{\"a\":1}");
        record_transaction_at(&f.db, record(&f, "p", "2026-11-01T10:00:00.000Z")).unwrap();
        let error = undo_change_at(&f.db, f.home.path(), "p").unwrap_err();
        assert_eq!(error, PROJECT_CHANGE);
        assert_eq!(read(&f, ".claude.json").as_deref(), Some("{\"a\":1}"));
    }

    #[test]
    fn undo_refuses_a_manifest_that_is_not_committed() {
        let f = fixture();
        let manifest = serde_json::json!({
            "version": 2, "timestamp": "n", "status": "prepared",
            "changes": [{ "root": "home", "path": ".claude.json", "before": "{}", "after": "{\"a\":1}" }],
        });
        write(&f, ".harness/backups/n/transaction.json", &manifest.to_string());
        write(&f, ".claude.json", "{\"a\":1}");
        record_transaction_at(&f.db, record(&f, "n", "2026-11-01T10:00:00.000Z")).unwrap();
        let error = undo_change_at(&f.db, f.home.path(), "n").unwrap_err();
        assert!(error.contains("did not finish"), "{error}");
    }

    #[cfg(unix)]
    #[test]
    fn undo_refuses_a_manifest_reached_through_a_symlink() {
        let f = fixture();
        let elsewhere = tempfile::tempdir().unwrap();
        let manifest = serde_json::json!({
            "version": 2, "timestamp": "s", "status": "committed",
            "changes": [{ "root": "home", "path": ".claude.json", "before": "{}", "after": "{\"a\":1}" }],
        });
        fs::write(elsewhere.path().join("transaction.json"), manifest.to_string()).unwrap();
        fs::create_dir_all(f.home.path().join(".harness/backups")).unwrap();
        std::os::unix::fs::symlink(elsewhere.path(), f.home.path().join(".harness/backups/s")).unwrap();
        write(&f, ".claude.json", "{\"a\":1}");
        record_transaction_at(&f.db, record(&f, "s", "2026-11-01T10:00:00.000Z")).unwrap();
        assert!(undo_change_at(&f.db, f.home.path(), "s").is_err());
        assert_eq!(read(&f, ".claude.json").as_deref(), Some("{\"a\":1}"));
    }

    // ── Audit ──────────────────────────────────────────────────

    fn audit_rows(db: &Db) -> Vec<(String, String, String, String, String)> {
        let conn = db.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT event_type, category, summary, details, source FROM audit_log ORDER BY timestamp")
            .unwrap();
        stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get::<_, Option<String>>(3)?.unwrap_or_default(), row.get(4)?))
        })
        .unwrap()
        .map(Result::unwrap)
        .collect()
    }

    #[test]
    fn a_machine_copy_is_recorded_in_the_audit_log() {
        let f = fixture();
        let data = tempfile::tempdir().unwrap();
        let db = crate::db::init(data.path()).unwrap();
        let mut row = record(&f, "copy1", "2026-11-03T09:00:00.000Z");
        row.copied_from = Some("claude-code".to_string());
        write_manifest(&f, "copy1", "committed");

        audited(&db, &f, row).unwrap();

        let rows = audit_rows(&db);
        assert_eq!(rows.len(), 1);
        let (event, category, summary, details, source) = &rows[0];
        assert_eq!(event, "machine_copy");
        assert_eq!(category, "changes");
        assert_eq!(summary, "Copied mcp-server github from claude-code to codex");
        assert_eq!(source, "machine");
        let details: serde_json::Value = serde_json::from_str(details).unwrap();
        assert_eq!(details["from"], "claude-code");
        assert_eq!(details["to"][0], "codex");
        assert_eq!(details["transactionId"], "copy1");
        assert_eq!(details["appliedAt"], "2026-11-03T09:00:00.000Z");
        // And the ledger row exists too.
        assert_eq!(list_transactions_at(&f.db, None).unwrap().len(), 1);
    }

    #[test]
    fn a_record_without_a_source_surface_writes_no_audit_entry() {
        let f = fixture();
        let data = tempfile::tempdir().unwrap();
        let db = crate::db::init(data.path()).unwrap();
        audited(&db, &f, record(&f, "page-save", "2026-11-03T09:00:00.000Z")).unwrap();
        assert!(audit_rows(&db).is_empty());
        assert_eq!(list_transactions_at(&f.db, None).unwrap().len(), 1);
    }

    fn write_manifest(f: &Fixture, id: &str, status: &str) {
        let manifest = serde_json::json!({
            "version": 2, "timestamp": id, "status": status,
            "changes": [{ "root": "home", "path": ".claude.json", "before": null, "after": "{}" }],
        });
        write(f, &format!(".harness/backups/{id}/transaction.json"), &manifest.to_string());
    }

    fn copy_row(f: &Fixture, id: &str) -> TransactionRecord {
        let mut row = record(f, id, "2026-11-03T09:00:00.000Z");
        row.copied_from = Some("claude-code".to_string());
        row
    }

    fn assert_refused_and_unlogged(f: &Fixture, row: TransactionRecord) {
        let data = tempfile::tempdir().unwrap();
        let db = crate::db::init(data.path()).unwrap();
        assert!(audited(&db, f, row).is_err());
        assert!(audit_rows(&db).is_empty());
        assert!(!f.db.exists() || list_transactions_at(&f.db, None).unwrap().is_empty());
    }

    #[test]
    fn a_copy_with_no_manifest_on_disk_is_refused_and_unlogged() {
        let f = fixture();
        assert_refused_and_unlogged(&f, copy_row(&f, "forged"));
    }

    #[test]
    fn a_copy_whose_manifest_is_not_committed_is_refused_and_unlogged() {
        for status in ["prepared", "rolled-back"] {
            let f = fixture();
            write_manifest(&f, "half", status);
            assert_refused_and_unlogged(&f, copy_row(&f, "half"));
        }
    }

    #[test]
    fn a_copy_cannot_borrow_another_transactions_manifest() {
        let f = fixture();
        write_manifest(&f, "real", "committed");
        let mut row = copy_row(&f, "forged");
        row.manifest_path = ".harness/backups/real/transaction.json".to_string();
        assert_refused_and_unlogged(&f, row);
    }

    #[test]
    fn surfaces_the_registry_does_not_know_are_refused() {
        let f = fixture();
        write_manifest(&f, "c1", "committed");
        let mut from = copy_row(&f, "c1");
        from.copied_from = Some("not-a-surface".to_string());
        assert_refused_and_unlogged(&f, from);
        let mut to = copy_row(&f, "c1");
        to.surfaces = vec!["codex".to_string(), "evil".to_string()];
        assert_refused_and_unlogged(&f, to);
        // A plain page-save record names surfaces too, so the check is not copy-only.
        let mut plain = record(&f, "c1", "2026-11-03T09:00:00.000Z");
        plain.surfaces = vec!["evil".to_string()];
        assert_refused_and_unlogged(&f, plain);
    }

    #[test]
    fn a_record_naming_more_surfaces_than_exist_is_refused() {
        let f = fixture();
        let mut row = record(&f, "many", "2026-11-03T09:00:00.000Z");
        row.surfaces = vec!["codex".to_string(); 33];
        assert_refused_and_unlogged(&f, row);
    }

    #[test]
    fn every_registry_surface_id_is_accepted() {
        let f = fixture();
        let data = tempfile::tempdir().unwrap();
        let db = crate::db::init(data.path()).unwrap();
        let mut row = record(&f, "all", "2026-11-03T09:00:00.000Z");
        row.surfaces = SURFACE_IDS.iter().map(|s| s.to_string()).collect();
        audited(&db, &f, row).unwrap();
    }

    fn webview_write(path: &str, content: &str) -> crate::commands::surface_write::SurfaceFileWrite {
        serde_json::from_value(serde_json::json!({
            "relativePath": path, "content": content, "expectedSha256": null
        }))
        .unwrap()
    }

    #[test]
    fn a_forged_manifest_without_a_commit_through_apply_cannot_back_a_copy() {
        // The webview writes the manifest file straight onto disk (here:
        // directly), never through apply_surface_transaction's commit path.
        let f = fixture();
        let data = tempfile::tempdir().unwrap();
        let db = crate::db::init(data.path()).unwrap();
        write_manifest(&f, "forged", "committed");
        let committed = CommittedTransactions::default();
        let err = record_transaction_audited(&db, &committed, f.home.path(), &f.db, copy_row(&f, "forged"))
            .unwrap_err();
        assert!(err.contains("not applied by this app session"), "{err}");
        assert!(audit_rows(&db).is_empty());
        assert!(!f.db.exists() || list_transactions_at(&f.db, None).unwrap().is_empty());
    }

    #[test]
    fn only_a_committed_manifest_written_by_apply_marks_the_id() {
        let f = fixture();
        let committed = CommittedTransactions::default();
        let manifest = |status: &str| serde_json::json!({ "status": status }).to_string();
        for (path, content) in [
            (".harness/backups/p/transaction.json", manifest("prepared")),
            (".harness/backups/q/other.json", manifest("committed")),
            (".harness/backups/r/transaction.json", "not json".to_string()),
        ] {
            apply_and_note_commits(&committed, f.home.path(), vec![webview_write(path, &content)]).unwrap();
        }
        assert!(!committed.contains("p") && !committed.contains("q") && !committed.contains("r"));
        apply_and_note_commits(
            &committed,
            f.home.path(),
            vec![webview_write(".harness/backups/ok/transaction.json", &manifest("committed"))],
        )
        .unwrap();
        assert!(committed.contains("ok"));
    }

    #[test]
    fn a_failed_apply_marks_nothing() {
        let f = fixture();
        let committed = CommittedTransactions::default();
        let body = serde_json::json!({ "status": "committed" }).to_string();
        let result = apply_and_note_commits(
            &committed,
            f.home.path(),
            vec![
                webview_write(".harness/backups/bad/transaction.json", &body),
                webview_write("not/a/declared/store", "x"),
            ],
        );
        assert!(result.is_err());
        assert!(!committed.contains("bad"));
    }

    #[test]
    fn an_identical_replay_logs_the_audit_entry_once() {
        let f = fixture();
        let data = tempfile::tempdir().unwrap();
        let db = crate::db::init(data.path()).unwrap();
        write_manifest(&f, "twice", "committed");
        let committed = CommittedTransactions::default();
        committed.insert("twice");
        for _ in 0..2 {
            record_transaction_audited(&db, &committed, f.home.path(), &f.db, copy_row(&f, "twice")).unwrap();
        }
        assert_eq!(audit_rows(&db).len(), 1);
        assert_eq!(list_transactions_at(&f.db, None).unwrap().len(), 1);
    }

    #[test]
    fn a_malformed_source_surface_refuses_the_record_and_logs_nothing() {
        let f = fixture();
        let data = tempfile::tempdir().unwrap();
        let db = crate::db::init(data.path()).unwrap();
        for bad in ["", "a b", "x\ny", &"z".repeat(65), "Copied everything"] {
            let mut row = record(&f, "bad", "2026-11-03T09:00:00.000Z");
            row.copied_from = Some(bad.to_string());
            assert!(audited(&db, &f, row).is_err(), "{bad:?}");
        }
        assert!(audit_rows(&db).is_empty());
        assert!(!f.db.exists() || list_transactions_at(&f.db, None).unwrap().is_empty());
    }

    #[test]
    fn audit_text_strips_control_characters_from_webview_ids() {
        let f = fixture();
        let mut row = record(&f, "t", "2026-11-03T09:00:00.000Z");
        row.copied_from = Some("claude-code".to_string());
        row.identity_keys = vec!["mcp-server:evil\n[forged] entry".to_string()];
        let entry = copy_audit_entry(&row).unwrap().unwrap();
        assert!(!entry.summary.contains('\n'), "{}", entry.summary);
    }

    #[test]
    fn the_copy_source_survives_the_ledger_round_trip() {
        let f = fixture();
        write_manifest(&f, "a", "committed");
        let mut row = record(&f, "a", "2026-11-01T10:00:00.000Z");
        row.copied_from = Some("claude-code".to_string());
        record_transaction_at(&f.db, row).unwrap();
        let listed = list_changes_at(&f.db, f.home.path(), None).unwrap();
        assert_eq!(listed[0].copied_from.as_deref(), Some("claude-code"));
    }
}
