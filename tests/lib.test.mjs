/**
 * utils.ts 与 sections.ts 单元测试。
 *
 * 覆盖首轮审查 P1-4（日期时区统一）、P2-9a（headlines 单一实现）、P2-9c（配色表
 * 唯一来源是 CSS）。最后一项用跨文件断言锁定：sections.ts 里出现的每个配色名，
 * global.css 必须有对应的 .color-* 规则——原本 TS 与 CSS 各维护一份色值表，
 * 删掉 TS 那份之后，这条断言防止将来再出现「有名字没样式」的板块。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WEEKDAYS,
  formatDate,
  formatMonthTitle,
  isoDate,
  extractHeadlines,
  daysInMonth,
  monthDays,
} from '../src/lib/utils.ts';
import { getSectionMeta } from '../src/lib/sections.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------- P1-4：日期必须统一以 UTC 为基准 ---------------- */

describe('日期格式化的时区一致性', () => {
  // frontmatter 的 date: YYYY-MM-DD 经 z.coerce.date() 解析为 UTC 午夜
  const utcMidnight = new Date('2026-09-05T00:00:00.000Z');

  test('formatDate 与 isoDate 对同一 Date 给出同一天', () => {
    assert.equal(isoDate(utcMidnight), '2026-09-05');
    assert.ok(
      formatDate(utcMidnight).startsWith('2026-09-05'),
      `formatDate 用了本地时区 getter，会与 isoDate 矛盾：${formatDate(utcMidnight)}`
    );
  });

  test('formatDate 取 UTC 星期，2026-09-05 是周六', () => {
    assert.equal(formatDate(utcMidnight), '2026-09-05 周六');
    assert.equal(WEEKDAYS[utcMidnight.getUTCDay()], '六');
  });

  test('UTC 午夜在负偏移时区仍是同一天（不得回退到前一天）', () => {
    // 该 Date 在 America/New_York 的本地时间是 2026-09-04 20:00，
    // 若 formatDate 用本地 getter 就会显示成 09-04 周五
    const nyLocalParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(utcMidnight);
    const nyDay = nyLocalParts.find((p) => p.type === 'day').value;
    assert.equal(nyDay, '04', '前提：该时刻在纽约确实是 9 月 4 日');
    assert.equal(isoDate(utcMidnight), '2026-09-05', 'formatDate 必须按 UTC 报 09-05');
  });

  test('formatDate 补零', () => {
    assert.equal(formatDate(new Date('2026-01-02T00:00:00.000Z')), '2026-01-02 周五');
  });

  test('formatMonthTitle', () => {
    assert.equal(formatMonthTitle(2026, 9), '2026 年 9 月');
  });
});

/* ---------------- P2-9a：extractHeadlines 复用 parser ---------------- */

describe('extractHeadlines', () => {
  const body = [
    '## 今日速览',
    '',
    '1. 头条一',
    '2、头条二',
    '',
    '## 行业动态',
    '',
    '【1】标题',
    '',
    '正文。',
    '',
    '来源：[甲](https://a.com)（9 月 5 日）',
  ].join('\n');

  test('提取编号条目并剥掉编号前缀', () => {
    assert.deepEqual(extractHeadlines(body), ['头条一', '头条二']);
  });

  test('同时支持「1.」与「1、」两种编号', () => {
    assert.equal(extractHeadlines(body).length, 2);
  });

  test('无今日速览时返回空数组', () => {
    assert.deepEqual(extractHeadlines('## 行业动态\n\n【1】t\n'), []);
  });

  test('空字符串不抛异常', () => {
    assert.deepEqual(extractHeadlines(''), []);
  });

  test('板块内的编号列表不会被误当成速览', () => {
    const b = '## 今日速览\n\n1. 真速览\n\n## 其他\n\n1. 假速览\n';
    assert.deepEqual(extractHeadlines(b), ['真速览']);
  });
});

/* ---------------- daysInMonth / monthDays ---------------- */

describe('月份天数', () => {
  test('闰年二月', () => {
    assert.equal(daysInMonth(2024, 2), 29);
    assert.equal(daysInMonth(2026, 2), 28);
  });

  test('世纪年闰年规则', () => {
    assert.equal(daysInMonth(2000, 2), 29);
    assert.equal(daysInMonth(1900, 2), 28);
  });

  test('monthDays 生成补零的完整 id 列表', () => {
    const days = monthDays(2026, 9);
    assert.equal(days.length, 30);
    assert.equal(days[0], '2026-09-01');
    assert.equal(days[29], '2026-09-30');
  });
});

/* ---------------- P2-9c：配色名的唯一来源是 global.css ---------------- */

describe('板块配色与 global.css 的一致性', () => {
  const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

  // 从 sections.ts 源码取出所有 color: 'xxx' 字面量，
  // 避免在测试里手抄第三份配色清单
  const sectionsSrc = readFileSync(join(root, 'src/lib/sections.ts'), 'utf8');
  const colorNames = [...new Set(
    [...sectionsSrc.matchAll(/color:\s*'([a-z]+)'/g)].map((m) => m[1])
  )];

  test('sections.ts 中至少声明了若干配色名', () => {
    assert.ok(colorNames.length >= 10, `只找到 ${colorNames.length} 个配色名，提取逻辑可能失效`);
  });

  for (const name of colorNames) {
    test(`global.css 存在 .section-block.color-${name} 规则`, () => {
      assert.ok(
        css.includes(`.section-block.color-${name}`),
        `配色名 "${name}" 在 sections.ts 中被使用，但 global.css 没有对应规则，板块会退化为默认色`
      );
    });
  }

  test('每条 .color-* 规则都定义了 hue/soft/ring 三个变量', () => {
    for (const name of colorNames) {
      const rule = css.match(new RegExp(`\\.section-block\\.color-${name}\\s*\\{([^}]*)\\}`));
      assert.ok(rule, `未找到 .section-block.color-${name} 规则体`);
      for (const v of ['--section-hue', '--section-soft', '--section-ring']) {
        assert.ok(rule[1].includes(v), `color-${name} 缺少 ${v}`);
      }
    }
  });

  test('sections.ts 不再维护第二份色值表（P2-9c 已删除 COLOR_VARS）', () => {
    assert.ok(!sectionsSrc.includes('COLOR_VARS'), 'COLOR_VARS 死代码不应复活');
    assert.ok(!sectionsSrc.includes('colorVars'), 'colorVars 死代码不应复活');
  });
});

describe('getSectionMeta', () => {
  test('已知板块名返回固定配色与图标', () => {
    assert.deepEqual(getSectionMeta('模型发布'), { color: 'teal', icon: 'rocket' });
    assert.deepEqual(getSectionMeta('传闻与爆料'), { color: 'amber', icon: 'eye' });
  });

  test('未知板块名基于哈希取色，且多次调用结果稳定', () => {
    const a = getSectionMeta('某个 AI 自由发挥的板块名');
    const b = getSectionMeta('某个 AI 自由发挥的板块名');
    assert.deepEqual(a, b, '同名板块必须得到相同配色，否则每次构建颜色都会变');
  });

  test('未知板块名返回的配色仍在 CSS 覆盖范围内', () => {
    const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');
    for (const name of ['量子计算', 'Robotaxi', '芯片与算力', 'AI 安全', '开源模型']) {
      const { color } = getSectionMeta(name);
      assert.ok(
        css.includes(`.section-block.color-${color}`),
        `板块「${name}」取到配色 ${color}，但 CSS 没有对应规则`
      );
    }
  });

  test('空板块名不抛异常', () => {
    assert.doesNotThrow(() => getSectionMeta(''));
  });
});
