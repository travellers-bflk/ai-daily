/**
 * 来源行的纯字符串处理：分段、剥离日期标注、提取媒体名。
 *
 * 来源行形如：
 *   [甲](url1)（9 月 8 日）、[乙（转载：丙报道）](url2)（9 月 9 日）
 * 以顿号分段，每段可自带末尾日期标注。本模块不依赖 parser，可被单元测试与
 * 页面层直接复用——「N 个来源」的去重键与每段日期的剥离都只在这里实现一份。
 *
 * 本模块不得有任何副作用。
 */

export interface SourcePart {
  /** 剥离末尾日期标注后的来源片段（仍含 markdown 链接） */
  text: string;
  /** 该片段自带的日期标注，如「9 月 8 日」；无则空串 */
  date: string;
}

/** 末尾的（M 月 D 日）/ (M 月 D 日) 标注；内容须含数字且不含括号 */
const TRAILING_DATE_RE = /[（(]([^（）()]{2,12})[）)]\s*$/;

/**
 * 按顿号拆分来源串，但只在括号/方括号深度为 0 处拆——
 * `[腾讯新闻（转载：工信部、新华社报道）]` 这类注记里的顿号不是分段点。
 */
export function splitSourceParts(raw: string): SourcePart[] {
  const segments: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of raw) {
    if (ch === '[' || ch === '(' || ch === '（') depth++;
    else if (ch === ']' || ch === ')' || ch === '）') depth = Math.max(0, depth - 1);
    if (ch === '、' && depth === 0) {
      segments.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  segments.push(cur);

  return segments
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) => {
      const m = seg.match(TRAILING_DATE_RE);
      if (m && /\d/.test(m[1])) {
        return {
          text: seg.slice(0, m.index).trim().replace(/[、\s]+$/, ''),
          date: m[1],
        };
      }
      return { text: seg, date: '' };
    });
}

/**
 * 媒体名：取链接文字（无链接取原文），并剥离「（转载：…）」这类括号注记——
 * 否则同一家媒体因注记不同会被去重键算成两家。
 */
export function mediaName(part: SourcePart): string {
  const label = part.text.match(/\[([^\]]+)\]/)?.[1] ?? part.text;
  return label.replace(/[（(][^）)]*[）)]/g, '').trim();
}

/** 去重后的媒体数（页面「N 个来源」指标的唯一实现） */
export function distinctMediaCount(parts: SourcePart[]): number {
  return new Set(parts.map(mediaName).filter(Boolean)).size;
}
