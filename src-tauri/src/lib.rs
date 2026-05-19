mod config;
mod git;

use config::{add_project, get_config, remove_project, save_config};
use git::{
    git_abort_merge, git_commit, git_commit_and_push, git_fetch_all, git_force_pull,
    git_get_current_branch, git_list_remote_branches, git_log, git_merge_branch, git_push,
    git_reset_hard, git_switch_branch, git_sync_before_merge,
};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            add_project,
            remove_project,
            git_fetch_all,
            git_get_current_branch,
            git_list_remote_branches,
            git_switch_branch,
            git_merge_branch,
            git_commit_and_push,
            git_sync_before_merge,
            git_commit,
            git_push,
            git_log,
            git_abort_merge,
            git_reset_hard,
            git_force_pull,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
