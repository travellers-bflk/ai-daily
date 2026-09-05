#!/usr/bin/env node
/**
 * 日报内容校验：在构建/推送前运行，断言每篇日报格式合规。
 * 零依赖纯 Node 实现（快照目录每日重建、无 node_modules，故不 import 项目 TS 代码）。
 * 校验的是「格式契约」而非 parser 逻辑——校验器与解析器彼此独立，可互相制衡。
 *
 * 拦截的典型问题：免责声明丢失、速览为空、缺来源/日期、非 http(s) 链接、
 * 多个媒体名共用一个链接等（对应 2026-09-05 审查报告 P0-1 与来源行规范）。
 *
 * 用法：node scripts/validate-content.mjs [内容目录]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] || join(root, 'src/content/daily');

const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
if (files.length === 0) {
  console.error(`未找到日报文件：${dir}`);
  process.exit(1);
}

const errors = [];

for (const f of files) {
  const raw = readFileSync(join(dir, f), 'utf8');
  // 剥离 frontmatter（与 Astro 行为一致）
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fm) {
    errors.push(`${f}: 缺少 frontmatter`);
    continue;
  }
  const body = fm[2];

  const check = (ok, msg) => {
    if (!ok) errors.push(`${f}: ${msg}`);
  };

  // 1. frontmatter 字段
  check(/^title:\s*\S/.test(fm[1]), 'frontmatter 缺少 title');
  check(/^date:\s*\d{4}-\d{2}-\d{2}\s*$/m.test(fm[1]), 'frontmatter 缺少 YYYY-MM-DD 格式的 date');

  // 2. 今日速览：标题存在且至少 3 条编号条目
  const quickMatch = body.match(/^##\s*今日速览\s*$/m);
  check(quickMatch !== null, '缺少「## 今日速览」板块');
  const quickSection = quickMatch
    ? (body.slice(quickMatch.index).split(/^##\s/m)[1] ?? '')
    : '';
  const headlineCount = (quickSection.match(/^\d+[.、]\s*\S/gm) || []).length;
  check(headlineCount >= 3, `「今日速览」条目不足 3 条（当前 ${headlineCount}）`);

  // 3. 正文板块：至少一个非「今日速览」的 ## 板块
  const allSections = body.match(/^##\s+(.+)$/gm) || [];
  check(
    allSections.some((s) => s.replace(/^##\s+/, '').trim() !== '今日速览'),
    '除今日速览外无任何正文板块'
  );

  // 4. 新闻条目：【N】标题存在
  const items = [...body.matchAll(/^【(\d+)】\s*(.+)$/gm)];
  check(items.length >= 5, `新闻条目不足 5 条（当前 ${items.length}）`);

  // 5. 每个条目块内：来源行 + 日期标注 + 链接规范
  const blocks = body.split(/^【\d+】/m).slice(1);
  for (let i = 0; i < blocks.length; i++) {
    const id = items[i] ? items[i][1] : String(i + 1);
    const block = blocks[i];
    const srcLine = block.match(/^来源[：:]\s*(.+)$/m);
    check(srcLine !== null, `【${id}】缺少「来源：」行`);
    if (!srcLine) continue;
    const src = srcLine[1];
    check(
      /[（(]\d{1,2}\s*月\s*\d{1,2}\s*日[）)]\s*$/.test(src.trim()),
      `【${id}】来源行末尾缺少（M 月 D 日）日期标注`
    );
    for (const lm of src.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
      check(
        /^https?:\/\//.test(lm[2]),
        `【${id}】非 http(s) 链接: ${lm[2]}`
      );
      // 「一个链接一个来源」：剥掉（转载：…）括号内的出处说明后再检查顿号，
      // `[腾讯新闻（转载：工信部、新华社报道）]` 合法，`[Hugging Face、腾讯新闻]` 违规
      const labelOutsideParens = lm[1].replace(/[（(][^）)]*[）)]/g, '');
      check(
        !labelOutsideParens.includes('、'),
        `【${id}】多个媒体名共用一个链接: [${lm[1]}](${lm[2]})`
      );
    }
  }

  // 6. 文末免责声明：最后一个 --- 之后含固定声明与「信息截至」（日期须与 frontmatter 一致）
  const lastHr = body.lastIndexOf('---');
  const tail = lastHr >= 0 ? body.slice(lastHr + 3) : '';
  check(/本文由 AI 辅助整理/.test(tail), '文末缺少固定免责声明');
  const fmDate = fm[1].match(/^date:\s*(\d{4}-\d{2}-\d{2})/m)?.[1] ?? '';
  check(fmDate !== '' && tail.includes(`信息截至 ${fmDate}`),
    '免责声明缺少「信息截至 YYYY-MM-DD」（或与 frontmatter 日期不一致）');
}

if (errors.length) {
  console.error(`内容校验失败（${errors.length} 个问题）：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`内容校验通过：${files.length} 篇日报全部合规。`);
