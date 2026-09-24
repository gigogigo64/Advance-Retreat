import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useApp } from "../lib/store";
import * as repo from "../lib/repo";
import { todayStr } from "../lib/types";
import { streaks } from "../lib/streak";
import { HabitCard } from "../components/HabitCard";
import { ProgressRing } from "../components/ProgressRing";
import { TextInput } from "../components/ui";
import { useEffect } from "react";

const WEEKDAYS_CN = ["日", "一", "二", "三", "四", "五", "六"];

export function TodayPage() {
  const { habits, checkins, refresh } = useApp();
  const today = todayStr();
  const now = new Date();

  const [streakMap, setStreakMap] = useState<Map<number, { current: number; longest: number }>>(new Map());
  const [note, setNote] = useState("");
  const [noteLoaded, setNoteLoaded] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    repo.getDailyNote(today).then((n) => { setNote(n); setNoteLoaded(true); });
  }, [today]);

  // 当前应打卡的项
  const dueHabits = useMemo(
    () => habits.filter((h) => {
      if (h.archived) return false;
      if (h.freq_type === "weekdays") {
        const day = now.getDay();
        return day >= 1 && day <= 5;
      }
      return true;
    }),
    [habits]
  );

  const doneSet = useMemo(
    () => new Set(checkins.filter((c) => c.date === today).map((c) => c.habit_id)),
    [checkins, today]
  );

  const doneCount = dueHabits.filter((h) => doneSet.has(h.id)).length;
  const full = dueHabits.length > 0 && doneCount === dueHabits.length;

  // streak 计算（每次打卡后刷新）
  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        dueHabits.map(async (h) => [h.id, await streaks(h.id, h.freq_type)] as const)
      );
      if (alive) setStreakMap(new Map(entries));
    })();
    return () => { alive = false; };
  }, [dueHabits, checkins]);

  const handleToggle = async (h: (typeof dueHabits)[number]) => {
    const added = await repo.toggleCheckin(h.id, today);
    // 积分
    if (added) {
      const per = Number(await repo.getSettingValue("points_per_checkin") || 2);
      await repo.addPoints(per, `打卡「${h.name}」`, today);
      // 满分日判断
      const willBeFull = dueHabits.every((x) => x.id === h.id || doneSet.has(x.id));
      if (willBeFull) {
        const fullPts = Number(await repo.getSettingValue("points_full_day") || 5);
        await repo.addPoints(fullPts, "今日满分", today);
        setCelebrate(true);
        setTimeout(() => setCelebrate(false), 2600);
        toast.success("🎉 今日满分！全部打卡完成");
      } else {
        toast.success(`+${per} 分 ·「${h.name}」`);
      }
      // 连续7天全勤奖励
      await maybeWeeklyBonus();
    }
    await refresh();
  }

  async function maybeWeeklyBonus() {
    // 检查最近7天是否每天全勤（简单实现：有打卡记录的每天计算全勤）
    const d = await repo.exportAll();
    const perDayDone = new Map<string, Set<number>>();
    for (const c of d.checkins) {
      if (!perDayDone.has(c.date)) perDayDone.set(c.date, new Set());
      perDayDone.get(c.date)!.add(c.habit_id);
    }
    let fullDays = 0;
    for (let i = 0; i < 7; i++) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const key = todayStr(dt);
      const doneSet = perDayDone.get(key);
      if (!doneSet || !doneSet.size) return; // 有缺口
      fullDays++;
    }
    if (fullDays === 7) {
      const already = d.points_log.some((p) => p.reason === "连续7天全勤" && p.date === todayStr());
      if (!already) {
        const bonus = Number(await repo.getSettingValue("points_weekly_bonus") || 10);
        await repo.addPoints(bonus, "连续7天全勤", todayStr());
        toast.success(`🔥 连续7天全勤！额外 +${bonus} 分`);
      }
    }
  }

  const saveNote = async () => {
    await repo.saveDailyNote(today, note);
    toast.success("今日回顾已保存");
  };

  const good = dueHabits.filter((h) => h.type === "good");
  const bad = dueHabits.filter((h) => h.type === "bad");

  return (
    <div className="p-6 max-w-4xl mx-auto relative">
      {/* 撒花 */}
      <AnimatePresence>
        {celebrate && <Confetti />}
      </AnimatePresence>

      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-2xl font-bold">
            {now.getMonth() + 1}月{now.getDate()}日
            <span className="text-base text-[var(--ink-soft)] font-normal ml-2">星期{WEEKDAYS_CN[now.getDay()]}</span>
          </div>
          <div className="text-sm text-[var(--ink-soft)] mt-1">
            {full ? "今天全部完成，明天见 👋" : dueHabits.length === 0 ? "还没有可打卡的项目，去「清单」添加吧" : "坚持就是胜利，逐条打卡 ↓"}
          </div>
        </div>
        <ProgressRing value={doneCount} total={dueHabits.length} />
      </div>

      {/* 优点 */}
      {good.length > 0 && (
        <Section title="🌱 优点培养" subtitle="坚持了就打卡" items={good} doneSet={doneSet}
          streakMap={streakMap} onToggle={handleToggle} />
      )}
      {/* 缺点 */}
      {bad.length > 0 && (
        <Section title="🛡️ 缺点抵制" subtitle="避开了就打卡" items={bad} doneSet={doneSet}
          streakMap={streakMap} onToggle={handleToggle} />
      )}

      {/* 一句话回顾 */}
      <div className="card p-4 mt-6">
        <div className="text-sm font-semibold mb-2">📝 今日一句话回顾</div>
        <div className="flex gap-2">
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={noteLoaded ? "今天，一句话总结…" : ""}
            maxLength={100}
          />
          <button onClick={saveNote}
            className="px-4 rounded-xl bg-emerald-500 text-white text-sm hover:bg-emerald-600 active:scale-95 transition">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title, subtitle, items, doneSet, streakMap, onToggle,
}: {
  title: string; subtitle: string;
  items: { id: number; name: string; emoji: string; color: string; category: string; type: string }[];
  doneSet: Set<number>;
  streakMap: Map<number, { current: number; longest: number }>;
  onToggle: (h: never) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-bold">{title}</span>
        <span className="text-xs text-[var(--ink-soft)]">{subtitle}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((h) => (
          <HabitCard
            key={h.id}
            habit={h as never}
            done={doneSet.has(h.id)}
            streak={streakMap.get(h.id)?.current ?? 0}
            onClick={() => onToggle(h as never)}
          />
        ))}
      </div>
    </div>
  );
}

/** 简易撒花 */
function Confetti() {
  const pieces = Array.from({ length: 40 }, (_, i) => i);
  const colors = ["#10b981", "#f59e0b", "#6366f1", "#f43f5e", "#06b6d4"];
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map((i) => (
        <motion.div
          key={i}
          initial={{ x: `${(i * 37) % 100}vw`, y: -20, rotate: 0, opacity: 1 }}
          animate={{ y: "105vh", rotate: 360 + i * 30, opacity: [1, 1, 0.6] }}
          transition={{ duration: 1.6 + (i % 5) * 0.25, ease: "easeIn" }}
          className="absolute w-2 h-3 rounded-sm"
          style={{ background: colors[i % colors.length], left: 0 }}
        />
      ))}
    </div>
  );
}
