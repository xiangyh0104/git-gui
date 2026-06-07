use super::common::run_bat;

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
