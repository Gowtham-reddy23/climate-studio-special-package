import { type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Roux } from "./Pebble";
import { IslandPill } from "../island/IslandPill";
import type { IslandView } from "../island/islandModel";
import { AgentRing, useAgents } from "./AgentsBento";
import type { Mood } from "../types";

export function NotchDock({
  open,
  mood,
  view,
  cueColor,
  onToggle,
  onHover,
  showRings,
  timer,
  waterDue,
  listening,
  onMic,
  children,
}: {
  open: boolean;
  mood: Mood;
  view: IslandView;
  cueColor?: string;
  onToggle: () => void;
  onHover?: () => void;
  showRings?: boolean;
  timer?: string | null;
  waterDue?: boolean;
  listening?: boolean;
  onMic?: () => void;
  children?: ReactNode;
}) {
  const agents = useAgents();
  const reduced = useReducedMotion();

  return (
    <motion.div
      layout
      transition={reduced ? { duration: 0.12 } : { type: "spring", stiffness: 380, damping: 30 }}
      className={`dock ${open ? "is-open" : "is-idle"}`}
      data-open={open}
      data-layout="horizontal"
      onMouseEnter={onHover}
    >
      {open ? (
        <div className="dock-chrome">
          <div className="notch-bar" onClick={() => onToggle()}>
            <Roux mood={mood} size={42} compact cueColor={cueColor} />
            <span className="dock-pills">
              <AnimatePresence mode="popLayout">
                {view.persistent ? (
                  <IslandPill key={view.persistent.id} activity={view.persistent} reduced={!!reduced} />
                ) : null}
                {view.transient ? (
                  <IslandPill key={view.transient.id} activity={view.transient} reduced={!!reduced} />
                ) : null}
              </AnimatePresence>
            </span>
            {showRings === false ? null : (
              <span className="dock-rings" aria-label="Code agents">
                {agents.map((a) => (
                  <AgentRing key={a.id} agent={a} size={18} />
                ))}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="dock-chrome">
          <div className="dock-wing is-left" />
          <div className="dock-camera" onClick={() => onToggle()} aria-hidden="true" />
          <div className="dock-wing is-right">
            <div className={`notch-side ${timer ? "has-time" : ""} ${waterDue ? "has-sip" : ""}`}>
              {waterDue ? (
                <button
                  type="button"
                  className="notch-sip"
                  title="Time for a glass of water"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                  }}
                >
                  <SipGlyph />
                </button>
              ) : null}
              <button
                type="button"
                className={`notch-mic ${listening ? "is-on" : ""}`}
                title={listening ? "Stop voice note" : "Voice note"}
                onClick={(e) => {
                  e.stopPropagation();
                  onMic?.();
                }}
              >
                <MicGlyph />
              </button>
              {timer ? <span className="notch-time">{timer}</span> : null}
            </div>
          </div>
        </div>
      )}

      {open ? <div className="dock-stage">{children}</div> : null}
    </motion.div>
  );
}

function SipGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M8 2.2c1.8 2.2 3.2 3.8 3.2 5.6a3.2 3.2 0 0 1-6.4 0C4.8 6 6.2 4.4 8 2.2z" />
    </svg>
  );
}

function MicGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <rect x="6" y="1.6" width="4" height="7.2" rx="2" />
      <path d="M4.2 7.4a3.8 3.8 0 0 0 7.6 0M8 11.2V14" />
    </svg>
  );
}

