use super::common::run_git;

#[tauri::command]
pub async fn git_repair(project_path: String) -> Result<String, String> {
    let mut log = String::new();

    log.push_str("=== git fsck ===\n");
    let (fsck_out, _) = run_git(&project_path, &["fsck", "--full"]).await?;
    log.push_str(&fsck_out);
    log.push('\n');

    log.push_str("\n=== git repack -a -d -f ===\n");
    let (repack_out, repack_code) =
        run_git(&project_path, &["repack", "-a", "-d", "-f"]).await?;
    log.push_str(&repack_out);
    if repack_code != 0 {
        log.push_str("\nrepack 失败，尝试 prune + gc...\n");
        let _ = run_git(&project_path, &["prune"]).await;
        let (gc_out, _) = run_git(&project_path, &["gc", "--aggressive"]).await?;
        log.push_str(&gc_out);
    }

    log.push_str("\n=== git fsck (验证) ===\n");
    let (verify_out, verify_code) = run_git(&project_path, &["fsck", "--full"]).await?;
    log.push_str(&verify_out);

    if verify_code == 0 || verify_out.trim().is_empty() {
        log.push_str("\n修复完成，仓库状态正常");
    } else {
        log.push_str("\n仍存在异常，建议重新 clone 仓库");
    }

    Ok(log)
}
