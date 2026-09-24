import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useApp } from "../lib/store";
import * as repo from "../lib/repo";
import { EMOJIS_GOOD, type Reward, type Redemption } from "../lib/types";
import { Modal, Button, Field, TextInput } from "../components/ui";

export function RewardsPage() {
  const { points, refresh } = useApp();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [history, setHistory] = useState<Redemption[]>([]);
  const [editing, setEditing] = useState<Reward | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setRewards(await repo.listRewards());
    setHistory(await repo.listRedemptions());
  };
  useEffect(() => { load(); }, []);

  const redeem = async (r: Reward) => {
    if (points < r.cost) { toast.error(`积分不足，还差 ${r.cost - points} 分`); return; }
    await repo.redeemReward(r);
    toast.success(`🎁 已兑换「${r.name}」，好好享受！`);
    await Promise.all([load(), refresh()]);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">奖励</h1>
          <div className="text-sm text-[var(--ink-soft)] mt-1">用坚持换来的积分，兑换给自己的礼物</div>
        </div>
        <div className="flex items-center gap-3">
          <motion.div key={points} initial={{ scale: 1.15 }} animate={{ scale: 1 }}
            className="px-4 py-2 rounded-2xl bg-amber-400/15 text-amber-600 font-bold">
            ⭐ {points} 分
          </motion.div>
          <Button onClick={() => setCreating(true)}>+ 新增愿望</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {rewards.length === 0 && (
          <div className="card p-10 text-center text-[var(--ink-soft)] sm:col-span-2 lg:col-span-3">
            还没有愿望，点「新增愿望」给自己定个奖励吧
          </div>
        )}
        {rewards.map((r) => {
          const affordable = points >= r.cost;
          return (
            <div key={r.id} className={`card p-4 flex flex-col gap-2 ${affordable ? "" : "opacity-70"}`}>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{r.emoji}</span>
                <span className="font-semibold text-sm flex-1 truncate">{r.name}</span>
              </div>
              <div className="text-amber-600 text-sm font-bold">⭐ {r.cost} 分</div>
              <div className="flex gap-2 mt-1">
                <Button className="flex-1" disabled={!affordable} onClick={() => redeem(r)}>
                  {affordable ? "兑换" : `还差 ${r.cost - points}`}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(r)}>编辑</Button>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="font-semibold mb-3">兑换记录</h2>
      {history.length === 0 ? (
        <div className="text-sm text-[var(--ink-soft)]">还没有兑换记录</div>
      ) : (
        <div className="card divide-y divide-[var(--border)]">
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>🎁 {h.reward_name}</span>
              <span className="text-[var(--ink-soft)]">{h.date} · -{h.cost} 分</span>
            </div>
          ))}
        </div>
      )}

      <RewardForm
        open={creating || !!editing}
        initial={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={async () => { await load(); setCreating(false); setEditing(null); }}
      />
    </div>
  );
}

function RewardForm({ open, initial, onClose, onSaved }: {
  open: boolean; initial: Reward | null; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [cost, setCost] = useState(50);
  const [emoji, setEmoji] = useState("🎁");
  const [lastId, setLastId] = useState<number | null>(null);
  if ((initial?.id ?? null) !== lastId) {
    setLastId(initial?.id ?? null);
    setName(initial?.name ?? ""); setCost(initial?.cost ?? 50); setEmoji(initial?.emoji ?? "🎁");
  }

  const save = async () => {
    if (!name.trim() || cost <= 0) { toast.error("请填写名称和有效积分"); return; }
    if (initial) { await repo.updateReward(initial.id, name, cost, emoji); toast.success("已更新"); }
    else { await repo.createReward(name, cost, emoji); toast.success("愿望已添加"); }
    onSaved();
  };

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={initial ? "编辑愿望" : "新增愿望"}>
      <Field label="奖励名称">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="如：看一场电影" maxLength={30} />
      </Field>
      <Field label="所需积分">
        <TextInput type="number" min={1} value={cost} onChange={(e) => setCost(Number(e.target.value))} />
      </Field>
      <Field label="图标">
        <div className="flex flex-wrap gap-1.5">
          {[...EMOJIS_GOOD.slice(0, 6), "🎁", "🎬", "🍰", "🎮", "🧳", "☕", "🎪", "💎"].map((e) => (
            <button key={e} type="button" onClick={() => setEmoji(e)}
              className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center
                ${emoji === e ? "bg-emerald-500/15 ring-2 ring-emerald-400" : "hover:bg-[var(--surface-2)]"}`}>
              {e}
            </button>
          ))}
        </div>
      </Field>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button onClick={save}>保存</Button>
      </div>
    </Modal>
  );
}
