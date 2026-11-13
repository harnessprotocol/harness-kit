//! AC-60, Rust half of the IPC contract.
//!
//! `apps/desktop/test-fixtures/ipc/<command>.json` holds the exact payloads the
//! webview sends (`src/lib/__tests__/ipc-contract.test.ts` proves tauri.ts sends
//! them). This test checks each payload against the command's real signature, read
//! from the `#[tauri::command]` source: argument names after Tauri's camelCase
//! conversion (or `rename_all` on the attribute), required versus `Option`
//! arguments, scalar types, and for struct-typed arguments a real serde
//! deserialization into the type the command takes.
//!
//! Why read the source: a `#[tauri::command]` function cannot be called without
//! a running app, and its argument decoding happens inside the generated macro.
//! A payload that Tauri would refuse ("invalid args `expectedSha256`", "missing
//! required key") is refused here too. Deleting `rename_all`-free camelCase
//! behaviour, renaming a Rust parameter, or renaming a fixture field fails this.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

struct Param {
    /// The key the webview must send.
    key: String,
    ty: String,
}

struct Command {
    params: Vec<Param>,
}

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn camel(snake: &str) -> String {
    let mut out = String::new();
    let mut upper = false;
    for c in snake.chars() {
        if c == '_' {
            upper = true;
        } else if upper {
            out.extend(c.to_uppercase());
            upper = false;
        } else {
            out.push(c);
        }
    }
    out
}

/// Split on commas that are not nested inside `<>`, `()` or `[]`.
fn split_top_level(s: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut cur = String::new();
    for c in s.chars() {
        match c {
            '<' | '(' | '[' => depth += 1,
            '>' | ')' | ']' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(std::mem::take(&mut cur));
                continue;
            }
            _ => {}
        }
        cur.push(c);
    }
    if !cur.trim().is_empty() {
        parts.push(cur);
    }
    parts.into_iter().map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect()
}

/// Arguments Tauri injects itself; the webview never sends them.
fn is_injected(ty: &str) -> bool {
    let t = ty.trim_start_matches('&').trim();
    t.starts_with("State<")
        || t.starts_with("tauri::State<")
        || t.starts_with("AppHandle")
        || t.starts_with("tauri::AppHandle")
        || t.starts_with("Window")
        || t.starts_with("WebviewWindow")
        || t.starts_with("tauri::Window")
        || t.starts_with("tauri::WebviewWindow")
        || t.starts_with("Webview")
}

fn collect_rs(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            collect_rs(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

/// Every `#[tauri::command]` under src/, keyed by function name.
fn scan_commands() -> BTreeMap<String, Command> {
    let mut files = Vec::new();
    collect_rs(&manifest_dir().join("src"), &mut files);
    files.retain(|f| !f.ends_with("commands/ipc_contract.rs"));
    let mut found = BTreeMap::new();
    for file in files {
        let text = fs::read_to_string(&file).unwrap();
        let mut rest = text.as_str();
        while let Some(at) = rest.find("#[tauri::command") {
            let after = &rest[at..];
            let attr_end = after.find(']').expect("unterminated attribute");
            let attr = &after[..attr_end];
            let snake = if attr.contains("rename_all") {
                assert!(
                    attr.contains("\"snake_case\""),
                    "{}: unsupported rename_all in {attr}",
                    file.display()
                );
                true
            } else {
                false
            };
            let body = &after[attr_end..];
            let fn_at = body.find("fn ").expect("command without fn");
            let sig = &body[fn_at + 3..];
            let paren = sig.find('(').unwrap();
            let name = sig[..paren].trim().to_string();
            // Find the matching close paren of the parameter list.
            let mut depth = 0i32;
            let mut end = 0usize;
            for (i, c) in sig[paren..].char_indices() {
                match c {
                    '(' => depth += 1,
                    ')' => {
                        depth -= 1;
                        if depth == 0 {
                            end = paren + i;
                            break;
                        }
                    }
                    _ => {}
                }
            }
            let mut params = Vec::new();
            for raw in split_top_level(&sig[paren + 1..end]) {
                let (pname, ty) = raw.split_once(':').unwrap_or_else(|| panic!("odd param `{raw}` in {name}"));
                let ty = ty.trim().to_string();
                if is_injected(&ty) {
                    continue;
                }
                let pname = pname.trim().trim_start_matches("mut ").trim();
                let key = if snake { pname.to_string() } else { camel(pname) };
                params.push(Param { key, ty });
            }
            found.insert(name, Command { params });
            rest = &rest[at + attr_end..];
        }
    }
    found
}

fn strip_option(ty: &str) -> Option<&str> {
    ty.strip_prefix("Option<").and_then(|t| t.strip_suffix('>')).map(str::trim)
}

/// Check one value against a Rust type. Struct types deserialize for real.
fn check_value(ty: &str, v: &Value) -> Result<(), String> {
    if let Some(inner) = strip_option(ty) {
        return if v.is_null() { Ok(()) } else { check_value(inner, v) };
    }
    let ok = match ty {
        "String" => v.is_string(),
        "bool" => v.is_boolean(),
        "i8" | "i16" | "i32" | "i64" | "isize" => v.is_i64(),
        "u8" | "u16" | "u32" | "u64" | "usize" => v.is_u64(),
        "f32" | "f64" => v.is_number(),
        "Vec<String>" => v.as_array().is_some_and(|a| a.iter().all(Value::is_string)),
        "PermissionsState" => {
            return serde_json::from_value::<super::security::PermissionsState>(v.clone())
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        "Vec<EnvConfigEntry>" => {
            return serde_json::from_value::<Vec<super::security::EnvConfigEntry>>(v.clone())
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        "Vec<SyncFileWrite>" => {
            return serde_json::from_value::<Vec<super::sync::SyncFileWrite>>(v.clone())
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        "Vec<FileDiffInput>" => {
            return serde_json::from_value::<Vec<super::comparator_panels::FileDiffInput>>(v.clone())
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        "DriftAck" => {
            return serde_json::from_value::<super::harness_state::DriftAck>(v.clone())
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        "ShareKind" => {
            return serde_json::from_value::<super::share::ShareKind>(v.clone())
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        other => return Err(format!("no contract check for argument type `{other}`; add one to check_value")),
    };
    if ok {
        Ok(())
    } else {
        Err(format!("expected {ty}, got {v}"))
    }
}

/// Why Tauri would refuse this payload for this command, if it would.
fn refusal(cmd: &Command, payload: &Value) -> Option<String> {
    let empty = serde_json::Map::new();
    let obj = match payload {
        Value::Null => &empty,
        Value::Object(o) => o,
        other => return Some(format!("payload must be an object or null, got {other}")),
    };
    for key in obj.keys() {
        if !cmd.params.iter().any(|p| &p.key == key) {
            return Some(format!(
                "unexpected argument `{key}`; the command takes {:?}",
                cmd.params.iter().map(|p| p.key.as_str()).collect::<Vec<_>>()
            ));
        }
    }
    for p in &cmd.params {
        match obj.get(&p.key) {
            None if strip_option(&p.ty).is_some() => {}
            None => return Some(format!("missing required argument `{}`", p.key)),
            Some(v) => {
                if let Err(e) = check_value(&p.ty, v) {
                    return Some(format!("argument `{}`: {e}", p.key));
                }
            }
        }
    }
    None
}

#[test]
fn every_ipc_fixture_is_accepted_by_its_command() {
    let commands = scan_commands();
    assert!(commands.len() > 60, "scan found only {} commands; the parser is broken", commands.len());
    let dir = manifest_dir().join("../test-fixtures/ipc");
    let mut checked = 0;
    let mut failures = Vec::new();
    for entry in fs::read_dir(&dir).expect("test-fixtures/ipc missing") {
        let path = entry.unwrap().path();
        if path.extension().is_none_or(|e| e != "json") {
            continue;
        }
        let fixture: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let name = fixture["command"].as_str().expect("fixture without `command`");
        assert_eq!(
            path.file_stem().unwrap().to_str().unwrap(),
            name,
            "fixture file name must be the command name"
        );
        let Some(cmd) = commands.get(name) else {
            failures.push(format!("{name}: no #[tauri::command] with this name"));
            continue;
        };
        for (i, call) in fixture["calls"].as_array().expect("fixture without `calls`").iter().enumerate() {
            if let Some(why) = refusal(cmd, &call["payload"]) {
                failures.push(format!("{name} call #{}: {why}", i + 1));
            }
            checked += 1;
        }
    }
    assert!(checked > 60, "only {checked} payloads checked");
    assert!(failures.is_empty(), "IPC fixtures the Rust commands would refuse:\n  {}", failures.join("\n  "));
}

#[test]
fn the_checker_rejects_a_renamed_field() {
    // Guards the checker itself: a snake_case key where Tauri expects camelCase,
    // the `rename_all` miss, must be refused.
    let cmd = Command {
        params: vec![
            Param { key: camel("expected_sha256"), ty: "Option<String>".into() },
            Param { key: camel("file_path"), ty: "String".into() },
        ],
    };
    assert!(refusal(&cmd, &serde_json::json!({ "filePath": "a", "expectedSha256": "x" })).is_none());
    assert!(refusal(&cmd, &serde_json::json!({ "filePath": "a" })).is_none());
    assert!(refusal(&cmd, &serde_json::json!({ "file_path": "a" })).is_some());
    assert!(refusal(&cmd, &serde_json::json!({ "filePath": "a", "expected_sha256": "x" })).is_some());
    assert!(refusal(&cmd, &serde_json::json!({ "filePath": 3 })).is_some());
    assert!(refusal(&cmd, &Value::Null).is_some());
}
