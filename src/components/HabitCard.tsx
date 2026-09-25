import { motion } from "framer-motion";
import type { Habit } from "../lib/types";

/**
 * 打卡卡片：
 * - 优点打卡 → 绿色高亮 + ✓
 * - 缺点打卡 → 用 BossCard（划去印章 + HP 血条）
 */
export function HabitCard({
  habit, done, streak, onClick,
}: {
  habit: Habit; done: boolean; streak: number; onClick: () => void;
}) {
  const isGood = habit.type === "good";

  const doneStyle = isGood
    ? { borderColor: habit.color, background: `${habit.color}14` }
    : {};

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -2 }}
      className={`card text-left p-4 w-full transition-shadow relative overflow-hidden
        ${done ? "shadow-md" : "hover:shadow-md"}`}
      style={done ? doneStyle : {}}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 transition-transform"
          style={{ background: `${habit.color}22` }}
        >
          {habit.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{habit.name}</div>
          <div className="text-xs text-[var(--ink-soft)] mt-0.5 flex items-center gap-2">
            <span>{habit.category}</span>
            {streak > 0 && (
              <span className="text-amber-500 font-medium">🔥 {streak} 天</span>
            )}
          </div>
        </div>
        {isGood && (
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 border-2 transition-all
              ${done ? "border-transparent text-white" : "border-[var(--border)] text-transparent"}`}
            style={done ? { background: habit.color } : {}}
          >
            ✓
          </div>
        )}
      </div>
      {isGood && (
        <div className="text-[11px] mt-2 text-[var(--ink-soft)]">
          {done ? "已坚持 ✓" : "今天坚持了吗？"}
        </div>
      )}
    </motion.button>
  );
}
