use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitEntry {
    pub hash: String,
    pub author: String,
    pub date_relative: String,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub last_commit_date: String,
    pub last_commit_relative: String,
    pub last_commit_message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    pub success: bool,
    pub has_conflicts: bool,
    pub conflict_files: Vec<String>,
    pub output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitOutput {
    pub success: bool,
    pub output: String,
    pub untracked_files: Vec<String>,
    pub needs_untracked_removal: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebaseResult {
    pub success: bool,
    pub has_conflicts: bool,
    pub conflict_files: Vec<String>,
    pub output: String,
    pub rebase_in_progress: bool,
}

fn exec_git(cwd: &str, args: &[String]) -> Result<(String, i32), String> {
    let mut cmd = std::process::Command::new("git");
    cmd.args(args).current_dir(cwd);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = if stderr.is_empty() {
        stdout
    } else {
        format!("{}\n{}", stdout.trim(), stderr.trim())
    };
    Ok((combined, output.status.code().unwrap_or(-1)))
}

fn try_remove_lock_file(output: &str) -> bool {
    if !output.contains("index.lock': File exists") && !output.contains("index.lock: File exists")
    {
        return false;
    }
    for line in output.lines() {
        if let Some(start) = line.find("Unable to create '") {
            let rest = &line[start + 18..];
            if let Some(end) = rest.find('\'') {
                let lock_path = &rest[..end];
                if lock_path.ends_with("index.lock") {
                    if std::fs::remove_file(lock_path).is_ok() {
                        return true;
                    }
                }
            }
        }
    }
    false
}

async fn run_git(cwd: &str, args: &[&str]) -> Result<(String, i32), String> {
    let cwd = cwd.to_string();
    let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();

    tokio::task::spawn_blocking(move || {
        let (output, code) = exec_git(&cwd, &args)?;

        if code != 0 && try_remove_lock_file(&output) {
            return exec_git(&cwd, &args);
        }

        Ok((output, code))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn git_fetch_all(project_path: String) -> Result<String, String> {
    let (output, code) = run_git(&project_path, &["fetch", "--all"]).await?;
    if code != 0 {
        return Err(format!("git fetch failed (code {}): {}", code, output));
    }
    Ok(output)
}

#[tauri::command]
pub async fn git_get_current_branch(project_path: String) -> Result<String, String> {
    let (output, code) = run_git(&project_path, &["rev-parse", "--abbrev-ref", "HEAD"]).await?;
    if code != 0 {
        return Err(format!("Failed to get current branch: {}", output));
    }
    Ok(output.trim().to_string())
}

const CORE_BRANCHES: &[&str] = &["public", "release", "patch", "master", "main", "develop"];

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

fn is_date_after(iso_date: &str, cutoff_epoch: i64) -> bool {
    // git iso format: "2025-06-15 10:30:00 +0800"
    let date_part = iso_date.get(..19).unwrap_or("");
    let tz_part = iso_date.get(20..).unwrap_or("+0000").trim();

    let base = match parse_datetime(date_part) {
        Some(v) => v,
        None => return true, // parse failure → keep the branch
    };

    let tz_offset_secs = parse_tz_offset(tz_part);
    let epoch = base - tz_offset_secs;
    epoch >= cutoff_epoch
}

fn parse_datetime(s: &str) -> Option<i64> {
    // "2025-06-15 10:30:00"
    let parts: Vec<&str> = s.split(|c| c == '-' || c == ' ' || c == ':').collect();
    if parts.len() < 6 { return None; }
    let y: i64 = parts[0].parse().ok()?;
    let m: i64 = parts[1].parse().ok()?;
    let d: i64 = parts[2].parse().ok()?;
    let h: i64 = parts[3].parse().ok()?;
    let min: i64 = parts[4].parse().ok()?;
    let sec: i64 = parts[5].parse().ok()?;

    // Simplified days-since-epoch (accurate enough for 30-day comparisons)
    let mut days: i64 = 0;
    for yr in 1970..y {
        days += if yr % 4 == 0 && (yr % 100 != 0 || yr % 400 == 0) { 366 } else { 365 };
    }
    let month_days = [31, if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 29 } else { 28 },
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for i in 0..(m as usize - 1) {
        days += month_days[i] as i64;
    }
    days += d - 1;

    Some(days * 86400 + h * 3600 + min * 60 + sec)
}

fn parse_tz_offset(tz: &str) -> i64 {
    // "+0800" or "-0530"
    if tz.len() < 5 { return 0; }
    let sign: i64 = if tz.starts_with('-') { -1 } else { 1 };
    let hh: i64 = tz[1..3].parse().unwrap_or(0);
    let mm: i64 = tz[3..5].parse().unwrap_or(0);
    sign * (hh * 3600 + mm * 60)
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

#[tauri::command]
pub async fn git_log(project_path: String, count: u32) -> Result<Vec<CommitEntry>, String> {
    let n = count.to_string();
    let (output, code) = run_git(
        &project_path,
        &["log", "--format=%h|%an|%ar|%s", "-n", &n],
    )
    .await?;

    if code != 0 {
        return Err(format!("git log failed: {}", output));
    }

    let entries: Vec<CommitEntry> = output
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(4, '|').collect();
            if parts.len() == 4 {
                Some(CommitEntry {
                    hash: parts[0].to_string(),
                    author: parts[1].to_string(),
                    date_relative: parts[2].to_string(),
                    subject: parts[3].to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(entries)
}

#[tauri::command]
pub async fn git_abort_merge(project_path: String) -> Result<String, String> {
    let (output, code) = run_git(&project_path, &["merge", "--abort"]).await?;
    if code != 0 {
        return Err(format!("git merge --abort failed: {}", output));
    }
    Ok(output)
}

#[tauri::command]
pub async fn git_reset_hard(project_path: String) -> Result<String, String> {
    let rebase_merge = std::path::Path::new(&project_path).join(".git/rebase-merge");
    let rebase_apply = std::path::Path::new(&project_path).join(".git/rebase-apply");

    if rebase_merge.exists() || rebase_apply.exists() {
        let (abort_out, abort_code) = run_git(&project_path, &["rebase", "--abort"]).await?;
        if abort_code != 0 {
            return Err(format!("git rebase --abort failed: {}", abort_out));
        }
        // Clean up stash mark if we auto-stashed before rebase
        let mark_path = get_stash_mark_path(&project_path);
        if mark_path.exists() {
            let _ = std::fs::remove_file(&mark_path);
            let _ = run_git(&project_path, &["stash", "pop"]).await;
        }
        return Ok("已中止 rebase 并恢复分支".to_string());
    }

    let (output, code) = run_git(&project_path, &["reset", "--hard", "HEAD"]).await?;
    if code != 0 {
        return Err(format!("git reset --hard failed: {}", output));
    }
    Ok(output)
}

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

const STASH_MARK_FILE: &str = ".git/auto-stash-mark";

fn get_stash_mark_path(project_path: &str) -> std::path::PathBuf {
    std::path::Path::new(project_path).join(STASH_MARK_FILE)
}

fn parse_rebase_conflict_files(output: &str) -> Vec<String> {
    output
        .lines()
        .filter(|line| line.contains("CONFLICT") || line.contains("Merge conflict in"))
        .filter_map(|line| {
            if let Some(pos) = line.rfind("Merge conflict in ") {
                Some(line[pos + 18..].trim().to_string())
            } else if let Some(pos) = line.rfind("CONFLICT (content): Merge conflict in ") {
                Some(line[pos + 38..].trim().to_string())
            } else {
                None
            }
        })
        .collect()
}

#[tauri::command]
pub async fn git_fetch_rebase(project_path: String) -> Result<RebaseResult, String> {
    let rebase_merge = std::path::Path::new(&project_path).join(".git/rebase-merge");
    let rebase_apply = std::path::Path::new(&project_path).join(".git/rebase-apply");
    let in_progress = rebase_merge.exists() || rebase_apply.exists();

    if in_progress {
        // User resolved conflicts, continue rebase
        // Use `add -u` to only stage tracked files, avoiding accidentally staging unrelated untracked files
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

        // Rebase continue succeeded, check if we need to pop stash
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

    // Check if remote branch exists
    let remote_ref = format!("origin/{}", branch);
    let (_, verify_code) =
        run_git(&project_path, &["rev-parse", "--verify", &remote_ref]).await?;
    if verify_code != 0 {
        return Err(format!("远程分支 {} 不存在", remote_ref));
    }

    // Check dirty state (only tracked changes matter for stash)
    let (status_out, _) = run_git(&project_path, &["status", "--porcelain"]).await?;
    let is_dirty = status_out
        .lines()
        .any(|line| !line.starts_with("??"));

    if is_dirty {
        let (stash_out, stash_code) = run_git(&project_path, &["stash"]).await?;
        if stash_code != 0 {
            return Err(format!("git stash failed: {}", stash_out));
        }
        // Write mark file so we know to pop later (even after restart)
        let mark_path = get_stash_mark_path(&project_path);
        let _ = std::fs::write(&mark_path, "auto-stash");
    }

    // Rebase
    let (rebase_out, rebase_code) =
        run_git(&project_path, &["rebase", &remote_ref]).await?;

    if rebase_code != 0 {
        // Handle untracked files that would be overwritten by rebase checkout
        if rebase_out.contains("would be overwritten") {
            let untracked = parse_conflict_files_from_pull(&rebase_out);
            let mut removed_files = Vec::new();
            for file in &untracked {
                let file_path = std::path::Path::new(&project_path).join(file);
                if tokio::fs::remove_file(&file_path).await.is_ok() {
                    removed_files.push(file.clone());
                }
            }
            // Retry rebase after removing conflicting untracked files
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
                // Still failed for other reason, abort and restore
                let _ = run_git(&project_path, &["rebase", "--abort"]).await;
                let mark_path = get_stash_mark_path(&project_path);
                if mark_path.exists() {
                    let _ = std::fs::remove_file(&mark_path);
                    let _ = run_git(&project_path, &["stash", "pop"]).await;
                }
                return Err(format!("git rebase failed: {}", retry_out));
            }
            // Retry succeeded, pop stash
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
        // Non-conflict failure: abort rebase and restore stash
        let _ = run_git(&project_path, &["rebase", "--abort"]).await;
        let mark_path = get_stash_mark_path(&project_path);
        if mark_path.exists() {
            let _ = std::fs::remove_file(&mark_path);
            let _ = run_git(&project_path, &["stash", "pop"]).await;
        }
        return Err(format!("git rebase failed: {}", rebase_out));
    }

    // Rebase succeeded, pop stash if we saved one
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

fn parse_untracked_files(output: &str) -> Vec<String> {
    let mut files = Vec::new();
    let mut in_file_section = false;

    for line in output.lines() {
        if line.contains("would be overwritten") {
            in_file_section = true;
            continue;
        }
        if in_file_section {
            if line.starts_with("Please") || line.starts_with("Aborting") {
                break;
            }
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                files.push(trimmed.to_string());
            }
        }
    }
    files
}

fn parse_conflict_files_from_pull(output: &str) -> Vec<String> {
    let mut files = Vec::new();
    let mut in_file_section = false;

    for line in output.lines() {
        if line.contains("would be overwritten") {
            in_file_section = true;
            continue;
        }
        if in_file_section {
            if line.starts_with("Please")
                || line.starts_with("Aborting")
                || line.starts_with("error:")
            {
                break;
            }
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                files.push(trimmed.to_string());
            }
        }
    }
    files
}
