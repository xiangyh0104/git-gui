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

pub fn exec_git(cwd: &str, args: &[String]) -> Result<(String, i32), String> {
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

pub fn exec_bat(cwd: &str, script: &str) -> Result<(String, i32), String> {
    let mut cmd = std::process::Command::new("cmd.exe");
    cmd.args(["/C", script])
        .current_dir(cwd)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to run script: {}", e))?;

    let status = child
        .wait()
        .map_err(|e| format!("Failed to wait for script: {}", e))?;

    Ok((String::new(), status.code().unwrap_or(-1)))
}

pub async fn run_bat(cwd: &str, script: &str) -> Result<(String, i32), String> {
    let cwd = cwd.to_string();
    let script = script.to_string();

    tokio::task::spawn_blocking(move || exec_bat(&cwd, &script))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

pub fn exec_bat_detached(cwd: &str, script: &str) -> Result<(), String> {
    let mut cmd = std::process::Command::new("cmd.exe");
    cmd.args(["/C", script])
        .current_dir(cwd);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x00000010); // CREATE_NEW_CONSOLE
    }

    cmd.spawn()
        .map_err(|e| format!("Failed to launch script: {}", e))?;

    Ok(())
}

pub async fn run_bat_detached(cwd: &str, script: &str) -> Result<(), String> {
    let cwd = cwd.to_string();
    let script = script.to_string();

    tokio::task::spawn_blocking(move || exec_bat_detached(&cwd, &script))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

pub fn exec_bat_with_input(cwd: &str, script: &str, stdin_input: Option<&str>) -> Result<(String, i32), String> {
    let mut cmd = std::process::Command::new("cmd.exe");
    cmd.args(["/C", script]).current_dir(cwd);

    if stdin_input.is_some() {
        cmd.stdin(std::process::Stdio::piped());
    } else {
        cmd.stdin(std::process::Stdio::null());
    }
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to run script: {}", e))?;

    if let Some(input) = stdin_input {
        use std::io::Write;
        if let Some(mut stdin_handle) = child.stdin.take() {
            let _ = stdin_handle.write_all(input.as_bytes());
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for script: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = if stderr.is_empty() {
        stdout
    } else {
        format!("{}\n{}", stdout.trim(), stderr.trim())
    };
    Ok((combined, output.status.code().unwrap_or(-1)))
}

pub fn exec_bat_streaming<F>(
    cwd: &str,
    script: &str,
    stdin_input: Option<&str>,
    on_line: F,
) -> Result<i32, String>
where
    F: Fn(&str) + Send + Sync + 'static,
{
    use std::io::{BufRead, BufReader, Write};
    use std::sync::Arc;

    let mut cmd = std::process::Command::new("cmd.exe");
    cmd.args(["/C", script]).current_dir(cwd);

    if stdin_input.is_some() {
        cmd.stdin(std::process::Stdio::piped());
    } else {
        cmd.stdin(std::process::Stdio::null());
    }
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to run script: {}", e))?;

    let child_pid = child.id();

    if let Some(input) = stdin_input {
        if let Some(mut stdin_handle) = child.stdin.take() {
            let _ = stdin_handle.write_all(input.as_bytes());
            drop(stdin_handle);
        }
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let on_line = Arc::new(on_line);

    let stdout_handle = stdout.map(|out| {
        let cb = Arc::clone(&on_line);
        std::thread::spawn(move || {
            let reader = BufReader::new(out);
            for line in reader.lines() {
                match line {
                    Ok(l) => cb(&l),
                    Err(_) => break,
                }
            }
        })
    });

    let stderr_handle = stderr.map(|err| {
        let cb = Arc::clone(&on_line);
        std::thread::spawn(move || {
            let reader = BufReader::new(err);
            for line in reader.lines() {
                match line {
                    Ok(l) => cb(&l),
                    Err(_) => break,
                }
            }
        })
    });

    let status = child.wait().map_err(|e| format!("Failed to wait for script: {}", e))?;
    let code = status.code().unwrap_or(-1);

    // Process exited. Wait briefly for reader threads to finish draining
    // buffered output. If orphaned child processes keep pipes open,
    // kill the process tree so readers can unblock.
    let drain_timeout = std::time::Duration::from_secs(3);
    let start = std::time::Instant::now();

    let stdout_done = stdout_handle.map(|h| {
        Arc::new((std::sync::Mutex::new(Some(h)), std::sync::atomic::AtomicBool::new(false)))
    });
    let stderr_done = stderr_handle.map(|h| {
        Arc::new((std::sync::Mutex::new(Some(h)), std::sync::atomic::AtomicBool::new(false)))
    });

    // Spawn a monitor that joins readers and marks them done
    let sd = stdout_done.clone();
    let ed = stderr_done.clone();
    std::thread::spawn(move || {
        if let Some(ref sd) = sd {
            if let Some(h) = sd.0.lock().unwrap().take() {
                let _ = h.join();
            }
            sd.1.store(true, std::sync::atomic::Ordering::Relaxed);
        }
        if let Some(ref ed) = ed {
            if let Some(h) = ed.0.lock().unwrap().take() {
                let _ = h.join();
            }
            ed.1.store(true, std::sync::atomic::Ordering::Relaxed);
        }
    });

    loop {
        let all_done = stdout_done.as_ref().map_or(true, |s| s.1.load(std::sync::atomic::Ordering::Relaxed))
            && stderr_done.as_ref().map_or(true, |s| s.1.load(std::sync::atomic::Ordering::Relaxed));
        if all_done {
            break;
        }
        if start.elapsed() > drain_timeout {
            kill_process_tree(child_pid);
            std::thread::sleep(std::time::Duration::from_millis(500));
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    Ok(code)
}

#[cfg(target_os = "windows")]
fn kill_process_tree(pid: u32) {
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
}

#[cfg(not(target_os = "windows"))]
fn kill_process_tree(pid: u32) {
    unsafe { libc::kill(-(pid as i32), libc::SIGKILL); }
}

pub async fn run_bat_with_input(cwd: &str, script: &str, stdin_input: Option<&str>) -> Result<(String, i32), String> {
    let cwd = cwd.to_string();
    let script = script.to_string();
    let input = stdin_input.map(|s| s.to_string());

    tokio::task::spawn_blocking(move || exec_bat_with_input(&cwd, &script, input.as_deref()))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

pub async fn run_git(cwd: &str, args: &[&str]) -> Result<(String, i32), String> {
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

pub const CORE_BRANCHES: &[&str] = &["public", "release", "patch", "master", "main", "develop"];

pub const STASH_MARK_FILE: &str = ".git/auto-stash-mark";

pub fn get_stash_mark_path(project_path: &str) -> std::path::PathBuf {
    std::path::Path::new(project_path).join(STASH_MARK_FILE)
}

pub fn is_date_after(iso_date: &str, cutoff_epoch: i64) -> bool {
    let date_part = iso_date.get(..19).unwrap_or("");
    let tz_part = iso_date.get(20..).unwrap_or("+0000").trim();

    let base = match parse_datetime(date_part) {
        Some(v) => v,
        None => return true,
    };

    let tz_offset_secs = parse_tz_offset(tz_part);
    let epoch = base - tz_offset_secs;
    epoch >= cutoff_epoch
}

fn parse_datetime(s: &str) -> Option<i64> {
    let parts: Vec<&str> = s.split(|c| c == '-' || c == ' ' || c == ':').collect();
    if parts.len() < 6 { return None; }
    let y: i64 = parts[0].parse().ok()?;
    let m: i64 = parts[1].parse().ok()?;
    let d: i64 = parts[2].parse().ok()?;
    let h: i64 = parts[3].parse().ok()?;
    let min: i64 = parts[4].parse().ok()?;
    let sec: i64 = parts[5].parse().ok()?;

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
    if tz.len() < 5 { return 0; }
    let sign: i64 = if tz.starts_with('-') { -1 } else { 1 };
    let hh: i64 = tz[1..3].parse().unwrap_or(0);
    let mm: i64 = tz[3..5].parse().unwrap_or(0);
    sign * (hh * 3600 + mm * 60)
}

pub fn parse_untracked_files(output: &str) -> Vec<String> {
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

pub fn parse_conflict_files_from_pull(output: &str) -> Vec<String> {
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

pub fn parse_rebase_conflict_files(output: &str) -> Vec<String> {
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
