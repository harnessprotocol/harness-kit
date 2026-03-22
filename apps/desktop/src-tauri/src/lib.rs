mod commands;
mod db;
mod board_server;

use tauri::Manager;
use commands::comparator::ComparatorState;
use board_server::BoardServerState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = dirs::home_dir()
        .expect("No home directory")
        .join(".harness-kit");
    let database = db::init(&data_dir).expect("Failed to init database");

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(ComparatorState::default())
        .manage(database)
        .manage(BoardServerState::new())
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
            // Harness File
            commands::harness_file::read_harness_file,
            commands::harness_file::write_harness_file,
            commands::harness_file::scan_claude_config,
            // Settings
            commands::settings::list_claude_dir,
            // Observatory
            commands::observatory::read_stats_cache,
            commands::observatory::list_sessions_summary,
            commands::observatory::read_session_facet,
            commands::observatory::list_active_sessions,
            commands::observatory::read_live_activity,
            // Comparator — live
            commands::comparator::detect_harnesses,
            commands::comparator::start_comparison,
            commands::comparator::kill_panel,
            // Comparator — persistence
            commands::comparator_db::save_comparison,
            commands::comparator_db::save_panel_result,
            commands::comparator_db::list_comparisons,
            commands::comparator_db::get_comparison,
            commands::comparator_db::delete_comparison,
            commands::comparator_db::save_file_diffs,
            commands::comparator_db::get_comparison_diffs,
            commands::comparator_db::get_comparison_setup,
            // Git
            commands::git::check_git_repo,
            commands::git::create_worktrees,
            commands::git::remove_worktrees,
            commands::git::get_diff_against_commit,
            // Evaluation
            commands::evaluation::save_evaluation,
            commands::evaluation::get_evaluations,
            commands::evaluation::update_evaluation_score,
            // Export + Analytics
            commands::export::export_comparison_json,
            commands::export::get_comparator_analytics,
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
            // Parity
            commands::parity::run_parity_scan,
            commands::parity::get_parity_snapshot,
            commands::parity::get_parity_drift,
            commands::parity::acknowledge_drift,
            commands::parity::get_parity_history,
        ])
        .setup(|app| {
            let state = app.state::<BoardServerState>();
            if state.check() {
                eprintln!("[board-server] running on :{}", 4800);
            } else {
                eprintln!("[board-server] not running — install with: pnpm board:install");
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_handle, _event| {});
}
