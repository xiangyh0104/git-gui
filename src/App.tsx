import { useState, useEffect, useCallback, useRef } from "react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { Config, LogEntry, GitOutput } from "./types";
import {
  getConfig,
  saveConfig,
  gitFetchAll,
  gitFetchRebase,
  gitGetCurrentBranch,
  gitSwitchBranch,
  gitPush,
  gitResetHard,
  gitCheckoutDiscard,
  gitUndoCommit,
  gitForcePull,
  gitRepair,
  runBatScript,
  launchUnity,
} from "./lib/commands";
import ProjectSelector from "./components/ProjectSelector";
import ActionButtons, { DEFAULT_ACTION_ORDER } from "./components/ActionButtons";
import LogViewer from "./components/LogViewer";
import BranchSwitcher from "./components/BranchSwitcher";
import MergePanel from "./components/MergePanel";
import Settings from "./components/Settings";
import UntrackedFilesDialog from "./components/UntrackedFilesDialog";
import CommitLogPanel from "./components/CommitLogPanel";
import StatusAnimation from "./components/StatusAnimation";
import QueuePanel from "./components/QueuePanel";
import useActionQueue from "./hooks/useActionQueue";

const ACTION_LABELS: Record<string, string> = {
  fetch: "拉取远端",
  "fetch-rebase": "Fetch & Rebase",
  switch: "切换分支",
  merge: "合并分支",
  push: "推送",
  reset: "重置分支",
  "force-pull": "更新分支",
  log: "查看日志",
  repair: "修复仓库",
  "one-key-start": "一键启动",
  "start-server": "启动2服",
  "start-client": "启动客户端",
  "checkout-discard": "回退改动",
  "undo-commit": "取消commit",
};

const CONFIRM_ACTIONS: Record<string, string> = {
  reset: "确定重置? 所有未提交修改将丢失",
  repair: "确定修复仓库? 将执行 fsck + repack，耗时较长",
  "checkout-discard": "确定回退所有改动? 未提交的修改将丢失",
  "undo-commit": "确定取消最近一次 commit? 改动会保留在工作区",
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

  const { queue, enqueue, cancelItem, clearQueue, dequeue } = useActionQueue();

  const currentBranchRef = useRef(currentBranch);
  currentBranchRef.current = currentBranch;
  const configRef = useRef(config);
  configRef.current = config;
  const processingQueueRef = useRef(false);

  const loading = !!loadingAction;

  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString("zh-CN", { hour12: false });
    setLogs((prev) => [...prev, { id: ++logIdCounter, timestamp, type, message }]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const notify = useCallback(async (title: string, body: string) => {
    try {
      const result = await Promise.race([
        (async () => {
          let granted = await isPermissionGranted();
          if (!granted) {
            const permission = await requestPermission();
            granted = permission === "granted";
          }
          if (granted) {
            sendNotification({ title, body });
          }
        })(),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);
      void result;
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

  const executeAction = useCallback(async (action: string, projectPath: string) => {
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
        case "fetch-rebase": {
          addLog("command", "> git fetch && git rebase origin/<branch>");
          const rebaseResult = await gitFetchRebase(projectPath);
          if (rebaseResult.hasConflicts) {
            addLog("warning", "Rebase 遇到冲突，请手动解决以下文件:");
            for (const file of rebaseResult.conflictFiles) {
              addLog("error", `  冲突: ${file}`);
            }
            addLog("info", "解决冲突后再次点击 Fetch & Rebase 按钮继续");
            await notify("Git 助手", "Rebase 冲突，请手动解决");
          } else if (rebaseResult.success) {
            addLog("success", rebaseResult.output || "Fetch & Rebase 完成");
            await refreshBranch(projectPath);
            await notify("Git 助手", "Fetch & Rebase 完成");
            succeeded = true;
          } else {
            addLog("error", rebaseResult.output || "Fetch & Rebase 失败");
          }
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
          addLog("command", "> git reset --hard");
          const result = await gitResetHard(projectPath);
          addLog("success", result || "重置完成");
          await refreshBranch(projectPath);
          await notify("Git 助手", "分支已重置");
          succeeded = true;
          break;
        }
        case "repair": {
          addLog("command", "> git fsck && git repack -a -d -f");
          const repairResult = await gitRepair(projectPath);
          addLog("info", repairResult);
          await notify("Git 助手", "仓库修复完成");
          succeeded = true;
          break;
        }
        case "checkout-discard": {
          addLog("command", "> git checkout -- .");
          const discardResult = await gitCheckoutDiscard(projectPath);
          addLog("success", discardResult || "回退改动完成");
          await notify("Git 助手", "回退改动完成");
          succeeded = true;
          break;
        }
        case "undo-commit": {
          addLog("command", "> git reset --mixed HEAD~1");
          const undoResult = await gitUndoCommit(projectPath);
          addLog("success", undoResult || "取消 commit 完成");
          await notify("Git 助手", "取消 commit 完成");
          succeeded = true;
          break;
        }
        case "force-pull": {
          addLog("command", "> git force pull");
          const result = await gitForcePull(projectPath, configRef.current?.autoRemoveUntracked ?? false);
          if (result.needsUntrackedRemoval) {
            const userConfirmed = await new Promise<boolean>((resolve) => {
              setUntrackedDialog({
                files: result.untrackedFiles,
                onConfirm: () => { setUntrackedDialog(null); resolve(true); },
                onCancel: () => { setUntrackedDialog(null); resolve(false); },
              });
            });
            if (userConfirmed) {
              addLog("command", "> git force pull (auto-remove untracked)");
              const retry = await gitForcePull(projectPath, true);
              if (retry.success) {
                addLog("success", retry.output || "更新完成");
                await notify("Git 助手", "分支更新完成");
                succeeded = true;
              } else {
                addLog("error", retry.output || "更新失败");
              }
            } else {
              addLog("warning", "操作已取消，未跟踪文件未移除");
            }
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
      else if (action !== "force-pull") setLastResult("error");
    }
  }, [addLog, refreshBranch, notify]);

  const executeSwitchAction = useCallback(async (projectPath: string, targetBranch: string) => {
    setLoadingAction("switch");
    setLastResult(null);
    let succeeded = false;
    try {
      addLog("command", `> git fetch && switch ${targetBranch}`);
      await gitFetchAll(projectPath);
      const result = await gitSwitchBranch(projectPath, targetBranch, configRef.current?.autoRemoveUntracked ?? false);
      if (result.needsUntrackedRemoval) {
        const userConfirmed = await new Promise<boolean>((resolve) => {
          setUntrackedDialog({
            files: result.untrackedFiles,
            onConfirm: () => { setUntrackedDialog(null); resolve(true); },
            onCancel: () => { setUntrackedDialog(null); resolve(false); },
          });
        });
        if (userConfirmed) {
          addLog("command", `> git switch ${targetBranch} (auto-remove untracked)`);
          const retry = await gitSwitchBranch(projectPath, targetBranch, true);
          if (retry.success) {
            addLog("success", `已切换到分支 ${targetBranch}`);
            await refreshBranch(projectPath);
            await notify("Git 助手", `已切换到 ${targetBranch}`);
            succeeded = true;
          } else {
            addLog("error", retry.output || "切换失败");
          }
        } else {
          addLog("warning", "切换已取消");
        }
      } else if (result.success) {
        addLog("success", `已切换到分支 ${targetBranch}`);
        await refreshBranch(projectPath);
        await notify("Git 助手", `已切换到 ${targetBranch}`);
        succeeded = true;
      } else {
        addLog("error", result.output || "切换失败");
      }
    } catch (e) {
      addLog("error", `切换分支失败: ${e}`);
    } finally {
      setLoadingAction(null);
      setLastResult(succeeded ? "success" : "error");
    }
  }, [addLog, refreshBranch, notify]);

  const runOneKeyStart = useCallback(async (projectPath: string) => {
    setLoadingAction("one-key-start");
    setLastResult(null);

    const branch = await gitGetCurrentBranch(projectPath);

    const steps = [
      { label: "git fetch --all", fn: () => gitFetchAll(projectPath) },
      { label: `切换到 origin/${branch}`, fn: async () => {
        const r = await gitSwitchBranch(projectPath, branch, true);
        if (!r.success) throw new Error(r.output || "切换失败");
        return r.output;
      }},
      { label: "clean_data.bat", fn: () => runBatScript(projectPath, "clean_data.bat") },
      { label: "clean_pull.bat", fn: () => runBatScript(projectPath, "clean_pull.bat") },
      { label: "check_update_pkg.bat", fn: () => runBatScript(projectPath, "check_update_pkg.bat") },
      { label: "clean_compile_cache.bat", fn: () => runBatScript(projectPath, "clean_compile_cache.bat") },
      { label: "start_all_cross.bat", fn: () => runBatScript(projectPath, "start_all_cross.bat") },
      { label: "启动 Unity", fn: () => launchUnity(projectPath) },
    ];

    let succeeded = false;
    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        addLog("command", `> [${i + 1}/${steps.length}] ${step.label}`);
        const result = await step.fn();
        addLog("success", result || `${step.label} 完成`);
      }
      await refreshBranch(projectPath);
      await notify("Git 助手", "一键启动完成");
      succeeded = true;
    } catch (e) {
      addLog("error", `一键启动失败: ${e}`);
      await notify("Git 助手", `一键启动失败`);
    } finally {
      setLoadingAction(null);
      setLastResult(succeeded ? "success" : "error");
    }
  }, [addLog, refreshBranch, notify]);

  const runStartServer = useCallback(async (projectPath: string) => {
    setLoadingAction("start-server");
    setLastResult(null);
    let succeeded = false;
    try {
      addLog("command", "> start_all_cross.bat");
      const result = await runBatScript(projectPath, "start_all_cross.bat");
      addLog("success", result || "启动2服完成");
      await notify("Git 助手", "启动2服完成");
      succeeded = true;
    } catch (e) {
      addLog("error", `启动2服失败: ${e}`);
      await notify("Git 助手", "启动2服失败");
    } finally {
      setLoadingAction(null);
      setLastResult(succeeded ? "success" : "error");
    }
  }, [addLog, notify]);

  const runStartClient = useCallback(async (projectPath: string) => {
    setLoadingAction("start-client");
    setLastResult(null);
    let succeeded = false;
    try {
      addLog("command", "> 启动 Unity");
      const result = await launchUnity(projectPath);
      addLog("success", result || "启动客户端完成");
      await notify("Git 助手", "启动客户端完成");
      succeeded = true;
    } catch (e) {
      addLog("error", `启动客户端失败: ${e}`);
      await notify("Git 助手", "启动客户端失败");
    } finally {
      setLoadingAction(null);
      setLastResult(succeeded ? "success" : "error");
    }
  }, [addLog, notify]);

  // Process next queue item when the current action completes
  useEffect(() => {
    if (loadingAction !== null) {
      processingQueueRef.current = false;
      return;
    }
    if (queue.length === 0 || activeDialog === "merge") return;
    if (processingQueueRef.current) return;
    processingQueueRef.current = true;

    const next = dequeue();
    if (!next) { processingQueueRef.current = false; return; }

    (async () => {
      const projectPath = next.projectPath;

      // Auto-switch branch if needed (switch actions handle their own branch)
      if (next.action !== "switch" && next.targetBranch && next.targetBranch !== currentBranchRef.current) {
        setLoadingAction(next.action);
        addLog("command", `> 队列自动切换到 ${next.targetBranch}`);
        try {
          const result = await gitSwitchBranch(
            projectPath,
            next.targetBranch,
            configRef.current?.autoRemoveUntracked ?? false,
          );
          if (result.needsUntrackedRemoval) {
            const confirmed = await new Promise<boolean>((resolve) => {
              setUntrackedDialog({
                files: result.untrackedFiles,
                onConfirm: () => { setUntrackedDialog(null); resolve(true); },
                onCancel: () => { setUntrackedDialog(null); resolve(false); },
              });
            });
            if (confirmed) {
              const retry = await gitSwitchBranch(projectPath, next.targetBranch, true);
              if (!retry.success) {
                addLog("error", `自动切换分支失败: ${retry.output}`);
                addLog("warning", "队列已停止");
                clearQueue();
                setLoadingAction(null);
                setLastResult("error");
                return;
              }
            } else {
              addLog("warning", "自动切换已取消，队列已停止");
              clearQueue();
              setLoadingAction(null);
              setLastResult("error");
              return;
            }
          } else if (!result.success) {
            addLog("error", `自动切换分支失败: ${result.output}`);
            addLog("warning", "队列已停止");
            clearQueue();
            setLoadingAction(null);
            setLastResult("error");
            return;
          }
          setCurrentBranch(next.targetBranch);
          addLog("success", `已切换到 ${next.targetBranch}`);
        } catch (e) {
          addLog("error", `自动切换分支失败: ${e}`);
          addLog("warning", "队列已停止");
          clearQueue();
          setLoadingAction(null);
          setLastResult("error");
          return;
        }
        setLoadingAction(null);
      }

      if (next.action === "switch" && next.switchTarget) {
        executeSwitchAction(projectPath, next.switchTarget);
      } else if (next.action === "one-key-start") {
        runOneKeyStart(projectPath);
      } else if (next.action === "start-server") {
        runStartServer(projectPath);
      } else if (next.action === "start-client") {
        runStartClient(projectPath);
      } else {
        executeAction(next.action, projectPath);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingAction, queue.length, activeDialog]);

  const handleAction = useCallback(async (action: string) => {
    if (!config?.currentProject) {
      addLog("warning", "请先选择一个项目目录");
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

    if (CONFIRM_ACTIONS[action]) {
      if (!window.confirm(CONFIRM_ACTIONS[action])) return;
    }

    if (loadingAction) {
      const label = ACTION_LABELS[action] || action;
      enqueue(action, label, currentBranch, projectPath);
      addLog("info", `已加入队列: ${label} (${currentBranch})`);
      return;
    }

    if (action === "one-key-start") {
      runOneKeyStart(projectPath);
    } else if (action === "start-server") {
      runStartServer(projectPath);
    } else if (action === "start-client") {
      runStartClient(projectPath);
    } else {
      executeAction(action, projectPath);
    }
  }, [config, loadingAction, currentBranch, addLog, enqueue, executeAction, runOneKeyStart, runStartServer, runStartClient]);

  const handleEnqueueSwitch = useCallback((targetBranch: string) => {
    if (!config?.currentProject) return;
    enqueue("switch", `切换 → ${targetBranch}`, currentBranch, config.currentProject, targetBranch);
    addLog("info", `已加入队列: 切换分支 → ${targetBranch}`);
  }, [config?.currentProject, currentBranch, enqueue, addLog]);

  const handleOrderChange = useCallback(async (newOrder: string[]) => {
    if (!config) return;
    const newConfig = { ...config, buttonOrder: newOrder };
    setConfig(newConfig);
    try {
      await saveConfig(newConfig);
    } catch {
      // non-critical
    }
  }, [config]);

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

      <div className="app-body">
        <ActionButtons
          onAction={handleAction}
          disabled={!config?.currentProject}
          loading={loading}
          loadingAction={loadingAction}
          order={config?.buttonOrder?.length ? config.buttonOrder : DEFAULT_ACTION_ORDER}
          onOrderChange={handleOrderChange}
          queueCounts={queue.reduce<Record<string, number>>((acc, item) => {
            acc[item.action] = (acc[item.action] || 0) + 1;
            return acc;
          }, {})}
        />

        <div className="main-content">
          <StatusAnimation loadingAction={loadingAction} lastResult={lastResult} />
          <div className="content-row">
            <LogViewer logs={logs} onClear={clearLogs} />
            {queue.length > 0 && (
              <QueuePanel
                queue={queue}
                onCancel={cancelItem}
                onClear={clearQueue}
              />
            )}
          </div>
        </div>
      </div>

      {activeDialog === "branch" && config?.currentProject && (
        <BranchSwitcher
          projectPath={config.currentProject}
          autoRemoveUntracked={config.autoRemoveUntracked}
          onClose={() => setActiveDialog(null)}
          onLog={addLog}
          onUntrackedFiles={handleUntrackedFiles}
          onRefresh={() => refreshBranch()}
          onEnqueue={loading ? handleEnqueueSwitch : undefined}
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
