import { useEffect, useRef } from "react";
import { listen, type EventCallback } from "@tauri-apps/api/event";

/** Subscribes to a backend event for the lifetime of the component. */
export function useTauriEvent<T>(name: string, handler: EventCallback<T>) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<T>(name, (e) => ref.current(e)).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [name]);
}
