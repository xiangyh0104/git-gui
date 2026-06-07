use super::common::{
    is_date_after, parse_untracked_files, run_git, BranchInfo, GitOutput, CORE_BRANCHES,
};

#[tauri::command]
pub async fn git_get_current_branch(project_path: String) -> Result<String, String> {
    let (output, code) = run_git(&project_path, &["rev-parse", "--abbrev-ref", "HEAD"]).await?;
    if code != 0 {
        return Err(format!("Failed to get current branch: {}", output));
    }
    Ok(output.trim().to_string())
}

#[tauri::command]
pub async fn git_list_remote_branches(
    project_path: String,
    show_all: bool,
) -> Result<Vec<BranchInfo>, String> {
    let (output, code) = run_git(
        &project_path,
        &[
            "branch",
            "-r",
            "--sort=-committerdate",
            "--format=%(refname:short)|%(committerdate:iso)|%(committerdate:relative)|%(subject)",
        ],
    )
    .await?;

    if code != 0 {
        return Err(format!("Failed to list branches: {}", output));
    }

    let cutoff = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
        - 30 * 24 * 3600;

    let branches: Vec<BranchInfo> = output
        .lines()
        .filter(|line| !line.contains("HEAD") && !line.contains("->"))
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(4, '|').collect();
            if parts.len() == 4 {
                let name = parts[0].trim().strip_prefix("origin/").unwrap_or(parts[0].trim());
                let date_str = parts[1].trim();

                if !show_all {
                    let is_core = CORE_BRANCHES.iter().any(|&c| c == name);
                    if !is_core && !is_date_after(date_str, cutoff) {
                        return None;
                    }
                }

                Some(BranchInfo {
                    name: name.to_string(),
                    last_commit_date: date_str.to_string(),
                    last_commit_relative: parts[2].trim().to_string(),
                    last_commit_message: parts[3].trim().to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(branches)
}

#[tauri::command]
pub async fn git_switch_branch(
    project_path: String,
    branch: String,
    auto_remove: bool,
) -> Result<GitOutput, String> {
    let target = format!("origin/{}", branch);
    let (output, code) = run_git(
        &project_path,
        &["checkout", "-f", "-B", &branch, &target],
    )
    .await?;

    if code == 0 {
        return Ok(GitOutput {
            success: true,
            output,
            untracked_files: Vec::new(),
            needs_untracked_removal: false,
        });
    }

    if output.contains("would be overwritten") {
        let untracked = parse_untracked_files(&output);

        if auto_remove {
            for file in &untracked {
                let file_path = std::path::Path::new(&project_path).join(file);
                let _ = tokio::fs::remove_file(&file_path).await;
            }
            let (retry_output, retry_code) = run_git(
                &project_path,
                &["checkout", "-f", "-B", &branch, &target],
            )
            .await?;
            return Ok(GitOutput {
                success: retry_code == 0,
                output: retry_output,
                untracked_files: Vec::new(),
                needs_untracked_removal: false,
            });
        }

        return Ok(GitOutput {
            success: false,
            output,
            untracked_files: untracked,
            needs_untracked_removal: true,
        });
    }

    Ok(GitOutput {
        success: false,
        output,
        untracked_files: Vec::new(),
        needs_untracked_removal: false,
    })
}
