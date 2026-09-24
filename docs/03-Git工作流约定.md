# Git 工作流约定

> 仓库：https://github.com/gigogigo64/Advance-Retreat
> 这些约定对整个项目全程生效。

## 提交规范（Conventional Commits，中文描述）

格式：`<类型>: <中文描述>`

| 类型 | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复缺陷 |
| `docs` | 文档变更 |
| `style` | 代码格式（不影响逻辑） |
| `refactor` | 重构 |
| `perf` | 性能优化 |
| `test` | 测试 |
| `chore` | 构建/脚手架/依赖等杂项 |

示例：
- `feat: 今日视图打卡卡片与动效`
- `fix: 修复连败排行统计跨月错误`
- `docs: 新增开发计划文档`
- `chore: 初始化Tauri项目脚手架`

## 其他约定

- 提交前确认 `git status`，不提交无关文件（node_modules、dist、target 等由 .gitignore 排除）
- 功能做完一个阶段/检查点就提交一次，保持历史清晰
- 分支：初期直接在 main 开发；后续如需试验性改动再开 feature 分支
- 文档（docs/）与代码同步提交，不留「文档滞后」
