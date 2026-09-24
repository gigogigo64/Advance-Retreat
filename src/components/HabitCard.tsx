import { motion } from "framer-motion";
import type { Habit } from "../lib/types";

/** 今日打卡卡片：单击 = 打卡/取消 */
export function HabitCard({
  habit, done, streak, onClick,
}: {
  habit: Habit; done: boolean; streak: number; onClick: () => void;
}) {
  const isGood = habit.type === "good";
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -2 }}
      className={`card text-left p-4 w-full transition-shadow relative overflow-hidden
        ${done ? "shadow-md" : "hover:shadow-md"}`}
      style={done ? { borderColor: habit.color, background: `${habit.color}14` } : {}}
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
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 border-2 transition-all
            ${done ? "border-transparent text-white" : "border-[var(--border)] text-transparent"}`}
          style={done ? { background: habit.color } : {}}
        >
          ✓
        </div>
      </div>
      <div className="text-[11px] mt-2 text-[var(--ink-soft)]">
        {isGood ? "今天坚持了吗？" : "今天避开了吗？"}
      </div>
    </motion.button>
  );
}
