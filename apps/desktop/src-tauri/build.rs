fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                // Plugins
                "list_installed_plugins",
                "list_marketplaces",
                "check_plugin_updates",
                "uninstall_plugin",
                // Plugin Explorer
                "read_plugin_tree",
                "read_plugin_file",
                "write_plugin_file",
                "import_plugin_from_path",
                "import_plugin_from_zip",
                "export_plugin_as_zip",
                "export_plugin_to_folder",
                // Hooks
                "read_hooks",
                // Claude.md
                "read_claude_md",
                "write_config_file",
                // MCP
                "read_mcp_config",
                "write_mcp_config",
                // Custom Profiles
                "list_custom_profiles",
                "get_custom_profile",
                "save_custom_profile",
                "delete_custom_profile",
                // Settings
                "list_claude_dir",
                // Observatory
                "read_stats_cache",
                "list_sessions_summary",
                "read_session_facet",
                "list_active_sessions",
                "read_live_activity",
                "compute_live_stats",
                "read_session_transcript",
                // Terminal sessions
                "get_cwd",
                "create_terminal",
                "destroy_terminal",
                "write_terminal",
                "resize_terminal",
                // Comparator — live
                "detect_harnesses",
                // Comparator — sessions
                "save_comparison",
                "update_comparison_title",
                "update_comparison_status",
                "list_comparisons",
                "get_comparison",
                "delete_comparison",
                // Comparator — panels
                "save_panel",
                "update_panel_result",
                "save_file_diffs",
                "get_comparison_diffs",
                "get_panel_diffs",
                // Git
                "check_git_repo",
                "create_worktrees",
                "remove_worktrees",
                "get_diff_against_commit",
                // Evaluation
                "save_evaluation",
                "get_evaluations",
                "update_evaluation_score",
                // Pairwise voting
                "create_evaluation_session",
                "get_evaluation_session",
                "reveal_evaluation_session",
                "save_pairwise_vote",
                "get_pairwise_votes",
                "get_pairwise_analytics",
                "delete_pairwise_vote",
                // Export + Analytics
                "export_comparison_json",
                "get_comparator_analytics",
                // Security
                "read_permissions",
                "update_permissions",
                "list_security_presets",
                "apply_security_preset",
                "list_required_env",
                "set_keychain_secret",
                "delete_keychain_secret",
                "read_env_config",
                "write_env_config",
                // Security — audit log
                "list_audit_entries",
                "clear_audit_entries",
                // File history
                "read_file_history",
                "push_file_history",
                "get_history_size",
                // Board server
                "board_server_check_installed",
                "board_server_install",
                "board_server_start",
                "board_server_restart",
                // Agent server
                "get_agent_server_token",
                "agent_server_check_installed",
                "agent_server_install",
                "agent_server_start",
                "agent_server_restart",
                // membrain
                "membrain_check_installed",
                "membrain_start",
                "membrain_stop",
                "membrain_get_port",
                // Parity
                "run_parity_scan",
                "get_parity_snapshot",
                "get_parity_drift",
                "acknowledge_drift",
                "get_parity_history",
                "create_config_file",
                "add_to_parity_baseline",
                // Chat
                "chat_save_room",
                "chat_leave_room",
                "chat_list_rooms",
                "chat_save_messages",
                "chat_load_messages",
                "chat_purge_room",
                // Local relay
                "chat_start_local_relay",
                "chat_stop_local_relay",
                "chat_local_relay_running",
                // Sync
                "sync_read_file",
                "sync_file_exists",
                "sync_read_dir",
                "sync_write_files",
                "sync_create_backup",
                "sync_list_backups",
                "sync_restore_backup",
                // Harness file
                "read_harness_file",
                "write_harness_file",
                "scan_claude_config",
            ]),
        ),
    )
    .expect("error while running tauri-build");
}
