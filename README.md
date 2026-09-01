# AI 日报

每日自动生成的 AI 行业资讯日报，发布于 [439952066.xyz](https://439952066.xyz)。

## 内容

- 每日搜集过去 24 小时内的 AI 行业新闻
- 板块：要闻 / 模型与产品 / 行业动态 / 观点与技术洞察 / 传闻与爆料
- 时效性与真实性硬性约束，宁缺毋滥

## 技术

- [Astro](https://astro.build) 静态站点
- 日报为 Markdown 文件，存放于 `src/content/daily/`
- RSS 订阅：[rss.xml](https://439952066.xyz/rss.xml)
- 部署：GitHub 推送 → Cloudflare Pages 自动构建

## 更新方式

每日定时任务自动搜集新闻 → 生成当日 `YYYY-MM-DD.md` → 提交推送 → 自动部署上线。
