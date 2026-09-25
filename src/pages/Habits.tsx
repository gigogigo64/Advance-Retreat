import { useState } from "react";
import { useApp } from "../lib/store";
import * as repo from "../lib/repo";
import { CATEGORIES, EMOJIS_BAD, EMOJIS_GOOD, HABIT_COLORS, type FreqType, type HabitType } from "../lib/types";
import type { Habit } from "../lib/types";
import { Modal, Button, Field, TextInput, Select, EmojiPicker, ColorPicker } from "../components/ui";
import { toast } from "sonner";

export function HabitsPage() {
  const { habits, refresh } = useApp();
  const [tab, setTab] = useState<HabitType>("good");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [creating, setCreating] = useState(false);


  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold">清单管理</h1>
        <div className="flex gap-2">
          <Button variant="soft" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "隐藏已归档" : "显示已归档"}
          </Button>
          <Button onClick={() => setCreating(true)}>+ 新增{tab === "good" ? "优点" : "缺点"}</Button>
        </div>
      </div>

      {/* 优/缺 切换 */}
      <div className="inline-flex bg-[var(--surface-2)] rounded-2xl p-1 mb-5">
        {(["good", "bad"] as HabitType[]).map((t) => (
          <button key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-1.5 rounded-xl text-sm font-medium transition-all
              ${tab === t ? "bg-[var(--surface)] shadow-sm" : "text-[var(--ink-soft)]"}`}>
            {t === "good" ? "🌱 优点" : "🛡️ 缺点"}
          </button>
        ))}
      </div>

      {/* 左右两栏：优点 | 缺点 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {(["good","bad"] as HabitType[]).map((colType) => {
          const col = habits.filter((h) => h.type === colType && (showArchived || !h.archived));
          return (
        <div key={colType} className="min-w-0">
          <div className="flex items-baseline gap-2 mb-3">
            <span className={`font-bold ${colType === "good" ? "text-emerald-600" : "text-rose-500"}`}>
              {colType === "good" ? "🌱 优点" : "🛡️ 缺点"}
            </span>
            <span className="text-xs text-[var(--ink-soft)]">{col.length} 项</span>
          </div>
          <div className="space-y-2.5">
            {col.length === 0 && (
              <div className="card p-6 text-center text-[var(--ink-soft)] text-sm">
                还没有{colType === "good" ? "优点" : "缺点"}，点右上角「新增{colType === "good" ? "优点" : "缺点"}」开始
              </div>
            )}
            {col.map((h) => (
          <div key={h.id} className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{ background: `${h.color}22` }}>
              {h.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{h.name}</span>
                {h.archived ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--ink-soft)]">已归档</span> : null}
              </div>
              <div className="text-xs text-[var(--ink-soft)] mt-0.5">
                {h.category} · {freqLabel(h)}{h.note ? ` · ${h.note}` : ""}
              </div>
            </div>
            <Button variant="ghost" onClick={() => setEditing(h)}>编辑</Button>
          </div>
            ))}
          </div>
        </div>
          );
        })}
      </div>

      <HabitForm
        open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        initial={editing}
        type={tab}
        onSaved={async () => { await refresh(); setCreating(false); setEditing(null); }}
      />
    </div>
  );
}

function freqLabel(h: Habit): string {
  if (h.freq_type === "daily") return "每天";
  if (h.freq_type === "weekdays") return "仅工作日";
  return `每周 ${h.freq_target} 次`;
}

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

  // 切换编辑对象时重置
  const [lastId, setLastId] = useState<number | null>(null);
  if ((initial?.id ?? null) !== lastId) {
    setLastId(initial?.id ?? null);
    setName(initial?.name ?? ""); setEmoji(initial?.emoji ?? "🌱");
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
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={initial ? "编辑项目" : `新增${type === "good" ? "优点" : "缺点"}`}>
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
      <div className="flex justify-between mt-5">
        <div>
          {initial && (
            <Button variant="danger" onClick={async () => {
              if (!initial.archived) { await repo.archiveHabit(initial.id, true); toast.success("已归档"); }
              else { await repo.deleteHabit(initial.id); toast.success("已彻底删除"); }
              onSaved();
            }}>
              {initial.archived ? "彻底删除" : "归档"}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={save}>保存</Button>
        </div>
      </div>
    </Modal>
  );
}
