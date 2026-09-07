# AI 日报

每日自动生成的 AI 行业资讯日报，发布于 [439952066.xyz](https://439952066.xyz)。

当前版本 **1.1.0** · 变更记录见 [CHANGELOG.md](CHANGELOG.md)

## 内容

- 每日搜集过去 24 小时内的 AI 行业新闻
- **板块不固定**：由 AI 根据当日内容自行决定分组与排序，常见板块：模型发布 / 行业动态 / 产品应用 / 技术与洞察 / 开发生态 / 传闻与爆料 等
- 时效性与真实性硬性约束（多轮搜集与交叉验证），宁缺毋滥
- 历史归档：[`/archive/`](https://439952066.xyz/archive/)

## 技术

- [Astro](https://astro.build) 静态站点（5.x）
- 日报为 Markdown 文件，存放于 `src/content/daily/YYYY-MM-DD.md`
- 设计：Apple Keynote 风格卡片化排版，板块配色语义化，支持深色模式
- 部署：GitHub 推送 → Cloudflare Pages 自动构建 → 域名 `439952066.xyz`
- CI：push/PR 自动执行 `astro check` + 单元测试 + 构建 + 内容校验（`.github/workflows/ci.yml`）
- 测试：`tests/`，用 Node 内置 `node:test`，零 npm 依赖
- 依赖跟踪：`.github/dependabot.yml`（npm 与 github-actions 两个生态，每周）
- 行尾统一为 LF（`.gitattributes` + `.editorconfig`）

> **已知依赖状况**：`npm audit` 会报 astro / sharp / esbuild 共 3 项。已逐条核实这些
> advisory 所需的特性本项目**一个都没用到**（无 `define:vars`、无 `{...}` spread props、
> 无 View Transitions、无 `server:` 指令、无动态 slot 名、无页面内 `fetch`、无 `<Image />`），
> 且产物是纯静态站点、生产环境无 Node 运行时，因此当前**零暴露面**。
> astro 5.18.2 已是 5.x 最新且无补丁版本，修复要求 7.1+（跨两个大版本）。
> **切勿执行 `npm audit fix --force`**——它会直接装 astro 7.x，把一个每天在自动发布的
> 站点推入未计划的大版本迁移。该迁移应作为独立事项有计划地做。

## 日报格式契约

日报是 `src/content/daily/YYYY-MM-DD.md`，由自动化每日生成。
站点不是直接渲染 markdown，而是用 [`src/lib/parser.ts`](src/lib/parser.ts) 把正文解析成
结构化数据后做卡片化排版，因此**格式是有约束的**。

以下规则由 `npm run validate` 强制，不满足会退出码 1；
`push-to-github.mjs` 在推送前会先跑这道闸，所以不合规的日报无法被发布。

```markdown
---
title: AI 日报 2026-09-05
date: 2026-09-05
---

## 今日速览

1. 头条一
2. 头条二
3. 头条三

## 行业动态            ← 板块名自由，见下

【1】新闻标题

正文段落，可多段。支持 **粗体** 与 [链接](https://…)。

来源：[媒体名](https://example.com)（9 月 4 日）、[另一媒体](https://example.org)（9 月 4 日）

【2】……

---

本文由 AI 辅助整理，可能存在遗漏或错误，请以各来源原文为准。信息截至 2026-09-05。
```

| 规则 | 要求 |
|---|---|
| frontmatter | `title` 非空；`date` 必须是 `YYYY-MM-DD` |
| 今日速览 | 必须有 `## 今日速览` 板块，且至少 **3** 条 `1.` 或 `1、` 编号条目 |
| 正文板块 | 除速览外至少 **1** 个 `## ` 板块 |
| 新闻条目 | 至少 **5** 条 `【N】标题` |
| 条目正文 | 每条必须有正文，不能只有标题与来源 |
| 来源行 | 每条必须有 `来源：`（全角或半角冒号均可） |
| 来源日期 | 来源行末尾必须有 `（M 月 D 日）` |
| 链接协议 | 只允许 `http` / `https`；渲染时会阻断 `javascript:` / `data:` |
| 链接括号 | 必须闭合，且**最多一层嵌套**——渲染器不支持更深的嵌套，会截断 URL |
| 一个链接一个来源 | 链接文字里不得用 `、` 并列多个媒体名；`[腾讯新闻（转载：工信部、新华社报道）]` 合法，`[Hugging Face、腾讯新闻]` 不合法 |
| 免责声明 | 最后一个 `---` 之后必须含「本文由 AI 辅助整理」，且含 `信息截至 YYYY-MM-DD`，日期须与 frontmatter 的 `date` 一致 |

**`【N】` 编号不被校验器强制**，但 parser 会原样取用作为卡片左上角的 `#N` 标签，
因此写作时应保持全文连续递增（跨板块也不重置），否则页面上会出现跳号或重号。

**板块名是自由的**：AI 可自行决定分组与排序。已识别的板块名会取到语义化配色与图标
（见 [`src/lib/sections.ts`](src/lib/sections.ts)），未识别的名字则按哈希从备用调色板取一个
**稳定**配色——同名板块每次构建颜色一致。

> 校验器 [`scripts/validate-content.mjs`](scripts/validate-content.mjs) 与解析器
> `src/lib/parser.ts` 刻意保持两套独立实现，不共享代码：这样解析器自身有缺陷时，
> 校验器不会跟着一起失效。改动格式约定时两侧都要同步。

## 开发

```bash
npm install
npm run dev        # 本地开发
npm run check      # 类型检查（astro check）
npm test           # 单元测试（node:test，零依赖；parser / utils / sections / 脚本守卫）
npm run build      # 生产构建 → dist/
npm run validate   # 日报内容校验（frontmatter/速览/免责声明/来源行格式/链接协议）
```

CI（`.github/workflows/ci.yml`）在 push 与 PR 上依次跑
`npm ci → check → test → build → validate`，并以 `permissions: contents: read` 最小权限运行。

### 自动化脚本

| 脚本 | 作用 |
|---|---|
| [`scripts/fetch-repo.mjs`](scripts/fetch-repo.mjs) | 从 GitHub API 拉取 main 快照到工作目录 |
| [`scripts/push-to-github.mjs`](scripts/push-to-github.mjs) | 目录模式推送：与远程 main 做 diff，只上传差异 blob |
| [`scripts/validate-content.mjs`](scripts/validate-content.mjs) | 日报格式契约校验（零依赖纯 Node） |
| [`scripts/lib/`](scripts/lib/) | 上述脚本的纯函数部分，抽出以便单元测试 |

`fetch-repo.mjs` 会递归删除整个工作目录，因此**只接受目录名为 `.daily-work` 的路径**，
传其他路径直接拒绝退出——避免误传参数时摧毁无关数据。

`push-to-github.mjs` 支持 `--dry-run`：跑完内容校验、凭据扫描与远端 diff 后，
打印将要新增/修改/删除的文件清单，但不做任何写操作。因为该脚本的成功路径会改写
公开仓库的 main，没有这个开关它就无法被安全测试；每日推送前也可先跑一次预检。

```bash
node scripts/push-to-github.mjs <目录> "提交信息" --dry-run   # 预检，不写入
node scripts/push-to-github.mjs <目录> "提交信息"            # 真正推送
```

退出码：`0` 成功或内容无变化 · `1` 参数/推送错误 · `2` 凭据扫描命中 · `3` 内容校验失败

**凭据**：脚本优先读环境变量 `AI_DAILY_GH_TOKEN`，未设置时回落到 `gh auth token`。
建议设为**仅授权本仓库 `Contents: Read and write`** 的 fine-grained PAT——
`gh auth login` 拿到的 OAuth token 实测 scope 为 `gist / read:org / repo / workflow`，
其中 `repo` 可读写账号下所有仓库（含私有），而本脚本只需要对这一个公开仓库写内容。
鉴于每日任务会让 AI 抓取任意外部网页内容后执行脚本，收窄凭据范围能显著降低影响面。

## 隐私

本站为**纯静态内容**，不收集任何用户数据：

- 无 Cookie、无第三方追踪脚本
- 无遥测、无埋点
- 构建产物中不加载任何第三方资源（已在 `dist/` 中核实，页面只引用本站路径）
- 推送脚本内置凭据模式扫描（GitHub PAT / AWS / 私钥 / Google / Slack / OpenAI 风格 key / 通用赋值），命中即中止推送；**只报告文件与行号，不打印任何凭据内容片段**，避免报告本身造成二次泄露（脚本见 [`scripts/push-to-github.mjs`](scripts/push-to-github.mjs)，可自行核实）
- 详见 [隐私说明](https://439952066.xyz/privacy/)

## 更新方式

每日 **22:00**（本地时间，UTC+8）定时任务自动搜集新闻 → 生成当日 `YYYY-MM-DD.md`
→ 内容校验 → 提交推送 → Cloudflare Pages 自动部署。错过可手动补跑。

关于这个时间点：

- 22:00 CST = **14:00 UTC**，属同一日历日，因此 `push-to-github.mjs` 中基于
  `toISOString()` 的默认提交信息日期不会错位。
  ⚠️ 若将来把排程挪到本地 **08:00 之前**，UTC 仍是前一天，默认日期会写成前一天——
  届时应显式传入提交信息，或改用本地日期。
- 新闻覆盖窗口为「前一日 22:00 → 当日 22:00」，当晚发布的消息可当天见报，
  比清晨发布更贴合中文读者的阅读节奏。

## 许可证

- 代码：[MIT](LICENSE)
- 日报内容（`src/content/daily/`）：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.zh)——转载请署名「AI 日报」并附原文链接
