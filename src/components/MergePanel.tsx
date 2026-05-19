import { useState, useMemo } from "react";
import type { MergeTemplate, LogEntry } from "../types";
import {
  gitMergeBranch, gitCommit, gitPush, gitAbortMerge, gitSyncBeforeMerge,
} from "../lib/commands";

type Phase = "select" | "conflict" | "pushConfirm";

interface Props {
  projectPath: string;
  currentBranch: string;
  mergeTemplates: MergeTemplate[];
  skipPushConfirm: boolean;
  onClose: () => void;
  onLog: (type: LogEntry["type"], message: string) => void;
  onRefresh: () => void;
}

const SOURCE_BRANCHES = ["public", "release", "patch", "master"];

export default function MergePanel({
  projectPath,
  currentBranch,
  mergeTemplates,
  skipPushConfirm,
  onClose,
  onLog,
  onRefresh,
}: Props) {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>("select");
  const [conflictFiles, setConflictFiles] = useState<string[]>([]);
  const [commitMessage, setCommitMessage] = useState("");

  const availableSources = SOURCE_BRANCHES.filter((b) => b !== currentBranch);

  const template = useMemo(() => {
    if (!selectedSource) return null;
    return mergeTemplates.find(
      (t) => t.currentBranch === currentBranch && t.sourceBranch === selectedSource
    ) || null;
  }, [selectedSource, currentBranch, mergeTemplates]);

  const generatedMessage = useMemo(() => {
    if (!template) return "";
    return `${template.taskId} : ${template.title}\n\n${template.url}\n-------------------------------------------------------\n${template.description}\nskip all`;
  }, [template]);

  const validCombinations = useMemo(() => {
    return mergeTemplates
      .filter((t) => t.currentBranch === currentBranch)
      .map((t) => t.sourceBranch);
  }, [currentBranch, mergeTemplates]);

  const handleMerge = async () => {
    if (!selectedSource) return;
    const msg = generatedMessage;
    setCommitMessage(msg);
    setBusy(true);

    try {
      onLog("command", "> git fetch --all && 检查远端同步状态");
      const syncResult = await gitSyncBeforeMerge(projectPath);
      onLog("info", syncResult);

      onLog("command", `> git merge --no-ff --no-commit origin/${selectedSource}`);
      const result = await gitMergeBranch(projectPath, selectedSource);

      if (result.success && !result.hasConflicts) {
        onLog("success", "合并成功，正在提交...");
        onLog("command", "> git add -A && git commit");
        await gitCommit(projectPath, msg);
        onLog("success", "提交完成");

        if (skipPushConfirm) {
          onLog("command", "> git push");
          await gitPush(projectPath);
          onLog("success", "推送完成");
          onRefresh();
          onClose();
        } else {
          setPhase("pushConfirm");
        }
      } else if (result.hasConflicts) {
        onLog("warning", `合并存在冲突: ${result.conflictFiles.length} 个文件`);
        setConflictFiles(result.conflictFiles);
        setPhase("conflict");
      } else {
        onLog("error", result.output || "合并失败");
      }
    } catch (e) {
      onLog("error", `合并失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleResolvedContinue = async () => {
    setBusy(true);
    try {
      onLog("command", "> git add -A && git commit (冲突已解决)");
      await gitCommit(projectPath, commitMessage);
      onLog("success", "提交完成");

      if (skipPushConfirm) {
        onLog("command", "> git push");
        await gitPush(projectPath);
        onLog("success", "推送完成");
        onRefresh();
        onClose();
      } else {
        setPhase("pushConfirm");
      }
    } catch (e) {
      onLog("error", `提交失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const handlePush = async () => {
    setBusy(true);
    try {
      onLog("command", "> git push");
      await gitPush(projectPath);
      onLog("success", "推送完成");
      onRefresh();
      onClose();
    } catch (e) {
      onLog("error", `推送失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSkipPush = () => {
    onLog("info", "已跳过推送，提交保留在本地");
    onRefresh();
    onClose();
  };

  const handleAbort = async () => {
    try {
      onLog("command", "> git merge --abort");
      await gitAbortMerge(projectPath);
      onLog("info", "已放弃合并");
      onRefresh();
      onClose();
    } catch (e) {
      onLog("error", `放弃合并失败: ${e}`);
    }
  };

  const handleClose = () => {
    if (phase === "conflict") {
      handleAbort();
    } else if (phase === "pushConfirm") {
      handleSkipPush();
    } else {
      onClose();
    }
  };

  const title = phase === "conflict" ? "合并冲突"
    : phase === "pushConfirm" ? "推送确认"
    : "合并分支";

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>
        <div className="modal-body">
          {phase === "pushConfirm" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <svg viewBox="0 0 24 24" width="48" height="48" style={{ margin: "0 auto 16px", display: "block" }}>
                <circle cx="12" cy="12" r="11" fill="none" stroke="var(--success)" strokeWidth="2" />
                <path d="M7 12l3 3 7-7" fill="none" stroke="var(--success)" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>合并并提交成功</p>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>是否推送到远端仓库？</p>
            </div>
          )}

          {phase === "conflict" && (
            <>
              <p style={{ fontSize: 13, color: "var(--warning)", marginBottom: 12 }}>
                以下文件存在冲突，请手动解决后继续：
              </p>
              <ul className="conflict-list">
                {conflictFiles.map((f) => (
                  <li key={f} className="conflict-file">
                    <span className="conflict-icon">⚠</span>
                    {f}
                  </li>
                ))}
              </ul>
            </>
          )}

          {phase === "select" && (
            <>
              <div className="merge-sources">
                {availableSources.map((source) => {
                  const isDisabled = !validCombinations.includes(source) && validCombinations.length > 0;
                  return (
                    <div
                      key={source}
                      className={`merge-source-option ${selectedSource === source ? "selected" : ""} ${isDisabled ? "disabled" : ""}`}
                      onClick={() => !isDisabled && setSelectedSource(source)}
                    >
                      <div className="merge-source-radio" />
                      <span className="merge-source-label">{source}</span>
                    </div>
                  );
                })}
              </div>

              {selectedSource && !template && (
                <div className="merge-error">
                  当前分支 <strong>{currentBranch}</strong> 不支持合并 <strong>{selectedSource}</strong>
                  {validCombinations.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      支持的合并源：{validCombinations.join(", ")}
                    </div>
                  )}
                </div>
              )}

              {selectedSource && template && (
                <div className="merge-preview">
                  <div className="merge-preview-label">Commit Message 预览：</div>
                  <textarea
                    className="input"
                    value={generatedMessage}
                    readOnly
                    rows={6}
                  />
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          {phase === "pushConfirm" && (
            <>
              <button className="btn btn-secondary" onClick={handleSkipPush}>
                暂不推送
              </button>
              <button className="btn btn-primary" onClick={handlePush} disabled={busy}>
                {busy ? "推送中..." : "推送到远端"}
              </button>
            </>
          )}
          {phase === "conflict" && (
            <>
              <button className="btn btn-danger" onClick={handleAbort}>
                放弃合并
              </button>
              <button className="btn btn-primary" onClick={handleResolvedContinue} disabled={busy}>
                {busy ? "提交中..." : "已解决冲突，继续"}
              </button>
            </>
          )}
          {phase === "select" && (
            <>
              <button className="btn btn-secondary" onClick={onClose}>取消</button>
              <button
                className="btn btn-primary"
                onClick={handleMerge}
                disabled={!selectedSource || !template || busy}
              >
                {busy ? "合并中..." : "开始合并"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
