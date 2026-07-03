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
                "detect_claude_account",
                // Observatory
                "read_stats_cache",
                "list_sessions_summary",
                "read_session_facet",
                "list_active_sessions",
                "read_live_activity",
                "compute_live_stats",
                "read_session_transcript",
                // Git
                "check_git_repo",
                "create_worktrees",
                "remove_worktrees",
                "get_diff_against_commit",
                "check_for_updates",
                "trigger_rebuild",
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
                // Comparator — sessions
                "save_comparison",
                "update_comparison_title",
                "update_comparison_status",
                "list_comparisons",
                "get_comparison",
                "delete_comparison",
                "tag_comparison_task_type",
                "get_harness_recommendations",
                // Agents
                "detect_agents",
                "record_harness_launch_result",
                "get_harness_health",
                // Comparator — panels
                "save_panel",
                "update_panel_result",
                "save_file_diffs",
                "get_comparison_diffs",
                "get_panel_diffs",
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
                // Harness detection (used by Parity)
                "detect_harnesses",
                // Parity
                "run_parity_scan",
                "get_parity_snapshot",
                "get_parity_drift",
                "acknowledge_drift",
                "get_parity_history",
                "create_config_file",
                "add_to_parity_baseline",
                "probe_harness_capabilities",
                // Feedback
                "get_system_info",
                "submit_feedback",
            ]),
        ),
    )
    .expect("error while running tauri-build");
}
