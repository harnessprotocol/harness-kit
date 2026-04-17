use serde::Serialize;
use std::env;
use std::process::Command as StdCommand;

const FEEDBACK_ENDPOINT: &str = "https://harnesskit.ai/feedback";

// ── Types ────────────────────────────────────────────────────

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
    category: String,
    title: String,
    description: String,
    os: String,
    os_version: String,
    arch: String,
    app_version: String,
) -> Result<FeedbackResult, String> {
    let body = serde_json::json!({
        "category": category,
        "title": title,
        "description": description,
        "os": os,
        "osVersion": os_version,
        "arch": arch,
        "appVersion": app_version,
    });

    let client = reqwest::Client::new();
    let response = client
        .post(FEEDBACK_ENDPOINT)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status().is_success() {
        let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        Ok(FeedbackResult {
            success: true,
            issue_url: json["issueUrl"].as_str().map(String::from),
            error: None,
        })
    } else {
        let status = response.status().as_u16();
        Ok(FeedbackResult {
            success: false,
            issue_url: None,
            error: Some(format!("Server returned HTTP {status}")),
        })
    }
}
