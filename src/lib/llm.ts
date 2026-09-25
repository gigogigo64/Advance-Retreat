/**
 * 缺点 Boss 智能转化 —— 数据操作型 LLM 工具调用。
 *
 * 设计见 docs/规范.md 第 14/15 节、dev/03-Boss智能转化.md。
 * - 请求统一走 tauri-plugin-http（绕开 WebView CORS），能力 scope 见 capabilities/default.json
 * - 采用 OpenAI 兼容的 tools + tool_calls 循环，客户端执行工具并做守门校验
 * - 记录本次会话的变更，支持一键撤销
 * - 降级链：原生 tool_calls → 纯文本 JSON 建议 → 失败提示手填
 */
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import * as repo from "./repo";
import { CATEGORIES, type FreqType, type Habit } from "./types";

/* ================= 类型 ================= */

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ChatTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface AgentStep {
  type: "tool" | "text";
  name?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  text?: string;
}

export interface ConversionResult {
  ok: boolean;
  summary: string;
  steps: AgentStep[];
  createdHabitIds: number[];
  archivedHabitIds: number[];
  source: "tools" | "json" | "none";
}

export interface LlmSuggestion {
  name: string;
  emoji: string;
  note: string;
}

/* ================= 配置与底层请求 ================= */

async function llmConfig() {
  const [baseUrl, apiKey, model] = await Promise.all([
    repo.getSettingValue("llm_base_url"),
    repo.getSettingValue("llm_api_key"),
    repo.getSettingValue("llm_model"),
  ]);
  return {
    baseUrl: baseUrl.trim().replace(/\/$/, ""),
    apiKey: apiKey.trim(),
    model: model.trim(),
  };
}

/** 底层对话请求（走 Tauri http 插件） */
async function chat(
  messages: ChatMessage[],
  tools?: ChatTool[]
): Promise<{ message: ChatMessage | null; raw: string }> {
  const { baseUrl, apiKey, model } = await llmConfig();
  if (!baseUrl || !apiKey || !model) throw new Error("未配置 AI 服务，请到设置页填写");

  const resp = await tauriFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      ...(tools && tools.length ? { tools, tool_choice: "auto" } : {}),
      max_tokens: 600,
      temperature: 0.5,
    }),
  });
  if (!resp.ok) throw new Error(`AI 请求失败 (${resp.status})`);
  const data = await resp.json();
  const message: ChatMessage | null = data?.choices?.[0]?.message ?? null;
  return { message, raw: message?.content ?? "" };
}

/** 设置页「测试连接」用 */
export async function testLlmConnection(): Promise<string> {
  const { message } = await chat([{ role: "user", content: "请只回复两个字：正常" }]);
  return (message?.content ?? "").trim() || "（无回复内容）";
}

/* ================= 系统提示词（REQ-01 定稿） ================= */

const SYSTEM_PROMPT = `你是「知进退」应用内的习惯转化智能体。用户刚刚击败了一个坏习惯（Boss），你要把它转化为一个具体、可执行、可打卡的对应好习惯，并通过工具把改动写回应用数据。

【工作流程（必须遵守）】
1. 先调用 list_habits 查看现有习惯，避免重名或重复。
2. 分析这个坏习惯，设计一个正向、具体的替代行为。
3. 调用 create_good_habit 创建这个好习惯。
4. 调用 archive_habit 归档被击败的坏习惯。
5. 最后必须调用 finish 用一句话总结你做了什么。不要在文本里罗列操作。

【好习惯设计原则】
- 用“去做某件正向的事”替代，而不是“不要做 X”。
- 名称 ≤14 字、简洁明确；emoji 用单个贴切表情；note 是一句可执行建议且 ≤20 字。
- 尽量继承坏习惯的 category；freq_type / freq_target 按新习惯的实际需要设置。
- 一次只创建一个好习惯。

【工具使用规范】
- 只能使用下面提供的工具，不要臆造工具或字段。
- 禁止臆造 id：archive_habit / update_habit 的 id 必须来自上下文或 list_habits 的结果。
- 若某工具返回 error，请调整参数后重试，不要放弃。`;

/* ================= 工具定义 ================= */

const TOOLS: ChatTool[] = [
  {
    type: "function",
    function: {
      name: "list_habits",
      description: "列出当前未归档的所有习惯（含 id 与类型），用于避免重名或重复。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "create_good_habit",
      description: "创建一个新的好习惯（优点）。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "好习惯名称，不超过14字" },
          emoji: { type: "string", description: "单个贴切 emoji" },
          note: { type: "string", description: "一句可执行建议，不超过20字" },
          category: { type: "string", description: "分类，尽量继承坏习惯", enum: CATEGORIES },
          color: { type: "string", description: "十六进制颜色，可不填" },
          freq_type: { type: "string", enum: ["daily", "weekly", "weekdays"] },
          freq_target: { type: "integer", minimum: 1, maximum: 7 },
        },
        required: ["name", "emoji"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_habit",
      description: "修改某个已有习惯的字段（可选）。",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer", description: "要修改的习惯 id" },
          name: { type: "string" },
          emoji: { type: "string" },
          note: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "archive_habit",
      description: "归档被击败的坏习惯（保留历史，不删除）。",
      parameters: {
        type: "object",
        properties: { id: { type: "integer", description: "要归档的坏习惯 id" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "完成转化，用一句话总结你做了什么。必须最后调用。",
      parameters: {
        type: "object",
        properties: { summary: { type: "string", description: "一句话总结" } },
        required: ["summary"],
      },
    },
  },
];

/* ================= 参数守门 ================= */

const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
const num = (v: unknown, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const emojiOr = (v: unknown, d: string) => {
  const s = str(v);
  return s && s.length <= 4 ? s : d;
};
const categoryOr = (v: unknown, d: string) => {
  const s = str(v);
  return CATEGORIES.includes(s) ? s : d;
};
const freqOr = (v: unknown, d: FreqType): FreqType => {
  const s = str(v);
  return s === "daily" || s === "weekly" || s === "weekdays" ? s : d;
};
const safeParse = (s: string): Record<string, unknown> => {
  try {
    const o = JSON.parse(s || "{}");
    return o && typeof o === "object" ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

function freqLabel(h: Habit): string {
  return h.freq_type === "daily"
    ? "每天"
    : h.freq_type === "weekdays"
      ? "仅工作日"
      : `每周${h.freq_target}次`;
}

/* ================= 工具执行 ================= */

interface AgentCtx {
  color: string;
  category: string;
  freq_type: FreqType;
  freq_target: number;
  createdHabitIds: number[];
  archivedHabitIds: number[];
  summary: string;
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentCtx
): Promise<{ result: unknown; done: boolean }> {
  switch (name) {
    case "list_habits": {
      const habits = await repo.listHabits(false);
      return {
        done: false,
        result: habits.map((h) => ({
          id: h.id,
          type: h.type,
          name: h.name,
          emoji: h.emoji,
          category: h.category,
          freq_type: h.freq_type,
          freq_target: h.freq_target,
        })),
      };
    }
    case "create_good_habit": {
      const nm = str(args.name).slice(0, 30);
      if (!nm) return { done: false, result: { error: "名称不能为空" } };
      const all = await repo.listHabits(false);
      if (all.some((h) => h.type === "good" && h.name === nm))
        return { done: false, result: { error: `已存在同名好习惯「${nm}」，请换一个名称` } };
      const id = await repo.createHabit({
        type: "good",
        name: nm,
        emoji: emojiOr(args.emoji, "🌱"),
        color: /^#[0-9a-fA-F]{6}$/.test(str(args.color)) ? str(args.color) : ctx.color,
        category: categoryOr(args.category, ctx.category),
        freq_type: freqOr(args.freq_type, ctx.freq_type),
        freq_target: clamp(num(args.freq_target, ctx.freq_target), 1, 7),
        note: str(args.note).slice(0, 50),
      });
      ctx.createdHabitIds.push(id);
      return { done: false, result: { ok: true, id, name: nm } };
    }
    case "update_habit": {
      const id = num(args.id, 0);
      const target = await repo.getHabit(id);
      if (!target) return { done: false, result: { error: `未找到 id=${id} 的习惯` } };
      const patch: Partial<Habit> = {};
      if (args.name != null) patch.name = str(args.name).slice(0, 30);
      if (args.emoji != null) patch.emoji = emojiOr(args.emoji, target.emoji);
      if (args.note != null) patch.note = str(args.note).slice(0, 50);
      if (args.category != null) patch.category = categoryOr(args.category, target.category);
      if (Object.keys(patch).length) await repo.updateHabit(id, patch);
      return { done: false, result: { ok: true } };
    }
    case "archive_habit": {
      const id = num(args.id, 0);
      const target = await repo.getHabit(id);
      if (!target) return { done: false, result: { error: `未找到 id=${id} 的习惯` } };
      await repo.archiveHabit(id, true);
      if (!ctx.archivedHabitIds.includes(id)) ctx.archivedHabitIds.push(id);
      return { done: false, result: { ok: true, archived: true } };
    }
    case "finish": {
      ctx.summary = str(args.summary).slice(0, 120);
      return { done: true, result: { ok: true } };
    }
    default:
      return { done: false, result: { error: `未知工具：${name}` } };
  }
}

/* ================= 智能体主循环 ================= */

export async function runConversionAgent(
  bad: Habit,
  onStep?: (s: AgentStep) => void
): Promise<ConversionResult> {
  const steps: AgentStep[] = [];
  const push = (s: AgentStep) => {
    steps.push(s);
    onStep?.(s);
  };
  const ctx: AgentCtx = {
    color: bad.color,
    category: bad.category,
    freq_type: bad.freq_type,
    freq_target: bad.freq_target,
    createdHabitIds: [],
    archivedHabitIds: [],
    summary: "",
  };
  let usedTools = false;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `坏习惯：${bad.name}（分类：${bad.category}｜频率：${freqLabel(bad)}｜备注：${bad.note || "无"}）\n请按流程把它转化为一个好习惯。`,
    },
  ];

  const MAX_ROUNDS = 8;
  try {
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const { message } = await chat(messages, TOOLS);
      if (!message) break;
      if (message.tool_calls?.length) {
        usedTools = true;
        messages.push({
          role: "assistant",
          content: message.content ?? null,
          tool_calls: message.tool_calls,
        });
        let finished = false;
        for (const tc of message.tool_calls) {
          const args = safeParse(tc.function.arguments);
          const { result, done } = await executeTool(tc.function.name, args, ctx);
          push({ type: "tool", name: tc.function.name, args, result });
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
          if (done) finished = true;
        }
        if (finished) break;
      } else {
        push({ type: "text", text: message.content ?? "" });
        break;
      }
    }
  } catch (e) {
    push({ type: "text", text: `⚠️ ${e instanceof Error ? e.message : "AI 请求失败"}` });
  }

  // 降级：模型未创建任何好习惯 → 用纯文本 JSON 建议兜底
  if (ctx.createdHabitIds.length === 0) {
    try {
      const s = await suggestGoodHabit(bad.name, bad.note);
      const id = await repo.createHabit({
        type: "good",
        name: s.name,
        emoji: s.emoji,
        color: bad.color,
        category: bad.category,
        freq_type: bad.freq_type,
        freq_target: bad.freq_target,
        note: s.note,
      });
      ctx.createdHabitIds.push(id);
      push({
        type: "tool",
        name: "create_good_habit",
        args: { ...s, fallback: true },
        result: { ok: true, id, fallback: true },
      });
      ctx.summary = ctx.summary || `已把它转化为「${s.name}」`;
    } catch (e) {
      push({ type: "text", text: e instanceof Error ? e.message : "AI 未返回可用建议" });
    }
  }

  if (ctx.createdHabitIds.length === 0) {
    return {
      ok: false,
      summary: "",
      steps,
      createdHabitIds: [],
      archivedHabitIds: [],
      source: usedTools ? "tools" : "none",
    };
  }

  // 兜底：确保坏习惯被归档（模型可能漏调 archive_habit）
  if (!ctx.archivedHabitIds.includes(bad.id)) {
    await repo.archiveHabit(bad.id, true);
    ctx.archivedHabitIds.push(bad.id);
    push({ type: "tool", name: "archive_habit", args: { id: bad.id, auto: true }, result: { ok: true } });
  }

  return {
    ok: true,
    summary: ctx.summary || `已将「${bad.name}」转化为好习惯`,
    steps,
    createdHabitIds: ctx.createdHabitIds,
    archivedHabitIds: ctx.archivedHabitIds,
    source: usedTools ? "tools" : "json",
  };
}

/** 撤销本次转化：删除新建的好习惯 + 取消归档（HP 保持 0，回到「击败」态可重转） */
export async function undoConversion(res: ConversionResult): Promise<void> {
  for (const id of res.createdHabitIds) {
    try {
      await repo.deleteHabit(id);
    } catch {
      /* 忽略 */
    }
  }
  for (const id of res.archivedHabitIds) {
    try {
      await repo.archiveHabit(id, false);
    } catch {
      /* 忽略 */
    }
  }
}

/* ================= 降级：纯文本 JSON 建议 ================= */

export async function suggestGoodHabit(badName: string, badNote: string): Promise<LlmSuggestion> {
  const sys =
    "你是习惯养成教练。把用户给出的坏习惯改写成一个具体、可执行、可打卡的对应好习惯。" +
    '严格只输出一个 JSON 对象，不要任何其他文字：{"name":"好习惯名(不超过14字)","emoji":"单个emoji","note":"一句执行建议(不超过20字)"}';
  const { raw } = await chat([
    { role: "system", content: sys },
    { role: "user", content: `坏习惯：${badName}${badNote ? `（${badNote}）` : ""}` },
  ]);
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI 返回格式异常");
  const obj = JSON.parse(m[0]) as Partial<LlmSuggestion>;
  if (!obj.name) throw new Error("AI 未返回有效名称");
  return {
    name: String(obj.name).slice(0, 20),
    emoji: obj.emoji && String(obj.emoji).length <= 4 ? String(obj.emoji) : "🌱",
    note: obj.note ? String(obj.note).slice(0, 50) : "",
  };
}
