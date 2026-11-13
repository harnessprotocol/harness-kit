//! AC-60, runtime half. Builds a Tauri app on the mock runtime with the REAL
//! `tauri.conf.json`, the REAL `capabilities/default.json` and the ACL manifest
//! build.rs generates, then sends IPC requests through Tauri's own dispatcher from
//! the "main" window. Granted calls pass the ACL; calls the capability does not
//! grant are refused with Tauri's ACL error.
//!
//! This is the nightly "real app" check where a real launch is not possible:
//! tauri-driver has no macOS WebKit driver, so the packaged app cannot be driven
//! from CI. The mock runtime has no webview, but it runs the same ACL resolver the
//! packaged app uses, so a capability change that breaks production fails here.
//!
//! No app command handlers are registered, on purpose. The ACL check runs before
//! dispatch, so a granted command reaches "command not found" and nothing touches
//! the user's disk, keychain or network; an ungranted one stops at the ACL. This
//! file is its own crate because `generate_context!` may be expanded once per crate.

use tauri::ipc::{CallbackFn, InvokeBody, InvokeResponseBody};
use tauri::test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Manager, WebviewUrl, WebviewWindowBuilder};

const CAPABILITY: &str = include_str!("../capabilities/default.json");
const BUILD_RS: &str = include_str!("../build.rs");

fn app() -> App<MockRuntime> {
    let app = mock_builder()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .build(tauri::generate_context!())
        .expect("the real tauri.conf.json and capabilities must build an app");
    if app.get_webview_window("main").is_none() {
        WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
            .build()
            .expect("create the main window");
    }
    app
}

fn call(
    app: &App<MockRuntime>,
    cmd: &str,
    body: serde_json::Value,
    origin: &str,
) -> Result<InvokeResponseBody, serde_json::Value> {
    let window = app.get_webview_window("main").expect("main window");
    get_ipc_response(
        &window,
        InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: origin.parse().unwrap(),
            body: InvokeBody::Json(body),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
}

fn is_acl_refusal(err: &serde_json::Value) -> bool {
    let text = err.to_string();
    text.contains("not allowed") || text.contains("Permissions associated with this command")
}

/// Every app command declared in build.rs's AppManifest: the commands the app
/// registers, each of which the capability must grant. Read from the declaration,
/// not from the capability, so deleting a grant makes a command fail here instead
/// of silently shrinking the list.
fn manifest_app_commands() -> Vec<String> {
    let start = BUILD_RS.find("commands(&[").expect("AppManifest commands list in build.rs");
    let end = BUILD_RS[start..].find("])").expect("end of commands list") + start;
    BUILD_RS[start..end]
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.starts_with("//"))
        .filter_map(|l| l.strip_prefix('"').and_then(|r| r.split('"').next()))
        .map(str::to_string)
        .collect()
}

/// Bare `allow-<kebab>` app-command grants in the capability, as command names.
fn granted_app_commands() -> Vec<String> {
    let caps: serde_json::Value = serde_json::from_str(CAPABILITY).unwrap();
    caps["permissions"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|p| p.as_str())
        .filter_map(|id| id.strip_prefix("allow-"))
        .map(|kebab| kebab.replace('-', "_"))
        .collect()
}

#[test]
fn the_real_app_builds_with_the_real_capability() {
    let app = app();
    assert!(app.get_webview_window("main").is_some());
}

#[test]
fn every_granted_app_command_passes_the_acl() {
    let app = app();
    let commands = manifest_app_commands();
    assert!(commands.len() > 60, "found only {} manifest commands; the parser is broken", commands.len());
    let mut granted = granted_app_commands();
    granted.sort();
    let mut declared = commands.clone();
    declared.sort();
    assert_eq!(declared, granted, "build.rs AppManifest and default.json grants must list the same commands");
    let mut refused = Vec::new();
    for cmd in &commands {
        if let Err(e) = call(&app, cmd, serde_json::json!({}), "tauri://localhost") {
            if is_acl_refusal(&e) {
                refused.push(format!("{cmd}: {e}"));
            }
        }
    }
    assert!(refused.is_empty(), "granted in default.json but refused by the ACL:\n  {}", refused.join("\n  "));
}

#[test]
fn granted_plugin_calls_are_not_refused_by_the_acl() {
    // `exists` outside the fs scope fails on the SCOPE ("forbidden path"), not on the
    // ACL: the permission is granted, the path is not. TauriFsProvider.exists() relies
    // on this and treats the string as "absent".
    let app = app();
    if let Err(e) = call(&app, "plugin:fs|exists", serde_json::json!({ "path": "/etc/hosts" }), "tauri://localhost") {
        let text = e.to_string();
        assert!(
            !is_acl_refusal(&e) || text.contains("forbidden path"),
            "fs exists must be granted by the capability: {text}"
        );
    }
}

#[test]
fn ungranted_plugin_calls_are_refused_by_the_acl() {
    let app = app();
    for (cmd, body) in [
        ("plugin:fs|write_text_file", serde_json::json!({ "path": "/tmp/x" })),
        ("plugin:fs|remove", serde_json::json!({ "path": "/tmp/x" })),
        ("plugin:fs|rename", serde_json::json!({ "oldPath": "/tmp/a", "newPath": "/tmp/b" })),
        ("plugin:shell|execute", serde_json::json!({})),
        ("plugin:shell|spawn", serde_json::json!({})),
    ] {
        match call(&app, cmd, body, "tauri://localhost") {
            Ok(_) => panic!("{cmd} must not be granted to the webview"),
            Err(e) => assert!(is_acl_refusal(&e), "{cmd} refused, but not by the ACL: {e}"),
        }
    }
}

#[test]
fn a_remote_origin_gets_no_app_commands() {
    let app = app();
    match call(&app, "get_system_info", serde_json::json!({}), "https://example.com/") {
        Ok(_) => panic!("a remote page must not reach app commands"),
        Err(e) => assert!(is_acl_refusal(&e), "refused, but not by the ACL: {e}"),
    }
}
