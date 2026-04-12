mod ai;
mod agent_server;
mod commands;
mod db;
mod board_server;
mod relay_server;
mod membrain_commands;

/// Process-wide lock for tests that mutate the HOME env variable.
/// All `with_home()` helpers across test modules must hold this lock
/// to prevent races when Rust runs tests in parallel threads.
#[cfg(test)]
pub static HOME_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

use tauri::{LogicalSize, Manager};
use ai::client::OllamaState;
use commands::terminal::TerminalState;
use board_server::BoardServerState;
use agent_server::AgentServerState;
use membrain_commands::MembrainServerState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = dirs::home_dir()
        .expect("No home directory")
        .join(".harness-kit");
    let database = db::init(&data_dir).expect("Failed to init database");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // A second instance was launched — focus the existing window instead.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(TerminalState::default())
        .manage(database)
        .manage(BoardServerState::new())
        .manage(AgentServerState::new())
        .manage(commands::relay::LocalRelay(tokio::sync::Mutex::new(None)))
        .manage(MembrainServerState::new())
        .manage(OllamaState::new("http://localhost:11434"))
        .invoke_handler(tauri::generate_handler![
            // Plugins
            commands::plugins::list_installed_plugins,
            commands::plugins::list_marketplaces,
            commands::plugins::check_plugin_updates,
            commands::plugins::uninstall_plugin,
            // Plugin Explorer
            commands::plugin_explorer::read_plugin_tree,
            commands::plugin_explorer::read_plugin_file,
            commands::plugin_explorer::write_plugin_file,
            commands::plugin_explorer::import_plugin_from_path,
            commands::plugin_explorer::import_plugin_from_zip,
            commands::plugin_explorer::export_plugin_as_zip,
            commands::plugin_explorer::export_plugin_to_folder,
            // Hooks
            commands::hooks::read_hooks,
            // Claude.md
            commands::claude_md::read_claude_md,
            commands::claude_md::write_config_file,
            // Harness File
            commands::harness_file::read_harness_file,
            commands::harness_file::write_harness_file,
            commands::harness_file::scan_claude_config,
            // MCP
            commands::mcp::read_mcp_config,
            commands::mcp::write_mcp_config,
            // Custom Profiles
            commands::profiles::list_custom_profiles,
            commands::profiles::get_custom_profile,
            commands::profiles::save_custom_profile,
            commands::profiles::delete_custom_profile,
            // Settings
            commands::settings::list_claude_dir,
            commands::settings::detect_claude_account,
            // Observatory
            commands::observatory::read_stats_cache,
            commands::observatory::list_sessions_summary,
            commands::observatory::read_session_facet,
            commands::observatory::list_active_sessions,
            commands::observatory::read_live_activity,
            commands::observatory::compute_live_stats,
            commands::observatory::read_session_transcript,
            // Terminal sessions
            commands::terminal::get_cwd,
            commands::terminal::create_terminal,
            commands::terminal::destroy_terminal,
            commands::terminal::write_terminal,
            commands::terminal::resize_terminal,
            commands::terminal::detect_harnesses,
            // Git
            commands::git::check_git_repo,
            commands::git::create_worktrees,
            commands::git::remove_worktrees,
            commands::git::get_diff_against_commit,
            // Evaluation
            commands::evaluation::save_evaluation,
            commands::evaluation::get_evaluations,
            commands::evaluation::update_evaluation_score,
            // Pairwise voting
            commands::pairwise::create_evaluation_session,
            commands::pairwise::get_evaluation_session,
            commands::pairwise::reveal_evaluation_session,
            commands::pairwise::save_pairwise_vote,
            commands::pairwise::get_pairwise_votes,
            commands::pairwise::get_pairwise_analytics,
            commands::pairwise::delete_pairwise_vote,
            // Export + Analytics
            commands::export::export_comparison_json,
            commands::export::get_comparator_analytics,
            // Comparator sessions
            commands::comparator::save_comparison,
            commands::comparator::update_comparison_title,
            commands::comparator::update_comparison_status,
            commands::comparator::list_comparisons,
            commands::comparator::get_comparison,
            commands::comparator::delete_comparison,
            // Comparator panels
            commands::comparator_panels::save_panel,
            commands::comparator_panels::update_panel_result,
            commands::comparator_panels::save_file_diffs,
            commands::comparator_panels::get_comparison_diffs,
            commands::comparator_panels::get_panel_diffs,
            // Security
            commands::security::read_permissions,
            commands::security::update_permissions,
            commands::security::list_security_presets,
            commands::security::apply_security_preset,
            commands::security::list_required_env,
            commands::security::set_keychain_secret,
            commands::security::delete_keychain_secret,
            commands::security::read_env_config,
            commands::security::write_env_config,
            // Security — audit log
            commands::security_db::list_audit_entries,
            commands::security_db::clear_audit_entries,
            // File history
            commands::history::read_file_history,
            commands::history::push_file_history,
            commands::history::get_history_size,
            // Sync
            commands::sync::sync_read_file,
            commands::sync::sync_file_exists,
            commands::sync::sync_read_dir,
            commands::sync::sync_write_files,
            commands::sync::sync_create_backup,
            commands::sync::sync_list_backups,
            commands::sync::sync_restore_backup,
            // Board server
            board_server::board_server_check_installed,
            board_server::board_server_install,
            board_server::board_server_start,
            board_server::board_server_restart,
            // Agent server
            agent_server::get_agent_server_token,
            agent_server::agent_server_check_installed,
            agent_server::agent_server_install,
            agent_server::agent_server_start,
            agent_server::agent_server_restart,
            // membrain
            membrain_commands::membrain_check_installed,
            membrain_commands::membrain_start,
            membrain_commands::membrain_stop,
            membrain_commands::membrain_get_port,
            // Parity
            commands::parity::run_parity_scan,
            commands::parity::get_parity_snapshot,
            commands::parity::get_parity_drift,
            commands::parity::acknowledge_drift,
            commands::parity::get_parity_history,
            commands::parity::create_config_file,
            commands::parity::add_to_parity_baseline,
            // Chat
            commands::chat::chat_save_room,
            commands::chat::chat_leave_room,
            commands::chat::chat_list_rooms,
            commands::chat::chat_save_messages,
            commands::chat::chat_load_messages,
            commands::chat::chat_purge_room,
            // Local relay
            commands::relay::chat_start_local_relay,
            commands::relay::chat_stop_local_relay,
            commands::relay::chat_local_relay_running,
            // AI Chat
            ai::commands::check_ollama_running,
            ai::commands::list_models,
            ai::commands::pull_model,
            ai::commands::stream_chat,
            ai::commands::cancel_ai_stream,
            ai::commands::create_ai_session,
            ai::commands::update_ai_session_title,
            ai::commands::delete_ai_session,
            ai::commands::list_ai_sessions,
            ai::commands::load_ai_session,
            ai::commands::save_ai_message,
            // Agents
            commands::agents::detect_agents,
        ])
        .setup(|app| {
            let state = app.state::<BoardServerState>();
            if state.check() {
                eprintln!("[board-server] running on :{}", 4800);
            } else {
                eprintln!("[board-server] not running — install with: pnpm board:install");
            }
            let agent_state = app.state::<AgentServerState>();
            if agent_state.check() {
                eprintln!("[agent-server] running on :{}", 4801);
            } else {
                eprintln!("[agent-server] not running — install with: pnpm agent:install");
            }
            // membrain server starts on-demand when the user navigates to the
            // Memory section (via useMembrainServerReady hook), not at app launch.
            // This avoids opening a network listener until the Labs feature is enabled.

            // Size the main window to 75% of the primary monitor on launch.
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let scale = monitor.scale_factor();
                    let phys = monitor.size();
                    let w = phys.width as f64 / scale * 0.75;
                    let h = phys.height as f64 / scale * 0.75;
                    let _ = window.set_size(LogicalSize::new(w, h));
                    let _ = window.center();
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_handle, _event| {});
}
