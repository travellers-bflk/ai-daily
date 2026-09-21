/**
 * scripts/lib 单元测试。
 *
 * 重点是「防漂移」：排除规则是与 .gitignore 并行维护的第二份清单，复审 N6 就是
 * 因为两者漂移（脚本缺 *.local 与 npm-debug.log*）导致被忽略的文件可能进公开仓库。
 * 这里直接解析 .gitignore 逐条断言覆盖情况，将来任何一侧单独改动都会让测试失败。
 *
 * 凭据扫描的测试刻意只使用结构上形似、但明显不是真实凭据的合成字符串。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import {
  EXCLUDE_DIRS,
  EXCLUDE_NAMES,
  isExcluded,
  scanSecrets,
  dedupeCommitMessage,
  gitBlobSha,
  readBlob,
  walk,
} from '../scripts/lib/publish-guards.mjs';
import { checkLinksIn } from '../scripts/lib/link-check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 复刻 walk 的完整跳过判定，供 .gitignore 对照使用 */
function shouldSkip(relPath) {
  return EXCLUDE_NAMES.has(basename(relPath)) || isExcluded(relPath);
}

/* ---------------- N6：排除规则与 .gitignore 的对照 ---------------- */

describe('排除规则覆盖 .gitignore 的每一条', () => {
  const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
  const lines = gitignore
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  test('.gitignore 能被解析出若干条规则（否则本组测试形同虚设）', () => {
    assert.ok(lines.length >= 10, `只解析出 ${lines.length} 条，解析逻辑可能失效`);
  });

  for (const line of lines) {
    if (line.startsWith('!')) {
      const target = line.slice(1).replace(/\*/g, 'x');
      test(`反向规则 ${line} → ${target} 必须放行`, () => {
        assert.equal(shouldSkip(target), false, `${target} 被排除了，但 .gitignore 用 ${line} 保留了它`);
      });
      continue;
    }

    if (line.endsWith('/')) {
      const dir = line.slice(0, -1);
      test(`目录规则 ${line} → EXCLUDE_DIRS 必须包含 ${dir}`, () => {
        assert.ok(EXCLUDE_DIRS.has(dir), `EXCLUDE_DIRS 缺少 ${dir}`);
      });
      continue;
    }

    // 文件规则：把 * 替换为填充字符生成一个样本路径，断言被排除
    const sample = line.replace(/\*/g, 'x');
    test(`文件规则 ${line} → ${sample} 必须被排除`, () => {
      assert.equal(
        shouldSkip(sample),
        true,
        `${sample} 未被排除，但 .gitignore 的 ${line} 会忽略它——推送会把该文件发到公开仓库`
      );
    });
  }
});

describe('isExcluded 的边界', () => {
  const excluded = [
    'state.local', '.env', '.env.production', 'build.log',
    'npm-debug.log.1', 'secret.pem', 'id_rsa.key', 'cert.p12', 'key.pfx',
    'config/.env', 'logs/npm-debug.log.1', 'deep/nested/x.local',
  ];
  const kept = [
    'README.md', 'package.json', 'src/lib/parser.ts',
    'src/content/daily/2026-09-05.md', 'public/og-image.png',
    'scripts/push-to-github.mjs', '.github/workflows/ci.yml', '.gitignore',
    // gitignore 的 *.local 要求名字以 .local 结尾，下面两个本就不被忽略
    'config.local.js', 'settings.local.json',
    '.env.example',
  ];

  for (const p of excluded) test(`排除 ${p}`, () => assert.equal(isExcluded(p), true));
  for (const p of kept) test(`放行 ${p}`, () => assert.equal(isExcluded(p), false));
});

/* ---------------- N5：凭据扫描只报位置，绝不回传内容 ---------------- */

describe('scanSecrets', () => {
  /* 合成凭据：结构形似真实凭据但明显不是（重复字符 / 占位字样）。
   * 全部用 join 在运行时拼接——若以完整字面量写进源码，本测试文件自己就会被
   * scanSecrets 命中，而推送脚本扫描整个仓库，提交后将永久无法推送。 */
  const SYNTHETIC = [
    ['GitHub PAT', ['ghp_', 'A'.repeat(36)].join('')],
    // fine-grained PAT 正是 README/CHANGELOG 推荐的 AI_DAILY_GH_TOKEN 的形态；
    // 1.2.0 的扫描器完全认不出它（第四轮审查 P1-3）
    ['GitHub fine-grained PAT', ['github_pat_', 'F'.repeat(22), '_', 'G'.repeat(59)].join('')],
    ['npm token', ['npm_', 'H'.repeat(36)].join('')],
    ['AWS Access Key', ['AKIA', 'B'.repeat(16)].join('')],
    ['Private Key', ['-----BEGIN ', 'RSA PRIVATE KEY-----', '\nMIIE...'].join('')],
    ['Google API Key', ['AIza', 'C'.repeat(35)].join('')],
    ['Slack Token', ['xox', 'b-1234567890-abcdefghijklmnop'].join('')],
    ['OpenAI/Anthropic-style Key', ['sk-', 'D'.repeat(24)].join('')],
    ['Generic api_key/secret/token/password 赋值', ['api_key = "', 'E'.repeat(20), '"'].join('')],
  ];

  for (const [pattern, text] of SYNTHETIC) {
    test(`识别 ${pattern}`, () => {
      const hits = scanSecrets(text, 'synthetic.txt');
      assert.ok(hits.length >= 1, `应至少命中 1 次，实际 ${hits.length}`);
      assert.ok(
        hits.some((h) => h.pattern === pattern),
        `应命中 [${pattern}]，实际命中 ${hits.map((h) => h.pattern).join(', ')}`
      );
    });
  }

  test('一段文本可同时命中多种模式（赋值语境下的 PAT 也匹配 Generic）', () => {
    const text = ['token = "ghp_', 'A'.repeat(36), '"'].join('');
    const patterns = scanSecrets(text, 'both.txt').map((h) => h.pattern).sort();
    assert.deepEqual(patterns, ['Generic api_key/secret/token/password 赋值', 'GitHub PAT']);
  });

  test('返回结果只含 filePath/pattern/line，不含任何内容片段（N5）', () => {
    const text = `line one\nline two\nkey = AKIA${'B'.repeat(16)}\nline four`;
    const hits = scanSecrets(text, 'a/b.txt');
    assert.equal(hits.length, 1);
    assert.deepEqual(Object.keys(hits[0]).sort(), ['filePath', 'line', 'pattern']);
    assert.equal(hits[0].line, 3, '应报告命中所在行号');
    assert.equal(hits[0].filePath, 'a/b.txt');
    // 关键断言：序列化后不得出现凭据正文
    const serialized = JSON.stringify(hits);
    assert.ok(!serialized.includes('B'.repeat(16)), '命中信息里泄露了凭据正文');
    assert.ok(!serialized.includes('AKIA'), '命中信息里泄露了凭据前缀');
  });

  test('无凭据的正常内容不产生命中', () => {
    const normal = readFileSync(join(root, 'src/lib/parser.ts'), 'utf8');
    assert.deepEqual(scanSecrets(normal, 'src/lib/parser.ts'), []);
  });

  test('本仓库全部源码不会自触发扫描（否则推送永久失败）', () => {
    const files = walk(root, root);
    const hits = [];
    for (const f of files) {
      const buf = readBlob(f.full);
      if (buf.includes(0)) continue;
      hits.push(...scanSecrets(buf.toString('utf8'), f.path));
    }
    assert.deepEqual(hits.map((h) => `${h.filePath}:${h.line} ${h.pattern}`), []);
  });

  test('同一模式的多次命中全部报告，不再只报第一处（P3-1）', () => {
    const text = `ghp_${'A'.repeat(36)} 和 AKIA${'B'.repeat(16)} 以及 ghp_${'C'.repeat(36)}`;
    const hits = scanSecrets(text, 'multi.txt');
    assert.equal(hits.length, 3, 'GitHub PAT 的两处命中都要报出，外加 AWS 一处');
    assert.deepEqual(
      hits.map((h) => h.pattern).sort(),
      ['AWS Access Key', 'GitHub PAT', 'GitHub PAT']
    );
  });

  test('按 path:line 放行一处后，同文件该模式的其余命中仍要报出（P3-1）', () => {
    const text = `ghp_${'A'.repeat(36)}\nghp_${'C'.repeat(36)}`;
    const hits = scanSecrets(text, 'multi.txt', new Set(['multi.txt:1']));
    assert.equal(hits.length, 1, '第 1 行被放行，第 2 行的同模式命中不得一起被静默放行');
    assert.equal(hits[0].line, 2);
  });

  test('通用赋值模式对日报正文豁免，严格模式不豁免（P2-2）', () => {
    const generic = ['api_key = "', 'E'.repeat(20), '"'].join('');
    const strict = ['ghp_', 'A'.repeat(36)].join('');
    assert.deepEqual(
      scanSecrets(generic, 'src/content/daily/2026-09-09.md'),
      [],
      '新闻正文里的 token 形态字符串不应硬停每日发布'
    );
    assert.equal(scanSecrets(generic, 'scripts/x.mjs').length, 1, '代码路径仍须命中');
    assert.equal(
      scanSecrets(strict, 'src/content/daily/2026-09-09.md').length,
      1,
      '严格模式对内容目录不豁免'
    );
  });

  test('确认清单可放行已人工核实的命中（P2-2）', () => {
    const text = `line one\nline two\nkey = AKIA${'B'.repeat(16)}\nline four`;
    assert.equal(scanSecrets(text, 'a/b.txt').length, 1);
    assert.deepEqual(scanSecrets(text, 'a/b.txt', new Set(['a/b.txt:3'])), []);
    assert.equal(
      scanSecrets(text, 'a/b.txt', new Set(['a/b.txt:4'])).length,
      1,
      '行号不匹配的放行项不应生效'
    );
  });
});

describe('dedupeCommitMessage', () => {
  test('与远端上一条重名且修改已有日报时追加（修订）（P2-8）', () => {
    assert.equal(
      dedupeCommitMessage('AI 日报 2026-09-08', 'AI 日报 2026-09-08\n\nbody', true),
      'AI 日报 2026-09-08（修订）'
    );
  });

  test('信息不同名时原样返回', () => {
    assert.equal(
      dedupeCommitMessage('AI 日报 2026-09-09', 'AI 日报 2026-09-08', true),
      'AI 日报 2026-09-09'
    );
  });

  test('新增日报（非修改）时原样返回', () => {
    assert.equal(
      dedupeCommitMessage('AI 日报 2026-09-09', 'AI 日报 2026-09-09', false),
      'AI 日报 2026-09-09'
    );
  });
});

/* ---------------- gitBlobSha / readBlob / walk ---------------- */

describe('gitBlobSha', () => {
  test('与 git hash-object 一致（ASCII）', () => {
    assert.equal(gitBlobSha(Buffer.from('hello')), 'b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0');
  });

  test('blob 头长度用字节数而非字符数（多字节内容）', () => {
    const buf = Buffer.from('日报');
    assert.equal(buf.length, 6, '前提：「日报」是 6 字节 2 字符');
    // 期望值取自 printf '日报' | git hash-object --stdin
    assert.equal(gitBlobSha(buf), 'edc46f1edf4ef26e405223d7bb8b7b9a23bc6150');
  });

  test('空内容的 blob sha', () => {
    assert.equal(gitBlobSha(Buffer.from('')), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  });
});

describe('readBlob', () => {
  let dir;
  test('文本文件的 CRLF 归一化为 LF', () => {
    dir = mkdtempSync(join(tmpdir(), 'aidaily-test-'));
    const p = join(dir, 'a.md');
    writeFileSync(p, 'line1\r\nline2\r\n');
    assert.equal(readBlob(p).toString('utf8'), 'line1\nline2\n');
  });

  test('二进制扩展名不做归一化', () => {
    const p = join(dir, 'a.png');
    const bytes = Buffer.from([0x89, 0x50, 0x0d, 0x0a, 0x1a, 0x0a]);
    writeFileSync(p, bytes);
    assert.deepEqual(readBlob(p), bytes);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('walk', () => {
  test('递归收集文件、跳过排除目录与排除文件', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aidaily-walk-'));
    try {
      mkdirSync(join(dir, 'src'));
      mkdirSync(join(dir, 'node_modules'));
      mkdirSync(join(dir, 'dist'));
      writeFileSync(join(dir, 'README.md'), 'x');
      writeFileSync(join(dir, 'src', 'a.ts'), 'x');
      writeFileSync(join(dir, 'src', 'state.local'), 'x');
      writeFileSync(join(dir, 'node_modules', 'dep.js'), 'x');
      writeFileSync(join(dir, 'dist', 'index.html'), 'x');
      writeFileSync(join(dir, '.DS_Store'), 'x');

      const paths = walk(dir, dir).map((f) => f.path).sort();
      assert.deepEqual(paths, ['README.md', 'src/a.ts']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('返回的 path 使用正斜杠，与 GitHub API 的树路径格式一致', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aidaily-sep-'));
    try {
      mkdirSync(join(dir, 'a', 'b'), { recursive: true });
      writeFileSync(join(dir, 'a', 'b', 'c.md'), 'x');
      const [f] = walk(dir, dir);
      assert.equal(f.path, 'a/b/c.md');
      assert.ok(!f.path.includes('\\'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('不跟随符号链接——指向外部的链接目录不得进入推送清单（P2-5）', (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'aidaily-symlink-'));
    const outside = mkdtempSync(join(tmpdir(), 'aidaily-outside-'));
    try {
      writeFileSync(join(dir, 'real.md'), 'x');
      writeFileSync(join(outside, 'id_rsa.key'), 'x');
      try {
        symlinkSync(outside, join(dir, 'outsidelink'));
        symlinkSync(join(dir, 'real.md'), join(dir, 'filelink.md'));
      } catch {
        // Windows 未开开发者模式时创建符号链接需要管理员权限。CI 是 Linux，
        // 本地没权限不该让测试变红，只能跳过。
        t.skip('当前环境无法创建符号链接，跳过（CI 会覆盖此路径）');
        return;
      }
      const paths = walk(dir, dir).map((f) => f.path).sort();
      assert.deepEqual(paths, ['real.md'], '链接本身与链接指向的内容都不得被收集');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

/* ---------------- N9：链接校验的四条分支 ---------------- */

describe('checkLinksIn', () => {
  function collect(src) {
    const msgs = [];
    checkLinksIn(src, (m) => msgs.push(m));
    return msgs;
  }

  test('正常链接无问题', () => {
    assert.deepEqual(collect('[甲媒体](https://a.example.com)'), []);
  });

  test('一层平衡括号合法（维基消歧义页常见）', () => {
    assert.deepEqual(
      collect('[维基百科](https://zh.wikipedia.org/wiki/人工智能_(消歧义))'),
      []
    );
  });

  test('两层嵌套报出——渲染器只支持一层会截断', () => {
    const msgs = collect('[深层](https://x.example.com/a_(b_(c)))');
    assert.equal(msgs.length, 1);
    assert.match(msgs[0], /括号嵌套超过一层/);
  });

  test('括号未闭合报出', () => {
    const msgs = collect('[未闭合](https://e.example.com/a_(b');
    assert.equal(msgs.length, 1);
    assert.match(msgs[0], /括号未闭合/);
  });

  test('非 http(s) 协议报出', () => {
    const msgs = collect('[危险](javascript:alert(1))');
    assert.equal(msgs.length, 1);
    assert.match(msgs[0], /非 http\(s\) 链接/);
  });

  test('http 链接报出——属协议降级（P2-2）', () => {
    const msgs = collect('[降级](http://a.example.com/x)');
    assert.equal(msgs.length, 1);
    assert.match(msgs[0], /非 https 链接/);
  });

  test('追踪/分享参数报出（P2-2）', () => {
    const tracked = [
      'https://a.example.com/x?utm_source=alphasignal',
      'https://www.wsj.com/tech/ai/x?st=Jfx6Z1',
      'https://www.nytimes.com/x.html?unlocked_article_code=1.BFE.6RVR&smid=url-share',
      'https://view.inews.qq.com/a/20260914?scene=news-skill',
      'https://3w.huanqiu.com/a/c36dc8?agt=23',
      'https://x.example.com/y?refer=cp_1009',
      'https://www.cnstock.com/commonDetail/784537?commTag=true',
    ];
    for (const url of tracked) {
      const msgs = collect(`[甲媒体](${url})`);
      assert.equal(msgs.length, 1, `${url} 应报出追踪/分享参数`);
      assert.match(msgs[0], /追踪\/分享参数/);
    }
  });

  test('正常参数放行（id 等不是追踪参数）', () => {
    assert.deepEqual(collect('[一手](https://qwen.ai/blog?id=qwen3.8-omni-flash)'), []);
  });

  test('路径里的 _pdya11y 形后缀不是参数，不得误报', () => {
    assert.deepEqual(
      collect('[量子位](https://www.163.com/dy/article/L6KM0VB80511DSSR_pdya11y.html)'),
      []
    );
  });

  test('URL 含空白视为未闭合', () => {
    const msgs = collect('[断开](https://a.com/x y)');
    assert.equal(msgs.length, 1);
    assert.match(msgs[0], /括号未闭合/);
  });

  test('多个媒体名共用一个链接报出', () => {
    const msgs = collect('[Hugging Face、腾讯新闻](https://a.com)');
    assert.equal(msgs.length, 1);
    assert.match(msgs[0], /多个媒体名共用一个链接/);
  });

  test('链接文字里的括号内出处说明不算共用链接', () => {
    assert.deepEqual(collect('[腾讯新闻（转载：工信部、新华社报道）](https://a.com)'), []);
  });

  test('一条来源串里的多个链接逐个检查', () => {
    const msgs = collect('[甲](https://a.com)、[危险](javascript:x)');
    assert.equal(msgs.length, 1);
    assert.match(msgs[0], /非 http\(s\) 链接/);
  });
});
