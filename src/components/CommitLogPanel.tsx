import { useState, useEffect, useCallback } from "react";
import type { CommitEntry, LogEntry } from "../types";
import { gitLog } from "../lib/commands";

interface Props {
  projectPath: string;
  currentBranch: string;
  logCount: number;
  onClose: () => void;
  onLog: (type: LogEntry["type"], message: string) => void;
}

export default function CommitLogPanel({
  projectPath,
  currentBranch,
  logCount,
  onClose,
  onLog,
}: Props) {
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentCount, setCurrentCount] = useState(logCount);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        onLog("command", `> git log -n ${logCount}`);
        const entries = await gitLog(projectPath, logCount);
        setCommits(entries);
        setHasMore(entries.length >= logCount);
        onLog("success", `获取到 ${entries.length} 条提交记录`);
      } catch (e) {
        onLog("error", `获取日志失败: ${e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectPath, logCount, onLog]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    const nextCount = currentCount + 30;
    try {
      const entries = await gitLog(projectPath, nextCount);
      setCommits(entries);
      setHasMore(entries.length >= nextCount);
      setCurrentCount(nextCount);
    } catch (e) {
      onLog("error", `加载更多失败: ${e}`);
    } finally {
      setLoadingMore(false);
    }
  }, [projectPath, currentCount, onLog]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640, maxHeight: "85vh" }}
      >
        <div className="modal-header">
          <h2>提交记录 — {currentBranch}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-indicator">
              <div className="spinner" />
              加载中...
            </div>
          ) : commits.length === 0 ? (
            <div className="loading-indicator">暂无提交记录</div>
          ) : (
            <div className="commit-list">
              {commits.map((c, i) => (
                <div key={`${c.hash}-${i}`} className="commit-item">
                  <span className="commit-hash">{c.hash}</span>
                  <span className="commit-subject">{c.subject}</span>
                  <span className="commit-meta">
                    {c.author} · {c.dateRelative}
                  </span>
                </div>
              ))}
              {hasMore && (
                <div className="load-more-row">
                  <button
                    className="btn btn-secondary load-more-btn"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "加载中..." : `显示更多（已加载 ${commits.length} 条）`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
