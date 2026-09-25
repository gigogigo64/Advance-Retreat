import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('good','bad')),
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '🌱',
  color TEXT DEFAULT '#10b981',
  category TEXT DEFAULT '其他',
  freq_type TEXT NOT NULL DEFAULT 'daily' CHECK(freq_type IN ('daily','weekly','weekdays')),
  freq_target INTEGER DEFAULT 7,
  start_date TEXT NOT NULL,
  note TEXT DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  hp INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(habit_id, date),
  FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS points_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cost INTEGER NOT NULL,
  emoji TEXT DEFAULT '🎁',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reward_id INTEGER NOT NULL,
  reward_name TEXT NOT NULL,
  cost INTEGER NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(date);
CREATE INDEX IF NOT EXISTS idx_checkins_habit ON checkins(habit_id);
`;

/** 获取数据库单例 */
export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:advance-retreat.db");
    // 老库升级：v0.1 只有基础列，补充 v0.2 新增的 sort_order / hp
    const cols = await db.select<{
      name: string;
    }[]>("PRAGMA table_info(habits)");
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("sort_order"))
      await db.execute("ALTER TABLE habits ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
    if (!names.has("hp"))
      await db.execute("ALTER TABLE habits ADD COLUMN hp INTEGER NOT NULL DEFAULT 100");
    await db.execute(SCHEMA);
    // 默认积分规则
    await db.execute(
      `INSERT OR IGNORE INTO settings(key, value) VALUES
        ('points_per_checkin', '2'),
        ('points_weekly_bonus', '10'),
        ('points_full_day', '5'),
        ('theme', 'system'),
        ('reminder_enabled', '1'),
        ('reminder_time', '21:00'),
        ('llm_base_url', 'https://dacint.tailae8db5.ts.net/v1'),
        ('llm_api_key', 'um-share-ZLGH16Jx048VwokN71gkWVVzFRtSH2ULlb_BD7CkPRw'),
        ('llm_model', 'GLM-5.3-Flash')`
    );
    // 老库已有数据时，按 type 填充初始 sort_order
    await db.execute(
      `UPDATE habits SET sort_order = id WHERE sort_order = 0`
    );
  }
  return db;
}

export async function getSetting(key: string): Promise<string> {
  const d = await getDb();
  const r = await d.select<[string]>("SELECT value FROM settings WHERE key = ?", [key]);
  return r.length ? JSON.parse(r[0] as unknown as string) ?? "" : "";
}
