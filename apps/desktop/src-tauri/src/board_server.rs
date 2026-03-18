use std::net::TcpListener;
use std::process::Command;
use std::path::PathBuf;

const PORT: u16 = 4800;
const PLIST_LABEL: &str = "com.harness-kit.board-server";
const MAX_TRAVERSAL_DEPTH: usize = 10;

pub struct BoardServerState;

impl BoardServerState {
    pub fn new() -> Self {
        Self
    }

    /// Returns true if the board server appears to be running.
    pub fn check(&self) -> bool {
        port_in_use(PORT)
    }
}

fn port_in_use(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_err()
}

fn plist_path() -> PathBuf {
    dirs::home_dir()
        .expect("No home directory")
        .join("Library/LaunchAgents/com.harness-kit.board-server.plist")
}

fn current_uid() -> String {
    let output = Command::new("id").arg("-u").output().expect("failed to get uid");
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn find_node() -> Result<String, String> {
    let output = Command::new("which")
        .arg("node")
        .output()
        .map_err(|_| "Could not locate node — install Node.js first".to_string())?;
    if !output.status.success() {
        return Err("node not found — install Node.js first".to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn find_server_dir() -> Result<PathBuf, String> {
    // Traverse up from the executable to locate packages/board-server (capped depth)
    let exe = std::env::current_exe()
        .map_err(|_| "Could not determine application location".to_string())?;
    let mut dir = exe.parent().map(|p| p.to_path_buf());
    let mut depth = 0;
    while let Some(d) = dir {
        if depth >= MAX_TRAVERSAL_DEPTH {
            break;
        }
        let candidate = d.join("packages/board-server/dist/index.js");
        if candidate.exists() {
            return Ok(d.join("packages/board-server"));
        }
        dir = d.parent().map(|p| p.to_path_buf());
        depth += 1;
    }
    Err("Board server not found — run `pnpm build:board-server` first".to_string())
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn generate_plist(node_path: &str, server_dir: &str, log_dir: &str) -> String {
    let node_path = xml_escape(node_path);
    let server_dir = xml_escape(server_dir);
    let log_dir = xml_escape(log_dir);
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{PLIST_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>{node_path}</string>
    <string>{server_dir}/dist/index.js</string>
  </array>

  <key>WorkingDirectory</key>
  <string>{server_dir}</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <key>ThrottleInterval</key>
  <integer>5</integer>

  <key>StandardOutPath</key>
  <string>{log_dir}/board-server.log</string>

  <key>StandardErrorPath</key>
  <string>{log_dir}/board-server.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>BOARD_PORT</key>
    <string>4800</string>
  </dict>
</dict>
</plist>"#
    )
}

#[tauri::command]
pub fn board_server_check_installed() -> bool {
    plist_path().exists()
}

#[tauri::command]
pub fn board_server_install() -> Result<String, String> {
    let node_path = find_node()?;
    let server_dir = find_server_dir()?;
    let server_dir_str = server_dir.to_string_lossy().to_string();

    let log_dir = dirs::home_dir()
        .expect("No home directory")
        .join(".harness-kit/logs");
    std::fs::create_dir_all(&log_dir)
        .map_err(|_| "Failed to create log directory".to_string())?;
    let log_dir_str = log_dir.to_string_lossy().to_string();

    let plist_content = generate_plist(&node_path, &server_dir_str, &log_dir_str);
    let plist = plist_path();

    std::fs::write(&plist, &plist_content)
        .map_err(|_| "Failed to write service configuration".to_string())?;

    // Restrict plist to owner-only access
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&plist, std::fs::Permissions::from_mode(0o600));
    }

    let uid = current_uid();
    let domain = format!("gui/{uid}");

    // Bootstrap the service (idempotent — ignores "already loaded" error)
    let _ = Command::new("launchctl")
        .args(["bootstrap", &domain, &plist.to_string_lossy()])
        .output();

    // Enable the service
    let _ = Command::new("launchctl")
        .args(["enable", &format!("{domain}/{PLIST_LABEL}")])
        .output();

    // Kickstart to run immediately
    Command::new("launchctl")
        .args(["kickstart", &format!("{domain}/{PLIST_LABEL}")])
        .output()
        .map_err(|_| "Failed to start the board server service".to_string())?;

    Ok("Board server installed and started".to_string())
}

#[tauri::command]
pub fn board_server_start() -> Result<String, String> {
    let uid = current_uid();
    let domain = format!("gui/{uid}");
    let plist = plist_path();

    // Bootstrap (idempotent)
    let _ = Command::new("launchctl")
        .args(["bootstrap", &domain, &plist.to_string_lossy()])
        .output();

    // Kickstart
    Command::new("launchctl")
        .args(["kickstart", &format!("{domain}/{PLIST_LABEL}")])
        .output()
        .map_err(|_| "Failed to start the board server service".to_string())?;

    Ok("Board server started".to_string())
}

#[tauri::command]
pub fn board_server_restart() -> Result<String, String> {
    let uid = current_uid();
    let domain = format!("gui/{uid}");

    // Kickstart with -k flag to kill existing instance first
    Command::new("launchctl")
        .args(["kickstart", "-k", &format!("{domain}/{PLIST_LABEL}")])
        .output()
        .map_err(|_| "Failed to restart the board server service".to_string())?;

    Ok("Board server restarted".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn port_in_use_returns_false_for_free_port() {
        // Bind to 0 to get an ephemeral port, then drop to free it
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        assert!(!port_in_use(port));
    }

    #[test]
    fn port_in_use_returns_true_for_occupied_port() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        // listener still bound — port is occupied
        assert!(port_in_use(port));
    }
}
