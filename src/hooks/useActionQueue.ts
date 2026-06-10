import { useState, useCallback, useRef } from "react";
import type { QueueItem } from "../types";

let queueIdCounter = 0;

export default function useActionQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;

  const enqueue = useCallback(
    (
      action: string,
      label: string,
      targetBranch: string,
      projectPath: string,
      switchTarget?: string,
    ): QueueItem => {
      const item: QueueItem = {
        id: ++queueIdCounter,
        action,
        label,
        targetBranch,
        projectPath,
        switchTarget,
      };
      setQueue((prev) => [...prev, item]);
      return item;
    },
    [],
  );

  const cancelItem = useCallback((id: number) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const dequeue = useCallback((): QueueItem | null => {
    const current = queueRef.current;
    if (current.length === 0) return null;
    const [first, ...rest] = current;
    setQueue(rest);
    return first;
  }, []);

  return { queue, enqueue, cancelItem, clearQueue, dequeue };
}
