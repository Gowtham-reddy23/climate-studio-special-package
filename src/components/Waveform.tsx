export function Waveform({ peaks, live }: { peaks: number[]; live?: number }) {
  const bars = peaks.length ? peaks : Array.from({ length: 16 }, () => 0.15);
  return (
    <div className="wave" aria-hidden="true">
      {bars.map((p, i) => (
        <span
          key={i}
          style={{ height: `${Math.max(12, Math.round((live && i === bars.length - 1 ? live : p) * 100))}%` }}
        />
      ))}
    </div>
  );
}
