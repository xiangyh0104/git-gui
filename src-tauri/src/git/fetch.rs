use super::common::run_git;

#[tauri::command]
pub async fn git_fetch_all(project_path: String) -> Result<String, String> {
    let (output, code) = run_git(&project_path, &["fetch", "--all"]).await?;
    if code != 0 {
        return Err(format!("git fetch failed (code {}): {}", code, output));
    }
    Ok(output)
}
