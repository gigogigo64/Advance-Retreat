import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as repo from "./repo";
import { todayStr } from "./types";
import type { Habit, Checkin } from "./types";

interface AppState {
  habits: Habit[];
  checkins: Checkin[];       // 近120天
  points: number;
  refresh: () => Promise<void>;
  loading: boolean;
  /** 乐观更新：点击打卡后立即反映到本地状态，无需等待后台对账 */
  applyCheckin: (habitId: number, date: string, done: boolean) => void;
}

const Ctx = createContext<AppState>(null!);

export function AppProvider({ children }: { children: ReactNode }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const [h, c, p] = await Promise.all([
      repo.listHabits(),
      repo.listCheckinsBetween(offsetStr(-120), offsetStr(1)),
      repo.pointsBalance(),
    ]);
    setHabits(h);
    setCheckins(c);
    setPoints(p);
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const applyCheckin = (habitId: number, date: string, done: boolean) => {
    setCheckins((prev) => {
      const exists = prev.some((c) => c.habit_id === habitId && c.date === date);
      if (done) return exists ? prev : [...prev, { id: -Date.now(), habit_id: habitId, date }];
      return exists ? prev.filter((c) => !(c.habit_id === habitId && c.date === date)) : prev;
    });
  };

  return (
    <Ctx.Provider value={{ habits, checkins, points, refresh, loading, applyCheckin }}>
      {children}
    </Ctx.Provider>
  );
}

function offsetStr(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return todayStr(d);
}

export function useApp(): AppState {
  return useContext(Ctx);
}
