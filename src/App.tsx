import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AppProvider, useApp } from "./lib/store";
import { startReminderLoop } from "./lib/reminder";
import { TodayPage } from "./pages/Today";
import { StatsPage } from "./pages/Stats";
import { HabitsPage } from "./pages/Habits";
import { RewardsPage } from "./pages/Rewards";
import { SettingsPage } from "./pages/Settings";
import { Toaster } from "sonner";

type PageId = "today" | "stats" | "habits" | "rewards" | "settings";

const NAV: { id: PageId; label: string; icon: string }[] = [
  { id: "today", label: "今日", icon: "📅" },
  { id: "stats", label: "统计", icon: "📊" },
  { id: "habits", label: "清单", icon: "📋" },
  { id: "rewards", label: "奖励", icon: "🎁" },
  { id: "settings", label: "设置", icon: "⚙️" },
];

export default function App() {
  return (
    <AppProvider>
      <Shell />
      <Toaster position="top-center" richColors />
    </AppProvider>
  );
}

function Shell() {
  const app = useApp();
  const { points, habits, checkins, loading } = app;
  const snapshot = { habits, checkins };
  const [page, setPage] = useState<PageId>("today");
  const [reminderOn, setReminderOn] = useState(false);

  useEffect(() => {
    if (!loading && !reminderOn) {
      setReminderOn(true);
      startReminderLoop(
        () => snapshot.habits,
        () => snapshot.checkins
      );
    }
  }, [loading, reminderOn]);

  return (
    <div className="flex h-full">
      {/* 侧边栏 */}
      <aside className="w-20 md:w-52 shrink-0 border-r border-[var(--border)] bg-[var(--surface)]
        flex flex-col py-4 px-2 md:px-3">
        <div className="flex items-center gap-2 px-2 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-indigo-500
            flex items-center justify-center text-white font-bold shadow-md shrink-0">知</div>
          <div className="hidden md:block">
            <div className="font-bold text-sm leading-tight">知进退</div>
            <div className="text-[10px] text-[var(--ink-soft)]">Advance & Retreat</div>
          </div>
        </div>

        <nav className="flex-1 flex md:flex-col gap-1 md:gap-1 items-center md:items-stretch justify-around">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setPage(n.id)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-colors ${page === n.id ? "text-emerald-600" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"}`}>
              {page === n.id && (
                <motion.span layoutId="nav-pill"
                  className="absolute inset-0 rounded-xl bg-emerald-500/12"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }} />
              )}
              <span className="text-lg relative z-10">{n.icon}</span>
              <span className="hidden md:inline relative z-10">{n.label}</span>
            </button>
          ))}
        </nav>

        <div className="hidden md:block px-2 py-3 rounded-xl bg-amber-400/10 text-amber-600 text-center">
          <div className="text-lg font-bold">⭐ {points}</div>
          <div className="text-[10px] text-[var(--ink-soft)]">当前积分</div>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="flex-1 overflow-y-auto">
        {page === "today" && <TodayPage />}
        {page === "stats" && <StatsPage />}
        {page === "habits" && <HabitsPage />}
        {page === "rewards" && <RewardsPage />}
        {page === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
