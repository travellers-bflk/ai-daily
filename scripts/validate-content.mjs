#!/usr/bin/env node
/**
 * 日报内容校验：在构建/推送前运行，断言每篇日报可被正确解析且格式合规。
 * 能拦截的典型问题：免责声明丢失、速览为空、缺来源/日期、非 http(s) 链接、
 * 多个媒体名共用一个链接等（对应 2026-09-05 审查报告 P0-1 与来源行规范）。
 *
 * 用法：npx tsx scripts/validate-content.mjs [内容目录]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDaily } from '../src/lib/parser.ts';

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
  const parsed = parseDaily(body);

  const check = (ok, msg) => {
    if (!ok) errors.push(`${f}: ${msg}`);
  };

  check(parsed.headlines.length > 0, '「今日速览」为空或未被解析');
  check(parsed.sections.length > 0, '无任何板块');
  check(parsed.disclaimer.trim().length > 0, '免责声明丢失（--- 之后应为声明文本）');
  check(/信息截至/.test(parsed.disclaimer), '免责声明缺少「信息截至」时效标注');

  for (const s of parsed.sections) {
    for (const item of s.items) {
      check(item.source.trim().length > 0, `【${item.id}】缺少来源行`);
      check(item.body.length > 0, `【${item.id}】正文为空`);
      check(item.sourceDate.trim().length > 0, `【${item.id}】来源行缺少（M 月 D 日）日期标注`);
      for (const lm of item.source.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
        check(/^https?:\/\//.test(lm[2]), `【${item.id}】非 http(s) 链接: ${lm[2]}`);
        // 「一个链接一个来源」：剥掉（转载：…）括号内的出处说明后再检查顿号，
        // `[腾讯新闻（转载：工信部、新华社报道）]` 合法，`[Hugging Face、腾讯新闻]` 违规
        const labelOutsideParens = lm[1].replace(/[（(][^）)]*[）)]/g, '');
        check(!labelOutsideParens.includes('、'), `【${item.id}】多个媒体名共用一个链接: [${lm[1]}](${lm[2]})`);
      }
    }
  }
}

if (errors.length) {
  console.error(`内容校验失败（${errors.length} 个问题）：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`内容校验通过：${files.length} 篇日报全部合规。`);
