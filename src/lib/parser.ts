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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    // 分隔线：向前看第一条非空行——若为「## 」标题则视为板块分隔，否则视为文末声明起始
    if (line === '---') {
      const nextNonEmpty =
        lines.slice(i + 1).find((l) => l.trim() !== '') ?? '';
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

/** 行内 markdown 安全渲染：整体 HTML 转义 + [文字](http/https url) 链接 + **粗体** */
export function renderInlineMarkdown(text: string): string {
  // 先整体转义（链接 URL 中的 & 等已被转义，恰好是属性值的安全形式）
  let out = escapeHtml(text);
  // 链接：协议白名单校验用还原后的 URL；href 已随整体转义，无需再处理
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label: string, href: string) => {
      const raw = href.replace(/&amp;/g, '&');
      if (isSafeUrl(raw)) {
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      }
      // 不安全或非法 URL：退化为纯文本
      return label;
    }
  );
  // **粗体**
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  return out;
}

/** 将来源串渲染为安全 HTML：链接可点击，其余文本转义，日期以弱化标签缀尾 */
export function renderSourceHtml(source: string, date: string): string {
  const html = renderInlineMarkdown(source);
  return date
    ? `${html}<span class="source-date">${escapeHtml(date)}</span>`
    : html;
}