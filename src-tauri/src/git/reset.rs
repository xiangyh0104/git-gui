use super::common::{get_stash_mark_path, run_git};

#[tauri::command]
pub async fn git_reset_hard(project_path: String) -> Result<String, String> {
    let rebase_merge = std::path::Path::new(&project_path).join(".git/rebase-merge");
    let rebase_apply = std::path::Path::new(&project_path).join(".git/rebase-apply");

    if rebase_merge.exists() || rebase_apply.exists() {
        let (abort_out, abort_code) = run_git(&project_path, &["rebase", "--abort"]).await?;
        if abort_code != 0 {
            return Err(format!("git rebase --abort failed: {}", abort_out));
        }
        let mark_path = get_stash_mark_path(&project_path);
        if mark_path.exists() {
            let _ = std::fs::remove_file(&mark_path);
            let _ = run_git(&project_path, &["stash", "pop"]).await;
        }
        return Ok("已中止 rebase 并恢复分支".to_string());
    }

    let (branch_out, branch_code) =
        run_git(&project_path, &["rev-parse", "--abbrev-ref", "HEAD"]).await?;
    if branch_code != 0 {
        return Err(format!("Failed to get current branch: {}", branch_out));
    }
    let remote_ref = format!("origin/{}", branch_out.trim());

    let (output, code) = run_git(&project_path, &["reset", "--hard", &remote_ref]).await?;
    if code != 0 {
        return Err(format!("git reset --hard failed: {}", output));
    }
    Ok(output)
}
