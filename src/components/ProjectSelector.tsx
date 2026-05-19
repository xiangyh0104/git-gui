import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Config, LogEntry } from "../types";
import { addProject, removeProject, saveConfig } from "../lib/commands";

interface Props {
  config: Config | null;
  onConfigChange: (config: Config) => void;
  onLog?: (type: LogEntry["type"], message: string) => void;
  disabled: boolean;
}

function getDisplayName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

export default function ProjectSelector({ config, onConfigChange, onLog, disabled }: Props) {
  const handleProjectChange = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!config) return;
    const newConfig = { ...config, currentProject: e.target.value };
    try {
      await saveConfig(newConfig);
    } catch (err) {
      onLog?.("error", `保存配置失败: ${err}`);
    }
    onConfigChange(newConfig);
  }, [config, onConfigChange, onLog]);

  const handleAdd = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择 Git 项目目录",
      });
      if (selected) {
        const newConfig = await addProject(selected as string);
        onConfigChange(newConfig);
      }
    } catch (e) {
      console.error("Failed to add project:", e);
    }
  }, [onConfigChange]);

  const handleRemove = useCallback(async () => {
    if (!config?.currentProject) return;
    const confirmed = window.confirm(`确定移除项目 "${getDisplayName(config.currentProject)}"？`);
    if (!confirmed) return;
    try {
      const newConfig = await removeProject(config.currentProject);
      onConfigChange(newConfig);
    } catch (e) {
      console.error("Failed to remove project:", e);
    }
  }, [config, onConfigChange]);

  return (
    <div className="project-selector">
      <select
        className="project-select"
        value={config?.currentProject || ""}
        onChange={handleProjectChange}
        disabled={disabled || !config}
      >
        {!config?.projects.length && <option value="">无项目</option>}
        {config?.projects.map((p) => (
          <option key={p} value={p}>
            {getDisplayName(p)}
          </option>
        ))}
      </select>
      <button
        className="project-btn"
        onClick={handleAdd}
        disabled={disabled}
        title="添加项目"
      >
        +
      </button>
      <button
        className="project-btn"
        onClick={handleRemove}
        disabled={disabled || !config?.currentProject}
        title="移除项目"
      >
        −
      </button>
    </div>
  );
}
