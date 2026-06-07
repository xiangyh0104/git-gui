use super::common::{
    get_stash_mark_path, parse_conflict_files_from_pull, parse_rebase_conflict_files, run_git,
    RebaseResult,
};

#[tauri::command]
pub async fn git_fetch_rebase(project_path: String) -> Result<RebaseResult, String> {
    let rebase_merge = std::path::Path::new(&project_path).join(".git/rebase-merge");
    let rebase_apply = std::path::Path::new(&project_path).join(".git/rebase-apply");
    let in_progress = rebase_merge.exists() || rebase_apply.exists();

    if in_progress {
        let (_, _) = run_git(&project_path, &["add", "-u"]).await?;
        let (out, code) = run_git(&project_path, &["-c", "core.editor=true", "rebase", "--continue"]).await?;

        if code != 0 {
            let conflict_files = parse_rebase_conflict_files(&out);
            let has_conflicts = !conflict_files.is_empty() || out.contains("CONFLICT");
            if has_conflicts {
                return Ok(RebaseResult {
                    success: false,
                    has_conflicts: true,
                    conflict_files,
                    output: out,
                    rebase_in_progress: true,
                });
            }
            return Err(format!("git rebase --continue failed: {}", out));
        }

        let mark_path = get_stash_mark_path(&project_path);
        if mark_path.exists() {
            let _ = std::fs::remove_file(&mark_path);
            let (pop_out, pop_code) = run_git(&project_path, &["stash", "pop"]).await?;
            if pop_code != 0 {
                return Ok(RebaseResult {
                    success: true,
                    has_conflicts: false,
                    conflict_files: Vec::new(),
                    output: format!("Rebase 完成，但 stash pop 失败: {}", pop_out),
                    rebase_in_progress: false,
                });
            }
        }

        return Ok(RebaseResult {
            success: true,
            has_conflicts: false,
            conflict_files: Vec::new(),
            output: out,
            rebase_in_progress: false,
        });
    }

    // Normal flow: fetch → check dirty → stash → rebase → pop
    let (fetch_out, fetch_code) = run_git(&project_path, &["fetch"]).await?;
    if fetch_code != 0 {
        return Err(format!("git fetch failed: {}", fetch_out));
    }

    let (branch_out, branch_code) =
        run_git(&project_path, &["rev-parse", "--abbrev-ref", "HEAD"]).await?;
    if branch_code != 0 {
        return Err(format!("获取当前分支失败: {}", branch_out));
    }
    let branch = branch_out.trim();

    let remote_ref = format!("origin/{}", branch);
    let (_, verify_code) =
        run_git(&project_path, &["rev-parse", "--verify", &remote_ref]).await?;
    if verify_code != 0 {
        return Err(format!("远程分支 {} 不存在", remote_ref));
    }

    let (status_out, _) = run_git(&project_path, &["status", "--porcelain"]).await?;
    let is_dirty = status_out
        .lines()
        .any(|line| !line.starts_with("??"));

    if is_dirty {
        let (stash_out, stash_code) = run_git(&project_path, &["stash"]).await?;
        if stash_code != 0 {
            return Err(format!("git stash failed: {}", stash_out));
        }
        let mark_path = get_stash_mark_path(&project_path);
        let _ = std::fs::write(&mark_path, "auto-stash");
    }

    let (rebase_out, rebase_code) =
        run_git(&project_path, &["rebase", &remote_ref]).await?;

    if rebase_code != 0 {
        if rebase_out.contains("would be overwritten") {
            let untracked = parse_conflict_files_from_pull(&rebase_out);
            let mut removed_files = Vec::new();
            for file in &untracked {
                let file_path = std::path::Path::new(&project_path).join(file);
                if tokio::fs::remove_file(&file_path).await.is_ok() {
                    removed_files.push(file.clone());
                }
            }
            let (retry_out, retry_code) =
                run_git(&project_path, &["rebase", &remote_ref]).await?;
            if retry_code != 0 {
                let conflict_files = parse_rebase_conflict_files(&retry_out);
                let has_conflicts = !conflict_files.is_empty() || retry_out.contains("CONFLICT");
                if has_conflicts {
                    return Ok(RebaseResult {
                        success: false,
                        has_conflicts: true,
                        conflict_files,
                        output: retry_out,
                        rebase_in_progress: true,
                    });
                }
                let _ = run_git(&project_path, &["rebase", "--abort"]).await;
                let mark_path = get_stash_mark_path(&project_path);
                if mark_path.exists() {
                    let _ = std::fs::remove_file(&mark_path);
                    let _ = run_git(&project_path, &["stash", "pop"]).await;
                }
                return Err(format!("git rebase failed: {}", retry_out));
            }
            let mark_path = get_stash_mark_path(&project_path);
            if mark_path.exists() {
                let _ = std::fs::remove_file(&mark_path);
                let (pop_out, pop_code) = run_git(&project_path, &["stash", "pop"]).await?;
                if pop_code != 0 {
                    return Ok(RebaseResult {
                        success: true,
                        has_conflicts: false,
                        conflict_files: Vec::new(),
                        output: format!("Rebase 完成，但 stash pop 失败: {}", pop_out),
                        rebase_in_progress: false,
                    });
                }
            }
            let removed_info = if removed_files.is_empty() {
                String::new()
            } else {
                format!("\n已自动移除冲突的未跟踪文件: {}", removed_files.join(", "))
            };
            return Ok(RebaseResult {
                success: true,
                has_conflicts: false,
                conflict_files: Vec::new(),
                output: format!("Fetch & Rebase 完成{}", removed_info),
                rebase_in_progress: false,
            });
        }

        let conflict_files = parse_rebase_conflict_files(&rebase_out);
        let has_conflicts = !conflict_files.is_empty() || rebase_out.contains("CONFLICT");
        if has_conflicts {
            return Ok(RebaseResult {
                success: false,
                has_conflicts: true,
                conflict_files,
                output: rebase_out,
                rebase_in_progress: true,
            });
        }
        let _ = run_git(&project_path, &["rebase", "--abort"]).await;
        let mark_path = get_stash_mark_path(&project_path);
        if mark_path.exists() {
            let _ = std::fs::remove_file(&mark_path);
            let _ = run_git(&project_path, &["stash", "pop"]).await;
        }
        return Err(format!("git rebase failed: {}", rebase_out));
    }

    let mark_path = get_stash_mark_path(&project_path);
    if mark_path.exists() {
        let _ = std::fs::remove_file(&mark_path);
        let (pop_out, pop_code) = run_git(&project_path, &["stash", "pop"]).await?;
        if pop_code != 0 {
            return Ok(RebaseResult {
                success: true,
                has_conflicts: false,
                conflict_files: Vec::new(),
                output: format!("Rebase 完成，但 stash pop 失败: {}", pop_out),
                rebase_in_progress: false,
            });
        }
    }

    Ok(RebaseResult {
        success: true,
        has_conflicts: false,
        conflict_files: Vec::new(),
        output: if fetch_out.trim().is_empty() && rebase_out.trim().is_empty() {
            "Fetch & Rebase 完成，已是最新".to_string()
        } else {
            format!("{}\n{}", fetch_out.trim(), rebase_out.trim())
        },
        rebase_in_progress: false,
    })
}
