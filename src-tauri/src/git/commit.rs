use super::common::run_git;

#[tauri::command]
pub async fn git_commit(project_path: String, message: String) -> Result<String, String> {
    let (add_output, add_code) = run_git(&project_path, &["add", "-A"]).await?;
    if add_code != 0 {
        return Err(format!("git add failed: {}", add_output));
    }

    let (commit_output, commit_code) =
        run_git(&project_path, &["commit", "-m", &message]).await?;
    if commit_code != 0 {
        return Err(format!("git commit failed: {}", commit_output));
    }

    Ok(format!("{}\n{}", add_output, commit_output))
}

#[tauri::command]
pub async fn git_commit_and_push(
    project_path: String,
    message: String,
) -> Result<String, String> {
    let (add_output, add_code) = run_git(&project_path, &["add", "-A"]).await?;
    if add_code != 0 {
        return Err(format!("git add failed: {}", add_output));
    }

    let (commit_output, commit_code) =
        run_git(&project_path, &["commit", "-m", &message]).await?;
    if commit_code != 0 {
        return Err(format!("git commit failed: {}", commit_output));
    }

    let (push_output, push_code) = run_git(&project_path, &["push"]).await?;
    if push_code != 0 {
        return Err(format!("git push failed: {}", push_output));
    }

    Ok(format!("{}\n{}\n{}", add_output, commit_output, push_output))
}
