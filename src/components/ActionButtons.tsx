import { useState, useRef, useCallback, useEffect } from "react";

interface Props {
  onAction: (action: string) => void;
  disabled: boolean;
  loading: boolean;
  loadingAction: string | null;
  order: string[];
  onOrderChange: (order: string[]) => void;
}

interface ActionDef {
  id: string;
  label: string;
  danger?: boolean;
}

const actions: ActionDef[] = [
  { id: "fetch", label: "fetch" },
  { id: "fetch-rebase", label: "Fetch & Rebase" },
  { id: "switch", label: "switch" },
  { id: "merge", label: "merge" },
  { id: "push", label: "push" },
  { id: "reset", label: "reset", danger: true },
  { id: "force-pull", label: "pull" },
  { id: "log", label: "show log" },
  { id: "repair", label: "repair", danger: true },
];

export const DEFAULT_ACTION_ORDER = actions.map((a) => a.id);

const actionMap = new Map(actions.map((a) => [a.id, a]));

export default function ActionButtons({
  onAction,
  disabled,
  loadingAction,
  order,
  onOrderChange,
}: Props) {
  const [sortMode, setSortMode] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rectsRef = useRef<DOMRect[]>([]);
  const overIdxRef = useRef<number | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;

  const sortedActions = order
    .map((id) => actionMap.get(id))
    .filter((a): a is ActionDef => !!a);

  const getTargetIdx = useCallback((clientY: number) => {
    const rects = rectsRef.current;
    for (let i = 0; i < rects.length; i++) {
      if (clientY < rects[i].top + rects[i].height / 2) return i;
    }
    return rects.length - 1;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, idx: number) => {
      if (!sortMode || dragIdx !== null) return;
      e.preventDefault();
      if (!containerRef.current) return;

      const buttons =
        containerRef.current.querySelectorAll<HTMLElement>(".action-btn");
      rectsRef.current = Array.from(buttons).map((b) =>
        b.getBoundingClientRect()
      );

      overIdxRef.current = idx;
      setDragIdx(idx);
      setOverIdx(idx);
    },
    [sortMode, dragIdx]
  );

  useEffect(() => {
    if (dragIdx === null) return;
    const fromIdx = dragIdx;

    const onMove = (e: PointerEvent) => {
      const target = getTargetIdx(e.clientY);
      overIdxRef.current = target;
      setOverIdx(target);
    };

    const onUp = () => {
      const to = overIdxRef.current;
      if (to !== null && fromIdx !== to) {
        const cur = [...orderRef.current];
        const [moved] = cur.splice(fromIdx, 1);
        cur.splice(to, 0, moved);
        onOrderChange(cur);
      }
      overIdxRef.current = null;
      setDragIdx(null);
      setOverIdx(null);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [dragIdx, getTargetIdx, onOrderChange]);

  return (
    <div className="sidebar">
      <div className="sidebar-actions" ref={containerRef}>
        {sortedActions.map((action, idx) => (
          <button
            key={action.id}
            className={`action-btn${action.danger ? " danger" : ""}${
              dragIdx === idx ? " dragging" : ""
            }${
              overIdx === idx && dragIdx !== null && dragIdx !== idx
                ? " drag-over"
                : ""
            }`}
            onClick={() => !sortMode && onAction(action.id)}
            disabled={disabled && !sortMode}
            onPointerDown={(e) => handlePointerDown(e, idx)}
            style={
              sortMode
                ? { touchAction: "none", userSelect: "none", cursor: "grab" }
                : undefined
            }
          >
            {sortMode && <span className="drag-handle">⋮⋮</span>}
            {loadingAction === action.id ? <div className="spinner" /> : null}
            <span className="action-label">{action.label}</span>
          </button>
        ))}
      </div>
      <div className="sidebar-footer">
        <div className="sort-toggle" onClick={() => setSortMode(!sortMode)}>
          <div
            className={`sort-toggle-indicator${sortMode ? " active" : ""}`}
          />
          <span>排序</span>
        </div>
      </div>
    </div>
  );
}
