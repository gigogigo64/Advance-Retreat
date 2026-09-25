import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Habit } from "../lib/types";
import { createHabit, archiveHabit } from "../lib/repo";
import { runConversionAgent, undoConversion, type AgentStep, type ConversionResult } from "../lib/llm";
import { Modal, Button, TextInput } from "./ui";

/**
 * 缺点 Boss 卡：
 * - 每天避开它 = 按该 Boss 的 hp_step 削弱生命值（血条上限 hp_max，默认 100/3）
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
  const hpMax = Math.max(1, habit.hp_max || 100);
  const hpStep = habit.hp_step ?? 3;
  const hp = Math.max(0, Math.min(hpMax, habit.hp));
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
                  animate={{ width: `${(hp / hpMax) * 100}%` }}
                  transition={{ type: "spring", stiffness: 160, damping: 22 }}
                />
              </div>
              <span className="text-[10px] font-bold text-rose-500/90 tabular-nums w-9 text-right">
                {defeated ? "倒下" : `HP ${hp}/${hpMax}`}
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
            <span>{done ? `已避开 ✓ 削弱 -${hpStep} HP` : "今天避开了吗？避开 = 削弱它"} · +{habit.points ?? 2} 分</span>
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
          onClose={() => { setConvertOpen(false); onConverted(); }}
          onDone={() => { setConvertOpen(false); onConverted(); }}
        />
      )}
    </>
  );
}

/** 击败后的转化弹窗：LLM 以工具调用方式直接完成「建优点 + 归档缺点」，可撤销 */
function ConvertModal({ habit, onClose, onDone }: { habit: Habit; onClose: () => void; onDone: () => void }) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [manual, setManual] = useState(false);
  const [mName, setMName] = useState("");
  const [mNote, setMNote] = useState("");

  const run = async () => {
    setRunning(true); setError(""); setSteps([]); setResult(null); setManual(false);
    try {
      const r = await runConversionAgent(habit, (s) => setSteps((prev) => [...prev, s]));
      if (r.ok) {
        setResult(r);
        toast.success("🎉 转化完成！新的优点已加入清单");
      } else {
        setError("AI 未能完成转化，可重试或手动填写");
        setManual(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "调用 AI 失败");
      setManual(true);
    } finally {
      setRunning(false);
    }
  };
  // 挂载即运行智能体
  useEffect(() => { run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const undo = async () => {
    if (!result) return;
    await undoConversion(result);
    toast("已撤销本次转化，缺点已恢复", { icon: "↩️" });
    onDone();
  };

  const manualSave = async () => {
    if (!mName.trim()) return;
    await createHabit({
      type: "good", name: mName.trim(), emoji: "🌱", color: habit.color,
      category: habit.category, freq_type: habit.freq_type,
      freq_target: habit.freq_target, note: mNote.trim(),
    });
    await archiveHabit(habit.id, true);
    toast.success("已创建新的好习惯并归档该缺点");
    onDone();
  };

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="⚔️ Boss 已被击败！">
      <div className="text-sm mb-3">
        <span className="text-rose-500 font-semibold line-through">{habit.emoji} {habit.name}</span>
        <span className="mx-2 text-[var(--ink-soft)]">→</span>
        <span className="text-emerald-600 font-semibold">🌱 新习惯</span>
      </div>

      {/* 智能体执行过程（实时） */}
      <div className="rounded-xl bg-[var(--surface-2)] p-3 mb-3 max-h-52 overflow-y-auto">
        {steps.length === 0 && running && (
          <div className="text-sm text-[var(--ink-soft)] flex items-center gap-2">
            <span className="text-lg animate-bounce">🤔</span> AI 正在思考并操作…
          </div>
        )}
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-2 text-xs py-0.5">
            <span className="text-[var(--ink-soft)] tabular-nums">{i + 1}.</span>
            {s.type === "tool" ? (
              <span className="flex-1 min-w-0">
                <span className="font-medium">{TOOL_LABEL[s.name ?? ""] ?? s.name}</span>
                <span className="text-[var(--ink-soft)] ml-1 break-words">{toolDetail(s)}</span>
              </span>
            ) : (
              <span className="flex-1 min-w-0 text-[var(--ink-soft)] break-words">{s.text}</span>
            )}
          </div>
        ))}
      </div>

      {result && (
        <div className="rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 p-3 mb-3 text-sm">
          ✅ {result.summary}
          <div className="text-xs text-[var(--ink-soft)] mt-1">
            新建优点 {result.createdHabitIds.length} 项 · 归档缺点 {result.archivedHabitIds.length} 项
            {result.source === "json" && "（AI 未走工具，已按建议自动创建）"}
          </div>
        </div>
      )}
      {error && (
        <div className="text-xs text-amber-600 bg-amber-500/10 rounded-lg p-2 mb-3">⚠️ {error}</div>
      )}
      {manual && !result && (
        <div className="mb-3">
          <div className="text-xs text-[var(--ink-soft)] mb-1.5">手动创建替代好习惯</div>
          <TextInput value={mName} onChange={(e) => setMName(e.target.value)} maxLength={30}
            placeholder="如：每天喝够8杯水" />
          <div className="mt-2">
            <TextInput value={mNote} onChange={(e) => setMNote(e.target.value)} maxLength={50}
              placeholder="执行建议（可选）" />
          </div>
        </div>
      )}

      <div className="flex justify-between items-center gap-2">
        <Button variant="ghost" onClick={run} disabled={running}>🔄 重新生成</Button>
        <div className="flex gap-2">
          {result ? (
            <>
              <Button variant="danger" onClick={undo}>撤销转化</Button>
              <Button onClick={onDone}>完成</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>暂不转化</Button>
              {manual && <Button onClick={manualSave} disabled={!mName.trim()}>手动创建</Button>}
            </>
          )}
        </div>
      </div>
      <div className="text-[11px] text-[var(--ink-soft)] mt-3">
        转化由 AI 通过工具直接完成：新建好习惯并归档该缺点；如不满意可一键撤销。
      </div>
    </Modal>
  );
}

const TOOL_LABEL: Record<string, string> = {
  list_habits: "🔍 查看现有习惯",
  create_good_habit: "🌱 创建好习惯",
  update_habit: "✏️ 修改条目",
  archive_habit: "📦 归档缺点",
  finish: "✅ 完成",
};

function toolDetail(s: AgentStep): string {
  const r = s.result as Record<string, unknown> | undefined;
  if (r?.error) return `⚠️ ${r.error}`;
  if (s.name === "list_habits") return `已读取 ${Array.isArray(s.result) ? s.result.length : 0} 项`;
  if (s.name === "create_good_habit" && r?.name) return `「${r.name}」`;
  if (s.name === "archive_habit") return "已归档";
  if (s.name === "finish") return "结束";
  return "";
}
