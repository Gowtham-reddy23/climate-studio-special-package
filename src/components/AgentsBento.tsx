import { useEffect, useState } from "react";
import { pollAgents, type AgentStatus } from "../native";
import claudeIcon from "../assets/agents/claude.png";
import cursorIcon from "../assets/agents/cursor.png";
import codexIcon from "../assets/agents/codex.png";

const AGENT_ICONS: Record<string, string> = {
  claude: claudeIcon,
  cursor: cursorIcon,
  codex: codexIcon,
};

export function useAgents() {
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
  return agents;
}

export function statusLine(a: AgentStatus) {
  const n = a.threads ?? 0;
  const thread = n === 1 ? "1 thread" : n > 1 ? `${n} threads` : "";
  if (a.running) return thread ? `busy · ${thread}` : "busy";
  if (thread) return thread;
  return a.detail || "idle";
}

export function AgentRing({ agent, size = 36 }: { agent: AgentStatus; size?: number }) {
  const pct = Math.max(0, Math.min(100, agent.percent ?? 0));
  const color = agent.color || "#7c7cff";
  const icon = AGENT_ICONS[agent.id];
  return (
    <span
      className={`ring has-mark ${agent.running ? "is-live" : ""}`}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${color} ${pct}%, #3a3a3c 0)`,
        ["--ring-color" as string]: color,
      }}
      title={`${agent.label} ${statusLine(agent)}`}
    >
      {icon ? <img src={icon} alt="" /> : null}
    </span>
  );
}

export function AgentsBento() {
  const agents = useAgents();
  return (
    <div className="bento agents">
      {agents.map((a) => (
        <article key={a.id} className={`bento-card agent ${a.running ? "is-busy" : ""}`}>
          <AgentRing agent={a} />
          <div className="agent-copy">
            <strong>{a.label}</strong>
            <em>{statusLine(a)}</em>
          </div>
          <b>{a.percent != null ? `${Math.round(a.percent)}%` : "—"}</b>
        </article>
      ))}
    </div>
  );
}

export function AgentsStrip() {
  const agents = useAgents();
  if (!agents.length) return null;
  return (
    <div className="usage-strip" aria-label="Agent usage">
      {agents.map((a) => (
        <div key={a.id} className={`usage-cell ${a.running ? "is-busy" : ""}`}>
          <AgentRing agent={a} size={22} />
          <span>
            <strong>{a.label}</strong>
            <em>{a.running ? "busy" : a.percent != null ? `${Math.round(a.percent)}%` : "idle"}</em>
          </span>
        </div>
      ))}
    </div>
  );
}
