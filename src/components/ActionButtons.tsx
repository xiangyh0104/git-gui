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
  { id: "fetch", label: "Fetch All", icon: "↓" },
  { id: "fetch-rebase", label: "Fetch & Rebase", icon: "⇣" },
  { id: "switch", label: "Switch Branch", icon: "⑂" },
  { id: "merge", label: "Merge Branch", icon: "⤞" },
  { id: "push", label: "Push", icon: "↑" },
  { id: "reset", label: "Reset Branch", icon: "↺", danger: true },
  { id: "force-pull", label: "Force Pull", icon: "⟳" },
  { id: "log", label: "Show Log", icon: "☰" },
  { id: "repair", label: "Repair Repository", icon: "🔧", danger: true },
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
