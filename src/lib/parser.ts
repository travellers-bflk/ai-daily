/**
 * 将日报 Markdown 正文解析为结构化数据，供卡片化渲染使用。
 *
 * 期望格式（板块由 AI 自行决定，名称自由）：
 *   ---
 *   ## 今日速览
 *   1. 头条一
 *   2. 头条二
 *
 *   ## <板块名>
 *
 *   【1】新闻标题
 *   正文段落...
 *
 *   来源：[媒体名](https://example.com)（8 月 31 日）
 *
 *   【2】...
 *
 *   ---
 *   本文由 AI 辅助整理...
 *
 * 来源行格式：
 *   - 链接为可选：`来源：路透社（8 月 31 日）` 同样合法
 *   - 多来源用 、 分隔：`来源：[甲](url1)、[乙](url2)（9 月 1 日）`
 *   - 日期为可选，位于末尾全角括号内
 *
 * 容错：
 *   - 无 ## 板块 → 所有条目归入「综合」板块
 *   - 无 今日速览 → headlines 为空
 *   - 缺来源或编号 → 跳过该项
 */

import { splitSourceParts, type SourcePart } from './sources.ts';

export interface NewsItem {
  id: string;
  title: string;
  body: string[];
  /** 来源行按顿号分段后的结果，每段各自带（可选的）日期标注 */
  sources: SourcePart[];
}

export interface Section {
  title: string;
  items: NewsItem[];
}

export interface ParsedDaily {
  headlines: string[];
  sections: Section[];
  disclaimer: string;
}

function makeItem(id: string, title: string): NewsItem {
  return { id, title, body: [], sources: [] };
}

function setSource(item: NewsItem, line: string) {
  const raw = line.replace(/^来源[：:]\s*/, '').trim();
  item.sources = splitSourceParts(raw);
}

function parseDailyUncached(body: string): ParsedDaily {
  const lines = body.split(/\r?\n/);
  const result: ParsedDaily = { headlines: [], sections: [], disclaimer: '' };

  let mode: 'idle' | 'headlines' | 'section' | 'item' | 'disclaimer' = 'idle';
  let currentSection: Section | null = null;
  let currentItem: NewsItem | null = null;

  const pushItem = () => {
    if (currentItem && currentSection) currentSection.items.push(currentItem);
    currentItem = null;
  };
  const pushSection = () => {
    pushItem();
    if (currentSection) result.sections.push(currentSection);
    currentSection = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    // 分隔线：向前看第一条非空行——若为「## 」标题则视为板块分隔，否则视为文末声明起始
    if (line === '---') {
      let nextNonEmpty = '';
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() !== '') {
          nextNonEmpty = lines[j];
          break;
        }
      }
      pushSection();
      if (nextNonEmpty.trimStart().startsWith('## ')) {
        mode = 'idle';
      } else {
        mode = 'disclaimer';
      }
      continue;
    }

    if (mode === 'disclaimer') {
      if (line.trim()) result.disclaimer += (result.disclaimer ? '\n' : '') + line;
      continue;
    }

    // 今日速览
    if (line === '## 今日速览') {
      pushSection();
      mode = 'headlines';
      continue;
    }

    // 任意板块
    if (line.startsWith('## ')) {
      pushSection();
      currentSection = { title: line.slice(3).trim(), items: [] };
      mode = 'section';
      continue;
    }

    // 速览条目
    if (mode === 'headlines' && /^\d+[.、]\s*\S/.test(line)) {
      result.headlines.push(line.replace(/^\d+[.、]\s*/, ''));
      continue;
    }

    // 新闻条目起点：【N】标题
    const itemStart = line.match(/^【(\d+)】\s*(.+)$/);
    if (itemStart) {
      pushItem();
      currentItem = makeItem(itemStart[1], itemStart[2].trim());
      mode = 'item';
      continue;
    }

    if (mode === 'item' && currentItem) {
      // 支持全角「：」和半角「:」
      if (line.startsWith('来源：') || line.startsWith('来源:')) {
        setSource(currentItem, line);
      } else if (line.trim()) {
        currentItem.body.push(line);
      }
    }
  }

  pushSection();

  // 容错：若没有板块但有游离的【N】项，归入「综合」
  if (result.sections.length === 0) {
    // 重新扫描提取
    const allItems: NewsItem[] = [];
    let cur: NewsItem | null = null;
    for (const raw of lines) {
      const line = raw.trimEnd();
      const m = line.match(/^【(\d+)】\s*(.+)$/);
      if (m) {
        if (cur) allItems.push(cur);
        cur = makeItem(m[1], m[2].trim());
      } else if (cur) {
        if (line.startsWith('来源：') || line.startsWith('来源:')) {
          setSource(cur, line);
        } else if (line.trim()) cur.body.push(line);
      }
    }
    if (cur) allItems.push(cur);
    if (allItems.length) result.sections.push({ title: '综合', items: allItems });
  }

  return result;
}

/**
 * 解析结果缓存：一次构建中同一篇正文会被首页统计、DayCard、详情页与 RSS
 * 各自解析一遍（合计约 5 次/篇），缓存后每篇只解析一次。
 * 缓存返回的是共享对象，故结果深冻结——任何调用方都不得改动返回值。
 */
const parseCache = new Map<string, ParsedDaily>();

function freezeParsed(p: ParsedDaily): ParsedDaily {
  for (const s of p.sections) {
    for (const it of s.items) {
      Object.freeze(it.body);
      Object.freeze(it);
    }
    Object.freeze(s.items);
    Object.freeze(s);
  }
  Object.freeze(p.sections);
  Object.freeze(p.headlines);
  return Object.freeze(p);
}

export function parseDaily(body: string): ParsedDaily {
  const hit = parseCache.get(body);
  if (hit) return hit;
  const result = freezeParsed(parseDailyUncached(body));
  parseCache.set(body, result);
  return result;
}

/* ============================================================
 * 来源行安全渲染：markdown 链接 → HTML
 * 安全策略：
 *   1. 文本内容 HTML 转义
 *   2. URL 仅允许 http/https 协议（阻断 javascript:、data: 等）
 *   3. 属性值转义（引号）
 *   4. 外链固定 target=_blank rel="noopener noreferrer"
 * ============================================================ */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 行内 markdown 链接：`[文字](url)`。
 * URL 部分允许一层平衡括号，否则 `…/人工智能_(消歧义)` 这类维基链接会在第一个
 * 右括号处被截断，href 少一个 `)` 且 `</a>` 后残留裸括号。
 */
const INLINE_LINK_RE = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))*)\)/g;

/** 行内 markdown 安全渲染：整体 HTML 转义 + [文字](http/https url) 链接 + **粗体** */
export function renderInlineMarkdown(text: string): string {
  // 先整体转义（链接 URL 中的 & 等已被转义，恰好是属性值的安全形式）
  let out = escapeHtml(text);
  // 链接先替换为占位符：粗体替换必须看不到 href，否则 URL 里的 * 会把
  // <strong> 写进属性值，或在正文留下孤立的 </strong>
  const links: string[] = [];
  out = out.replace(INLINE_LINK_RE, (_m, label: string, href: string) => {
    const raw = href.replace(/&amp;/g, '&');
    links.push(
      isSafeUrl(raw)
        ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : label // 不安全或非法 URL：退化为纯文本
    );
    return `\u0000${links.length - 1}\u0000`;
  });
  // **粗体**：flanking 规则——开 ** 之后、闭 ** 之前不得是空白，且两端不得紧贴
  // 单词字符或星号。否则 `**kwargs 与 **args`、`src/**/*.ts` 这类技术正文中的
  // 星号对会被错误配对，产生跨段加粗与裸星号。
  out = out.replace(
    /(?<![\w*])\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*(?![\w*])/g,
    '<strong>$1</strong>'
  );
  return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => links[Number(i)]);
}

/** 将来源分段渲染为安全 HTML：每段链接可点击、其余文本转义，各自的日期以弱化标签缀尾 */
export function renderSourcesHtml(parts: SourcePart[]): string {
  return parts
    .map((p) => {
      const html = renderInlineMarkdown(p.text);
      return p.date
        ? `${html}<span class="source-date">${escapeHtml(p.date)}</span>`
        : html;
    })
    .join('、');
}