import { motion } from "framer-motion";
import type { IslandActivity } from "./islandModel";

export function IslandPill({ activity, reduced }: { activity: IslandActivity; reduced: boolean }) {
  const spring = reduced
    ? { duration: 0.12 }
    : { type: "spring" as const, stiffness: 420, damping: 32 };
  return (
    <motion.span
      layout
      className={`island-pill kind-${activity.kind}`}
      initial={{ opacity: 0, scale: 0.8, y: reduced ? 0 : -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: reduced ? 0 : -4 }}
      transition={spring}
      title={activity.detail ?? activity.label}
    >
      {activity.accent ? (
        <i className="island-swatch" style={{ background: activity.accent }} aria-hidden="true" />
      ) : null}
      <b className="island-pill-label">{activity.label}</b>
      {activity.detail ? <span className="island-pill-detail">{activity.detail}</span> : null}
    </motion.span>
  );
}
