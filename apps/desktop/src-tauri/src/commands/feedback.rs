use serde::Serialize;
use std::env;
use std::process::Command as StdCommand;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

// ── Types ────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhAuthStatus {
    pub available: bool,
    pub authenticated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub os: String,
    pub os_version: String,
    pub arch: String,
    pub app_version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackResult {
    pub success: bool,
    pub issue_url: Option<String>,
    pub error: Option<String>,
}

// ── Commands ─────────────────────────────────────────────────

#[tauri::command]
pub async fn check_gh_auth(app: AppHandle) -> Result<GhAuthStatus, String> {
    let shell = app.shell();

    // Check if gh is available
    let version_out = shell.command("gh")
        .args(["--version"])
        .output()
        .await;

    let available = matches!(version_out, Ok(ref o) if o.status.success());
    if !available {
        return Ok(GhAuthStatus { available: false, authenticated: false });
    }

    // Check if authenticated
    let auth_out = shell.command("gh")
        .args(["auth", "status"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    Ok(GhAuthStatus {
        available: true,
        authenticated: auth_out.status.success(),
    })
}

#[tauri::command]
pub fn get_system_info() -> Result<SystemInfo, String> {
    let os = match env::consts::OS {
        "macos" => "macOS".to_string(),
        "linux" => "Linux".to_string(),
        "windows" => "Windows".to_string(),
        other => other.to_string(),
    };

    let os_version = get_os_version().unwrap_or_else(|| "Unknown".to_string());
    let arch = env::consts::ARCH.to_string();
    let app_version = env!("CARGO_PKG_VERSION").to_string();

    Ok(SystemInfo { os, os_version, arch, app_version })
}

fn get_os_version() -> Option<String> {
    match env::consts::OS {
        "macos" => StdCommand::new("sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()),
        _ => StdCommand::new("uname")
            .arg("-r")
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()),
    }
}

#[tauri::command]
pub async fn submit_feedback(
    app: AppHandle,
    category: String,
    title: String,
    description: String,
    os: String,
    os_version: String,
    arch: String,
    app_version: String,
) -> Result<FeedbackResult, String> {
    let (label, title_prefix) = match category.as_str() {
        "bug_report"       => ("bug",         "[Bug Report]"),
        "feature_request"  => ("enhancement", "[Feature Request]"),
        "general_feedback" => ("feedback",    "[Feedback]"),
        "question"         => ("question",    "[Question]"),
        _                  => ("feedback",    "[Feedback]"),
    };

    let full_title = format!("{} {}", title_prefix, title.trim());

    let body = format!(
        "## Description\n\n{}\n\n## System Info\n\n| Field | Value |\n|-------|-------|\n| OS | {} {} |\n| Architecture | {} |\n| App Version | {} |\n\n---\n*Submitted from Harness Kit desktop app*",
        description.trim(),
        os, os_version,
        arch,
        app_version,
    );

    let shell = app.shell();
    let output = shell.command("gh")
        .args([
            "issue", "create",
            "--repo", "harnessprotocol/harness-kit-feedback",
            "--title", &full_title,
            "--body", &body,
            "--label", label,
            "--label", "desktop-app",
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let issue_url = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(FeedbackResult {
            success: true,
            issue_url: Some(issue_url),
            error: None,
        })
    } else {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Ok(FeedbackResult {
            success: false,
            issue_url: None,
            error: Some(err),
        })
    }
}
