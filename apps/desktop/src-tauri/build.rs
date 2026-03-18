fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                // Plugins
                "list_installed_plugins",
                "list_marketplaces",
                "check_plugin_updates",
                // Hooks
                "read_hooks",
                // Claude.md
                "read_claude_md",
                // Settings
                "list_claude_dir",
                // Observatory
                "read_stats_cache",
                "list_sessions_summary",
                "read_session_facet",
                "list_active_sessions",
                "read_live_activity",
                // Comparator — live
                "detect_harnesses",
                "start_comparison",
                "kill_panel",
                // Comparator — persistence
                "save_comparison",
                "save_panel_result",
                "list_comparisons",
                "get_comparison",
                "delete_comparison",
                "save_file_diffs",
                "get_comparison_diffs",
                "get_comparison_setup",
                // Git
                "check_git_repo",
                "create_worktrees",
                "remove_worktrees",
                "get_diff_against_commit",
                // Evaluation
                "save_evaluation",
                "get_evaluations",
                "update_evaluation_score",
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
                // Board server
                "board_server_check_installed",
                "board_server_install",
                "board_server_start",
                "board_server_restart",
            ]),
        ),
    )
    .expect("error while running tauri-build");
}
