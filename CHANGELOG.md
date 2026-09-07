# 更新日志

本文件记录对本项目的重要改动。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

日报内容（`src/content/daily/`）每日自动追加，不在此逐条记录。

---

## [1.1.0] - 2026-09-07

两轮独立代码审查（首轮 18 项、复审 12 项）的全部修复，加上工程化加固。
覆盖提交区间 `a370954..HEAD`。

### 修复 · 用户可见

- **免责声明此前在全站每一篇日报上都未渲染**。`parser.ts` 处理 `---` 分隔线时，
  若当前状态是「正在解析条目」会走「板块结束」分支，导致其后的免责声明文本被静默丢弃。
  改为向前看下一条非空行：是 `## ` 标题则视为板块分隔线，否则视为声明起始。
  该改法同时修掉了「正文以 `---` 开头时整篇降级为综合板块、速览丢失」的问题。
- **归档页的月份导航完全失效**。`new Date(year, month - 1, 1)` 把 1-based 的月份
  直接喂给 0-based 的 `Date` 构造器，前后各差一个月：「上一月」指向当前月自己，
  「下一月」跳过一个月。月份之间因此永远无法互相跳转。
- **「N 个来源」是个假指标**。原先对来源串整体去重，而每条来源串都含各自的 URL
  必然互异，结果恒等于新闻条数。改为按 `、` 拆分后提取媒体名再去重
  （例：2026-09-05 由「12 个来源」修正为真实的 24 家）。
- **RSS 摘要曾一度比修复前更糟**。改为输出 `<ul><li>` 列表时误以为
  `@astrojs/rss` 会自动包 CDATA；实际该包的 `xmlOptions` 未配置 `cdataPropName`，
  HTML 标签被转义成 `&lt;ul&gt;` 字面量，叠加 `escapeHtml` 还造成 `&amp;quot;` 双重转义。
  回退为纯文本编号列表，转义交由 XMLBuilder 独自负责。
- **归档页失效月份的死链**。原先输出 `href="#"`；改为 `<span>` 后，弱化样式又被
  错加在容器上且只由「上一月是否存在」决定，导致最新月份（上月存在、下月不存在）
  这一稳态下死链与可点链接颜色完全相同。改为把 `nav-disabled` 加到每个失效元素上。
- **含括号的 URL 会被截断**。链接正则 `[^)\s]+` 在第一个右括号处停下，
  `[维基百科](…/人工智能_(消歧义))` 渲染出的 href 少一个 `)` 且尾部残留裸括号。
  改为支持一层平衡括号。
- **404 页发出了 `canonical=/404` 且无 `noindex`**。Cloudflare Pages 用 404.html
  响应所有不存在的 URL，等于每个坏链接都把权重信号汇聚到同一页。

### 修复 · 稳定性

- **一篇空正文日报会让构建崩溃，且此后每次部署都失败**。`DayCard.astro` 的
  `report: any` 附带注释称「astro:content 类型无法在组件层导入」——实测该说法不成立，
  而这个 `any` 恰好掩盖了 `report.body` 为 `string | undefined` 的真实类型错误。
  改用 `CollectionEntry<'daily'>`，并补齐 4 个调用点中漏掉 `?? ''` 的 2 处。
- **`fetch-repo.mjs` 会无条件递归删除传入路径**。注释声称「仅删除本脚本专属的
  `.daily-work`」，但代码没有任何校验。改为先解析绝对路径，校验目录名必须是
  `.daily-work`、存在时必须是目录，否则拒绝退出。
- **日期格式化混用本地时区与 UTC**。`formatDate` 用本地 getter 而 `isoDate`、
  `<time datetime>`、RSS `pubDate` 用 UTC；Astro 把 frontmatter 的 `date:` 解析为
  UTC 午夜，因此在 UTC 负偏移的构建机上页面日期会显示成前一天。全面统一为 UTC getter。

### 安全

- **推送脚本的排除清单已与 `.gitignore` 漂移**，缺 `*.local` 与 `npm-debug.log*`；
  且原规则用 `^` 锚定路径起始，子目录下的 `.env`、`npm-debug.log.1` 会整体漏网。
  已补齐并改为 `(^|/)` 分量锚定，另按 `!.env.example` 反向放行模板文件。
  两侧各加注释互相指向，并新增「解析 `.gitignore` 逐条断言」的防漂移测试。
- **凭据扫描命中时会打印内容片段**（前 12 字符），对 GitHub PAT 等于泄露
  `ghp_` 前缀加 8 位正文，并被 CI 与流水线日志留存。改为只报文件与行号。
- **内容校验此前不在推送链路上**。`validate-content.mjs` 只在 CI 里跑，而 CI 触发于
  push 之后，格式错误的日报会先发布、事后才报错。改为推送前先执行，失败退出码 3。
- **CI 未声明 `permissions`**，`GITHUB_TOKEN` 沿用仓库默认（可能 write-all）。
  已限定为 `contents: read`。
- **`actions/checkout` 与 `actions/setup-node` 钉在可变的 `@v4` 标签**，
  已改为 commit SHA（`11d5960…` / `49933ea…`），升级交由 dependabot 提议。
- **推送凭据范围过宽**。`gh auth token` 取到的是 OAuth token，实测 scope 为
  `gist / read:org / repo / workflow`，其中 `repo` 可读写账号下所有仓库（含私有），
  而脚本只需要对这一个公开仓库写内容。现优先读环境变量 `AI_DAILY_GH_TOKEN`，
  可注入仅授权单仓库 `Contents` 读写的 fine-grained PAT。
- **`execSync` 改为 `execFileSync` 的 argv 形式**（两个脚本共 3 处），
  彻底移除 shell 解析环节。原参数虽是固定字面量不存在注入，argv 形式在语义上
  不可能被 shell 元字符影响。
- 新增 **`--dry-run`**：跑完校验、扫描与远端 diff 后打印推送计划但不做任何写操作。
  该脚本的成功路径会改写公开仓库的 main，此前无法被安全测试。

### 新增

- **CI**（`.github/workflows/ci.yml`）：push/PR 上依次跑
  `npm ci → astro check → test → build → validate`；含 `concurrency` 组避免
  定时推送与手动推送并行。
- **140 个单元测试**（`tests/`，Node 内置 `node:test`，零 npm 依赖）：
  覆盖 parser 的 `---` 四种形态与容错分支、14 个 XSS 载荷、括号 URL、
  日期 UTC 一致性、板块配色与 `global.css` 的跨文件一致性、
  `.gitignore` 防漂移、凭据扫描不回传内容、`gitBlobSha` 对齐 `git hash-object`。
- **SEO**：canonical、Open Graph 全套、Twitter card、`theme-color`（明暗两套）、
  日报页的 `BlogPosting` JSON-LD；新增自定义 404 页（带 `noindex`）。
- **LICENSE**：代码 MIT，日报内容 CC BY 4.0。
- **`.gitattributes` + `.editorconfig`**：行尾统一为 LF。仓库历史上已出现过一次
  行尾归一化的清理提交，此后可避免。
- **dependabot**：跟踪 npm 与 github-actions 两个生态。
- **README 新增「日报格式契约」一节**：此前 parser 期望的 markdown 格式只存在于
  代码注释里，而这是整个自动化最关键的规格说明。
- 校验器新增「条目正文不得为空」检查（原先只有标题加来源也能通过）。

### 重构

- 抽出 `src/components/DayCard.astro`，消除首页与月份归档页之间约 25 行的重复 JSX。
- `utils.extractHeadlines` 改为委托 `parseDaily`，消除同一套正则的两份实现。
- 删除 `sections.ts` 中未被引用的 `COLOR_VARS` / `colorVars()`：16 色调色板曾在
  TS 与 CSS 各维护一份，实际只有 CSS 那份生效。
- 抽出 `scripts/lib/publish-guards.mjs` 与 `scripts/lib/link-check.mjs`：
  两个脚本原先在模块加载时就执行校验闸、取 token 并推送，无法被安全导入测试。
- 校验器改为**零依赖纯 Node 实现**，不再 import `parser.ts`——校验的是「格式契约」
  而非解析器逻辑，两套独立实现可互相制衡；同时适配「快照目录每日重建、无
  `node_modules`」的实际约束（因此也移除了 `tsx` 依赖）。
- `src/lib/utils.ts` 的相对导入补 `.ts` 扩展名，以便 Node 原生 TypeScript 直接导入。

### 已知问题

- **`npm audit` 报 3 项**（astro 8 条 advisory 含 2 high、sharp 的 libvips 继承漏洞、
  esbuild 的 dev-server 文件读取）。已逐条核实所需特性本项目**一个都没用到**
  （无 `define:vars`、无 `{...}` spread props、无 View Transitions、无 `server:` 指令、
  无动态 slot 名、无页面内 `fetch`、无 `<Image />`），且产物为纯静态站点、
  生产环境无 Node 运行时，因此当前**零暴露面**。astro 5.18.2 已是 5.x 最新且无补丁版本，
  修复要求 7.1+（跨两个大版本）。**切勿执行 `npm audit fix --force`**——
  它会直接装 astro 7.x。该迁移应作为独立事项有计划地做。
- **`package-lock.json` 有 28 个孤儿条目**：移除 `tsx` 后未重新生成 lockfile，
  遗留一批 `@esbuild/*` 跨平台可选二进制（均标 `peer: true`）。`npm ci` 实测仍通过，
  不影响 CI。建议在 ubuntu 上执行一次 `npm install` 后单独提交（本机为 Windows，
  lockfile 改动与平台相关）。
- **`main` 无分支保护**。推送脚本使用 `force: false` 已能避免非快进覆盖，
  但没有机制阻止格式错误的日报直接进入 main（CI 是事后信号）。
  若要求 PR + status check 通过才能合并，会改变现有自动化流程，需权衡。

### 备注 · 关于提交 `d37bb28`

历史上有一个提交信息为 `test` 的提交（`d37bb28`）。它是在验证推送脚本的凭据回落
逻辑时**误触发**产生的：该脚本的成功路径就是推送到 main，而未设置 `AI_DAILY_GH_TOKEN`
时它会回落到有效的 `gh auth token` 并走完全程。

该提交包含的内容是本轮计划内的工程配置改动，无无关文件、无测试残留、无凭据：
`.editorconfig`、`.gitattributes`、`.github/dependabot.yml`、`ci.yml`（concurrency +
钉 SHA）、`fetch-repo.mjs` 与 `push-to-github.mjs`（凭据环境变量 + `execFileSync`）。
CI 与 Cloudflare Pages 均构建部署成功，线上站点渲染无变化（这些文件都不参与 Astro 构建）。

选择不改写公开历史，改为在此记录。**这次事故的直接对策是随后加入的 `--dry-run`**：
一个成功路径会改写公开仓库的脚本，必须具备只读的预检模式才能被安全测试。

---

## [1.0.0] - 2026-09-01

首个公开版本。

- Astro 5.x 静态站点，部署到 Cloudflare Pages，域名 `439952066.xyz`
- 日报为 `src/content/daily/YYYY-MM-DD.md`，由 `parser.ts` 解析为结构化数据后
  做 Apple Keynote 风格卡片化排版，板块配色语义化并支持深色模式
- 按月归档（`/archive/YYYY/MM/`）、RSS 订阅、sitemap、隐私说明页
- 安全基线：`public/_headers` 中的 CSP 与 nosniff / X-Frame-Options / Referrer-Policy；
  来源行渲染做 HTML 转义与 http(s) 协议白名单，外链固定 `noopener noreferrer`
- 每日自动化：搜集新闻 → 生成 markdown → 提交推送 → 自动部署

[1.1.0]: https://github.com/travellers-bflk/ai-daily/compare/a370954...v1.1.0
[1.0.0]: https://github.com/travellers-bflk/ai-daily/releases/tag/v1.0.0
