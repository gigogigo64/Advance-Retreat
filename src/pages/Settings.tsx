import { useEffect, useState } from "react";
import { toast } from "sonner";
import * as repo from "../lib/repo";
import { getDb } from "../lib/db";
import { Button, Field, TextInput } from "../components/ui";

function useDark() {
  const [dark, setDark] = useState(document.documentElement.classList.contains("dark"));
  return {
    dark,
    toggle: (v: boolean) => {
      setDark(v);
      document.documentElement.classList.toggle("dark", v);
      repo.setSettingValue("theme_dark", v ? "1" : "0");
    },
  };
}

export function SettingsPage() {
  const { dark, toggle } = useDark();
  const [perCheckin, setPerCheckin] = useState(2);
  const [weeklyBonus, setWeeklyBonus] = useState(10);
  const [fullDay, setFullDay] = useState(5);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState("21:00");
  const [llmBase, setLlmBase] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    (async () => {
      setPerCheckin(Number(await repo.getSettingValue("points_per_checkin") || 2));
      setWeeklyBonus(Number(await repo.getSettingValue("points_weekly_bonus") || 10));
      setFullDay(Number(await repo.getSettingValue("points_full_day") || 5));
      setReminderEnabled((await repo.getSettingValue("reminder_enabled")) === "1");
      setReminderTime(await repo.getSettingValue("reminder_time") || "21:00");
      setLlmBase(await repo.getSettingValue("llm_base_url") || "https://dacint.tailae8db5.ts.net/v1");
      setLlmKey(await repo.getSettingValue("llm_api_key") || "");
      setLlmModel(await repo.getSettingValue("llm_model") || "GLM-5.3-Flash");
    })();
  }, []);

  const savePoints = async () => {
    await repo.setSettingValue("points_per_checkin", String(perCheckin));
    await repo.setSettingValue("points_weekly_bonus", String(weeklyBonus));
    await repo.setSettingValue("points_full_day", String(fullDay));
    toast.success("积分规则已保存");
  };

  const saveReminder = async () => {
    await repo.setSettingValue("reminder_enabled", reminderEnabled ? "1" : "0");
    await repo.setSettingValue("reminder_time", reminderTime);
    toast.success("提醒设置已保存");
  };

  const doExport = async () => {
    const data = await repo.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `知进退备份_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("备份已导出");
  };

  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      await repo.importAll(data);
      toast.success("导入成功，正在刷新…");
      setTimeout(() => location.reload(), 800);
    } catch {
      toast.error("文件格式无效");
    }
  };

  const resetAll = async () => {
    if (!confirm("确定清空所有数据？此操作不可恢复（建议先导出备份）")) return;
    const d = await getDb();
    for (const t of ["checkins", "habits", "daily_notes", "points_log", "redemptions", "rewards"])
      await d.execute(`DELETE FROM ${t}`);
    toast.success("已清空");
    setTimeout(() => location.reload(), 600);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">设置</h1>

      <div className="card p-5">
        <div className="font-semibold mb-3">🎨 外观</div>
        <div className="flex items-center justify-between">
          <span className="text-sm">深色模式</span>
          <button onClick={() => toggle(!dark)}
            className={`w-12 h-7 rounded-full transition-colors relative ${dark ? "bg-emerald-500" : "bg-[var(--border)]"}`}>
            <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${dark ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      </div>

      <div className="card p-5">
        <div className="font-semibold mb-3">⭐ 积分规则</div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="每次打卡"><TextInput type="number" min={0} value={perCheckin} onChange={(e) => setPerCheckin(Number(e.target.value))} /></Field>
          <Field label="连续7天全勤"><TextInput type="number" min={0} value={weeklyBonus} onChange={(e) => setWeeklyBonus(Number(e.target.value))} /></Field>
          <Field label="每日满分"><TextInput type="number" min={0} value={fullDay} onChange={(e) => setFullDay(Number(e.target.value))} /></Field>
        </div>
        <div className="text-right"><Button onClick={savePoints}>保存</Button></div>
      </div>

      <div className="card p-5">
        <div className="font-semibold mb-3">⏰ 每日提醒</div>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 text-sm pb-2">
            <input type="checkbox" checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)}
              className="w-4 h-4 accent-emerald-500" />
            启用
          </label>
          <Field label="提醒时间">
            <TextInput type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
          </Field>
          <div className="pb-0"><Button onClick={saveReminder}>保存</Button></div>
        </div>
        <div className="text-xs text-[var(--ink-soft)] mt-1">到点后若今日仍有未打卡项，将弹系统通知；全部完成则不打扰。</div>
      </div>

      <div className="card p-5">
        <div className="font-semibold mb-1">🤖 AI 助手（缺点→优点转化）</div>
        <div className="text-xs text-[var(--ink-soft)] mb-3">
          缺点 Boss 被击败后，AI 会把它改写成一个对应的好习惯。默认服务已内置，一般无需修改。
        </div>
        <div className="space-y-3">
          <Field label="接口地址（Base URL）">
            <TextInput value={llmBase} onChange={(e) => setLlmBase(e.target.value)} placeholder="https://…/v1" />
          </Field>
          <Field label="模型名称（注意大小写，如 GLM-5.3-Flash）">
            <TextInput value={llmModel} onChange={(e) => setLlmModel(e.target.value)} placeholder="GLM-5.3-Flash" />
          </Field>
          <Field label="API Key">
            <div className="flex gap-2">
              <TextInput type={showKey ? "text" : "password"} value={llmKey} onChange={(e) => setLlmKey(e.target.value)} placeholder="um-share-…" />
              <Button variant="soft" className="shrink-0" onClick={() => setShowKey(!showKey)}>{showKey ? "隐藏" : "显示"}</Button>
            </div>
          </Field>
          <div className="text-right">
            <Button onClick={async () => {
              await repo.setSettingValue("llm_base_url", llmBase.trim());
              await repo.setSettingValue("llm_api_key", llmKey.trim());
              await repo.setSettingValue("llm_model", llmModel.trim());
              toast.success("AI 设置已保存");
            }}>保存</Button>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="font-semibold mb-3">💾 数据</div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="soft" onClick={doExport}>导出备份 (JSON)</Button>
          <label className="px-4 py-2 rounded-xl text-sm font-medium bg-[var(--surface-2)] hover:brightness-95 cursor-pointer transition-all active:scale-95">
            导入备份
            <input type="file" accept=".json" className="hidden"
              onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
          </label>
          <Button variant="danger" onClick={resetAll}>清空数据</Button>
        </div>
        <div className="text-xs text-[var(--ink-soft)] mt-2">数据存储于本机 SQLite（%APPDATA%/知进退/），不联网、不采集。</div>
      </div>

      <div className="text-center text-xs text-[var(--ink-soft)] py-4">
        知进退 · Advance & Retreat v0.1.0 — 培养优点，抵制缺点
      </div>
    </div>
  );
}
