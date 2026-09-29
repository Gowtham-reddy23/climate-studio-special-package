import { todayKey, waterIsDue } from "../lib";
import { useStore } from "../store";
import { buildActivities, selectIsland, type IslandView } from "./islandModel";

export function useIsland(args: {
  now: number;
  recording: boolean;
  elapsedMs: number;
  partial: string;
  agentAlert?: { id: string; label: string; percent: number } | null;
}): IslandView {
  const { state } = useStore();
  const latest = state.clips[0] ?? null;
  const focusTask = state.tasks.find((t) => t.id === state.focus.taskId)?.title ?? null;
  const due = state.tasks.find(
    (t) => !t.done && t.remindAt && t.remindAt <= args.now && args.now < t.remindAt + 8 * 60 * 1000,
  );

  let activities = buildActivities(
    {
      focus: {
        running: state.focus.running,
        mode: state.focus.mode,
        remainingMs: state.focus.remainingMs,
        taskTitle: focusTask,
      },
      recording: { active: args.recording, elapsedMs: args.elapsedMs, partial: args.partial },
      latestClip: latest
        ? {
            id: latest.id,
            kind: latest.kind,
            preview: latest.preview,
            createdAt: latest.createdAt,
            accent: latest.kind === "color" ? latest.content : undefined,
          }
        : null,
      lastBlockedAt: state.lastBlockedAt,
      agentAlert: args.agentAlert ?? null,
      reminder: due?.remindAt ? { id: due.id, title: due.title, at: due.remindAt } : null,
      water: state.water
        ? {
            due: waterIsDue(state.water, args.now),
            count: state.water.day === todayKey(new Date(args.now)) ? state.water.count : 0,
            goal: state.water.goal,
          }
        : null,
    },
    args.now,
  );
  if (!state.showTimer) activities = activities.filter((a) => a.kind !== "focus-timer");

  return selectIsland(activities, args.now);
}
