interface Props {
  onAction: (action: string) => void;
  disabled: boolean;
  loading: boolean;
  loadingAction: string | null;
}

interface ActionDef {
  id: string;
  label: string;
  icon: string;
  danger?: boolean;
}

const actions: ActionDef[] = [
  { id: "fetch", label: "拉取远端", icon: "↓" },
  { id: "switch", label: "切换分支", icon: "⑂" },
  { id: "merge", label: "合并", icon: "⤞" },
  { id: "push", label: "推送", icon: "↑" },
  { id: "reset", label: "重置分支", icon: "↺", danger: true },
  { id: "force-pull", label: "更新分支", icon: "⟳" },
  { id: "log", label: "显示日志", icon: "☰" },
  { id: "repair", label: "修复仓库", icon: "🔧", danger: true },
];

export default function ActionButtons({ onAction, disabled, loadingAction }: Props) {
  return (
    <div className="actions">
      {actions.map((action) => (
        <button
          key={action.id}
          className={`action-btn ${action.danger ? "danger" : ""}`}
          onClick={() => onAction(action.id)}
          disabled={disabled}
          title={action.label}
        >
          {loadingAction === action.id ? (
            <div className="spinner" />
          ) : (
            <span className="action-icon">{action.icon}</span>
          )}
          <span className="action-label">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
