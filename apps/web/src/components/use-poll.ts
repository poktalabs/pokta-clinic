"use client";
import { useEffect, useRef } from "react";

// Calls `fn` now and every `ms` while the tab is visible; stops while hidden and catches up on return.
export function usePoll(fn: () => Promise<void> | void, ms: number) {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => void Promise.resolve(latest.current()).catch(() => undefined);
    const start = () => {
      if (timer || document.visibilityState !== "visible") return;
      tick();
      timer = setInterval(tick, ms);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [ms]);
}
