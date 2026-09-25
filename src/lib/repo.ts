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
}): Promise<number> {
  const d = await getDb();
  // 排到同类末尾
  const maxRow = await d.select<{ m: number | null }[]>(
    "SELECT MAX(sort_order) as m FROM habits WHERE type = ?", [h.type]
  );
  const r = await d.execute(
    `INSERT INTO habits (type, name, emoji, color, category, freq_type, freq_target, start_date, note, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [h.type, h.name, h.emoji, h.color, h.category, h.freq_type, h.freq_target, todayStr(), h.note,
     (maxRow[0]?.m ?? 0) + 1]
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

/* ---------------- LLM（缺点→优点智能转化） ---------------- */

export interface LlmSuggestion {
  name: string;
  emoji: string;
  note: string;
}

/**
 * 调用外接 LLM，把坏习惯改写为对应的好习惯。
 * 走 Tauri http 插件（绕过 WebView CORS），模型返回纯 JSON。
 */
export async function suggestGoodHabit(badName: string, badNote: string): Promise<LlmSuggestion> {
  const [baseUrl, apiKey, model] = await Promise.all([
    getSettingValue("llm_base_url"),
    getSettingValue("llm_api_key"),
    getSettingValue("llm_model"),
  ]);
  if (!baseUrl || !apiKey || !model)
    throw new Error("未配置 LLM，请到设置页填写");

  const sys =
    "你是习惯养成教练。用户会给出一个坏习惯，你要把它改写成一个具体、可执行、可打卡的对应好习惯。" +
    '严格只输出一个 JSON 对象，不要任何其他文字：{"name":"好习惯名(不超过14字)","emoji":"单个emoji","note":"一句执行建议(不超过20字)"}';
  const user = `坏习惯：${badName}${badNote ? `（${badNote}）` : ""}`;

  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      max_tokens: 200,
      temperature: 0.6,
    }),
  });
  if (!resp.ok) throw new Error(`LLM 请求失败 (${resp.status})`);
  const data = await resp.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("LLM 返回格式异常");
  const obj = JSON.parse(m[0]) as Partial<LlmSuggestion>;
  if (!obj.name) throw new Error("LLM 未返回有效名称");
  return {
    name: String(obj.name).slice(0, 20),
    emoji: obj.emoji && String(obj.emoji).length <= 4 ? String(obj.emoji) : "🌱",
    note: obj.note ? String(obj.note).slice(0, 50) : "",
  };
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
        `INSERT INTO habits (id, type, name, emoji, color, category, freq_type, freq_target, start_date, note, archived, sort_order, hp)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [h.id, h.type, h.name, h.emoji, h.color, h.category, h.freq_type, h.freq_target, h.start_date, h.note, h.archived,
         (h as Partial<Habit>).sort_order ?? h.id, (h as Partial<Habit>).hp ?? 100]
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
