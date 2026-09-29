import { useEffect, useState } from "react";
import { isNativeApp, screenTimeToday } from "../native";

export function useScreenTime() {
  const [screen, setScreen] = useState<{ allowed: boolean; ms: number | null }>({ allowed: false, ms: null });
  useEffect(() => {
    if (!isNativeApp()) return;
    let alive = true;
    const tick = () => {
      void screenTimeToday().then((value) => {
        if (!alive) return;
        setScreen({ allowed: value.allowed, ms: value.milliseconds });
      });
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  return screen;
}
