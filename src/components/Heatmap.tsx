/** GitHub 风格年度热力图（近一年打卡率） */
export function Heatmap({
  data,
}: {
  /** key: YYYY-MM-DD, value: 完成率 0~1；null = 当日无任务，显示空白 */
  data: Map<string, number | null>;
}) {
  const cells: { date: Date; rate: number | null }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  // 对齐到周日开始
  start.setDate(start.getDate() - start.getDay());

  const cursor = new Date(start);
  while (cursor <= today) {
    const key = fmt(cursor);
    cells.push({ date: new Date(cursor), rate: data.has(key) ? data.get(key)! : null });
    cursor.setDate(cursor.getDate() + 1);
  }

  // 按周分列
  const weeks: { date: Date; rate: number | null }[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthLabels: { idx: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((w, i) => {
    const m = w[0].date.getMonth();
    if (m !== lastMonth) {
      lastMonth = m;
      monthLabels.push({ idx: i, label: `${m + 1}月` });
    }
  });

  // 颜色：null=当日无任何项目（空白）；其余为完成率深浅
  const color = (rate: number | null) => {
    if (rate === null) return "var(--heat-empty)";
    if (rate === 0) return "var(--heat-0)";
    if (rate < 0.34) return "#a7f3d0";
    if (rate < 0.67) return "#6ee7b7";
    if (rate < 1) return "#34d399";
    return "#059669";
  };

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex flex-col gap-1">
        {/* 月标签列宽必须与格子列宽一致（10px + 3px gap），否则会横向溢出出现滚动条 */}
        <div className="flex gap-[3px] text-[10px] text-[var(--ink-soft)] h-4">
          {weeks.map((_, i) => {
            const m = monthLabels.find((mm) => mm.idx === i);
            return (
              <div key={i} className="w-[10px] shrink-0 relative">
                {m && <span className="absolute left-0 top-0 whitespace-nowrap">{m.label}</span>}
              </div>
            );
          })}
        </div>
        <div className="flex gap-[3px]">
          {weeks.map((w, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {w.map(({ date, rate }) => (
                <div
                  key={fmt(date)}
                  title={`${fmt(date)} ${rate === null ? "无项目" : "完成率 " + Math.round(rate * 100) + "%"}`}
                  className="w-[10px] h-[10px] rounded-[2px]"
                  style={{ background: color(rate) }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function fmt(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
