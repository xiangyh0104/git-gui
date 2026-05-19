import { useState, useEffect, useMemo } from "react";

const ACTION_LABELS: Record<string, string> = {
  fetch: "拉取远端",
  switch: "切换分支",
  merge: "合并分支",
  reset: "重置分支",
  "force-pull": "更新分支",
};

const P = 3; // pixel size

// 1=body, 2=eye
const BODY = [
  [0,0,0,0,0,1,1,1,1,1],
  [0,0,0,0,1,1,2,1,1,1],
  [0,0,0,0,1,1,1,1,1,1],
  [0,0,0,0,1,1,0,0,0,0],
  [0,0,0,1,1,1,1,1,0,0],
  [1,0,1,1,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,0,0,0],
  [0,0,1,1,1,1,1,0,0,0],
  [0,0,0,1,1,1,0,0,0,0],
];

const LEGS_1 = [
  [0,0,0,1,0,0,1,0,0,0],
  [0,0,0,1,0,0,0,1,0,0],
  [0,0,1,1,0,0,0,0,0,0],
];

const LEGS_2 = [
  [0,0,0,0,1,0,1,0,0,0],
  [0,0,0,0,1,0,0,1,0,0],
  [0,0,0,0,0,0,1,1,0,0],
];

function buildRects(grid: number[][], color: string, eyeColor: string) {
  const rects: JSX.Element[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] === 1) {
        rects.push(
          <rect key={`${r}-${c}`} x={c * P} y={r * P} width={P} height={P} fill={color} />
        );
      } else if (grid[r][c] === 2) {
        rects.push(
          <rect key={`${r}-${c}`} x={c * P} y={r * P} width={P} height={P} fill={eyeColor} />
        );
      }
    }
  }
  return rects;
}

interface Props {
  loadingAction: string | null;
  lastResult: "success" | "error" | null;
}

export default function StatusAnimation({ loadingAction, lastResult }: Props) {
  const [visible, setVisible] = useState(true);
  const [showResult, setShowResult] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    const onFocus = () => setVisible(true);
    const onBlur = () => setVisible(false);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    if (lastResult) {
      setShowResult(lastResult);
      const t = setTimeout(() => setShowResult(null), 3000);
      return () => clearTimeout(t);
    }
  }, [lastResult]);

  useEffect(() => {
    if (loadingAction) setShowResult(null);
  }, [loadingAction]);

  const isRunning = !!loadingAction;
  const paused = !visible;
  const bodyColor = "#555";
  const eyeColor = "#fff";

  const frame1Rects = useMemo(
    () => buildRects([...BODY, ...LEGS_1], bodyColor, eyeColor),
    []
  );
  const frame2Rects = useMemo(
    () => buildRects([...BODY, ...LEGS_2], bodyColor, eyeColor),
    []
  );

  const w = 10 * P;
  const h = 12 * P;

  if (!isRunning && !showResult) {
    return <div className="status-bar status-collapsed" />;
  }

  if (showResult && !isRunning) {
    return (
      <div className="status-bar status-result">
        {showResult === "success" ? (
          <>
            <svg className="result-icon" viewBox="0 0 24 24" width="20" height="20">
              <circle cx="12" cy="12" r="11" fill="none" stroke="var(--success)" strokeWidth="2" />
              <path d="M7 12l3 3 7-7" fill="none" stroke="var(--success)" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="status-label" style={{ color: "var(--success)" }}>操作完成</span>
          </>
        ) : (
          <>
            <svg className="result-icon" viewBox="0 0 24 24" width="20" height="20">
              <circle cx="12" cy="12" r="11" fill="none" stroke="var(--error)" strokeWidth="2" />
              <path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="var(--error)" strokeWidth="2.5"
                strokeLinecap="round" />
            </svg>
            <span className="status-label" style={{ color: "var(--error)" }}>操作失败</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`status-bar status-running ${paused ? "status-paused" : ""}`}>
      <div className="dino-scene">
        <div className="dino-ground" />
        <div className="dino-mover">
          <svg className="dino-frame dino-f1" width={w} height={h} viewBox={`0 0 ${w} ${h}`}
            style={{ imageRendering: "pixelated" }}>
            {frame1Rects}
          </svg>
          <svg className="dino-frame dino-f2" width={w} height={h} viewBox={`0 0 ${w} ${h}`}
            style={{ imageRendering: "pixelated" }}>
            {frame2Rects}
          </svg>
        </div>
      </div>
      <span className="status-label status-label-running">
        正在{ACTION_LABELS[loadingAction!] || loadingAction}...
      </span>
    </div>
  );
}
