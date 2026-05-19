import { useEffect, useRef } from "react";
import type { LogEntry } from "../types";

interface Props {
  logs: LogEntry[];
  onClear: () => void;
}

export default function LogViewer({ logs, onClear }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="log-panel">
      <div className="log-header">
        <span className="log-title">操作日志</span>
        {logs.length > 0 && (
          <button className="log-clear-btn" onClick={onClear}>
            清除
          </button>
        )}
      </div>
      <div className="log-entries" ref={scrollRef}>
        {logs.length === 0 ? (
          <div className="log-empty">暂无操作记录</div>
        ) : (
          logs.map((entry) => (
            <div key={entry.id} className={`log-entry ${entry.type}`}>
              <span className="log-timestamp">{entry.timestamp}</span>
              <span className="log-dot" />
              <span className="log-message">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
