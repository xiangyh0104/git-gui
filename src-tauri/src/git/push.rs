use super::common::run_git;

#[tauri::command]
pub async fn git_push(project_path: String) -> Result<String, String> {
    let (output, code) = run_git(&project_path, &["push"]).await?;
    if code != 0 {
        if output.contains("locksverify") || output.contains("Locking support detected") {
            let (remote_url, _) =
                run_git(&project_path, &["remote", "get-url", "origin"]).await?;
            let lfs_key = format!("lfs.{}/info/lfs.locksverify", remote_url.trim());
            let _ = run_git(&project_path, &["config", &lfs_key, "true"]).await;
            let (retry_output, retry_code) = run_git(&project_path, &["push"]).await?;
            if retry_code != 0 {
                return Err(format!("git push failed: {}", retry_output));
            }
            return Ok(format!("(已自动配置 LFS locksverify)\n{}", retry_output));
        }
        return Err(format!("git push failed: {}", output));
    }
    Ok(output)
}
