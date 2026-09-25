import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useApp } from "../lib/store";
import * as repo from "../lib/repo";
import { todayStr } from "../lib/types";
import { streaks } from "../lib/streak";
import { HabitCard } from "../components/HabitCard";
import { BossCard } from "../components/BossCard";
import { ProgressRing } from "../components/ProgressRing";
import { Button, TextInput } from "../components/ui";
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
    const wasDoneBefore = doneSet.has(h.id);

    if (added) {
      // 打卡加分
      const per = Number(await repo.getSettingValue("points_per_checkin") || 2);
      await repo.addPoints(per, `打卡「${h.name}」`, today);

      // 缺点 Boss：避开一次，削弱它 3 点生命值
      if (h.type === "bad") {
        const newHp = Math.max(0, h.hp - 3);
        await repo.updateHabit(h.id, { hp: newHp });
        if (newHp === 0) toast.success(`⚔️ 「${h.name}」被击败了！可以把它转化为优点了`);
      }

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
      await reconcileWeeklyBonus();
    } else if (wasDoneBefore) {
      // 取消打卡 → 扣回本次打卡所得的分（含满分奖励，防刷分）
      const per = Number(await repo.getSettingValue("points_per_checkin") || 2);
      await repo.addPoints(-per, `取消打卡「${h.name}」`, today);

      // 缺点 Boss：取消避开，回补生命值
      if (h.type === "bad") {
        await repo.updateHabit(h.id, { hp: Math.min(100, h.hp + 3) });
      }

      // 如果取消前是满分日，扣回满分奖励
      const wasFull = dueHabits.every((x) => doneSet.has(x.id));
      if (wasFull) {
        const fullPts = Number(await repo.getSettingValue("points_full_day") || 5);
        await repo.addPoints(-fullPts, "取消今日满分", today);
      }

      // 对账：若因取消而不再满足7天全勤，则扣回相应奖励
      await reconcileWeeklyBonus();
      toast(`已取消「${h.name}」，分数已相应扣除`, { icon: "↩️" });
    }
    await refresh();
  }

  /**
   * 连续7天全勤奖励对账（幂等且可逆）：
   * 比对“今日应得”与“今日已发放净额”，只补差额 / 只扣回超额，
   * 避免用“是否已有记录”判重导致取消后无法重新发放而净亏分。
   */
  async function reconcileWeeklyBonus() {
    const bonus = Number(await repo.getSettingValue("points_weekly_bonus") || 10);
    const d = await repo.exportAll();
    const today = todayStr();
    const net = d.points_log
      .filter((p) => p.date === today && (p.reason === "连续7天全勤" || p.reason === "撤销连续7天全勤"))
      .reduce((s, p) => s + p.delta, 0);
    const full = await isSevenDayFull();
    if (full && net < bonus) {
      await repo.addPoints(bonus - net, "连续7天全勤", today);
      if (net === 0) toast.success(`🔥 连续7天全勤！额外 +${bonus} 分`);
    } else if (!full && net > 0) {
      await repo.addPoints(-net, "撤销连续7天全勤", today);
    }
  }

  async function isSevenDayFull(): Promise<boolean> {
    const d = await repo.exportAll();
    const perDayDone = new Map<string, Set<number>>();
    for (const c of d.checkins) {
      if (!perDayDone.has(c.date)) perDayDone.set(c.date, new Set());
      perDayDone.get(c.date)!.add(c.habit_id);
    }
    for (let i = 0; i < 7; i++) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const key = todayStr(dt);
      const doneSet = perDayDone.get(key);
      if (!doneSet || !doneSet.size) return false;
    }
    return true;
  }

  const saveNote = async () => {
    await repo.saveDailyNote(today, note);
    toast.success("今日回顾已保存");
  };

  const good = dueHabits.filter((h) => h.type === "good");
  const bad = dueHabits.filter((h) => h.type === "bad");

  return (
    <div className="p-6 max-w-5xl mx-auto relative">
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

      {/* 左右两栏：优点 | 缺点 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 优点栏 */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="font-bold text-emerald-600">🌱 优点培养</span>
            <span className="text-xs text-[var(--ink-soft)]">坚持了就打卡</span>
            <span className="ml-auto text-xs text-[var(--ink-soft)]">
              {good.filter((h) => doneSet.has(h.id)).length}/{good.length}
            </span>
          </div>
          <div className="space-y-3">
            {good.length === 0 && (
              <div className="card p-6 text-center text-sm text-[var(--ink-soft)]">还没有优点项目</div>
            )}
            {good.map((h) => (
              <HabitCard key={h.id} habit={h} done={doneSet.has(h.id)}
                streak={streakMap.get(h.id)?.current ?? 0}
                onClick={() => handleToggle(h)} />
            ))}
          </div>
        </div>

        {/* 缺点栏 */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="font-bold text-rose-500">🛡️ 缺点抵制</span>
            <span className="text-xs text-[var(--ink-soft)]">每天避开 = 削弱 Boss 生命值</span>
            <span className="ml-auto text-xs text-[var(--ink-soft)]">
              {bad.filter((h) => doneSet.has(h.id)).length}/{bad.length}
            </span>
          </div>
          <div className="space-y-3">
            {bad.length === 0 && (
              <div className="card p-6 text-center text-sm text-[var(--ink-soft)]">还没有缺点项目</div>
            )}
            {bad.map((h) => (
              <BossCard key={h.id} habit={h} done={doneSet.has(h.id)}
                streak={streakMap.get(h.id)?.current ?? 0}
                onToggle={() => handleToggle(h)}
                onConverted={async () => { await refresh(); }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 一句话回顾 */}
      <div className="card p-4 mt-6">
        <div className="text-sm font-semibold mb-2">📝 今日一句话回顾</div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={noteLoaded ? "今天，一句话总结…" : ""}
            maxLength={100}
            onKeyDown={(e) => e.key === "Enter" && saveNote()}
          />
          <Button onClick={saveNote} className="shrink-0 whitespace-nowrap px-5">保存</Button>
        </div>
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
