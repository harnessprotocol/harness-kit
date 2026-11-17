//! Quit handshake. A close request on the main window is held by `lib.rs`,
//! which emits [`QUIT_REQUESTED_EVENT`]; the webview checks for unsaved drafts
//! and answers `confirm_quit` when it is safe to exit.

use tauri::AppHandle;

/// Emitted to the webview when the user asks to quit or close the window.
pub const QUIT_REQUESTED_EVENT: &str = "app://quit-requested";

/// Exits the app. Called by the webview once unsaved drafts are saved,
/// discarded, or absent.
#[tauri::command]
pub fn confirm_quit(app: AppHandle) {
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_name_matches_the_webview() {
        // The webview listens for this literal (src/lib/app-menu.ts).
        assert_eq!(QUIT_REQUESTED_EVENT, "app://quit-requested");
    }
}
