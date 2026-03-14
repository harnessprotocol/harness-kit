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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
