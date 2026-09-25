import { getDb } from "./db";
import type { Habit, Checkin, Reward, Redemption, HabitType, FreqType } from "./types";
import { todayStr } from "./types";

/* ---------------- habits ---------------- */

export async function listHabits(archived = false): Promise<Habit[]> {
  const d = await getDb();
  return d.select<Habit[]>(
    "SELECT * FROM habits WHERE archived = ? ORDER BY type DESC, sort_order, id",
    [archived ? 1 : 0]
  );
}

export async function createHabit(h: {
  type: HabitType; name: string; emoji: string; color: string;
  category: string; freq_type: FreqType; freq_target: number; note: string;
  hp_max?: number; hp_step?: number; points?: number;
}): Promise<number> {
  const d = await getDb();
  // 排到同类末尾
  const maxRow = await d.select<{ m: number | null }[]>(
    "SELECT MAX(sort_order) as m FROM habits WHERE type = ?", [h.type]
  );
  const r = await d.execute(
    `INSERT INTO habits (type, name, emoji, color, category, freq_type, freq_target, start_date, note, sort_order, hp_max, hp_step, points)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [h.type, h.name, h.emoji, h.color, h.category, h.freq_type, h.freq_target, todayStr(), h.note,
     (maxRow[0]?.m ?? 0) + 1, h.hp_max ?? 100, h.hp_step ?? 3, h.points ?? 2]
  );
  return r.lastInsertId as number;
}

export async function updateHabit(id: number, h: Partial<Habit>): Promise<void> {
  const d = await getDb();
  const keys = Object.keys(h).filter((k) => k !== "id" && k !== "created_at");
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  await d.execute(`UPDATE habits SET ${sets} WHERE id = ?`, [
    ...keys.map((k) => (h as Record<string, unknown>)[k]),
    id,
  ]);
}

export async function archiveHabit(id: number, archived: boolean): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE habits SET archived = ? WHERE id = ?", [archived ? 1 : 0, id]);
}

export async function deleteHabit(id: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM habits WHERE id = ?", [id]);
}

/** 按 id 取单条习惯（不存在返回 null） */
export async function getHabit(id: number): Promise<Habit | null> {
  const d = await getDb();
  const r = await d.select<Habit[]>("SELECT * FROM habits WHERE id = ?", [id]);
  return r.length ? r[0] : null;
}

/** 保存同类内的新顺序（传入该 type 全部 id，按新顺序） */
export async function reorderHabits(_type: HabitType, orderedIds: number[]): Promise<void> {
  const d = await getDb();
  await d.execute("BEGIN");
  try {
    for (let i = 0; i < orderedIds.length; i++)
      await d.execute("UPDATE habits SET sort_order = ? WHERE id = ?", [i + 1, orderedIds[i]]);
    await d.execute("COMMIT");
  } catch (e) {
    await d.execute("ROLLBACK");
    throw e;
  }
}

/* ---------------- checkins ---------------- */

export async function listCheckinsBetween(from: string, to: string): Promise<Checkin[]> {
  const d = await getDb();
  return d.select<Checkin[]>(
    "SELECT id, habit_id, date FROM checkins WHERE date BETWEEN ? AND ?",
    [from, to]
  );
}

export async function listCheckinsByHabit(habitId: number): Promise<Checkin[]> {
  const d = await getDb();
  return d.select<Checkin[]>(
    "SELECT id, habit_id, date FROM checkins WHERE habit_id = ? ORDER BY date",
    [habitId]
  );
}

export async function toggleCheckin(habitId: number, date: string): Promise<boolean> {
  const d = await getDb();
  const existing = await d.select<{ id: number }[]>(
    "SELECT id FROM checkins WHERE habit_id = ? AND date = ?",
    [habitId, date]
  );
  if (existing.length) {
    await d.execute("DELETE FROM checkins WHERE id = ?", [existing[0].id]);
    return false; // 取消打卡
  }
  await d.execute("INSERT INTO checkins (habit_id, date) VALUES (?, ?)", [habitId, date]);
  return true; // 新增打卡
}

export async function isCheckinAllowed(date: string): Promise<boolean> {
  // 补卡禁止：只允许今天（未来日期也不允许）
  return date === todayStr();
}

/* ---------------- daily note ---------------- */

export async function getDailyNote(date: string): Promise<string> {
  const d = await getDb();
  const r = await d.select<{ content: string }[]>(
    "SELECT content FROM daily_notes WHERE date = ?", [date]
  );
  return r.length ? r[0].content : "";
}

export async function saveDailyNote(date: string, content: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO daily_notes (date, content) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET content = excluded.content, updated_at = datetime('now','localtime')`,
    [date, content]
  );
}

/* ---------------- points ---------------- */

export async function pointsBalance(): Promise<number> {
  const d = await getDb();
  const r = await d.select<{ total: number | null }[]>(
    "SELECT SUM(delta) as total FROM points_log"
  );
  return r[0]?.total ?? 0;
}

export async function addPoints(delta: number, reason: string, date: string): Promise<void> {
  const d = await getDb();
  await d.execute("INSERT INTO points_log (delta, reason, date) VALUES (?,?,?)", [delta, reason, date]);
}

/** 某日、指定原因集合的积分净额（定向查询，避免全库导出） */
export async function sumPointsByDate(date: string, reasons: string[]): Promise<number> {
  if (!reasons.length) return 0;
  const d = await getDb();
  const ph = reasons.map(() => "?").join(",");
  const r = await d.select<{ total: number | null }[]>(
    `SELECT SUM(delta) as total FROM points_log WHERE date = ? AND reason IN (${ph})`,
    [date, ...reasons]
  );
  return r[0]?.total ?? 0;
}

export async function getSettingValue(key: string): Promise<string> {
  const d = await getDb();
  const r = await d.select<{ value: string }[]>("SELECT value FROM settings WHERE key = ?", [key]);
  return r.length ? r[0].value : "";
}

export async function setSettingValue(key: string, value: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}

/* ---------------- rewards ---------------- */

export async function listRewards(archived = false): Promise<Reward[]> {
  const d = await getDb();
  return d.select<Reward[]>("SELECT * FROM rewards WHERE archived = ? ORDER BY cost", [archived ? 1 : 0]);
}

export async function createReward(name: string, cost: number, emoji: string): Promise<void> {
  const d = await getDb();
  await d.execute("INSERT INTO rewards (name, cost, emoji) VALUES (?,?,?)", [name, cost, emoji]);
}

export async function updateReward(id: number, name: string, cost: number, emoji: string): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE rewards SET name=?, cost=?, emoji=? WHERE id=?", [name, cost, emoji, id]);
}

export async function archiveReward(id: number, archived: boolean): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE rewards SET archived=? WHERE id=?", [archived ? 1 : 0, id]);
}

export async function redeemReward(r: Reward): Promise<void> {
  const d = await getDb();
  await d.execute("INSERT INTO redemptions (reward_id, reward_name, cost, date) VALUES (?,?,?,?)",
    [r.id, r.name, r.cost, todayStr()]);
  await addPoints(-r.cost, `兑换奖励「${r.name}」`, todayStr());
}

export async function listRedemptions(): Promise<Redemption[]> {
  const d = await getDb();
  return d.select<Redemption[]>("SELECT id, reward_name, cost, date FROM redemptions ORDER BY created_at DESC");
}

/* ---------------- export / import ---------------- */

export interface BackupData {
  habits: Habit[];
  checkins: Checkin[];
  daily_notes: { date: string; content: string }[];
  points_log: { delta: number; reason: string; date: string }[];
  rewards: Reward[];
  redemptions: Redemption[];
  settings: { key: string; value: string }[];
}

export async function exportAll(): Promise<BackupData> {
  const d = await getDb();
  return {
    habits: await d.select<Habit[]>("SELECT * FROM habits"),
    checkins: await d.select<Checkin[]>("SELECT id, habit_id, date FROM checkins"),
    daily_notes: await d.select("SELECT date, content FROM daily_notes"),
    points_log: await d.select("SELECT delta, reason, date FROM points_log"),
    rewards: await d.select<Reward[]>("SELECT * FROM rewards"),
    redemptions: await d.select<Redemption[]>("SELECT * FROM redemptions"),
    settings: await d.select("SELECT key, value FROM settings"),
  };
}

export async function importAll(data: BackupData): Promise<void> {
  const d = await getDb();
  await d.execute("BEGIN");
  try {
    await d.execute("DELETE FROM checkins"); await d.execute("DELETE FROM habits");
    await d.execute("DELETE FROM daily_notes"); await d.execute("DELETE FROM points_log");
    await d.execute("DELETE FROM redemptions"); await d.execute("DELETE FROM rewards");
    for (const h of data.habits ?? [])
      await d.execute(
        `INSERT INTO habits (id, type, name, emoji, color, category, freq_type, freq_target, start_date, note, archived, sort_order, hp, hp_max, hp_step, points)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [h.id, h.type, h.name, h.emoji, h.color, h.category, h.freq_type, h.freq_target, h.start_date, h.note, h.archived,
         (h as Partial<Habit>).sort_order ?? h.id, (h as Partial<Habit>).hp ?? 100,
         (h as Partial<Habit>).hp_max ?? 100, (h as Partial<Habit>).hp_step ?? 3, (h as Partial<Habit>).points ?? 2]
      );
    for (const c of data.checkins ?? [])
      await d.execute("INSERT OR IGNORE INTO checkins (habit_id, date) VALUES (?,?)", [c.habit_id, c.date]);
    for (const n of data.daily_notes ?? [])
      await d.execute("INSERT OR IGNORE INTO daily_notes (date, content) VALUES (?,?)", [n.date, n.content]);
    for (const p of data.points_log ?? [])
      await d.execute("INSERT INTO points_log (delta, reason, date) VALUES (?,?,?)", [p.delta, p.reason, p.date]);
    for (const r of data.rewards ?? [])
      await d.execute("INSERT INTO rewards (id, name, cost, emoji, archived) VALUES (?,?,?,?,?)",
        [r.id, r.name, r.cost, r.emoji, r.archived]);
    for (const r of data.redemptions ?? [])
      await d.execute("INSERT INTO redemptions (reward_id, reward_name, cost, date) VALUES (?,?,?,?)",
        [r.reward_id, r.reward_name, r.cost, r.date]);
    for (const s of data.settings ?? [])
      await d.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)", [s.key, s.value]);
    await d.execute("COMMIT");
  } catch (e) {
    await d.execute("ROLLBACK");
    throw e;
  }
}
