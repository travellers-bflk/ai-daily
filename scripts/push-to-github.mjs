#!/usr/bin/env node
/**
 * 将一个目录的内容推送到 GitHub 仓库 main 分支（无需本地 .git）。
 *
 * 原理：扫描目录全部文件 → 计算 git blob sha → 与远程 main 树 diff
 *      → 上传差异 blob → 建树 → 创建提交 → 快进更新 main
 *
 * 用法：
 *   node push-to-github.mjs <目录路径> [提交信息]
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

import { execSync, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { walk, readBlob, gitBlobSha, scanSecrets } from './lib/publish-guards.mjs';

const REPO = 'travellers-bflk/ai-daily';
const repoDir = process.argv[2];
const commitMessage =
  process.argv[3] || `AI 日报更新 ${new Date().toISOString().slice(0, 10)}`;

if (!repoDir) {
  console.error('用法: node push-to-github.mjs <目录路径> [提交信息]');
  process.exit(1);
}

/* ---------------- 内容校验（推送前置闸） ----------------
 * 与 `npm run validate` 是同一把闸。放在脚本内部而非依赖调用方先跑，
 * 是为了让「校验 → 推送」的顺序成为脚本自身的保证：CI 只在 push 之后触发，
 * 拦不住已经发布的内容，格式错误的日报会让 Cloudflare 构建持续失败。
 */
const validateScript = join(repoDir, 'scripts', 'validate-content.mjs');
if (!existsSync(validateScript)) {
  console.error(`❌ 找不到内容校验脚本：${validateScript}`);
  console.error('   推送目录按契约应与仓库内容一致（含 scripts/），已中止推送。');
  process.exit(3);
}
try {
  // 校验器为零依赖纯 Node 实现，快照目录没有 node_modules 也能直接跑；
  // 它按自身位置解析 src/content/daily，无需传目录参数
  execFileSync(process.execPath, [validateScript], { stdio: 'inherit' });
} catch {
  console.error('❌ 内容校验失败，已中止推送。');
  process.exit(3);
}

/* ---------------- GitHub API ---------------- */
const token = execSync('gh auth token').toString().trim();
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
    const hits = scanSecrets(content.toString('utf8'), f.path);
    if (hits.length) secretHits.push(...hits);
    local.push({ path: f.path, sha: gitBlobSha(content), content });
  }
  if (secretHits.length) {
    console.error('❌ 隐私扫描失败，已中止推送：');
    for (const h of secretHits) {
      console.error(`  - ${h.filePath}:${h.line}  命中 [${h.pattern}]`);
    }
    console.error('\n请确认文件内容是否为凭据误提交，移除后再推送。');
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
