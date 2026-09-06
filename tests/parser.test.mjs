/**
 * parser.ts 单元测试。
 *
 * 覆盖首轮审查 P0-1 / P1-6 与复审 N9，以及 renderInlineMarkdown 这条 XSS 防线。
 * 用例来自 2026-09-05 两轮审查中手工构造并验证过的场景，固化下来防回归。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseDaily,
  escapeHtml,
  renderInlineMarkdown,
  renderSourceHtml,
} from '../src/lib/parser.ts';

/* ---------------- parseDaily：--- 分隔线的四种形态 ---------------- */

const NORMAL = [
  '## 今日速览',
  '',
  '1. 头条一',
  '2. 头条二',
  '',
  '## 行业动态',
  '',
  '【1】新闻标题',
  '',
  '正文段落。',
  '',
  '来源：[媒体](https://example.com)（9 月 5 日）',
  '',
  '---',
  '',
  '本文由 AI 辅助整理。信息截至 2026-09-05。',
].join('\n');

describe('parseDaily 分隔线处理', () => {
  test('正常结构：末尾单个 --- 之后的声明必须被捕获（P0-1）', () => {
    const r = parseDaily(NORMAL);
    assert.equal(r.headlines.length, 2);
    assert.equal(r.sections.length, 1);
    assert.equal(r.sections[0].title, '行业动态');
    assert.equal(r.sections[0].items.length, 1);
    assert.match(r.disclaimer, /本文由 AI 辅助整理/);
    assert.match(r.disclaimer, /信息截至 2026-09-05/);
  });

  test('正文以 --- 开头且后接 ## 标题：视为分隔线，不得吞掉整篇（P1-6）', () => {
    const r = parseDaily(`---\n\n${NORMAL.split('\n---\n')[0]}`);
    assert.equal(r.headlines.length, 2, '速览不应丢失');
    assert.equal(r.sections.length, 1);
    assert.equal(r.sections[0].title, '行业动态', '真实板块名不应退化为「综合」');
  });

  test('--- 作为板块之间的分隔线：两侧板块都应保留', () => {
    const body = [
      '## 今日速览',
      '',
      '1. 头条',
      '',
      '## 板块A',
      '',
      '【1】标题A',
      '',
      '正文。',
      '',
      '来源：[甲](https://a.com)（9 月 5 日）',
      '',
      '---',
      '',
      '## 板块B',
      '',
      '【2】标题B',
      '',
      '正文。',
      '',
      '来源：[乙](https://b.com)（9 月 5 日）',
      '',
      '---',
      '',
      '声明文字。',
    ].join('\n');
    const r = parseDaily(body);
    assert.deepEqual(r.sections.map((s) => s.title), ['板块A', '板块B']);
    assert.equal(r.disclaimer, '声明文字。');
  });

  test('末尾 --- 之后无任何内容：disclaimer 为空且不报错', () => {
    const r = parseDaily(`${NORMAL.split('\n---\n')[0]}\n---\n`);
    assert.equal(r.disclaimer, '');
    assert.equal(r.sections.length, 1);
  });
});

describe('parseDaily 容错', () => {
  test('无任何 ## 板块时，游离的【N】条目归入「综合」', () => {
    const r = parseDaily('【1】标题\n\n正文。\n\n来源：[甲](https://a.com)（9 月 5 日）\n');
    assert.equal(r.sections.length, 1);
    assert.equal(r.sections[0].title, '综合');
    assert.equal(r.sections[0].items[0].id, '1');
  });

  test('无今日速览时 headlines 为空', () => {
    const r = parseDaily('## 行业动态\n\n【1】标题\n\n正文。\n\n来源：[甲](https://a.com)（9 月 5 日）\n');
    assert.deepEqual(r.headlines, []);
  });

  test('空正文不抛异常（N1：曾因 body 为 undefined 使构建崩溃）', () => {
    assert.doesNotThrow(() => parseDaily(''));
    const r = parseDaily('');
    assert.deepEqual(r, { headlines: [], sections: [], disclaimer: '' });
  });

  test('来源行同时支持全角与半角冒号', () => {
    const full = parseDaily('## A\n\n【1】t\n\n正文。\n\n来源：[甲](https://a.com)（9 月 5 日）\n');
    const half = parseDaily('## A\n\n【1】t\n\n正文。\n\n来源: [甲](https://a.com)（9 月 5 日）\n');
    assert.equal(full.sections[0].items[0].source, half.sections[0].items[0].source);
  });

  test('来源行末尾日期被拆出到 sourceDate，且不带链接时也合法', () => {
    const r = parseDaily('## A\n\n【1】t\n\n正文。\n\n来源：路透社（8 月 31 日）\n');
    const item = r.sections[0].items[0];
    assert.equal(item.source, '路透社');
    assert.equal(item.sourceDate, '8 月 31 日');
  });
});

/* ---------------- renderInlineMarkdown：XSS 防线 ---------------- */

const ALLOWED_TAG = /^<\/?(a|strong|span)\b/i;

/**
 * 审计渲染输出是否安全。
 * 判据必须针对「未转义的真实标签/属性」，不能裸匹配 onerror= 之类字面文本——
 * 否则 &lt;img src=x onerror=alert(1)&gt; 这种已安全转义的结果会被误判为危险。
 * （审查过程中第一版判据就犯过这个错，报了 5 个假阳性。）
 */
function audit(out) {
  const problems = [];
  for (const m of out.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)) {
    if (!ALLOWED_TAG.test(m[0])) problems.push(`未转义标签 <${m[1]}>`);
  }
  for (const m of out.matchAll(/<a\b[^>]*>/g)) {
    if (/\son\w+\s*=/i.test(m[0])) problems.push('a 标签内含事件属性');
    const href = m[0].match(/href="([^"]*)"/)?.[1] ?? '';
    const decoded = href.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    if (/^\s*(javascript|data|vbscript):/i.test(decoded)) problems.push(`危险协议 ${decoded.slice(0, 32)}`);
    if (/["']/.test(href)) problems.push('href 内含未转义引号');
  }
  return problems;
}

const XSS_PAYLOADS = [
  ['javascript 协议', '[点我](javascript:alert(1))'],
  ['data 协议', '[点我](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'],
  ['vbscript 协议', '[点我](vbscript:msgbox(1))'],
  ['协议大小写绕过', '[点我](JaVaScRiPt:alert(1))'],
  ['双引号属性突破', '[点我](https://a.com/" onmouseover="alert(1))'],
  ['单引号属性突破', "[点我](https://a.com/' onload='alert(1))"],
  ['HTML 实体编码绕过', '[点我](java&#115;cript:alert(1))'],
  ['script 标签注入', '<script>alert(1)</script>'],
  ['img onerror', '<img src=x onerror=alert(1)>'],
  ['svg onload', '<svg onload=alert(1)>'],
  ['iframe 注入', '<iframe src="javascript:alert(1)"></iframe>'],
  ['粗体内夹标签', '**加粗 <img src=x onerror=alert(1)>**'],
  ['链接文字夹标签', '[<img src=x onerror=alert(1)>](https://a.com)'],
  ['裸尖括号与和号', 'a < b > c & d'],
];

describe('renderInlineMarkdown 安全边界', () => {
  for (const [name, payload] of XSS_PAYLOADS) {
    test(`拦截：${name}`, () => {
      const problems = audit(renderInlineMarkdown(payload));
      assert.deepEqual(problems, [], `输出不安全: ${problems.join('; ')}`);
    });
  }

  test('正常链接渲染为带 noopener noreferrer 的外链', () => {
    const out = renderInlineMarkdown('[路透社](https://reuters.com/a?x=1&y=2)');
    assert.equal(
      out,
      '<a href="https://reuters.com/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">路透社</a>'
    );
  });

  test('正常粗体渲染为 strong', () => {
    assert.equal(renderInlineMarkdown('这是**重点**内容'), '这是<strong>重点</strong>内容');
  });

  test('URL 含一层平衡括号时不得截断，且 </a> 后无残留裸括号（N9）', () => {
    const out = renderInlineMarkdown('[维基百科](https://zh.wikipedia.org/wiki/人工智能_(消歧义))');
    assert.equal(
      out,
      '<a href="https://zh.wikipedia.org/wiki/人工智能_(消歧义)" target="_blank" rel="noopener noreferrer">维基百科</a>'
    );
    assert.ok(!out.endsWith(')'), '不应残留裸右括号');
  });

  test('不安全 URL 退化为纯文本时同样不残留裸括号（N9）', () => {
    const out = renderInlineMarkdown('[点我](javascript:alert(1))');
    assert.equal(out, '点我');
  });
});

/* ---------------- escapeHtml / renderSourceHtml ---------------- */

describe('escapeHtml', () => {
  test('转义全部五个 HTML 敏感字符', () => {
    assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
  });

  test('和号只转义一次，不会双重转义', () => {
    assert.equal(escapeHtml('&amp;'), '&amp;amp;');
    assert.equal(escapeHtml('a & b'), 'a &amp; b');
  });
});

describe('renderSourceHtml', () => {
  test('多来源用顿号分隔，日期以弱化标签缀尾', () => {
    const out = renderSourceHtml('[甲](https://a.com)、[乙](https://b.com)', '9 月 5 日');
    assert.equal(out.match(/<a /g).length, 2);
    assert.match(out, /<span class="source-date">9 月 5 日<\/span>$/);
  });

  test('无日期时不输出 source-date 标签', () => {
    assert.ok(!renderSourceHtml('[甲](https://a.com)', '').includes('source-date'));
  });

  test('日期文本同样经过转义', () => {
    assert.match(renderSourceHtml('甲', '<9 月>'), /&lt;9 月&gt;/);
  });
});
