import type { QueueItem } from "../types";

interface Props {
  queue: QueueItem[];
  onCancel: (id: number) => void;
  onClear: () => void;
}

export default function QueuePanel({ queue, onCancel, onClear }: Props) {
  return (
    <div className="queue-panel">
      <div className="queue-header">
        <span className="queue-title">队列 ({queue.length})</span>
        <button className="queue-clear-btn" onClick={onClear}>清空</button>
      </div>
      <ul className="queue-list">
        {queue.map((item) => (
          <li key={item.id} className="queue-item">
            <div className="queue-item-info">
              <span className="queue-item-label">{item.label}</span>
              <span className="queue-item-branch">{item.targetBranch}</span>
            </div>
            <button
              className="queue-item-cancel"
              onClick={() => onCancel(item.id)}
              title="取消"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
