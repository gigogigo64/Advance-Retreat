import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import * as repo from "./repo";
import { todayStr } from "./types";
import type { Habit, Checkin } from "./types";

/**
 * 提醒调度：每30秒检查一次是否到达提醒时间。
 * 到点且今日有未完成打卡 → 发系统通知；全完成不打扰。每日最多提醒一次。
 */
export function startReminderLoop(getHabits: () => Habit[], getCheckins: () => Checkin[]) {
  let lastRemindedDate = "";
  setInterval(async () => {
    try {
      const enabled = await repo.getSettingValue("reminder_enabled");
      if (enabled !== "1") return;
      const time = await repo.getSettingValue("reminder_time"); // "HH:MM"
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (hhmm < time) return;
      const today = todayStr();
      if (lastRemindedDate === today) return;

      const habits = getHabits().filter((h) => !h.archived && isDueToday(h, now));
      const done = new Set(getCheckins().filter((c) => c.date === today).map((c) => c.habit_id));
      const pending = habits.filter((h) => !done.has(h.id));
      if (!pending.length) return; // 全完成，不打扰

      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
      if (granted) {
        sendNotification({
          title: "知进退 · 今日还未完成打卡",
          body: `还有 ${pending.length} 项没完成：${pending.slice(0, 3).map((h) => h.name).join("、")}${pending.length > 3 ? " 等" : ""}`,
        });
        lastRemindedDate = today;
      }
    } catch {
      /* 静默失败 */
    }
  }, 30_000);
}

function isDueToday(h: Habit, now: Date): boolean {
  if (h.freq_type === "weekdays") {
    const day = now.getDay();
    return day >= 1 && day <= 5;
  }
  return true; // daily / weekly 目标次数按周统计，提醒一律触发
}
