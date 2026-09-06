#!/usr/bin/env node
/**
 * 从 GitHub 下载仓库 main 分支最新快照（tarball）并解压到工作目录。
 * 走 gh CLI 的 api.github.com 通道（本机 git HTTPS 不稳时的稳定替代）。
 *
 * 用法：
 *   node fetch-repo.mjs [工作目录]
 *
 * 输出：
 *   仓库根目录路径（<工作目录>/repo），供 push-to-github.mjs 使用。
 *   每次运行都会重新下载覆盖，保证内容 = 远程 main 最新状态。
 */

import { execSync } from 'node:child_process';
import {
  rmSync, mkdirSync, writeFileSync, readdirSync, renameSync, existsSync, statSync,
} from 'node:fs';
import { join, resolve, basename } from 'node:path';

const REPO = 'travellers-bflk/ai-daily';
// 注：默认值是每日自动化任务依赖的固定快照目录，改动前需同步调整调用方；
// 可用命令行参数覆盖（覆盖值同样受下方 .daily-work 目录名校验约束）。
const DEFAULT_WORK = 'D:/ai/workbuddy/other/.daily-work';
const work = resolve(process.argv[2] || DEFAULT_WORK);
const repoTarget = join(work, 'repo');

// 1. 清理工作目录。本脚本会递归删除整个 work，因此只接受专属的 .daily-work 目录，
//    避免误传路径（如 node fetch-repo.mjs D:/ai）时摧毁无关数据。
if (basename(work) !== '.daily-work') {
  console.error(`拒绝删除：工作目录名必须是 .daily-work，收到 ${work}`);
  console.error('本脚本会递归删除整个工作目录，为防止误删不接受其他路径。');
  process.exit(1);
}
if (existsSync(work) && !statSync(work).isDirectory()) {
  console.error(`拒绝删除：${work} 已存在但不是目录`);
  process.exit(1);
}
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

// 2. 下载 tarball（api.github.com 通道，跟随重定向由 gh 处理）
const tarball = join(work, 'repo.tar.gz');
const buf = execSync(`gh api repos/${REPO}/tarball/main`, {
  maxBuffer: 100 * 1024 * 1024,
});
writeFileSync(tarball, buf);

// 3. 解压（Windows 自带 bsdtar；用 cwd + 相对路径，避免 "D:" 被解析为远程主机）
execSync('tar -xzf repo.tar.gz', { cwd: work, stdio: 'pipe' });

// 4. 定位解压出的唯一顶层目录（形如 travellers-bflk-ai-daily-<sha>）→ 重命名为 repo
const entries = readdirSync(work).filter(
  (n) => n !== 'repo.tar.gz' && n !== 'repo'
);
if (entries.length !== 1) {
  throw new Error('解压结果异常，顶层条目: ' + entries.join(', '));
}
if (existsSync(repoTarget)) rmSync(repoTarget, { recursive: true, force: true });
renameSync(join(work, entries[0]), repoTarget);

// 5. 清理 tarball
rmSync(tarball, { force: true });

console.log(repoTarget);
