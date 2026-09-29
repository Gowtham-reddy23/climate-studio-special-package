export type ActivityKind =
  | "focus-timer"
  | "clip-landed"
  | "recording"
  | "secret-blocked"
  | "agent-alert"
  | "task-remind"
  | "water-sip";

export interface IslandActivity {
  id: string;
  kind: ActivityKind;
  priority: number;
  persistent: boolean;
  label: string;
  detail?: string;
  accent?: string;
  expiresAt?: number;
}

export interface IslandView {
  persistent: IslandActivity | null;
  transient: IslandActivity | null;
  hot: boolean;
}

export interface IslandInputs {
  focus: {
    running: boolean;
    mode: "pomodoro" | "deep" | "watch";
    remainingMs: number;
    taskTitle: string | null;
  };
  recording: { active: boolean; elapsedMs: number; partial: string };
  latestClip: { id: string; kind: string; preview: string; createdAt: number; accent?: string } | null;
  lastBlockedAt: number | null;
  agentAlert: { id: string; label: string; percent: number } | null;
  reminder?: { id: string; title: string; at: number } | null;
  water?: { due: boolean; count: number; goal: number } | null;
}

export const PRIORITY: Record<ActivityKind, number> = {
  "secret-blocked": 50,
  recording: 40,
  "focus-timer": 30,
  "agent-alert": 20,
  "task-remind": 35,
  "water-sip": 32,
  "clip-landed": 10,
};

const CLIP_TTL = 2500;
const SECRET_TTL = 4000;
const AGENT_TTL = 6000;

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export function buildActivities(input: IslandInputs, now: number): IslandActivity[] {
  const acts: IslandActivity[] = [];

  if (input.recording.active) {
    acts.push({
      id: "recording",
      kind: "recording",
      priority: PRIORITY.recording,
      persistent: true,
      label: fmt(input.recording.elapsedMs),
      detail: input.recording.partial || "Listening",
    });
  }

  if (input.focus.running) {
    acts.push({
      id: "focus-timer",
      kind: "focus-timer",
      priority: PRIORITY["focus-timer"],
      persistent: true,
      label: fmt(input.focus.remainingMs),
      detail: input.focus.taskTitle || undefined,
    });
  }

  if (input.lastBlockedAt !== null) {
    acts.push({
      id: "secret-blocked",
      kind: "secret-blocked",
      priority: PRIORITY["secret-blocked"],
      persistent: false,
      label: "held",
      detail: "Secret not saved",
      expiresAt: input.lastBlockedAt + SECRET_TTL,
    });
  }

  if (input.reminder && input.reminder.at <= now && now < input.reminder.at + 8 * 60 * 1000) {
    acts.push({
      id: `remind-${input.reminder.id}`,
      kind: "task-remind",
      priority: PRIORITY["task-remind"],
      persistent: false,
      label: "Remind",
      detail: input.reminder.title,
      expiresAt: input.reminder.at + 8 * 60 * 1000,
    });
  }

  if (input.water?.due) {
    acts.push({
      id: "water-sip",
      kind: "water-sip",
      priority: PRIORITY["water-sip"],
      persistent: false,
      label: "Sip",
      detail: `${input.water.count}/${input.water.goal}`,
    });
  }

  if (input.agentAlert) {
    acts.push({
      id: `agent-${input.agentAlert.id}`,
      kind: "agent-alert",
      priority: PRIORITY["agent-alert"],
      persistent: false,
      label: `${Math.round(input.agentAlert.percent)}%`,
      detail: input.agentAlert.label,
      expiresAt: now + AGENT_TTL,
    });
  }

  if (input.latestClip) {
    acts.push({
      id: `clip-${input.latestClip.id}`,
      kind: "clip-landed",
      priority: PRIORITY["clip-landed"],
      persistent: false,
      label: input.latestClip.kind,
      detail: input.latestClip.preview,
      accent: input.latestClip.accent,
      expiresAt: input.latestClip.createdAt + CLIP_TTL,
    });
  }

  return acts;
}

export function selectIsland(activities: IslandActivity[], now: number): IslandView {
  const live = activities.filter((a) => a.expiresAt === undefined || a.expiresAt > now);
  const byPriority = (a: IslandActivity, b: IslandActivity) => b.priority - a.priority;
  const persistent = live.filter((a) => a.persistent).sort(byPriority)[0] ?? null;
  const transient = live.filter((a) => !a.persistent).sort(byPriority)[0] ?? null;
  return { persistent, transient, hot: Boolean(persistent || transient) };
}
