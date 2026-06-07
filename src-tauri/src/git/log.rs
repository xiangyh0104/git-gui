use super::common::{run_git, CommitEntry};

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
