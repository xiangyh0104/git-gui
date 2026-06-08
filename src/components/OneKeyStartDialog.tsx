import { useState, useEffect, useCallback } from "react";
import type { BranchInfo, LogEntry } from "../types";
import { gitListRemoteBranches } from "../lib/commands";

interface Props {
  projectPath: string;
  onClose: () => void;
  onStart: (branch: string) => void;
  onLog: (type: LogEntry["type"], message: string) => void;
}

export default function OneKeyStartDialog({
  projectPath,
  onClose,
  onStart,
  onLog,
}: Props) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showingAll, setShowingAll] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await gitListRemoteBranches(projectPath, false);
        if (!cancelled) {
          setBranches(list);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          onLog("error", `获取分支列表失败: ${e}`);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [projectPath, onLog]);

  const handleShowAll = useCallback(async () => {
    setLoadingAll(true);
    try {
      const list = await gitListRemoteBranches(projectPath, true);
      setBranches(list);
      setShowingAll(true);
    } catch (e) {
      onLog("error", `获取全部分支失败: ${e}`);
    } finally {
      setLoadingAll(false);
    }
  }, [projectPath, onLog]);

  const filteredBranches = branches.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>一键启动 — 选择分支</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <input
            className="input"
            type="text"
            placeholder="搜索分支..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {loading ? (
            <div className="loading-indicator">
              <div className="spinner" />
              <span>正在获取分支列表...</span>
            </div>
          ) : (
            <>
              <ul className="branch-list">
                {filteredBranches.map((b) => (
                  <li
                    key={b.name}
                    className={`branch-item ${selected === b.name ? "selected" : ""}`}
                    onClick={() => setSelected(b.name)}
                    onDoubleClick={() => onStart(b.name)}
                  >
                    <div className="branch-item-info">
                      <div className="branch-item-name">{b.name}</div>
                      <div className="branch-item-meta">{b.lastCommitMessage}</div>
                    </div>
                    <span className="branch-item-time">{b.lastCommitRelative}</span>
                  </li>
                ))}
                {filteredBranches.length === 0 && (
                  <li className="branch-item">
                    <div className="branch-item-info">
                      <div className="branch-item-meta">无匹配分支</div>
                    </div>
                  </li>
                )}
              </ul>
              {!showingAll && (
                <div className="load-more-row">
                  <button
                    className="btn btn-secondary load-more-btn"
                    onClick={handleShowAll}
                    disabled={loadingAll}
                  >
                    {loadingAll
                      ? "加载中..."
                      : `显示全部分支（当前 ${branches.length} 个）`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn btn-primary"
            onClick={() => selected && onStart(selected)}
            disabled={!selected}
          >
            开始启动
          </button>
        </div>
      </div>
    </div>
  );
}
