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
 *   来源：XXX
 *
 *   【2】...
 *
 *   ---
 *   本文由 AI 辅助整理...
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
  source: string;
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
      currentItem = {
        id: itemStart[1],
        title: itemStart[2].trim(),
        body: [],
        source: '',
      };
      mode = 'item';
      continue;
    }

    if (mode === 'item' && currentItem) {
      if (line.startsWith('来源：') || line.startsWith('来源:')) {
        currentItem.source = line.replace(/^来源[::]\s*/, '').trim();
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
        cur = { id: m[1], title: m[2].trim(), body: [], source: '' };
      } else if (cur) {
        if (line.startsWith('来源：') || line.startsWith('来源:')) {
          cur.source = line.replace(/^来源[::]\s*/, '').trim();
        } else if (line.trim()) cur.body.push(line);
      }
    }
    if (cur) allItems.push(cur);
    if (allItems.length) result.sections.push({ title: '综合', items: allItems });
  }

  return result;
}