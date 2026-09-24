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

  return (
    <Ctx.Provider value={{ habits, checkins, points, refresh, loading }}>
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
