interface Props {
  files: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function UntrackedFilesDialog({ files, onConfirm, onCancel }: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2>未跟踪文件冲突</h2>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <p className="untracked-description">
            以下未跟踪文件与目标分支冲突，需要移除才能继续操作：
          </p>
          <ul className="untracked-file-list">
            {files.map((file) => (
              <li key={file} className="untracked-file-item">
                {file}
              </li>
            ))}
          </ul>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            放弃操作
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            移除并继续
          </button>
        </div>
      </div>
    </div>
  );
}
