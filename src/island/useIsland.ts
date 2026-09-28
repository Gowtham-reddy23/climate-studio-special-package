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

  const activities = buildActivities(
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
    },
    args.now,
  );

  return selectIsland(activities, args.now);
}
