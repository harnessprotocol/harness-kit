use std::net::TcpListener;
use std::process::{Child, Command};
use std::sync::Mutex;

const DEFAULT_PORT: u16 = 3131;

/// Holds the spawned `mem serve` child process so we can kill it on stop.
pub struct MembrainServerState {
    child: Mutex<Option<Child>>,
}

impl MembrainServerState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }
}

fn port_in_use(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_err()
}

fn find_mem() -> Result<String, String> {
    let output = Command::new("which")
        .arg("mem")
        .output()
        .map_err(|_| "Could not locate mem — install with: go install github.com/siracusa5/membrain/cmd/mem@latest".to_string())?;
    if !output.status.success() {
        return Err("mem not found — install with: go install github.com/siracusa5/membrain/cmd/mem@latest".to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Returns true if the mem binary is available on PATH.
#[tauri::command]
pub fn membrain_check_installed() -> bool {
    find_mem().is_ok()
}

/// Spawns `mem serve --no-open --port {port}` as a background child process.
#[tauri::command]
pub fn membrain_start(
    state: tauri::State<'_, MembrainServerState>,
    port: Option<u16>,
) -> Result<String, String> {
    let port = port.unwrap_or(DEFAULT_PORT);

    if port_in_use(port) {
        return Ok(format!("membrain already running on :{port}"));
    }

    let mem = find_mem()?;

    let child = Command::new(&mem)
        .args(["serve", "--no-open", "--port", &port.to_string()])
        .spawn()
        .map_err(|e| format!("Failed to start membrain: {e}"))?;

    *state.child.lock().unwrap() = Some(child);
    Ok(format!("membrain server started on :{port}"))
}

/// Kills the membrain server child process if one was spawned by this app.
#[tauri::command]
pub fn membrain_stop(state: tauri::State<'_, MembrainServerState>) -> Result<(), String> {
    let mut guard = state.child.lock().unwrap();
    if let Some(mut child) = guard.take() {
        child.kill().map_err(|e| format!("Failed to stop membrain: {e}"))?;
    }
    Ok(())
}

/// Returns the configured membrain HTTP port.
#[tauri::command]
pub fn membrain_get_port() -> u16 {
    DEFAULT_PORT
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn port_in_use_returns_false_for_free_port() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        assert!(!port_in_use(port));
    }

    #[test]
    fn port_in_use_returns_true_for_occupied_port() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(port_in_use(port));
    }
}
