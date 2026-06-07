use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeTemplate {
    pub current_branch: String,
    pub source_branch: String,
    pub task_id: String,
    pub title: String,
    pub url: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub projects: Vec<String>,
    pub current_project: String,
    pub auto_remove_untracked: bool,
    #[serde(default)]
    pub skip_push_confirm: bool,
    #[serde(default = "default_log_count")]
    pub log_count: u32,
    pub merge_templates: Vec<MergeTemplate>,
    #[serde(default)]
    pub button_order: Vec<String>,
}

fn default_log_count() -> u32 {
    30
}

impl Default for Config {
    fn default() -> Self {
        Config {
            projects: Vec::new(),
            current_project: String::new(),
            auto_remove_untracked: false,
            skip_push_confirm: false,
            log_count: 30,
            merge_templates: vec![
                MergeTemplate {
                    current_branch: "patch".into(),
                    source_branch: "master".into(),
                    task_id: "#M72-147444".into(),
                    title: "【版本】同步 master 到 patch".into(),
                    url: "https://ones.g-bits.com:21001/project/#/team/TYdk6vTk/task/DQFMg73RDojE5U8m".into(),
                    description: "同步 master 到 patch".into(),
                },
                MergeTemplate {
                    current_branch: "master".into(),
                    source_branch: "patch".into(),
                    task_id: "#M72-125013".into(),
                    title: "【版本】合并 patch 进入 master".into(),
                    url: "https://ones.g-bits.com:21001/project/#/team/TYdk6vTk/task/DQFMg73ROyIgAUYR".into(),
                    description: "合并 patch 进入 master".into(),
                },
                MergeTemplate {
                    current_branch: "release".into(),
                    source_branch: "patch".into(),
                    task_id: "#M72-147443".into(),
                    title: "【版本】同步 patch 到 release".into(),
                    url: "https://ones.g-bits.com:21001/project/#/team/TYdk6vTk/task/DQFMg73RHDpResfk".into(),
                    description: "同步 patch 到 release".into(),
                },
                MergeTemplate {
                    current_branch: "patch".into(),
                    source_branch: "release".into(),
                    task_id: "#M72-124986".into(),
                    title: "【版本】合并 release 进入 patch".into(),
                    url: "https://ones.g-bits.com:21001/project/#/team/TYdk6vTk/task/DQFMg73R742PwDni".into(),
                    description: "合并 release 进入 patch".into(),
                },
                MergeTemplate {
                    current_branch: "release".into(),
                    source_branch: "public".into(),
                    task_id: "#M72-129360".into(),
                    title: "【版本】合并 public 进入 release".into(),
                    url: "https://ones.g-bits.com:21001/project/#/team/TYdk6vTk/task/DQFMg73RMuVu5wn2".into(),
                    description: "合并 public 进入 release".into(),
                },
                MergeTemplate {
                    current_branch: "public".into(),
                    source_branch: "release".into(),
                    task_id: "#M72-147442".into(),
                    title: "【版本】同步 release 到 public".into(),
                    url: "https://ones.g-bits.com:21001/project/#/team/TYdk6vTk/task/DQFMg73RiQQ3H3Tf".into(),
                    description: "同步 release 到 public".into(),
                },
            ],
            button_order: Vec::new(),
        }
    }
}

fn config_path() -> PathBuf {
    std::env::current_exe()
        .unwrap()
        .parent()
        .unwrap()
        .join("git-gui-config.json")
}

fn load_config() -> Config {
    let path = config_path();
    if path.exists() {
        let content = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Config::default()
    }
}

fn persist_config(config: &Config) -> Result<(), String> {
    let path = config_path();
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_config() -> Result<Config, String> {
    Ok(load_config())
}

#[tauri::command]
pub async fn save_config(config: Config) -> Result<(), String> {
    persist_config(&config)
}

#[tauri::command]
pub async fn add_project(path: String) -> Result<Config, String> {
    let mut config = load_config();
    if !config.projects.contains(&path) {
        config.projects.push(path.clone());
    }
    config.current_project = path;
    persist_config(&config)?;
    Ok(config)
}

#[tauri::command]
pub async fn remove_project(path: String) -> Result<Config, String> {
    let mut config = load_config();
    config.projects.retain(|p| p != &path);
    if config.current_project == path {
        config.current_project = config.projects.first().cloned().unwrap_or_default();
    }
    persist_config(&config)?;
    Ok(config)
}
