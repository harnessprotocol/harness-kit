//! Quit handshake. Closing the main window (or Quit from the menu) while drafts
//! are unsaved is held, and the webview is asked via [`QUIT_REQUESTED_EVENT`];
//! it answers `confirm_quit` when it is safe to exit.
//!
//! The webview is not trusted to be alive. Rust keeps the one fact it needs,
//! whether unsaved drafts exist (`set_unsaved_drafts`). With none, a close goes
//! straight through. With some, the webview must acknowledge the request
//! (`quit_request_seen`) within [`ACK_TIMEOUT`], or the app exits anyway: the
//! drafts are already in the webview's localStorage and return on next launch.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Emitter};

/// Emitted to the webview when the user asks to quit or close the window.
pub const QUIT_REQUESTED_EVENT: &str = "app://quit-requested";

/// Menu id of the custom Quit item (src/lib/app-menu.ts).
pub const QUIT_MENU_ID: &str = "app:quit";

/// How long the webview has to acknowledge a quit request.
pub const ACK_TIMEOUT: Duration = Duration::from_secs(2);

static UNSAVED: AtomicBool = AtomicBool::new(false);
static ACKED: AtomicBool = AtomicBool::new(false);
/// Bumped per request, so an old request's watchdog cannot act on a newer one.
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// What to do with a quit or close request.
#[derive(Debug, PartialEq, Eq)]
pub enum QuitAction {
    /// Nothing unsaved: quit now.
    Proceed,
    /// Unsaved drafts: hold the request and ask the webview.
    AskWebview,
}

pub fn quit_action(unsaved: bool) -> QuitAction {
    if unsaved {
        QuitAction::AskWebview
    } else {
        QuitAction::Proceed
    }
}

/// Whether the watchdog for request `started` must force an exit: the request
/// is still the latest and the webview never acknowledged it.
pub fn should_force_exit(started: u64, current: u64, acked: bool) -> bool {
    started == current && !acked
}

/// Current decision for a close request on the main window.
pub fn current_quit_action() -> QuitAction {
    quit_action(UNSAVED.load(Ordering::SeqCst))
}

/// Asks the webview to handle a held quit and starts the watchdog.
pub fn ask_webview(app: &AppHandle) {
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    ACKED.store(false, Ordering::SeqCst);
    let _ = app.emit(QUIT_REQUESTED_EVENT, ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(ACK_TIMEOUT);
        if should_force_exit(generation, GENERATION.load(Ordering::SeqCst), ACKED.load(Ordering::SeqCst)) {
            app.exit(0);
        }
    });
}

/// A quit from the menu: straight out, or through the webview.
pub fn request_quit(app: &AppHandle) {
    match current_quit_action() {
        QuitAction::Proceed => app.exit(0),
        QuitAction::AskWebview => ask_webview(app),
    }
}

/// Exits the app. Called by the webview once unsaved drafts are saved,
/// discarded, or absent.
#[tauri::command]
pub fn confirm_quit(app: AppHandle) {
    app.exit(0);
}

/// The webview reports whether any draft holds unsaved edits.
#[tauri::command]
pub fn set_unsaved_drafts(unsaved: bool) {
    UNSAVED.store(unsaved, Ordering::SeqCst);
}

/// The webview heard the quit request and will answer it.
#[tauri::command]
pub fn quit_request_seen() {
    ACKED.store(true, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_name_matches_the_webview() {
        // The webview listens for this literal (src/lib/app-menu.ts).
        assert_eq!(QUIT_REQUESTED_EVENT, "app://quit-requested");
        assert_eq!(QUIT_MENU_ID, "app:quit");
    }

    #[test]
    fn no_unsaved_drafts_means_quit_proceeds() {
        assert_eq!(quit_action(false), QuitAction::Proceed);
    }

    #[test]
    fn unsaved_drafts_mean_ask_the_webview() {
        assert_eq!(quit_action(true), QuitAction::AskWebview);
    }

    #[test]
    fn watchdog_exits_when_the_webview_never_answers() {
        assert!(should_force_exit(3, 3, false));
    }

    #[test]
    fn watchdog_stands_down_after_an_acknowledgement() {
        assert!(!should_force_exit(3, 3, true));
    }

    #[test]
    fn watchdog_of_an_old_request_does_not_act_on_a_newer_one() {
        assert!(!should_force_exit(2, 3, false));
    }

    #[test]
    fn the_flag_follows_set_unsaved_drafts() {
        set_unsaved_drafts(true);
        assert_eq!(current_quit_action(), QuitAction::AskWebview);
        set_unsaved_drafts(false);
        assert_eq!(current_quit_action(), QuitAction::Proceed);
    }
}
