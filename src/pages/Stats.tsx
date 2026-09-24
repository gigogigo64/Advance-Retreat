import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store";
import * as repo from "../lib/repo";
import { todayStr } from "../lib/types";
import { streaks } from "../lib/streak";
import { Heatmap } from "../components/Heatmap";
import { ProgressRing } from "../components/ProgressRing";
import { TextInput } from "../components/ui";

export function StatsPage() {
  const { habits, checkins } = useApp();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [streakMap, setStreakMap] = useState<Map<number, { current: number; longest: number }>>(new Map());
  const [browseDate, setBrowseDate] = useState(todayStr());
  const [dayNote, setDayNote] = useState("");
  const [dayCheckins, setDayCheckins] = useState<number[]>([]);

  const active = habits.filter((h) => !h.archived);

  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        active.map(async (h) => [h.id, await streaks(h.id, h.freq_type)] as const)
      );
      if (alive) setStreakMap(new Map(entries));
    })();
    return () => { alive = false; };
  }, [habits, checkins]);

  // 年度热力图数据：当日应打卡项中的完成率
  const heatmapData = useMemo(() => {
    const map = new Map<string, number>();
    const byDate = new Map<string, Set<number>>();
    for (const c of checkins) {
      if (!byDate.has(c.date)) byDate.set(c.date, new Set());
      byDate.get(c.date)!.add(c.habit_id);
    }
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = todayStr(d);
      const due = active.filter((h) => {
        if (h.start_date > key) return false;
        if (h.freq_type === "weekdays") { const w = d.getDay(); return w >= 1 && w <= 5; }
        return true;
      });
      if (!due.length) { map.set(key, -1); continue; } // -1 表示当日无任务
      const done = byDate.get(key) ?? new Set();
      const rate = due.filter((h) => done.has(h.id)).length / due.length;
      map.set(key, rate);
    }
    return map;
  }, [habits, checkins]);

  const selected = habits.find((h) => h.id === selectedId) ?? null;

  // 选中项的完成率（近30天）
  const rate30 = useMemo(() => {
    if (!selected) return 0;
    const byDate = new Set(checkins.filter((c) => c.habit_id === selected.id).map((c) => c.date));
    let due = 0, done = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      if (selected.freq_type === "weekdays") { const w = d.getDay(); if (w === 0 || w === 6) continue; }
      due++;
      if (byDate.has(todayStr(d))) done++;
    }
    return due ? done / due : 0;
  }, [selected, checkins]);

  // 浏览历史某天
  useEffect(() => {
    (async () => {
      setDayNote(await repo.getDailyNote(browseDate));
      const all = await repo.listCheckinsBetween(browseDate, browseDate);
      setDayCheckins(all.map((c) => c.habit_id));
    })();
  }, [browseDate]);

  const best = [...active].sort((a, b) => (streakMap.get(b.id)?.current ?? 0) - (streakMap.get(a.id)?.current ?? 0)).slice(0, 3);
  const warn = [...active].filter((h) => (streakMap.get(h.id)?.current ?? 0) === 0).slice(0, 3);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">统计</h1>

      {/* 总览卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="font-semibold mb-3">🏆 连续天数排行</div>
          {best.length === 0 && <div className="text-sm text-[var(--ink-soft)]">暂无数据</div>}
          {best.map((h) => (
            <button key={h.id} onClick={() => setSelectedId(h.id)}
              className="flex items-center gap-2 w-full py-1.5 text-sm hover:bg-[var(--surface-2)] rounded-lg px-1 -mx-1">
              <span>{h.emoji}</span>
              <span className="flex-1 text-left truncate">{h.name}</span>
              <span className="text-amber-500 font-semibold">🔥 {streakMap.get(h.id)?.current ?? 0}</span>
              <span className="text-[var(--ink-soft)] text-xs">最长 {streakMap.get(h.id)?.longest ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="card p-5">
          <div className="font-semibold mb-3">⚠️ 需要警惕（当前连续为0）</div>
          {warn.length === 0 && <div className="text-sm text-[var(--ink-soft)]">一切正常，继续保持 💪</div>}
          {warn.map((h) => (
            <button key={h.id} onClick={() => setSelectedId(h.id)}
              className="flex items-center gap-2 w-full py-1.5 text-sm hover:bg-[var(--surface-2)] rounded-lg px-1 -mx-1">
              <span>{h.emoji}</span>
              <span className="flex-1 text-left truncate">{h.name}</span>
              <span className="text-rose-500 text-xs">最长 {streakMap.get(h.id)?.longest ?? 0} 天</span>
            </button>
          ))}
        </div>
      </div>

      {/* 热力图 */}
      <div className="card p-5">
        <div className="font-semibold mb-3">📅 近一年总览</div>
        <Heatmap data={heatmapData} />
        <div className="flex items-center gap-1 mt-3 text-xs text-[var(--ink-soft)]">
          少
          {["#e2e8f0", "#a7f3d0", "#6ee7b7", "#34d399", "#059669"].map((c) => (
            <div key={c} className="w-3 h-3 rounded-[2px]" style={{ background: c }} />
          ))}
          多
        </div>
      </div>

      {/* 单项详情 */}
      {selected && (
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `${selected.color}22` }}>
              {selected.emoji}
            </div>
            <div className="flex-1">
              <div className="font-semibold">{selected.name}</div>
              <div className="text-xs text-[var(--ink-soft)]">{selected.category}</div>
            </div>
            <ProgressRing value={Math.round(rate30 * 30)} total={30} size={56} />
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-[var(--surface-2)] rounded-xl p-3">
              <div className="text-2xl font-bold text-amber-500">🔥 {streakMap.get(selected.id)?.current ?? 0}</div>
              <div className="text-xs text-[var(--ink-soft)]">当前连续</div>
            </div>
            <div className="bg-[var(--surface-2)] rounded-xl p-3">
              <div className="text-2xl font-bold">{streakMap.get(selected.id)?.longest ?? 0}</div>
              <div className="text-xs text-[var(--ink-soft)]">最长连续</div>
            </div>
            <div className="bg-[var(--surface-2)] rounded-xl p-3">
              <div className="text-2xl font-bold">{Math.round(rate30 * 100)}%</div>
              <div className="text-xs text-[var(--ink-soft)]">30天完成率</div>
            </div>
          </div>
        </div>
      )}

      {/* 历史浏览 */}
      <div className="card p-5">
        <div className="font-semibold mb-3">🔍 历史回顾（只读，不可补卡）</div>
        <TextInput type="date" value={browseDate} max={todayStr()}
          onChange={(e) => setBrowseDate(e.target.value)} className="!w-44 mb-3" />
        <div className="flex flex-wrap gap-2 mb-3">
          {habits.filter((h) => !h.archived).map((h) => (
            <span key={h.id}
              className={`px-2.5 py-1 rounded-lg text-xs border ${dayCheckins.includes(h.id) ? "text-white" : "text-[var(--ink-soft)]"}`}
              style={dayCheckins.includes(h.id) ? { background: h.color, borderColor: h.color } : { borderColor: "var(--border)" }}>
              {h.emoji} {h.name}{dayCheckins.includes(h.id) ? " ✓" : ""}
            </span>
          ))}
        </div>
        {dayNote && (
          <div className="bg-[var(--surface-2)] rounded-xl p-3 text-sm">📝 {dayNote}</div>
        )}
      </div>
    </div>
  );
}
