mod commands;
mod db;

use commands::comparator::ComparatorState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = dirs::home_dir()
        .expect("No home directory")
        .join(".harness-kit");
    let database = db::init(&data_dir).expect("Failed to init database");

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(ComparatorState::default())
        .manage(database)
        .invoke_handler(tauri::generate_handler![
            // Plugins
            commands::plugins::list_installed_plugins,
            commands::plugins::list_marketplaces,
            // Hooks
            commands::hooks::read_hooks,
            // Claude.md
            commands::claude_md::read_claude_md,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
