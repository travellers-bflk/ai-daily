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

export interface NewsItem {
  id: string;
  title: string;
  body: string[];
  /** 原始来源串（可能含 markdown 链接与末尾日期括号） */
  source: string;
  /** 从来源行末尾提取的日期标注，如「8 月 31 日」 */
  sourceDate: string;
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

/** 从来源串中剥离末尾（日期）标注（全角/半角括号皆可） */
function splitSourceDate(source: string): { text: string; date: string } {
  const m = source.match(/[（(]([^（）()]{2,12})[）)]\s*$/);
  if (m && /\d/.test(m[1])) {
    return { text: source.slice(0, m.index).trim().replace(/[、\s]+$/, ''), date: m[1] };
  }
  return { text: source, date: '' };
}

function makeItem(id: string, title: string): NewsItem {
  return { id, title, body: [], source: '', sourceDate: '' };
}

function setSource(item: NewsItem, line: string) {
  const raw = line.replace(/^来源[：:]\s*/, '').trim();
  const { text, date } = splitSourceDate(raw);
  item.source = text;
  item.sourceDate = date;
}

export function parseDaily(body: string): ParsedDaily {
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

  for (const raw of lines) {
    const line = raw.trimEnd();

    // 分隔线（文末声明前）
    if (line === '---') {
      if (mode === 'disclaimer' || mode === 'idle') {
        mode = 'disclaimer';
        continue;
      }
      // 板块内的 hr 视为板块结束
      pushSection();
      mode = 'idle';
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

/* ============================================================
 * 来源行安全渲染：markdown 链接 → HTML
 * 安全策略：
 *   1. 文本内容 HTML 转义
 *   2. URL 仅允许 http/https 协议（阻断 javascript:、data: 等）
 *   3. 属性值转义（引号）
 *   4. 外链固定 target=_blank rel="noopener noreferrer"
 * ============================================================ */

function escapeHtml(s: string): string {
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

const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/** 将来源串渲染为安全 HTML：链接可点击，其余文本转义，日期以弱化标签缀尾 */
export function renderSourceHtml(source: string, date: string): string {
  const parts: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(source)) !== null) {
    parts.push(escapeHtml(source.slice(last, m.index)));
    const [whole, text, url] = m;
    if (isSafeUrl(url)) {
      parts.push(
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`
      );
    } else {
      // 不安全或非法 URL：退化为纯文本
      parts.push(escapeHtml(text));
    }
    last = m.index + whole.length;
  }
  parts.push(escapeHtml(source.slice(last)));
  const html = parts.join('');
  return date
    ? `${html}<span class="source-date">${escapeHtml(date)}</span>`
    : html;
}