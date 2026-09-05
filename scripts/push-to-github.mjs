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
 *   - 自动排除 node_modules / dist / .git / .env / 密钥文件等
 *   - 内容与远程完全一致时跳过推送（exit 0）
 *   - 内置凭据模式扫描，命中即中止
 */

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

const REPO = 'travellers-bflk/ai-daily';
const repoDir = process.argv[2];
const commitMessage =
  process.argv[3] || `AI 日报更新 ${new Date().toISOString().slice(0, 10)}`;

if (!repoDir) {
  console.error('用法: node push-to-github.mjs <目录路径> [提交信息]');
  process.exit(1);
}

/* ---------------- 排除规则（与 .gitignore 对齐 + 防呆） ---------------- */
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', '.astro', '.wrangler', '.vercel',
  '.vscode', '.idea', '.npm-cache', '__pycache__',
]);
const EXCLUDE_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const EXCLUDE_PATTERNS = [
  /^\.env(\.|$)/i, /\.log$/i, /\.pem$/i, /\.key$/i, /\.p12$/i, /\.pfx$/i,
];

const TEXT_EXTS = new Set([
  '.md', '.ts', '.js', '.mjs', '.cjs', '.astro', '.json', '.svg', '.txt',
  '.css', '.html', '.xml', '.yml', '.yaml', '.toml',
]);

/* ---------------- 凭据扫描 ---------------- */
const SECRET_PATTERNS = [
  { name: 'GitHub PAT', regex: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g },
  { name: 'AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'Slack Token', regex: /\bxox[baprs]-[0-9a-zA-Z-]{10,}\b/g },
  { name: 'OpenAI/Anthropic-style Key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  {
    name: 'Generic api_key/secret/token/password 赋值',
    regex: /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"]?[A-Za-z0-9_\\-]{16,}/gi,
  },
];

function scanSecrets(text, filePath) {
  const hits = [];
  for (const { name, regex } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    const m = text.match(regex);
    if (m) hits.push({ filePath, pattern: name, sample: m[0].slice(0, 12) + '…' });
  }
  return hits;
}

/* ---------------- 文件读取与 blob sha ---------------- */
function gitBlobSha(content) {
  const h = createHash('sha1');
  h.update(`blob ${content.length}\0`);
  h.update(content);
  return h.digest('hex');
}

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2',
  '.ttf', '.otf', '.eot', '.zip', '.gz', '.tgz', '.pdf', '.mp3', '.mp4',
  '.mov', '.webm',
]);

function readBlob(full) {
  const buf = readFileSync(full);
  const dot = full.lastIndexOf('.');
  const ext = dot >= 0 ? full.slice(dot).toLowerCase() : '';
  // 无 null 字节视为文本 → CRLF 归一化为 LF（与 git 存储一致）；二进制原样
  if (!BINARY_EXTS.has(ext) && !buf.includes(0)) {
    return Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  }
  return buf;
}

function walk(dir, base, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (EXCLUDE_DIRS.has(name)) continue;
      walk(full, base, out);
    } else {
      if (EXCLUDE_NAMES.has(name)) continue;
      const rel = relative(base, full).split(sep).join('/');
      if (EXCLUDE_PATTERNS.some((re) => re.test(rel))) continue;
      out.push({ path: rel, full });
    }
  }
  return out;
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
      console.error(`  - ${h.filePath}  命中 [${h.pattern}]  片段: ${h.sample}`);
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
