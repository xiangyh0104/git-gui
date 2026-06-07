use super::common::{run_git, MergeResult};

#[tauri::command]
pub async fn git_merge_branch(
    project_path: String,
    source_branch: String,
) -> Result<MergeResult, String> {
    let remote_branch = format!("origin/{}", source_branch);
    let (output, code) = run_git(
        &project_path,
        &["merge", "--no-ff", "--no-commit", &remote_branch],
    )
    .await?;

    if code == 0 && !output.contains("CONFLICT") {
        return Ok(MergeResult {
            success: true,
            has_conflicts: false,
            conflict_files: Vec::new(),
            output,
        });
    }

    let (diff_output, _) = run_git(
        &project_path,
        &["diff", "--name-only", "--diff-filter=U"],
    )
    .await?;

    let conflict_files: Vec<String> = diff_output
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    Ok(MergeResult {
        success: false,
        has_conflicts: true,
        conflict_files,
        output,
    })
}

#[tauri::command]
pub async fn git_sync_before_merge(project_path: String) -> Result<String, String> {
    let (fetch_out, fetch_code) = run_git(&project_path, &["fetch", "--all"]).await?;
    if fetch_code != 0 {
        return Err(format!("git fetch failed: {}", fetch_out));
    }

    let (branch, branch_code) =
        run_git(&project_path, &["rev-parse", "--abbrev-ref", "HEAD"]).await?;
    if branch_code != 0 {
        return Err(format!("Failed to get current branch: {}", branch));
    }
    let branch = branch.trim();
    let remote_ref = format!("origin/{}", branch);

    let (count_str, _) = run_git(
        &project_path,
        &["rev-list", &format!("HEAD..{}", remote_ref), "--count"],
    )
    .await?;
    let behind: u32 = count_str.trim().parse().unwrap_or(0);

    if behind > 0 {
        let (pull_out, pull_code) =
            run_git(&project_path, &["pull", "origin", branch]).await?;
        if pull_code != 0 {
            return Err(format!("git pull failed: {}", pull_out));
        }
        Ok(format!("已同步远端 {} 个新提交", behind))
    } else {
        Ok("本地已是最新".to_string())
    }
}

#[tauri::command]
pub async fn git_abort_merge(project_path: String) -> Result<String, String> {
    let (output, code) = run_git(&project_path, &["merge", "--abort"]).await?;
    if code != 0 {
        return Err(format!("git merge --abort failed: {}", output));
    }
    Ok(output)
}
