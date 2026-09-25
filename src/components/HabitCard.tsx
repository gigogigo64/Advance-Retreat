import { motion } from "framer-motion";
import type { Habit } from "../lib/types";

/**
 * 打卡卡片：
 * - 优点打卡 → 绿色高亮 + ✓
 * - 缺点打卡 → 名称划去 + 灰化（保留显示，以示「今天避开了」）
 */
export function HabitCard({
  habit, done, streak, onClick,
}: {
  habit: Habit; done: boolean; streak: number; onClick: () => void;
}) {
  const isGood = habit.type === "good";

  // 打卡后的视觉：优点=点亮，缺点=划去淡出
  const doneStyle = isGood
    ? { borderColor: habit.color, background: `${habit.color}14` }
    : { borderColor: "var(--border)", background: "var(--surface-2)", opacity: 0.72 };

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
          <div className={`font-semibold text-sm truncate ${!isGood && done ? "line-through" : ""}`}>
            {habit.name}
          </div>
          <div className="text-xs text-[var(--ink-soft)] mt-0.5 flex items-center gap-2">
            <span>{habit.category}</span>
            {streak > 0 && (
              <span className="text-amber-500 font-medium">🔥 {streak} 天</span>
            )}
          </div>
        </div>
        {/* 右侧状态标 */}
        {isGood ? (
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 border-2 transition-all
              ${done ? "border-transparent text-white" : "border-[var(--border)] text-transparent"}`}
            style={done ? { background: habit.color } : {}}
          >
            ✓
          </div>
        ) : (
          <div
            className={`px-2 h-7 rounded-full flex items-center justify-center text-xs shrink-0 border transition-all
              ${done
                ? "bg-rose-500/15 text-rose-500 border-transparent font-medium"
                : "border-[var(--border)] text-transparent"}`}
          >
            避开
          </div>
        )}
      </div>
      <div className="text-[11px] mt-2 text-[var(--ink-soft)]">
        {isGood
          ? done ? "已坚持 ✓" : "今天坚持了吗？"
          : done ? "已避开 ✓" : "今天避开了吗？"}
      </div>
    </motion.button>
  );
}
