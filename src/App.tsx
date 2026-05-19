import { useState, useEffect, useCallback } from "react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { Config, LogEntry, GitOutput } from "./types";
import {
  getConfig,
  gitFetchAll,
  gitGetCurrentBranch,
  gitPush,
  gitResetHard,
  gitForcePull,
} from "./lib/commands";
import ProjectSelector from "./components/ProjectSelector";
import ActionButtons from "./components/ActionButtons";
import LogViewer from "./components/LogViewer";
import BranchSwitcher from "./components/BranchSwitcher";
import MergePanel from "./components/MergePanel";
import Settings from "./components/Settings";
import UntrackedFilesDialog from "./components/UntrackedFilesDialog";
import CommitLogPanel from "./components/CommitLogPanel";
import StatusAnimation from "./components/StatusAnimation";

const ACTION_LABELS: Record<string, string> = {
  fetch: "拉取远端",
  switch: "切换分支",
  merge: "合并分支",
  push: "推送",
  reset: "重置分支",
  "force-pull": "更新分支",
  log: "查看日志",
};

let logIdCounter = 0;

function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [currentBranch, setCurrentBranch] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<"success" | "error" | null>(null);
  const [activeDialog, setActiveDialog] = useState<"branch" | "merge" | "settings" | "log" | null>(null);
  const [untrackedDialog, setUntrackedDialog] = useState<{
    files: string[];
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);

  const loading = !!loadingAction;

  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString("zh-CN", { hour12: false });
    setLogs((prev) => [...prev, { id: ++logIdCounter, timestamp, type, message }]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const notify = useCallback(async (title: string, body: string) => {
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }
      if (granted) {
        sendNotification({ title, body });
      }
    } catch {
      // notification not available
    }
  }, []);

  const refreshBranch = useCallback(async (projectPath?: string) => {
    const path = projectPath || config?.currentProject;
    if (!path) return;
    try {
      const branch = await gitGetCurrentBranch(path);
      setCurrentBranch(branch);
    } catch (e) {
      setCurrentBranch("unknown");
    }
  }, [config?.currentProject]);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getConfig();
        setConfig(cfg);
        if (cfg.currentProject) {
          const branch = await gitGetCurrentBranch(cfg.currentProject);
          setCurrentBranch(branch);
        }
      } catch (e) {
        addLog("error", `加载配置失败: ${e}`);
      }
    })();
  }, [addLog]);

  const handleConfigChange = useCallback(async (newConfig: Config) => {
    setConfig(newConfig);
    if (newConfig.currentProject) {
      try {
        const branch = await gitGetCurrentBranch(newConfig.currentProject);
        setCurrentBranch(branch);
      } catch {
        setCurrentBranch("unknown");
      }
    } else {
      setCurrentBranch("");
    }
  }, []);

  const handleUntrackedFiles = useCallback((output: GitOutput, retryFn: () => Promise<void>) => {
    setUntrackedDialog({
      files: output.untrackedFiles,
      onConfirm: async () => {
        setUntrackedDialog(null);
        await retryFn();
      },
      onCancel: () => {
        setUntrackedDialog(null);
        addLog("warning", "操作已取消，未跟踪文件未移除");
      },
    });
  }, [addLog]);

  const handleAction = useCallback(async (action: string) => {
    if (!config?.currentProject) {
      addLog("warning", "请先选择一个项目目录");
      return;
    }

    if (loadingAction) {
      addLog("warning", `当前正在${ACTION_LABELS[loadingAction] || loadingAction}，请等待完成`);
      return;
    }

    const projectPath = config.currentProject;

    if (action === "switch") {
      setActiveDialog("branch");
      return;
    }
    if (action === "merge") {
      setActiveDialog("merge");
      return;
    }
    if (action === "log") {
      setActiveDialog("log");
      return;
    }

    setLoadingAction(action);
    setLastResult(null);
    let succeeded = false;
    try {
      switch (action) {
        case "fetch": {
          addLog("command", "> git fetch --all");
          const result = await gitFetchAll(projectPath);
          addLog("success", result || "拉取完成");
          await refreshBranch(projectPath);
          await notify("Git 助手", "远端拉取完成");
          succeeded = true;
          break;
        }
        case "push": {
          addLog("command", "> git push");
          const pushResult = await gitPush(projectPath);
          addLog("success", pushResult || "推送完成");
          await notify("Git 助手", "推送完成");
          succeeded = true;
          break;
        }
        case "reset": {
          const confirmed = window.confirm("确定重置? 所有未提交修改将丢失");
          if (!confirmed) break;
          addLog("command", "> git reset --hard");
          const result = await gitResetHard(projectPath);
          addLog("success", result || "重置完成");
          await refreshBranch(projectPath);
          await notify("Git 助手", "分支已重置");
          succeeded = true;
          break;
        }
        case "force-pull": {
          addLog("command", "> git force pull");
          const result = await gitForcePull(projectPath, config.autoRemoveUntracked);
          if (result.needsUntrackedRemoval) {
            handleUntrackedFiles(result, async () => {
              setLoadingAction("force-pull");
              setLastResult(null);
              try {
                addLog("command", "> git force pull (auto-remove untracked)");
                const retry = await gitForcePull(projectPath, true);
                if (retry.success) {
                  addLog("success", retry.output || "更新完成");
                  await notify("Git 助手", "分支更新完成");
                  setLastResult("success");
                } else {
                  addLog("error", retry.output || "更新失败");
                  setLastResult("error");
                }
              } catch (e) {
                addLog("error", `更新失败: ${e}`);
                setLastResult("error");
              } finally {
                setLoadingAction(null);
                await refreshBranch(projectPath);
              }
            });
          } else if (result.success) {
            addLog("success", result.output || "更新完成");
            await notify("Git 助手", "分支更新完成");
            succeeded = true;
          } else {
            addLog("error", result.output || "更新失败");
          }
          await refreshBranch(projectPath);
          break;
        }
      }
    } catch (e) {
      addLog("error", `操作失败: ${e}`);
    } finally {
      setLoadingAction(null);
      if (succeeded) setLastResult("success");
      else if (!succeeded && action !== "force-pull") setLastResult("error");
    }
  }, [config, loadingAction, addLog, refreshBranch, notify, handleUntrackedFiles]);

  return (
    <div className="app">
      <header className="header">
        <ProjectSelector
          config={config}
          onConfigChange={handleConfigChange}
          onLog={addLog}
          disabled={loading}
        />
        <div className="branch-display">
          <span className="branch-icon">⑂</span>
          <span className="branch-name">{currentBranch || "—"}</span>
        </div>
        <button
          className="icon-btn settings-btn"
          onClick={() => setActiveDialog("settings")}
          title="设置"
        >
          ⚙
        </button>
      </header>

      <ActionButtons onAction={handleAction} disabled={!config?.currentProject} loading={loading} loadingAction={loadingAction} />

      <StatusAnimation loadingAction={loadingAction} lastResult={lastResult} />

      <LogViewer logs={logs} onClear={clearLogs} />

      {activeDialog === "branch" && config?.currentProject && (
        <BranchSwitcher
          projectPath={config.currentProject}
          autoRemoveUntracked={config.autoRemoveUntracked}
          onClose={() => setActiveDialog(null)}
          onLog={addLog}
          onUntrackedFiles={handleUntrackedFiles}
          onRefresh={() => refreshBranch()}
        />
      )}

      {activeDialog === "merge" && config?.currentProject && (
        <MergePanel
          projectPath={config.currentProject}
          currentBranch={currentBranch}
          mergeTemplates={config.mergeTemplates}
          skipPushConfirm={config.skipPushConfirm ?? false}
          onClose={() => setActiveDialog(null)}
          onLog={addLog}
          onRefresh={() => refreshBranch()}
        />
      )}

      {activeDialog === "log" && config?.currentProject && (
        <CommitLogPanel
          projectPath={config.currentProject}
          currentBranch={currentBranch}
          logCount={config.logCount ?? 30}
          onClose={() => setActiveDialog(null)}
          onLog={addLog}
        />
      )}

      {activeDialog === "settings" && config && (
        <Settings
          config={config}
          onConfigChange={handleConfigChange}
          onClose={() => setActiveDialog(null)}
        />
      )}

      {untrackedDialog && (
        <UntrackedFilesDialog
          files={untrackedDialog.files}
          onConfirm={untrackedDialog.onConfirm}
          onCancel={untrackedDialog.onCancel}
        />
      )}
    </div>
  );
}

export default App;
