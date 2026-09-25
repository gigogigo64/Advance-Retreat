export type HabitType = "good" | "bad";
export type FreqType = "daily" | "weekly" | "weekdays";

export interface Habit {
  id: number;
  type: HabitType;
  name: string;
  emoji: string;
  color: string;
  category: string;
  freq_type: FreqType;
  freq_target: number;
  start_date: string;
  note: string;
  archived: number;
  /** 列表排序（值越小越靠前） */
  sort_order: number;
  /** 缺点 Boss 当前生命值（0~hp_max，仅 type=bad 有效） */
  hp: number;
  /** 缺点 Boss 血量上限 */
  hp_max: number;
  /** 缺点 Boss 每次成功避开扣除的血量 */
  hp_step: number;
  /** 每条习惯完成打卡得分 */
  points: number;
  created_at: string;
}

export interface Checkin {
  id: number;
  habit_id: number;
  date: string;
}

export interface Reward {
  id: number;
  name: string;
  cost: number;
  emoji: string;
  archived: number;
}

export interface Redemption {
  id: number;
  reward_id: number;
  reward_name: string;
  cost: number;
  date: string;
}

export interface DailyNote {
  date: string;
  content: string;
}

/** YYYY-MM-DD（本地时区） */
export function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dateOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return todayStr(d);
}

export const CATEGORIES = ["健康", "学习", "社交", "情绪", "其他"];

export const EMOJIS_GOOD = ["🌱", "📚", "🏃", "💪", "🧘", "💧", "☀️", "🍎", "✍️", "🎧", "🛏️", "🚀"];
export const EMOJIS_BAD = ["🛡️", "🚭", "📵", "🍰", "🎮", "🛒", "🍺", "😴", "😤", "📺", "🧨", "⏰"];

export const HABIT_COLORS = [
  "#10b981", "#6366f1", "#f59e0b", "#f43f5e",
  "#06b6d4", "#8b5cf6", "#ec4899", "#84cc16",
];
