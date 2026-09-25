import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import type { Habit } from "../lib/types";
import { suggestGoodHabit, createHabit, updateHabit, archiveHabit } from "../lib/repo";
import { Modal, Button, TextInput } from "./ui";

/**
 * 缺点 Boss 卡：
 * - 每天避开它 = 削弱它 3 点生命值（HP 0~100，约 34 天击败）
 * - 划去 UI 加强：斜切「避开」印章 + 整卡压暗 + 轻微旋转
 * - HP 归零 → 进入「击败」态，可一键让 LLM 把它转化为对应好习惯
 */
export function BossCard({
  habit, done, streak, onToggle, onConverted,
}: {
  habit: Habit; done: boolean; streak: number;
  onToggle: () => void;
  /** 击败并成功转化为优点后回调 */
  onConverted: () => void;
}) {
  const hp = Math.max(0, Math.min(100, habit.hp));
  const defeated = hp <= 0;
  const [convertOpen, setConvertOpen] = useState(false);

  return (
    <>
      <motion.button
        onClick={() => !defeated && onToggle()}
        whileTap={defeated ? undefined : { scale: 0.96 }}
        whileHover={defeated ? undefined : { y: -2 }}
        className={`card text-left p-4 w-full transition-shadow relative overflow-hidden border-2
          ${done ? "shadow-md" : "hover:shadow-md"} ${defeated ? "opacity-70" : ""}`}
        style={done ? {
          borderColor: "var(--rose-strong, #f43f5e)",
          background: "var(--surface-2)",
        } : defeated ? {
          borderColor: "#f43f5e55",
          background: "var(--surface-2)",
        } : {}}
      >
        {/* 打卡后的斜切印章 */}
        <AnimatePresence>
          {done && (
            <motion.div
              initial={{ opacity: 0, scale: 1.6, rotate: -18 }}
              animate={{ opacity: 1, scale: 1, rotate: -14 }}
              exit={{ opacity: 0, scale: 1.4 }}
              transition={{ type: "spring", stiffness: 320, damping: 20 }}
              className="absolute right-10 top-1/2 -translate-y-1/2 z-10 pointer-events-none
                px-3 py-1 rounded-lg border-[3px] border-rose-500 text-rose-500 font-black text-lg
                bg-rose-500/10 tracking-widest select-none"
            >
              避开
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-3 relative">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 transition-all
              ${done ? "grayscale-[0.5] scale-90" : ""}`}
            style={{ background: "#f43f5e22" }}
          >
            {habit.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`font-semibold text-sm truncate ${done ? "line-through decoration-rose-500 decoration-2" : ""}`}>
              {habit.name}
            </div>
            {/* HP 血条 */}
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-[7px] rounded-full bg-[var(--surface-2)] overflow-hidden
                border border-[var(--border)]">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: defeated
                      ? "#64748b"
                      : hp > 50
                        ? "linear-gradient(90deg,#f97316,#ef4444)"
                        : hp > 20
                          ? "linear-gradient(90deg,#ef4444,#dc2626)"
                          : "linear-gradient(90deg,#dc2626,#b91c1c)",
                  }}
                  initial={false}
                  animate={{ width: `${hp}%` }}
                  transition={{ type: "spring", stiffness: 160, damping: 22 }}
                />
              </div>
              <span className="text-[10px] font-bold text-rose-500/90 tabular-nums w-9 text-right">
                {defeated ? "倒下" : `HP ${hp}`}
              </span>
              {streak > 0 && !defeated && (
                <span className="text-amber-500 font-medium text-xs">🔥{streak}</span>
              )}
            </div>
          </div>
        </div>

        <div className="text-[11px] mt-2 text-[var(--ink-soft)] flex items-center justify-between">
          {defeated ? (
            <span className="text-rose-500 font-semibold">⚔️ 已被击败！点击下方按钮将它转化为优点</span>
          ) : (
            <span>{done ? "已避开 ✓ 削弱 -3 HP" : "今天避开了吗？避开 = 削弱它"}</span>
          )}
        </div>

        {defeated && (
          <button
            onClick={(e) => { e.stopPropagation(); setConvertOpen(true); }}
            className="mt-2.5 w-full py-2 rounded-xl text-sm font-semibold text-white
              bg-gradient-to-r from-rose-500 to-amber-500 hover:brightness-110 active:scale-95 transition"
          >
            ✨ 转化为好习惯
          </button>
        )}
      </motion.button>

      {convertOpen && (
        <ConvertModal
          habit={habit}
          onClose={() => setConvertOpen(false)}
          onDone={() => { setConvertOpen(false); onConverted(); }}
        />
      )}
    </>
  );
}

/** 击败后的转化弹窗：调 LLM 生成建议 → 用户确认后创建优点并归档缺点 */
function ConvertModal({ habit, onClose, onDone }: { habit: Habit; onClose: () => void; onDone: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const s = await suggestGoodHabit(habit.name, habit.note);
      setName(s.name);
      setNote(s.note);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
      setName("");
      setNote("");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []); // 挂载即请求

  const confirm = async () => {
    if (!name.trim()) return;
    await createHabit({
      type: "good", name: name.trim(), emoji: "🌱", color: habit.color,
      category: habit.category, freq_type: habit.freq_type,
      freq_target: habit.freq_target, note: note.trim(),
    });
    await updateHabit(habit.id, { hp: 100 });
    await archiveHabit(habit.id, true);
    onDone();
  };

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="⚔️ Boss 已被击败！">
      {loading ? (
        <div className="py-8 text-center">
          <div className="text-3xl mb-3 animate-bounce">🤔</div>
          <div className="text-sm text-[var(--ink-soft)]">AI 正在想一个好的替代习惯…</div>
        </div>
      ) : (
        <>
          <div className="text-sm mb-3">
            <span className="text-rose-500 font-semibold line-through">{habit.emoji} {habit.name}</span>
            <span className="mx-2 text-[var(--ink-soft)]">→</span>
            <span className="text-emerald-600 font-semibold">🌱 新习惯</span>
          </div>
          {error && (
            <div className="text-xs text-amber-600 bg-amber-500/10 rounded-lg p-2 mb-2">
              ⚠️ {error}，请手动填写或重试
            </div>
          )}
          <div className="mb-3">
            <div className="text-xs text-[var(--ink-soft)] mb-1.5">替代的好习惯（可修改）</div>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={30}
              placeholder="如：每天喝够8杯水" />
          </div>
          <div className="mb-4">
            <div className="text-xs text-[var(--ink-soft)] mb-1.5">执行建议（可选）</div>
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={50}
              placeholder="如：少量多次饮水" />
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={load} disabled={loading}>🔄 重新生成</Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>暂不转化</Button>
              <Button onClick={confirm} disabled={!name.trim()}>确认转化</Button>
            </div>
          </div>
          <div className="text-[11px] text-[var(--ink-soft)] mt-3">
            确认后会创建新的优点项目，并将该缺点归档（生命值重置，可随时恢复）。
          </div>
        </>
      )}
    </Modal>
  );
}
