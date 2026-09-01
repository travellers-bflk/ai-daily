# AI 日报

每日自动生成的 AI 行业资讯日报，发布于 [439952066.xyz](https://439952066.xyz)。

## 内容

- 每日搜集过去 24 小时内的 AI 行业新闻
- **板块不固定**：由 AI 根据当日内容自行决定分组与排序，常见板块：模型发布 / 行业动态 / 产品应用 / 技术与洞察 / 开发生态 / 传闻与爆料 等
- 时效性与真实性硬性约束，宁缺毋滥
- 历史归档：[`/archive/`](https://439952066.xyz/archive/)

## 技术

- [Astro](https://astro.build) 静态站点（5.x）
- 日报为 Markdown 文件，存放于 `src/content/daily/YYYY-MM-DD.md`
- 设计：Apple Keynote 风格卡片化排版，板块配色语义化
- 部署：GitHub 推送 → Cloudflare Pages 自动构建 → 域名 `439952066.xyz`

## 隐私

本站为**纯静态内容**，不收集任何用户数据：

- 无 Cookie、无第三方追踪脚本
- 无遥测、无埋点
- 推送脚本内置凭据模式扫描（GitHub PAT / AWS / 私钥 / 常见 API key），命中即中止推送
- 详见 [隐私说明](https://439952066.xyz/privacy/)

## 更新方式

每日定时任务自动搜集新闻 → 生成当日 `YYYY-MM-DD.md` → 提交推送 → Cloudflare Pages 自动部署。
错过可手动补跑。