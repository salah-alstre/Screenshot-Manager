import { create } from "zustand";

interface SelectionState {
  /** Identifies the list the selection belongs to; changing it clears the selection. */
  listKey: string;
  ids: Set<number>;
  anchor: number | null;
  focusIndex: number;
  reset: (listKey: string) => void;
  setIds: (ids: Iterable<number>) => void;
  toggle: (id: number) => void;
  clear: () => void;
  setAnchor: (index: number | null) => void;
  setFocusIndex: (index: number) => void;
}

export const useSelection = create<SelectionState>((set) => ({
  listKey: "",
  ids: new Set(),
  anchor: null,
  focusIndex: -1,
  reset: (listKey) => set({ listKey, ids: new Set(), anchor: null, focusIndex: -1 }),
  setIds: (ids) => set({ ids: new Set(ids) }),
  toggle: (id) =>
    set((s) => {
      const next = new Set(s.ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ids: next };
    }),
  clear: () => set({ ids: new Set(), anchor: null }),
  setAnchor: (anchor) => set({ anchor }),
  setFocusIndex: (focusIndex) => set({ focusIndex }),
}));
