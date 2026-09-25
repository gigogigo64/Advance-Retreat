import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "../lib/store";
import * as repo from "../lib/repo";
import { CATEGORIES, EMOJIS_BAD, EMOJIS_GOOD, HABIT_COLORS, type FreqType, type HabitType } from "../lib/types";
import type { Habit } from "../lib/types";
import { Modal, Button, Field, TextInput, Select, EmojiPicker, ColorPicker } from "../components/ui";
import { toast } from "sonner";

export function HabitsPage() {
  const { habits, refresh } = useApp();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [creatingType, setCreatingType] = useState<HabitType | null>(null);
  // 拖拽状态：正在拖拽的 id、悬停目标 id（同栏内）
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  const commitReorder = async (colType: HabitType, targetId: number) => {
    if (dragId == null || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const col = habits.filter((h) => h.type === colType && (showArchived || !h.archived));
    const ids = col.map((h) => h.id);
    const from = ids.indexOf(dragId), to = ids.indexOf(targetId);
    if (from < 0 || to < 0) { setDragId(null); setOverId(null); return; }
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null); setOverId(null);
    await repo.reorderHabits(colType, ids);
    await refresh();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold">清单管理</h1>
        <Button variant="soft" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? "隐藏已归档" : "显示已归档"}
        </Button>
      </div>

      <div className="text-xs text-[var(--ink-soft)] mb-3">
        💡 点名字 / 图标 / 分类 / 频率可直接就地编辑；按住左侧 ⠿ 拖动可调顺序。
      </div>

      {/* 左右两栏：优点 | 缺点 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {(["good", "bad"] as HabitType[]).map((colType) => {
          const col = habits.filter((h) => h.type === colType && (showArchived || !h.archived));
          const isGood = colType === "good";
          return (
            <div key={colType} className="min-w-0">
              <div className="flex items-center gap-2 mb-3">
                <span className={`font-bold ${isGood ? "text-emerald-600" : "text-rose-500"}`}>
                  {isGood ? "🌱 优点" : "🛡️ 缺点"}
                </span>
                <span className="text-xs text-[var(--ink-soft)]">{col.length} 项</span>
                <button
                  onClick={() => setCreatingType(colType)}
                  className={`ml-auto text-xs px-3 py-1 rounded-lg transition-colors
                    ${isGood ? "text-emerald-600 hover:bg-emerald-500/10" : "text-rose-500 hover:bg-rose-500/10"}`}>
                  + 新增{isGood ? "优点" : "缺点"}
                </button>
              </div>
              <div className="space-y-2.5">
                {col.length === 0 && (
                  <div className="card p-6 text-center text-[var(--ink-soft)] text-sm">
                    还没有{isGood ? "优点" : "缺点"}，点上方「+ 新增{isGood ? "优点" : "缺点"}」开始
                  </div>
                )}
                {col.map((h) => (
                  <HabitRow
                    key={h.id}
                    habit={h}
                    dragging={dragId === h.id}
                    over={overId === h.id && dragId !== h.id}
                    onDragStart={() => setDragId(h.id)}
                    onDragEnter={() => setOverId(h.id)}
                    onDrop={() => commitReorder(colType, h.id)}
                    onDragEnd={() => { setDragId(null); setOverId(null); }}
                    onEdit={() => setEditing(h)}
                    onChanged={refresh}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <HabitForm
        open={!!creatingType || !!editing}
        onClose={() => { setCreatingType(null); setEditing(null); }}
        initial={editing}
        type={creatingType ?? editing?.type ?? "good"}
        onSaved={async () => { await refresh(); setCreatingType(null); setEditing(null); }}
      />
    </div>
  );
}

/* ---------------- 单行：就地编辑 + 拖拽 ---------------- */

function HabitRow({
  habit, dragging, over, onDragStart, onDragEnter, onDrop, onDragEnd, onEdit, onChanged,
}: {
  habit: Habit; dragging: boolean; over: boolean;
  onDragStart: () => void; onDragEnter: () => void; onDrop: () => void; onDragEnd: () => void;
  onEdit: () => void; onChanged: () => Promise<void> | void;
}) {
  const isGood = habit.type === "good";
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(habit.name);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojis = isGood ? EMOJIS_GOOD : EMOJIS_BAD;

  const patch = async (p: Partial<Habit>, msg: string) => {
    await repo.updateHabit(habit.id, p);
    await onChanged();
    toast.success(msg);
  };

  const startName = () => { setNameDraft(habit.name); setEditingName(true); setTimeout(() => inputRef.current?.select(), 0); };
  const saveName = () => {
    setEditingName(false);
    const v = nameDraft.trim();
    if (v && v !== habit.name) patch({ name: v }, "名称已更新");
  };

  const cycleCategory = () => {
    const i = CATEGORIES.indexOf(habit.category);
    patch({ category: CATEGORIES[(i + 1) % CATEGORIES.length] }, `分类 → ${CATEGORIES[(i + 1) % CATEGORIES.length]}`);
  };

  const cycleFreq = () => {
    const order: FreqType[] = ["daily", "weekdays", "weekly"];
    const next = order[(order.indexOf(habit.freq_type) + 1) % order.length];
    patch({ freq_type: next }, `频率 → ${next === "daily" ? "每天" : next === "weekdays" ? "仅工作日" : "每周3次"}`);
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      onDragEnd={onDragEnd}
      className={`card p-3.5 flex items-center gap-2.5 transition-all select-none
        ${dragging ? "opacity-40 scale-95" : ""} ${over ? "ring-2 ring-emerald-400/60" : "hover:shadow-md"}`}
    >
      {/* 拖拽把手 */}
      <div className="text-[var(--ink-soft)] cursor-grab active:cursor-grabbing text-base leading-none px-0.5" title="拖动调整顺序">
        ⠿
      </div>

      {/* 图标：点击弹出 emoji 选择 */}
      <div className="relative shrink-0">
        <button
          onClick={() => setEmojiOpen(!emojiOpen)}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-transform hover:scale-110"
          style={{ background: `${habit.color}22` }}
          title="点击换图标"
        >
          {habit.emoji}
        </button>
        <AnimatePresence>
          {emojiOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              className="absolute z-30 left-0 top-11 card p-2 shadow-xl w-[168px]"
            >
              <div className="flex flex-wrap gap-1">
                {emojis.map((e) => (
                  <button key={e} onClick={() => { patch({ emoji: e }, "图标已更新"); setEmojiOpen(false); }}
                    className={`w-8 h-8 rounded-lg text-base flex items-center justify-center
                      ${habit.emoji === e ? "bg-emerald-500/20 ring-1 ring-emerald-400" : "hover:bg-[var(--surface-2)]"}`}>
                    {e}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 名称：点击就地编辑 */}
      <div className="flex-1 min-w-0">
        {editingName ? (
          <input
            ref={inputRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
            autoFocus
            maxLength={30}
            className="w-full px-2 py-1 rounded-lg bg-[var(--surface-2)] border border-emerald-400 text-sm font-semibold outline-none"
          />
        ) : (
          <div className="flex items-center gap-2">
            <span onClick={startName}
              className="font-semibold text-sm cursor-text hover:bg-[var(--surface-2)] rounded px-1 -mx-1 py-0.5 transition-colors"
              title="点击改名">{habit.name}</span>
            {habit.archived ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--ink-soft)]">已归档</span>
            ) : null}
          </div>
        )}
        {/* 分类 / 频率 / HP：点击切换 */}
        <div className="text-xs text-[var(--ink-soft)] mt-1 flex items-center gap-1.5 flex-wrap">
          <button onClick={cycleCategory} title="点击换分类"
            className="px-1.5 py-0.5 rounded-md hover:bg-[var(--surface-2)] transition-colors">🏷 {habit.category}</button>
          <button onClick={cycleFreq} title="点击换频率"
            className="px-1.5 py-0.5 rounded-md hover:bg-[var(--surface-2)] transition-colors">🔁 {freqLabel(habit)}</button>
          {habit.type === "bad" && !habit.archived && (
            <span className="text-rose-500/80 font-medium">HP {Math.max(0, habit.hp)}</span>
          )}
          {habit.note && <span className="truncate max-w-[120px]">· {habit.note}</span>}
        </div>
      </div>

      {/* 归档 / 恢复 / 删除 + 更多设置 */}
      <div className="flex items-center gap-1 shrink-0">
        {habit.archived ? (
          <>
            <IconBtn title="恢复" onClick={() => patch({ archived: 0 }, "已恢复")}>↩️</IconBtn>
            <IconBtn title="彻底删除" onClick={async () => { await repo.deleteHabit(habit.id); await onChanged(); toast.success("已删除"); }}>🗑</IconBtn>
          </>
        ) : (
          <>
            <IconBtn title="归档" onClick={() => patch({ archived: 1 }, "已归档")}>📦</IconBtn>
            <IconBtn title="颜色等更多设置" onClick={onEdit}>⚙️</IconBtn>
          </>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--surface-2)] transition-colors">
      {children}
    </button>
  );
}

function freqLabel(h: Habit): string {
  if (h.freq_type === "daily") return "每天";
  if (h.freq_type === "weekdays") return "仅工作日";
  return `每周 ${h.freq_target} 次`;
}

/* ---------------- 完整编辑弹窗（颜色/备注/每周次数） ---------------- */

function HabitForm({
  open, onClose, initial, type, onSaved,
}: {
  open: boolean; onClose: () => void; initial: Habit | null;
  type: HabitType; onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? (type === "good" ? "🌱" : "🛡️"));
  const [color, setColor] = useState(initial?.color ?? HABIT_COLORS[0]);
  const [category, setCategory] = useState(initial?.category ?? "其他");
  const [freqType, setFreqType] = useState<FreqType>(initial?.freq_type ?? "daily");
  const [freqTarget, setFreqTarget] = useState(initial?.freq_target ?? 3);
  const [note, setNote] = useState(initial?.note ?? "");

  // 切换编辑对象/新建类型时重置
  const [lastKey, setLastKey] = useState<string | null>(null);
  const formKey = `${initial?.id ?? "new"}-${type}`;
  if (formKey !== lastKey) {
    setLastKey(formKey);
    setName(initial?.name ?? "");
    setEmoji(initial?.emoji ?? (type === "good" ? "🌱" : "🛡️"));
    setColor(initial?.color ?? HABIT_COLORS[0]); setCategory(initial?.category ?? "其他");
    setFreqType(initial?.freq_type ?? "daily"); setFreqTarget(initial?.freq_target ?? 3);
    setNote(initial?.note ?? "");
  }

  const save = async () => {
    if (!name.trim()) { toast.error("名称不能为空"); return; }
    if (initial) {
      await repo.updateHabit(initial.id, { name, emoji, color, category, freq_type: freqType, freq_target: freqTarget, note });
      toast.success("已更新");
    } else {
      await repo.createHabit({ type, name, emoji, color, category, freq_type: freqType, freq_target: freqTarget, note });
      toast.success("已添加");
    }
    onSaved();
  };

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={initial ? "更多设置" : `新增${type === "good" ? "优点" : "缺点"}`}>
      <Field label="名称">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="如：每天阅读30分钟" maxLength={30} />
      </Field>
      <Field label="图标">
        <EmojiPicker value={emoji} onChange={setEmoji} list={type === "good" ? EMOJIS_GOOD : EMOJIS_BAD} />
      </Field>
      <Field label="颜色">
        <ColorPicker value={color} onChange={setColor} list={HABIT_COLORS} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="分类">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="目标频率">
          <Select value={freqType} onChange={(e) => setFreqType(e.target.value as FreqType)}>
            <option value="daily">每天</option>
            <option value="weekly">每周N次</option>
            <option value="weekdays">仅工作日</option>
          </Select>
        </Field>
      </div>
      {freqType === "weekly" && (
        <Field label="每周次数">
          <TextInput type="number" min={1} max={7} value={freqTarget}
            onChange={(e) => setFreqTarget(Number(e.target.value))} />
        </Field>
      )}
      <Field label="备注（可选）">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={50} placeholder="补充说明" />
      </Field>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button onClick={save}>保存</Button>
      </div>
    </Modal>
  );
}
