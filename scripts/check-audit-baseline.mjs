#!/usr/bin/env node
/**
 * 依赖漏洞基线检查：把「零暴露面」从一次性人工结论变成机器可验证的基线。
 *
 * 背景：CHANGELOG 1.1.0 记录过一次逐条 advisory 的暴露面分析（所需特性均未使用、
 * 纯静态产物）。但该分析是时间点结论——此后 astro 的 advisory 从 8 条增至 10 条，
 * 没有任何机制在结论失效时报警。本脚本将已评估接受的 advisory URL 固定在
 * .github/audit-baseline.json 中：
 *   - 出现基线之外的新 advisory → 退出码 1，强制重新做暴露面分析；
 *   - 基线中的条目已消失（依赖已修复）→ 仅提示清理基线，不失败。
 *
 * 切勿用「把新 advisory 加进基线」来让 CI 变绿：那等于跳过分析。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselineFile = join(root, '.github', 'audit-baseline.json');

/**
 * 取得 `npm audit --json` 的输出，跨平台且不经 shell：
 *   1. npm_execpath（经 npm 调用时存在）→ 用当前 Node 直接执行该入口；
 *   2. 非 Windows：裸名 npm 本身是可执行脚本，直接派生；
 *   3. Windows：npm 是 npm.cmd，execFileSync 派生会 EINVAL，改为执行 npm-cli.js
 *      （Node 官方安装包在 Windows 是 node_modules/npm、在 Linux/macOS 是
 *      lib/node_modules/npm，两种布局都查）。
 */
function auditJson() {
  const opts = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return execFileSync(process.execPath, [process.env.npm_execpath, 'audit', '--json'], opts);
  }
  if (process.platform !== 'win32') {
    return execFileSync('npm', ['audit', '--json'], opts);
  }
  const layouts = [
    join('node_modules', 'npm', 'bin', 'npm-cli.js'),
    join('lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const rel of layouts) {
    const cli = join(dirname(process.execPath), rel);
    if (existsSync(cli)) return execFileSync(process.execPath, [cli, 'audit', '--json'], opts);
  }
  throw new Error('找不到 npm：npm_execpath 未设置、裸名 npm 不可用、Node 自带 npm 不存在');
}

let raw;
try {
  raw = auditJson();
} catch (err) {
  // npm audit 存在漏洞时退出码非 0，但 stdout 仍是完整 JSON
  raw = err.stdout;
}
if (!raw) {
  console.error('❌ 无法取得 npm audit 输出');
  process.exit(1);
}

const audit = JSON.parse(raw);
const current = new Set();
for (const v of Object.values(audit.vulnerabilities || {})) {
  for (const adv of v.via || []) {
    if (typeof adv === 'object' && adv.url) current.add(adv.url);
  }
}

const baseline = new Set(JSON.parse(readFileSync(baselineFile, 'utf8')).advisories || []);

const added = [...current].filter((u) => !baseline.has(u));
const resolved = [...baseline].filter((u) => !current.has(u));

if (added.length) {
  console.error(`❌ 出现 ${added.length} 条基线之外的新 advisory：`);
  for (const u of added) console.error(`  - ${u}`);
  console.error(
    '\n请先逐条核实所需特性是否被本项目使用（见 CHANGELOG 1.1.0 的分析方法），\n' +
      '确认暴露面后再将其加入 .github/audit-baseline.json。不要直接扩充基线让 CI 变绿。'
  );
  process.exit(1);
}

if (resolved.length) {
  console.log(`提示：以下 ${resolved.length} 条基线条目已不再被报告（依赖已修复），可从基线移除：`);
  for (const u of resolved) console.log(`  - ${u}`);
}

console.log(`依赖漏洞基线检查通过：当前 ${current.size} 条 advisory 均在基线内。`);
