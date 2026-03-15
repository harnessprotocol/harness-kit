mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::plugins::list_installed_plugins,
            commands::plugins::list_marketplaces,
            commands::hooks::read_hooks,
            commands::claude_md::read_claude_md,
            commands::settings::list_claude_dir,
            commands::observatory::read_stats_cache,
            commands::observatory::list_sessions_summary,
            commands::observatory::read_session_facet,
            commands::observatory::list_active_sessions,
            commands::observatory::read_live_activity,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
