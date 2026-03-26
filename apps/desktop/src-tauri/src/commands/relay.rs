use crate::relay_server::{start_relay, RelayHandle};
use tauri::State;
use tokio::sync::Mutex;

pub struct LocalRelay(pub Mutex<Option<RelayHandle>>);

#[tauri::command]
pub async fn chat_start_local_relay(
    port: Option<u16>,
    relay: State<'_, LocalRelay>,
) -> Result<u16, String> {
    let mut guard = relay.0.lock().await;
    // Stop existing relay if running
    if let Some(existing) = guard.take() {
        existing.stop();
    }
    let handle = start_relay(port.unwrap_or(4801)).await?;
    let actual_port = handle.port;
    *guard = Some(handle);
    Ok(actual_port)
}

#[tauri::command]
pub async fn chat_stop_local_relay(relay: State<'_, LocalRelay>) -> Result<(), String> {
    let mut guard = relay.0.lock().await;
    if let Some(handle) = guard.take() {
        handle.stop();
    }
    Ok(())
}

#[tauri::command]
pub async fn chat_local_relay_running(relay: State<'_, LocalRelay>) -> Result<bool, String> {
    Ok(relay.0.lock().await.is_some())
}
