/** 圆形进度环 */
export function ProgressRing({
  value, total, size = 72,
}: {
  value: number; total: number; size?: number;
}) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const ratio = total > 0 ? value / total : 0;
  const offset = c * (1 - ratio);
  const full = total > 0 && value >= total;

  return (
    <div className="relative progress-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--surface-2)" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={full ? "#f59e0b" : "#10b981"}
          strokeWidth={8} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold leading-none" style={{ fontSize: size * 0.28 }}>{value}</span>
        <span className="text-[var(--ink-soft)] leading-none" style={{ fontSize: size * 0.16 }}>/ {total}</span>
      </div>
    </div>
  );
}
