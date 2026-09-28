import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Roux } from "./Pebble";
import { pollAgents, type AgentStatus } from "../native";
import type { DockLayout, Mood } from "../types";

export function NotchDock({
  open,
  layout,
  mood,
  live,
  task,
  cueColor,
  onToggle,
  onLayout,
  onHover,
  children,
}: {
  open: boolean;
  layout: DockLayout;
  mood: Mood;
  live: string | null;
  task: string | null;
  cueColor?: string;
  onToggle: () => void;
  onLayout: () => void;
  onHover?: () => void;
  children?: ReactNode;
}) {
  const [agents, setAgents] = useState<AgentStatus[]>([]);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      void pollAgents().then((list) => {
        if (alive) setAgents(list);
      });
    };
    tick();
    const id = window.setInterval(tick, 4000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div
      className={`dock ${open ? "is-open" : "is-idle"}`}
      data-open={open}
      data-layout={layout}
      onMouseEnter={onHover}
    >
      <div className="dock-chrome">
        <div className="dock-wing is-left" onClick={() => onToggle()}>
          <Roux mood={mood} size={20} compact cueColor={cueColor} />
          {live ? (
            <span className="dock-timer" title={task ?? live}>
              {live}
            </span>
          ) : null}
        </div>
        <div className="dock-camera" onClick={() => onToggle()} aria-hidden="true" />
        <div className="dock-wing is-right">
          <div className="dock-rings" aria-label="Code agents">
            {agents.map((a) => (
              <span
                key={a.id}
                className={`ring ${a.running ? "is-live" : ""}`}
                style={ringStyle(a)}
                title={`${a.label} ${a.running ? "busy" : a.detail || "idle"}`}
              />
            ))}
          </div>
          {open ? (
            <>
              <button type="button" className="dock-ico" title="Flip layout" onClick={onLayout}>
                <LayoutGlyph layout={layout} />
              </button>
              <button type="button" className="dock-ico" title="Close · ⌥-click to quit" onClick={() => onToggle()}>
                <CloseGlyph />
              </button>
            </>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="dock-stage">
          <i className="dock-inv is-bl" aria-hidden="true" />
          <i className="dock-inv is-br" aria-hidden="true" />
          {children}
        </div>
      ) : null}
    </div>
  );
}

function LayoutGlyph({ layout }: { layout: DockLayout }) {
  return layout === "vertical" ? (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="3" y="2" width="10" height="12" rx="2" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="1.5" y="4" width="13" height="8" rx="2" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function ringStyle(a: AgentStatus): CSSProperties {
  const pct = Math.max(0, Math.min(100, a.percent ?? 0));
  const color = a.color || "#7c7cff";
  return {
    background: `conic-gradient(${color} ${pct}%, #2c2c2e 0)`,
    ["--ring-color" as string]: color,
  };
}
