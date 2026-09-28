import type { Mood } from "../types";

export function Roux({
  mood,
  size = 96,
  cueColor,
  compact = false,
}: {
  mood: Mood;
  size?: number;
  cueColor?: string;
  compact?: boolean;
}) {
  return (
    <svg
      className={`mascot mood-${mood} ${compact ? "is-compact" : ""}`}
      viewBox={compact ? "40 18 64 64" : "0 0 140 140"}
      width={size}
      height={size}
      aria-hidden="true"
    >
      <ellipse className="m-shadow" cx="70" cy="128" rx="28" ry="6" />

      {mood === "listen" ? (
        <g className="m-rings">
          <circle cx="70" cy="62" r="46" />
          <circle cx="70" cy="62" r="56" />
          <circle cx="70" cy="62" r="66" />
        </g>
      ) : null}

      {mood === "copy" ? (
        <g className="m-spark">
          <path d="M108 28l2.2 6.4 6.4 2.2-6.4 2.2-2.2 6.4-2.2-6.4-6.4-2.2 6.4-2.2z" />
          <path d="M24 40l1.4 4 4 1.4-4 1.4-1.4 4-1.4-4-4-1.4 4-1.4z" />
          <path d="M118 72l1.6 4.6 4.6 1.6-4.6 1.6-1.6 4.6-1.6-4.6-4.6-1.6 4.6-1.6z" />
        </g>
      ) : null}

      {mood === "focus" ? (
        <g className="m-zzz">
          <text x="104" y="36">z</text>
          <text x="114" y="24">z</text>
          <text x="122" y="14">z</text>
        </g>
      ) : null}

      <g className="m-figure">
        <g className="m-tail">
          <path
            d="M42 96c-22 4-34-10-36-28-2-16 8-30 22-34"
            fill="none"
            stroke="#c24a1c"
            strokeWidth="16"
            strokeLinecap="round"
          />
          <path
            d="M42 96c-22 4-34-10-36-28-2-16 8-30 22-34"
            fill="none"
            stroke="#f3e2c8"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray="9 11"
          />
          <circle cx="30" cy="36" r="9" fill="#f7efe2" />
        </g>

        <ellipse className="m-torso" cx="74" cy="92" rx="26" ry="24" fill="#c24a1c" />
        <ellipse cx="76" cy="98" rx="16" ry="14" fill="#f3e2c8" />

        <g className="m-leg-l">
          <ellipse cx="62" cy="114" rx="8" ry="10" fill="#8a3214" />
        </g>
        <g className="m-leg-r">
          <ellipse cx="88" cy="114" rx="8" ry="10" fill="#8a3214" />
        </g>

        <g className="m-arm-l">
          <ellipse cx="52" cy="90" rx="8" ry="12" fill="#c24a1c" />
          <ellipse cx="50" cy="100" rx="7" ry="6" fill="#f3e2c8" />
        </g>
        <g className="m-arm-r">
          <ellipse cx="98" cy="88" rx="8" ry="12" fill="#c24a1c" />
          <ellipse cx="100" cy="98" rx="7" ry="6" fill="#f3e2c8" />
        </g>

        {mood === "copy" ? (
          <g className="m-held">
            {cueColor ? (
              <rect x="66" y="84" width="18" height="14" rx="4" fill={cueColor} stroke="#f3e2c8" strokeWidth="1.2" />
            ) : (
              <rect x="64" y="82" width="22" height="16" rx="4" fill="#1c1824" stroke="#f3e2c8" strokeWidth="1.2" />
            )}
          </g>
        ) : null}

        <g className="m-head">
          <g className="m-ear-l">
            <ellipse cx="48" cy="36" rx="11" ry="14" fill="#c24a1c" />
            <ellipse cx="49" cy="38" rx="6" ry="8" fill="#f3e2c8" />
          </g>
          <g className="m-ear-r">
            <ellipse cx="96" cy="36" rx="11" ry="14" fill="#c24a1c" />
            <ellipse cx="95" cy="38" rx="6" ry="8" fill="#f3e2c8" />
          </g>

          <circle cx="72" cy="54" r="24" fill="#c24a1c" />
          <path d="M54 48c6 10 12 14 18 14s12-4 18-14" fill="#2a1810" />
          <ellipse cx="72" cy="62" rx="14" ry="12" fill="#f3e2c8" />
          <path d="M50 52c4-8 10-12 14-10 2 6-2 14-8 18-4 1-8-2-6-8z" fill="#2a1810" />
          <path d="M94 52c-4-8-10-12-14-10-2 6 2 14 8 18 4 1 8-2 6-8z" fill="#2a1810" />

          <g className="m-eyes">
            <ellipse className="eye" cx="62" cy="52" rx="4.2" ry="5" fill="#1a1010" />
            <ellipse className="eye" cx="82" cy="52" rx="4.2" ry="5" fill="#1a1010" />
            {mood !== "focus" && mood !== "secret" ? (
              <>
                <circle cx="63.4" cy="50.2" r="1.4" fill="#fff8ee" />
                <circle cx="83.4" cy="50.2" r="1.4" fill="#fff8ee" />
              </>
            ) : null}
            <rect className="lid lid-l" x="57" y="46" width="10" height="10" rx="5" fill="#c24a1c" />
            <rect className="lid lid-r" x="77" y="46" width="10" height="10" rx="5" fill="#c24a1c" />
          </g>

          <ellipse cx="72" cy="64" rx="3.4" ry="2.6" fill="#1a1010" />
          <path
            className="m-mouth"
            d="M67 70c3 4 7 4 10 0"
            fill="none"
            stroke="#1a1010"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>

        {mood === "secret" ? (
          <g className="m-cover">
            <ellipse cx="58" cy="56" rx="11" ry="8" fill="#f3e2c8" />
            <ellipse cx="86" cy="56" rx="11" ry="8" fill="#f3e2c8" />
          </g>
        ) : null}
      </g>
    </svg>
  );
}
