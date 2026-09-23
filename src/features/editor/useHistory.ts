import { useCallback, useState } from "react";

const LIMIT = 60;

/** Linear undo/redo history of immutable snapshots. */
export function useHistory<T>(initial: T | null) {
  const [state, setState] = useState<{ stack: T[]; index: number; saved: number }>(() => ({
    stack: initial ? [initial] : [],
    index: initial ? 0 : -1,
    saved: 0,
  }));

  const reset = useCallback((value: T) => setState({ stack: [value], index: 0, saved: 0 }), []);

  const push = useCallback((value: T) => {
    setState((s) => {
      const stack = [...s.stack.slice(0, s.index + 1), value];
      const overflow = Math.max(0, stack.length - LIMIT);
      return { stack: stack.slice(overflow), index: stack.length - 1 - overflow, saved: s.saved - overflow };
    });
  }, []);

  const undo = useCallback(() => setState((s) => (s.index > 0 ? { ...s, index: s.index - 1 } : s)), []);
  const redo = useCallback(() => setState((s) => (s.index < s.stack.length - 1 ? { ...s, index: s.index + 1 } : s)), []);
  const markSaved = useCallback(() => setState((s) => ({ ...s, saved: s.index })), []);

  return {
    current: state.index >= 0 ? state.stack[state.index]! : null,
    canUndo: state.index > 0,
    canRedo: state.index < state.stack.length - 1,
    dirty: state.index !== state.saved,
    first: state.stack[0] ?? null,
    push,
    undo,
    redo,
    reset,
    markSaved,
  };
}
