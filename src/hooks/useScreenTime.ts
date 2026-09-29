import { useEffect, useState } from "react";
import { isNativeApp, screenTimeToday } from "../native";

export function useScreenTime() {
  const [ms, setMs] = useState<number | null>(isNativeApp() ? null : null);
  useEffect(() => {
    if (!isNativeApp()) return;
    let alive = true;
    const tick = () => {
      void screenTimeToday().then((value) => {
        if (alive) setMs(value);
      });
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  return ms;
}
