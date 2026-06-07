use super::common::{parse_conflict_files_from_pull, run_git, GitOutput};

#[tauri::command]
pub async fn git_force_pull(
    project_path: String,
    auto_remove: bool,
) -> Result<GitOutput, String> {
    let (branch, branch_code) =
        run_git(&project_path, &["rev-parse", "--abbrev-ref", "HEAD"]).await?;
    if branch_code != 0 {
        return Err(format!("Failed to get current branch: {}", branch));
    }
    let branch = branch.trim();

    let (pull_output, pull_code) =
        run_git(&project_path, &["pull", "origin", branch]).await?;

    if pull_code == 0 {
        return Ok(GitOutput {
            success: true,
            output: pull_output,
            untracked_files: Vec::new(),
            needs_untracked_removal: false,
        });
    }

    if pull_output.contains("would be overwritten by merge")
        || pull_output.contains("would be overwritten by checkout")
    {
        let conflict_files = parse_conflict_files_from_pull(&pull_output);
        let mut untracked_files: Vec<String> = Vec::new();

        for file in &conflict_files {
            let (_, ls_code) =
                run_git(&project_path, &["ls-files", "--error-unmatch", file]).await?;

            if ls_code == 0 {
                let _ = run_git(&project_path, &["checkout", "--", file]).await;
            } else {
                if auto_remove {
                    let file_path = std::path::Path::new(&project_path).join(file);
                    let _ = tokio::fs::remove_file(&file_path).await;
                } else {
                    untracked_files.push(file.clone());
                }
            }
        }

        if !untracked_files.is_empty() && !auto_remove {
            return Ok(GitOutput {
                success: false,
                output: pull_output,
                untracked_files,
                needs_untracked_removal: true,
            });
        }

        let (retry_output, retry_code) =
            run_git(&project_path, &["pull", "origin", branch]).await?;
        return Ok(GitOutput {
            success: retry_code == 0,
            output: retry_output,
            untracked_files: Vec::new(),
            needs_untracked_removal: false,
        });
    }

    Ok(GitOutput {
        success: false,
        output: pull_output,
        untracked_files: Vec::new(),
        needs_untracked_removal: false,
    })
}
