import { useMemo } from "react";
import { create } from "zustand";
import type { TaskInfo } from "@/types/models";

interface TaskState {
  tasks: Record<number, TaskInfo>;
  upsert: (t: TaskInfo) => void;
  remove: (id: number) => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: {},
  upsert: (t) => set((s) => ({ tasks: { ...s.tasks, [t.id]: t } })),
  remove: (id) =>
    set((s) => {
      const next = { ...s.tasks };
      delete next[id];
      return { tasks: next };
    }),
}));

/** Applies a progress event; finished tasks linger briefly so the UI can show completion. */
export function applyTaskEvent(t: TaskInfo) {
  const store = useTaskStore.getState();
  store.upsert(t);
  if (t.state !== "running") setTimeout(() => useTaskStore.getState().remove(t.id), 2500);
}

export function useTasks() {
  const tasks = useTaskStore((s) => s.tasks);
  return useMemo(() => {
    const all = Object.values(tasks).sort((a, b) => a.id - b.id);
    return { all, running: all.filter((t) => t.state === "running") };
  }, [tasks]);
}
