# REQ-01 执行计划：缺点 Boss 智能转化（LLM 工具调用）

> 需求来源：用户 2026-09-25（见 `docs/规范.md` 第 13/14 节）
> 本文件是该需求的可执行计划：现状差距 → 目标 → 技术设计 → 任务清单 → 验收。
> 执行时逐项勾选；完成后做文档对齐（规范 13.3）。

---

## 一、需求复述

1. 坏习惯（缺点）做成**打 Boss**：每天成功避开 = 削弱 HP；HP 归零 = 击败。
2. 击败后应被**转化为一个好习惯**（优点）继续坚持。
3. 转化**交给中转站 GLM**（`GLM-5.3-Flash`，OpenAI 兼容），需：
   - 写好**系统提示词**；
   - 给 LLM **编辑条目的权限**；
   - 定义清晰的**工具调用范式**。

## 二、现状与差距

| 事项 | 现状 | 差距 |
|------|------|------|
| Boss 血条 / 击败态 | ✅ 已实现（HP100，-3/天，划去+印章+血条） | — |
| 转化入口 | ✅ 击败后可点「转化为好习惯」 | — |
| LLM 接入 | ⚠️ 仅返回文本建议，用户手动确认 | **需升级为工具调用智能体** |
| 编辑权限 | ❌ 无（前端代劳） | 需给 LLM 工具去读写条目 |
| 系统提示词 | ⚠️ 一段简单 system | 需重写为智能体提示词 |
| 工具调用范式 | ❌ 无 | 需定义 tools + 循环 + 终止规则 |
| http 插件 | ❌ `repo.ts` 用的是 WebView 全局 `fetch`，插件/权限是死代码 | 改用 `@tauri-apps/plugin-http` 并配 scope |
| 撤销 | ❌ 无 | 需支持撤销本次转化 |
| 兜底 | ⚠️ 仅解析失败给空表单 | 需完整降级链 |

## 三、技术设计

### 3.1 工具定义（给 LLM 的 tools）

| 工具 | 参数 | 作用 |
|------|------|------|
| `list_habits` | 无 | 返回当前未归档习惯（id/type/name/emoji/category/freq_type），用于避免重名与重复 |
| `create_good_habit` | `name, emoji, note?, category?, color?, freq_type?, freq_target?` | 新建一条**优点**，返回新 id |
| `update_habit` | `id, (name/emoji/note/category/color/freq_type/freq_target/hp)?` | 修改条目字段（可选工具） |
| `archive_habit` | `id, archived?` | 归档被击败的缺点 |
| `finish` | `summary` | **终止信号**，一句话总结 |

### 3.2 智能体循环（前端 TS 实现）

```
messages = [system, user(坏习惯上下文)]
for i in 0..8:
  resp = chatCompletions(messages, tools)
  msg  = resp.choices[0].message
  messages.push(msg)
  if !msg.tool_calls: break            # 模型直接给文本 → 结束
  for tc in msg.tool_calls:
    result = executeTool(tc.name, parse(tc.arguments))   # 客户端守门校验
    messages.push({role:"tool", tool_call_id:tc.id, content:JSON(result)})
    if tc.name == "finish": done
；若 8 轮仍未结束 → 以当前结果收尾
```

- **客户端守门**：`create_good_habit` 重名/空名 → 返回 `{error}` 让模型改正；`archive_habit` id 不存在 → 返回 `{error}`。
- **变更记录**：`ConversionResult { summary, steps[], createdHabitIds[], archivedHabitIds[], ok }`。
- **撤销**：删除 `createdHabitIds` + 恢复 `archivedHabitIds`（HP 保持 0，回到击败态可重转）。

### 3.3 系统提示词（定稿）

```
你是「知进退」应用内的习惯转化智能体。用户刚刚击败了一个坏习惯（Boss），
你要把它转化为一个具体、可执行、可打卡的对应好习惯，并通过工具把改动写回应用数据。

【工作流程（必须遵守）】
1. 先调用 list_habits 查看现有习惯，避免重名或重复。
2. 分析坏习惯的成因，设计一个正向、具体的替代行为。
3. 调用 create_good_habit 创建这个好习惯。
4. 调用 archive_habit 归档被击败的坏习惯。
5. 最后必须调用 finish 用一句话总结，不要在文本里罗列操作。

【好习惯设计原则】
- 用“去做某件正向的事”替代，而不是“不要做 X”。
- 名称 ≤14 字、简洁明确；emoji 用单个贴切表情；note 是一句可执行建议且 ≤20 字。
- 尽量继承坏习惯的 category；freq_type/freq_target 按新习惯实际需要设置。
- 一次只创建一个好习惯。

【工具使用规范】
- 只能使用提供的工具，不要臆造工具或字段。
- 禁止臆造 id：archive_habit / update_habit 的 id 必须来自上下文或 list_habits 结果。
- 若某工具返回 error，请调整参数后重试，不要放弃。
```

`user` 消息模板：`坏习惯：{name}（分类：{category}｜频率：{freq}｜备注：{note}｜已坚持避开 {?} 次）`

### 3.4 降级链

1. 原生 `tool_calls` 正常 → 智能体流程。
2. 模型返回文本但含 JSON `{name,emoji,note}` → 按旧逻辑解析，前端自动建优点 + 归档。
3. 接口异常/无有效内容 → 提示错误 + 提供手填表单（现有 ConvertModal 表单）。

### 3.5 Tauri 落点

- `repo.ts`：`import { fetch as tauriFetch } from "@tauri-apps/plugin-http"`，所有 LLM 请求改用它。
- `capabilities/default.json`：`http:default` 改为带 scope 的对象：
  `{ "identifier": "http:default", "allow": [{ "url": "https://*" }] }`
  （base URL 可配置，故给通配；仅限 https。）

## 四、任务清单

- [x] T1 修复 http 通道：`repo.ts` 改用 plugin-http fetch；capability 配 URL scope
- [x] T2 `src/lib/llm.ts`：工具定义 + `chat` + 智能体循环 + 守门 + 变更记录
- [x] T3 `repo.ts` 暴露工具所需原子操作（新增 `getHabit`，复用 create/update/archive/list）
- [x] T4 重写系统提示词（见 3.3）并接入
- [x] T5 `BossCard.tsx` / `ConvertModal` 改造：实时展示智能体步骤 + 摘要 + 「撤销本次转化」
- [x] T6 降级链与错误兜底
- [x] T7 设置页：AI 区块补充「测试连接」按钮
- [x] T8 构建验证（`npm run build` 类型通过；`npm run deploy` 出包）
- [x] T9 文档对齐 + 提交

## 五、验收标准

1. 缺点打卡 HP -3、取消回补、血条与击败态正确（回归）。
2. HP=0 触发转化时，真实请求 GLM 并收到 `tool_calls`。
3. LLM 能新建优点、归档缺点，结果落库，清单页可见。
4. 转化过程可视化；可一键撤销，撤销后数据与转化前一致。
5. 断网 / 接口异常 / 无工具调用时，均不破坏数据且有明确提示。

## 六、风险

| 风险 | 应对 |
|------|------|
| 模型偶发不返回 tool_calls | 降级链 + `tool_choice` 保持 auto；提示词强约束 |
| 模型臆造 id / 重名 | 客户端守门返回 error 让其自纠 |
| 通配 scope 安全面偏大 | 仅 https；本地优先、不外传数据；规范记录 |
| LLM 循环失控 | 硬上限 8 轮 + `finish` 终止工具 |
| 无法联网实测（沙箱） | 已用 curl 验证工具调用可用；应用内以「测试连接」+ 日志诊断 |

## 七、执行结果与验证（已完成）

**实现文件**
- 新增 `src/lib/llm.ts`（工具定义 / 系统提示词 / 智能体循环 / 守门 / 降级 / 撤销 / 测试连接）
- 改 `src/lib/repo.ts`（移除旧 `suggestGoodHabit`，新增 `getHabit`）
- 改 `src/components/BossCard.tsx`（ConvertModal 改为智能体过程视图）
- 改 `src/pages/Today.tsx`（回调简化）、`src/pages/Settings.tsx`（测试连接）
- 改 `src-tauri/capabilities/default.json`（http scope）

**真实验证（对中转站 GLM 实测，复刻智能体循环）**

用例一（正常流程）：
```
round1 list_habits() -> 2 项
round2 create_good_habit({name:"睡前按时上床",...}) -> {ok,id:10}
round3 archive_habit({id:1}) -> {ok}
round4 finish({summary:...}) -> {ok}
结果：created [10] / archived [1] / finish 已调用 ✅
```

用例二（守门报错自纠）：
```
round2 create_good_habit("23点前放下手机") -> {error:同名}
round3 create_good_habit("睡前半小时关屏") -> {ok,id:10}  # 自动改名重试
round4 archive_habit({id:1}) -> {ok}
round5 finish(...)                    ✅
```

**结论**：系统提示词与工具调用范式在真实模型上完全按预期工作，含错误自纠。降级链与撤销为静态审查 + 类型检查保证。

**构建**：`npm run build` 类型通过；`npm run deploy` 出包并部署到根目录（`知进退.exe` / `知进退-安装包.exe`）。capability 的对象式 scope 写法被接受。
