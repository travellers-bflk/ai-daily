# AI 日报

每日自动生成的 AI 行业资讯日报，发布于 [439952066.xyz](https://439952066.xyz)。

当前版本 **1.3.1** · 变更记录见 [CHANGELOG.md](CHANGELOG.md)

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
| frontmatter | `title` 非空；`date` 必须是 `YYYY-MM-DD`；可选 `updated: YYYY-MM-DD`（内容在首发后被修订时填写，用于页面结构化数据的 `dateModified`） |
| 今日速览 | 必须有 `## 今日速览` 板块，且至少 **3** 条 `1.` 或 `1、` 编号条目 |
| 正文板块 | 除速览外至少 **1** 个 `## ` 板块 |
| 新闻条目 | 至少 **5** 条 `【N】标题` |
| 条目正文 | 每条必须有正文，不能只有标题与来源 |
| 来源行 | 每条必须有 `来源：`（全角或半角冒号均可） |
| 来源日期 | 来源行末尾必须有 `（M 月 D 日）`；多来源时**每段各自**带日期，页面会为每段渲染独立徽章 |
| 链接协议 | 只允许 `https`；`http` 被视为协议降级而拒绝，`javascript:` / `data:` 在渲染时阻断 |
| 链接参数 | 不得带追踪/分享参数（`utm_*`、`smid`、`st`、`scene`、`agt`、`commTag`、`refer`、`unlocked_article_code` 等）。抓取到的 URL 先剥到裸链接再写入；`?id=`、`?page=` 这类正常参数不受影响 |
| 链接括号 | 必须闭合，且**最多一层嵌套**——渲染器不支持更深的嵌套，会截断 URL |
| 一个链接一个来源 | 链接文字里不得用 `、` 并列多个媒体名；`[腾讯新闻（转载：工信部、新华社报道）]` 合法，`[Hugging Face、腾讯新闻]` 不合法 |
| 引号 | 正文不得出现 ASCII 直引号 `"`；中文引语一律用全角 `“”`（确需引用代码片段用反引号行内代码） |
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
`npm ci → check → test → build → validate → 依赖漏洞基线`，并以 `permissions: contents: read` 最小权限运行。

依赖漏洞以**基线**方式管理：`.github/audit-baseline.json` 记录已逐条评估接受的
advisory（评估方法见 CHANGELOG 1.1.0「已知问题」），`npm run audit:baseline` 在出现
基线之外的新 advisory 时失败，强制重新做暴露面分析——「零暴露面」是时间点结论，
astro 的 advisory 曾在三周内从 8 条增至 10 条而无人察觉。注意其中 esbuild 一条的
影响面是**开发服务器**（Windows 上任意文件读取）：「生产零暴露面」不覆盖
`npm run dev`，在 Windows 上本地开发时请知悉该风险。

### 自动化脚本

| 脚本 | 作用 |
|---|---|
| [`scripts/fetch-repo.mjs`](scripts/fetch-repo.mjs) | 从 GitHub API 拉取 main 快照到工作目录 |
| [`scripts/push-to-github.mjs`](scripts/push-to-github.mjs) | 目录模式推送：与远程 main 做 diff，只上传差异 blob |
| [`scripts/validate-content.mjs`](scripts/validate-content.mjs) | 日报格式契约校验（零依赖纯 Node） |
| [`scripts/lib/`](scripts/lib/) | 上述脚本的纯函数部分，抽出以便单元测试 |

`fetch-repo.mjs` 会递归删除整个工作目录，因此**只接受目录名为 `.daily-work` 的路径**，
传其他路径直接拒绝退出——避免误传参数时摧毁无关数据。

`push-to-github.mjs` 还有三道自我保护：

- **不执行待发布目录里的代码**：校验器只从本脚本旁边的可信副本加载，快照目录当作
  纯数据看待；启动时会再校验自身不在待发布目录之下。仓库一旦被攻破，
  攻击者也无法在发布机上任执行代码。
- **不跟随符号链接**：`walk()` 用 `withFileTypes` 判定并跳过链接，快照目录里一个
  指向外部的链接目录不会被整个纳入推送清单。
- **凭据扫描**：命中即中止，退出码 2。

它支持 `--dry-run`：跑完内容校验、凭据扫描与远端 diff 后，
打印将要新增/修改/删除的文件清单，但不做任何写操作。因为该脚本的成功路径会改写
公开仓库的 main，没有这个开关它就无法被安全测试；每日推送前也可先跑一次预检。

```bash
node push-to-github.mjs <目录> "提交信息" --dry-run   # 预检，不写入
node push-to-github.mjs <目录> "提交信息"             # 真正推送
```

⚠️ **脚本必须放在待发布目录之外运行**（上例即仓库外的工作区根目录；每日自动化
正是这样调用的，脚本在 `<工作区>/`、被发布的是 `<工作区>/.daily-work/repo`）。
若把仓库 `scripts/` 里那份直接对着仓库自身跑，会被「自身位于待发布目录内」这道守卫
拒绝退出——那份脚本来自远端快照，让它自证清白没有意义。

退出码：`0` 成功或内容无变化 · `1` 参数/推送错误 · `2` 凭据扫描命中 · `3` 内容校验失败

⚠️ **目录模式推送会删除远程存在而本地目录里没有的文件**。若本地目录是从旧快照
拷来的（例如手工维护时），务必先重新 `fetch-repo.mjs` 拉一次，或确认没有别人
（含每日自动化）在期间往 main 上推过新日报，否则会把那篇直接删掉。

### 脚本同步（重要）

`scripts/` 里的推送脚本与自动化实际执行的**本地工作区副本是两份**：

| 仓库内 | 本地工作区（自动化实际调用） |
|---|---|
| `scripts/push-to-github.mjs` | `<工作区>/push-to-github.mjs` |
| `scripts/validate-content.mjs` | `<工作区>/validate-content.mjs` |
| `scripts/lib/publish-guards.mjs` | `<工作区>/lib/publish-guards.mjs` |
| `scripts/lib/link-check.mjs` | `<工作区>/lib/link-check.mjs` |

**改动脚本后必须双向同步，四个文件缺一不可**——新版 `push-to-github.mjs` 按自身位置
定位 `validate-content.mjs` 与 `lib/`，漏同步会直接找不到依赖。两者曾漂移过一整个
版本：仓库已修掉的「执行待发布目录里的校验器」在本地副本上仍是旧代码，
等于修了个寂寞（详见 CHANGELOG 1.3.0「发布链路漂移」）。

**凭据**：脚本优先读环境变量 `AI_DAILY_GH_TOKEN`，未设置时回落到 `gh auth token`。
建议设为**仅授权本仓库 `Contents: Read and write`** 的 fine-grained PAT——
`gh auth login` 拿到的 OAuth token 实测 scope 为 `gist / read:org / repo / workflow`，
其中 `repo` 可读写账号下所有仓库（含私有），而本脚本只需要对这一个公开仓库写内容。
鉴于每日任务会让 AI 抓取任意外部网页内容后执行脚本，收窄凭据范围能显著降低影响面。

## 隐私

本站为**纯静态内容**，自身不收集任何用户数据：

- 本站不设 Cookie、不埋点、无后端（cf_clearance 是托管方机器人防护写的，见下）
- 构建产物不加载任何第三方资源（页面只引用本站路径）
- **核实第三方注入必须看线上响应，而不是 `dist/`**：托管边缘（Cloudflare）会在
  serve 时向 HTML 注入它自己的脚本——Web Analytics 信标与 Bot Fight Mode 的客户端
  检测脚本。这类注入不存在于构建产物中，只有抓线上响应才看得见。

### 边缘注入与 CSP（1.3.1）

这两个脚本是**有意放行**的，不是拦不住：

| 注入 | 放行方式 | 不放行的后果 |
|---|---|---|
| Web Analytics / Browser Insights 信标 | `script-src https://static.cloudflareinsights.com` + `connect-src https://cloudflareinsights.com` | 静默失效——脚本被拦不报错，后台一条数据都收不到，看起来像「没人访问」 |
| Bot Fight Mode 的内联引导脚本 | [`functions/_middleware.js`](functions/_middleware.js) 在响应头注入一次性 nonce | 客户端机器人检测跑不起来 |

Bot Fight Mode 那段是**内联**脚本，且每次请求内容都不同（内含随机请求 ID 与时间戳），
**hash 放行不可行**；Cloudflare 官方也不推荐 `'unsafe-inline'`——本站 CSP 正是最后一道
XSS 防线，加上它等于自废武功。折中方案是官方推荐的 nonce：它会解析响应头里的 nonce
并盖到它注入的脚本上。中间件不复制 CSP，而是读 `_headers` 已设好的头再插 nonce，
避免两处各写一份；任何异常都原样放行，中间件挂了最多是 JSD 继续被拦，不会让站点出错。

⚠️ **nonce 依赖「响应一一对应」**：Cloudflare 默认不缓存 HTML，故无需处理。
若将来给 HTML 配了长缓存，nonce 会在缓存期内复用（等同静态 nonce），
届时不该再走 nonce 方案。
- 推送脚本内置凭据模式扫描（GitHub 经典与 **fine-grained** PAT / npm token / AWS / 私钥 / Google / Slack / OpenAI 风格 key / 通用赋值），命中即中止推送；**只报告文件与行号，不打印任何凭据内容片段**，避免报告本身造成二次泄露（脚本见 [`scripts/lib/publish-guards.mjs`](scripts/lib/publish-guards.mjs)，可自行核实）
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
