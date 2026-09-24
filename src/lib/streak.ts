import { listCheckinsByHabit } from "./repo";

export interface StreakResult {
  current: number;
  longest: number;
}

/** 计算某习惯的当前连续 & 最长连续（基于打卡日期集合，针对“避开/坚持”的打卡） */
export async function streaks(habitId: number, freqType: string): Promise<StreakResult> {
  const rows = await listCheckinsByHabit(habitId);
  const dates = new Set(rows.map((r) => r.date));
  if (!dates.size) return { current: 0, longest: 0 };

  const sorted = [...dates].sort();
  const toDate = (s: string) => new Date(s + "T00:00:00");

  // 最长连续
  let longest = 1, run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = (toDate(sorted[i]).getTime() - toDate(sorted[i - 1]).getTime()) / 86400000;
    if (diff === 1) { run++; longest = Math.max(longest, run); }
    else run = 1;
  }

  // 当前连续：从今天（或昨天，若今天尚未打卡）往回数，跳过非目标日
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let cur = 0;
  const cursor = new Date(today);
  if (!dates.has(fmt(cursor))) cursor.setDate(cursor.getDate() - 1); // 今天没打，从昨天算
  while (cursor >= toDate(sorted[0])) {
    if (dates.has(fmt(cursor))) { cur++; cursor.setDate(cursor.getDate() - 1); continue; }
    if (isTargetDay(freqType, cursor)) break; // 该打卡而未打 → 断
    cursor.setDate(cursor.getDate() - 1);     // 非目标日跳过
  }
  return { current: cur, longest };
}

export function fmt(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isTargetDay(freqType: string, d: Date): boolean {
  if (freqType === "daily") return true;
  if (freqType === "weekdays") return d.getDay() >= 1 && d.getDay() <= 5;
  return true; // weekly 由完成率另行计算，streak 按自然日
}
