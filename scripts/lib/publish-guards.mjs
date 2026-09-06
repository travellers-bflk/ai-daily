/**
 * push-to-github.mjs 的纯函数部分：排除规则、凭据扫描、blob 计算、目录遍历。
 *
 * 抽成独立模块的原因：这些是隐私与安全的关键路径（漏一条排除规则 = 把被
 * gitignore 的文件发到公开仓库；扫描逻辑有缺陷 = 凭据外泄），需要能被单元测试
 * 直接 import。原脚本在模块加载时就会执行校验闸、取 token 并推送，无法安全导入。
 *
 * 本模块不得有任何副作用。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

/* ---------------- 排除规则 ----------------
 * 这是与 .gitignore 并行维护的第二份清单（push-to-github.mjs 的设计前提是
 * 「无需本地 .git」，因此不能直接用 git check-ignore）。修改 .gitignore 时必须
 * 同步这里，反之亦然。漏掉一条的后果是：被 gitignore 忽略的文件被推送到公开仓库。
 * tests/publish-guards.test.mjs 锁定了这条对应关系。
 */
export const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', '.astro', '.wrangler', '.vercel',
  '.vscode', '.idea', '.npm-cache', '__pycache__',
]);

export const EXCLUDE_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

export const EXCLUDE_PATTERNS = [
  /(^|\/)\.env(\.|$)/i,         // .gitignore: .env / .env.*（任意层级）
  /\.local$/i,                  // .gitignore: *.local
  /\.log$/i,                    // .gitignore: *.log
  /(^|\/)npm-debug\.log/i,      // .gitignore: npm-debug.log*（任意层级，含 .log.1 / .log.gz）
  /\.pem$/i, /\.key$/i, /\.p12$/i, /\.pfx$/i,
];

// .gitignore 用 !.env.example 反向保留模板文件，此处同步放行
export const INCLUDE_OVERRIDES = [/(^|\/)\.env\.example$/i];

/** 判断一个仓库相对路径是否应被排除在推送之外 */
export function isExcluded(relPath) {
  return (
    EXCLUDE_PATTERNS.some((re) => re.test(relPath)) &&
    !INCLUDE_OVERRIDES.some((re) => re.test(relPath))
  );
}

/* ---------------- 凭据扫描 ---------------- */
export const SECRET_PATTERNS = [
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

/**
 * 扫描文本中的凭据模式，返回命中位置。
 * 只报文件与行号，不返回任何内容片段——打印凭据片段本身就是二次泄露
 * （输出会被 CI 与流水线日志留存）。每种模式每文件只报第一次命中，避免刷屏。
 */
export function scanSecrets(text, filePath) {
  const hits = [];
  for (const { name, regex } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    for (const m of text.matchAll(regex)) {
      hits.push({ filePath, pattern: name, line: text.slice(0, m.index).split('\n').length });
      break;
    }
  }
  return hits;
}

/* ---------------- 文件读取与 blob sha ---------------- */
export function gitBlobSha(content) {
  const h = createHash('sha1');
  h.update(`blob ${content.length}\0`);
  h.update(content);
  return h.digest('hex');
}

export const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2',
  '.ttf', '.otf', '.eot', '.zip', '.gz', '.tgz', '.pdf', '.mp3', '.mp4',
  '.mov', '.webm',
]);

export function readBlob(full) {
  const buf = readFileSync(full);
  const dot = full.lastIndexOf('.');
  const ext = dot >= 0 ? full.slice(dot).toLowerCase() : '';
  // 无 null 字节视为文本 → CRLF 归一化为 LF（与 git 存储一致）；二进制原样
  if (!BINARY_EXTS.has(ext) && !buf.includes(0)) {
    return Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  }
  return buf;
}

/** 递归收集目录下应推送的文件，返回 [{ path: 仓库相对路径, full: 绝对路径 }] */
export function walk(dir, base, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (EXCLUDE_DIRS.has(name)) continue;
      walk(full, base, out);
    } else {
      if (EXCLUDE_NAMES.has(name)) continue;
      const rel = relative(base, full).split(sep).join('/');
      if (isExcluded(rel)) continue;
      out.push({ path: rel, full });
    }
  }
  return out;
}
