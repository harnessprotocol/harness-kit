mod commands;
mod db;

/// Process-wide lock for tests that mutate the HOME env variable.
/// All `with_home()` helpers across test modules must hold this lock
/// to prevent races when Rust runs tests in parallel threads.
#[cfg(test)]
pub static HOME_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

use tauri::{LogicalSize, Manager};

/// Detect the current git branch by running `git branch --show-current`
/// from the process working directory. Returns `None` when not in a git
/// repo or when in detached-HEAD state (e.g. a packaged app launched from
/// Finder where CWD is not inside a repo).
fn detect_git_branch() -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["branch", "--show-current"])
        .output()
        .ok()?;
    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if branch.is_empty() { None } else { Some(branch) }
    } else {
        None
    }
}

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
        .manage(database)
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
            // Git
            commands::git::check_git_repo,
            commands::git::create_worktrees,
            commands::git::remove_worktrees,
            commands::git::get_diff_against_commit,
            commands::git::check_for_updates,
            commands::git::trigger_rebuild,
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
            commands::comparator::tag_comparison_task_type,
            commands::comparator::get_harness_recommendations,
            // Agents
            commands::agents::detect_agents,
            // Harness health / resilience
            commands::agents::record_harness_launch_result,
            commands::agents::get_harness_health,
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
            // Harness detection (used by Fleet)
            commands::harnesses::detect_harnesses,
            // Runtime FS scope grants (used by Fleet/Drift's project scope)
            commands::fs_scope::grant_project_scope,
            // Drift (capability probing + acknowledgement persistence;
            // drift computation itself lives in packages/core, run from the
            // Drift page — see commands/parity.rs module docs)
            commands::parity::probe_harness_capabilities,
            commands::parity::acknowledge_drift_item,
            commands::parity::unacknowledge_drift_item,
            commands::parity::get_acknowledged_drift_items,
            // Feedback
            commands::feedback::get_system_info,
            commands::feedback::submit_feedback,
        ])
        .setup(|app| {
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
                // When running from a worktree, show the branch in the title bar
                // so multiple app instances are easy to tell apart.
                if let Some(branch) = detect_git_branch() {
                    let _ = window.set_title(&format!("Harness Kit \u{2014} {}", branch));
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_handle, _event| {});
}
