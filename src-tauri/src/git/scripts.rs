use super::common::{run_bat, run_bat_detached, run_bat_with_input, exec_bat_streaming};
use tauri::Emitter;

#[tauri::command]
pub async fn run_bat_script(project_path: String, script_name: String) -> Result<String, String> {
    let scripts_dir = std::path::Path::new(&project_path)
        .join("server")
        .join("run_scripts");

    if !scripts_dir.exists() {
        return Err(format!("脚本目录不存在: {}", scripts_dir.display()));
    }

    let script_path = scripts_dir.join(&script_name);
    if !script_path.exists() {
        return Err(format!("脚本不存在: {}", script_path.display()));
    }

    let cwd = scripts_dir.to_string_lossy().to_string();
    let (output, _code) = run_bat(&cwd, &script_name).await?;

    Ok(output)
}

#[tauri::command]
pub async fn launch_bat_script(project_path: String, script_name: String) -> Result<String, String> {
    let scripts_dir = std::path::Path::new(&project_path)
        .join("server")
        .join("run_scripts");

    if !scripts_dir.exists() {
        return Err(format!("脚本目录不存在: {}", scripts_dir.display()));
    }

    let script_path = scripts_dir.join(&script_name);
    if !script_path.exists() {
        return Err(format!("脚本不存在: {}", script_path.display()));
    }

    let cwd = scripts_dir.to_string_lossy().to_string();
    run_bat_detached(&cwd, &script_name).await?;

    Ok(format!("{} 已在新窗口启动", script_name))
}

#[tauri::command]
pub async fn run_project_script(
    project_path: String,
    script_path: String,
    stdin_input: Option<String>,
) -> Result<String, String> {
    let full_path = std::path::Path::new(&project_path).join(&script_path);

    if !full_path.exists() {
        return Err(format!("脚本不存在: {}", full_path.display()));
    }

    let cwd = full_path.parent()
        .ok_or_else(|| "无法获取脚本所在目录".to_string())?
        .to_string_lossy()
        .to_string();

    let file_name = full_path.file_name()
        .ok_or_else(|| "无法获取脚本文件名".to_string())?
        .to_string_lossy()
        .to_string();

    let (output, _code) = run_bat_with_input(&cwd, &file_name, stdin_input.as_deref()).await?;

    Ok(output)
}

#[tauri::command]
pub async fn run_script_streaming(
    app: tauri::AppHandle,
    project_path: String,
    script_path: String,
    stdin_input: Option<String>,
) -> Result<i32, String> {
    let full_path = std::path::Path::new(&project_path).join(&script_path);

    if !full_path.exists() {
        return Err(format!("脚本不存在: {}", full_path.display()));
    }

    let cwd = full_path.parent()
        .ok_or_else(|| "无法获取脚本所在目录".to_string())?
        .to_string_lossy()
        .to_string();

    let file_name = full_path.file_name()
        .ok_or_else(|| "无法获取脚本文件名".to_string())?
        .to_string_lossy()
        .to_string();

    let input = stdin_input.clone();

    let code = tokio::task::spawn_blocking(move || {
        exec_bat_streaming(&cwd, &file_name, input.as_deref(), move |line| {
            let _ = app.emit("script-output", line);
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(code)
}

#[tauri::command]
pub async fn run_import_external_streaming(
    app: tauri::AppHandle,
    project_path: String,
    stdin_input: Option<String>,
) -> Result<i32, String> {
    let pack_mode_dir = std::path::Path::new(&project_path).join("pack_mode");
    if !pack_mode_dir.exists() {
        return Err(format!("pack_mode 目录不存在: {}", pack_mode_dir.display()));
    }

    let cwd = pack_mode_dir.to_string_lossy().to_string();
    let command = r"pushd ..\server\run_scripts & call start_mongodb.bat & popd & python tools\patch_builder\src\hotupdate_toolkit\cli\import_external_data.py".to_string();
    let input = stdin_input;

    let code = tokio::task::spawn_blocking(move || {
        exec_bat_streaming(&cwd, &command, input.as_deref(), move |line| {
            let _ = app.emit("script-output", line);
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(code)
}

#[tauri::command]
pub async fn launch_unity(project_path: String) -> Result<String, String> {
    let client_dir = std::path::Path::new(&project_path).join("client");
    if !client_dir.exists() {
        return Err(format!("client 目录不存在: {}", client_dir.display()));
    }

    let unity_path = r"C:\Program Files\Unity 2022.3.20f1\Editor\Unity.exe";
    if !std::path::Path::new(unity_path).exists() {
        return Err(format!("Unity 不存在: {}", unity_path));
    }

    let client_dir_str = client_dir.to_string_lossy().to_string();

    tokio::task::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(unity_path);
        cmd.arg("-projectPath").arg(&client_dir_str);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x00000008); // DETACHED_PROCESS
        }

        cmd.spawn()
            .map_err(|e| format!("启动 Unity 失败: {}", e))?;

        Ok("Unity 已启动".to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
