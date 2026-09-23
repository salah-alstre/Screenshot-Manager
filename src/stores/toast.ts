import { create } from "zustand";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
  action?: { label: string; run: () => void };
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id" | "duration"> & { duration?: number }) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    const toast: Toast = { duration: t.kind === "error" ? 6000 : 3500, ...t, id };
    set((s) => ({ toasts: [...s.toasts.slice(-3), toast] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (message: string, action?: Toast["action"]) => useToasts.getState().push({ kind: "success", message, action }),
  error: (message: string) => useToasts.getState().push({ kind: "error", message }),
  info: (message: string, action?: Toast["action"]) => useToasts.getState().push({ kind: "info", message, action }),
};
