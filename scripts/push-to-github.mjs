#!/usr/bin/env node
/**
 * 将一个目录的内容推送到 GitHub 仓库 main 分支（无需本地 .git）。
 *
 * 原理：扫描目录全部文件 → 计算 git blob sha → 与远程 main 树 diff
 *      → 上传差异 blob → 建树 → 创建提交 → 快进更新 main
 *
 * 用法：
 *   node push-to-github.mjs <目录路径> [提交信息] [--dry-run]
 *
 *   --dry-run  跑完内容校验、凭据扫描与远端 diff，打印将要新增/修改/删除的
 *              文件清单，但不执行任何写操作。本脚本的成功路径会改写公开仓库的
 *              main，没有这个开关就无法被安全测试；每日推送前也可先跑一次预检。
 *
 * 凭据：
 *   优先读环境变量 AI_DAILY_GH_TOKEN（建议设为仅授权本仓库 Contents 读写的
 *   fine-grained PAT），未设置时回落到 `gh auth token`。详见下方注释。
 *
 * 说明：
 *   - 目录内容应与仓库内容一致（如从 tarball 解压，或本地 clone 工作区）
 *   - 推送前先执行 scripts/validate-content.mjs 内容校验，不通过则中止
 *   - 自动排除 node_modules / dist / .git / .env / 密钥文件等
 *     （排除清单与 .gitignore 并行维护，改动需同步，见 EXCLUDE_PATTERNS 处注释）
 *   - 内置凭据模式扫描，命中即中止；只报告文件与行号，不打印凭据内容
 *   - 内容与远程完全一致时跳过推送
 *
 * 退出码：
 *   0 成功 / 内容无变化跳过 · 1 参数或推送错误 · 2 凭据扫描命中 · 3 内容校验失败
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  walk, readBlob, gitBlobSha, scanSecrets, dedupeCommitMessage,
} from './lib/publish-guards.mjs';

const REPO = 'travellers-bflk/ai-daily';
const argv = process.argv.slice(2);
// --dry-run 可出现在任意位置；摘出后再取位置参数
const dryRun = argv.includes('--dry-run');
const positional = argv.filter((a) => a !== '--dry-run');
const repoDir = positional[0];
const explicitMessage = positional[1] || null;
// 凭据扫描的确认清单：形如 "path:line,path:line"，用于对已人工核实的命中放行
const secretAllowlist = new Set(
  (process.env.AI_DAILY_SECRET_ALLOWLIST || '').split(',').map((s) => s.trim()).filter(Boolean)
);

if (!repoDir) {
  console.error('用法: node push-to-github.mjs <目录路径> [提交信息] [--dry-run]');
  console.error('  --dry-run  跑完校验与 diff，打印将要推送的内容，但不做任何写操作');
  process.exit(1);
}

/* ---------------- 内容校验（推送前置闸） ----------------
 * 与 `npm run validate` 是同一把闸。放在脚本内部而非依赖调用方先跑，
 * 是为了让「校验 → 推送」的顺序成为脚本自身的保证：CI 只在 push 之后触发，
 * 拦不住已经发布的内容，格式错误的日报会让 Cloudflare 构建持续失败。
 *
 * 注意：执行的是**本脚本旁边**的可信校验器副本，只把待发布目录的内容路径作为
 * 数据传入。绝不能执行待发布目录里的脚本——每日流程中该目录是刚从远端拉下的
 * 快照，执行其中的代码等于把发布机的代码执行权交给仓库内容。
 */
const selfDir = dirname(fileURLToPath(import.meta.url));
const validateScript = join(selfDir, 'validate-content.mjs');
const contentDir = join(repoDir, 'src', 'content', 'daily');
if (!existsSync(contentDir)) {
  console.error(`❌ 找不到日报内容目录：${contentDir}`);
  console.error('   推送目录按契约应与仓库内容一致（含 src/content/daily），已中止推送。');
  process.exit(3);
}
try {
  // 校验器为零依赖纯 Node 实现，按传入的内容目录校验
  execFileSync(process.execPath, [validateScript, contentDir], { stdio: 'inherit' });
} catch {
  console.error('❌ 内容校验失败，已中止推送。');
  process.exit(3);
}

/* ---------------- GitHub API ----------------
 * 凭据优先级：
 *   1. AI_DAILY_GH_TOKEN —— 推荐。设为仅授权本仓库 Contents: Read and write 的
 *      fine-grained PAT，把泄露影响面限制在这一个公开仓库内。
 *   2. gh auth token —— 回落。这是 gh 登录用的 OAuth token，实测 scope 为
 *      gist / read:org / repo / workflow，其中 repo 可读写账号下所有仓库（含私有）。
 *      本脚本只需要 contents:write，范围远超所需；鉴于每日任务会让 AI 抓取任意外部
 *      网页内容后执行脚本，建议尽快切到方案 1。
 * 任何情况下都不打印 token 本身。
 */
const envToken = process.env.AI_DAILY_GH_TOKEN?.trim();
const token = envToken || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
if (!envToken) {
  console.error(
    '提示：未设置 AI_DAILY_GH_TOKEN，回落使用 gh auth token（scope 覆盖账号下全部仓库）。'
  );
}
const API = 'https://api.github.com';

async function api(path, method = 'GET', body = null) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'ai-daily-publisher',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} -> ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function main() {
  // 1. 扫描本地目录
  const files = walk(repoDir, repoDir, []);
  if (files.length === 0) throw new Error('目录为空: ' + repoDir);

  const local = [];
  const secretHits = [];
  for (const f of files) {
    const content = readBlob(f.full);
    const hits = scanSecrets(content.toString('utf8'), f.path, secretAllowlist);
    if (hits.length) secretHits.push(...hits);
    local.push({ path: f.path, sha: gitBlobSha(content), content });
  }
  if (secretHits.length) {
    console.error('❌ 隐私扫描失败，已中止推送：');
    for (const h of secretHits) {
      console.error(`  - ${h.filePath}:${h.line}  命中 [${h.pattern}]`);
    }
    console.error(
      '\n请确认文件内容是否为凭据误提交，移除后再推送。\n' +
        '若确认为误报（如新闻正文引用的示例字符串），可将 ' +
        'AI_DAILY_SECRET_ALLOWLIST 设为 "path:line,…" 显式放行。'
    );
    process.exit(2);
  }

  // 2. 远程 main 树
  const ref = await api(`/repos/${REPO}/git/ref/heads/main`);
  const remoteSha = ref.object.sha;
  const remoteCommit = await api(`/repos/${REPO}/git/commits/${remoteSha}`);
  const baseTreeSha = remoteCommit.tree.sha;
  const remoteTree = await api(
    `/repos/${REPO}/git/trees/${baseTreeSha}?recursive=1`
  );
  const remoteMap = new Map();
  for (const e of remoteTree.tree || []) {
    if (e.type === 'blob') remoteMap.set(e.path, e.sha);
  }

  // 3. diff
  const localMap = new Map(local.map((e) => [e.path, e.sha]));
  const uploads = local.filter((e) => remoteMap.get(e.path) !== e.sha);
  const deletions = [...remoteMap.keys()].filter((p) => !localMap.has(p));

  if (uploads.length === 0 && deletions.length === 0) {
    console.log('内容与远程 main 完全一致，跳过推送。');
    return;
  }

  // 提交信息：调用方未显式给出时用默认值；若与远端上一条提交首行重名、且本次是
  // 修改（而非新增）某篇日报，则追加「（修订）」——每日自动化重跑会在历史里留下
  // 两条同名提交，无法区分哪条是首发、哪条是事后修订
  const modifiesExistingDaily = uploads.some(
    (e) => remoteMap.has(e.path) && /^src\/content\/daily\/[^/]+\.md$/.test(e.path)
  );
  const commitMessage = dedupeCommitMessage(
    explicitMessage || `AI 日报 ${new Date().toISOString().slice(0, 10)}`,
    remoteCommit.message,
    modifiesExistingDaily
  );

  // 3.5 dry-run：只报告计划，不做任何写操作。
  // 本脚本的成功路径会改写公开仓库的 main，没有这个开关就无法被安全测试。
  if (dryRun) {
    const added = uploads.filter((e) => !remoteMap.has(e.path));
    const modified = uploads.filter((e) => remoteMap.has(e.path));
    console.log(`[dry-run] 未做任何写操作。以下为推送计划：`);
    console.log(`  本地扫描文件 : ${local.length}`);
    console.log(`  远程 main    : ${remoteSha.slice(0, 7)}`);
    console.log(`  提交信息     : ${commitMessage}`);
    console.log(`  新增 ${added.length} 个：`);
    for (const e of added) console.log(`    + ${e.path}`);
    console.log(`  修改 ${modified.length} 个：`);
    for (const e of modified) console.log(`    ~ ${e.path}`);
    console.log(`  删除 ${deletions.length} 个：`);
    for (const p of deletions) console.log(`    - ${p}`);
    console.log('\n[dry-run] 内容校验与凭据扫描均已通过。去掉 --dry-run 即真正推送。');
    return;
  }

  // 4. 上传差异 blob
  let uploaded = 0;
  for (const e of uploads) {
    const blob = await api(`/repos/${REPO}/git/blobs`, 'POST', {
      content: e.content.toString('base64'),
      encoding: 'base64',
    });
    if (blob.sha !== e.sha) {
      throw new Error(`blob sha 不一致：${e.path} 本地 ${e.sha} / 远程 ${blob.sha}`);
    }
    uploaded++;
  }

  // 5. 建树 → 提交 → 更新引用
  const tree = local.map((e) => ({
    path: e.path, mode: '100644', type: 'blob', sha: e.sha,
  }));
  for (const p of deletions) {
    tree.push({ path: p, mode: '100644', type: 'blob', sha: null });
  }

  const newTree = await api(`/repos/${REPO}/git/trees`, 'POST', {
    base_tree: baseTreeSha,
    tree,
  });
  const newCommit = await api(`/repos/${REPO}/git/commits`, 'POST', {
    message: commitMessage,
    tree: newTree.sha,
    parents: [remoteSha],
  });
  await api(`/repos/${REPO}/git/refs/heads/main`, 'PATCH', {
    sha: newCommit.sha,
    force: false,
  });

  console.log(
    `推送成功：${newCommit.sha.slice(0, 7)} "${commitMessage}" ` +
      `(${local.length} 个文件，上传 ${uploaded} 个 blob` +
      `${deletions.length ? `，删除 ${deletions.length} 个文件` : ''})`
  );
}

main().catch((err) => {
  console.error('推送失败：', err.message);
  process.exit(1);
});
