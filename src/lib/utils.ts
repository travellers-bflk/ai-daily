import { parseDaily } from './parser.ts';

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function formatDate(d: Date): string {
  // frontmatter 日期解析为 UTC 午夜；统一用 UTC getter 与 isoDate 保持同一基准，
  // 避免在 UTC 负偏移的构建环境显示成前一天
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const wd = d.getUTCDay();
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')} 周${WEEKDAYS[wd]}`;
}

export function formatMonthTitle(year: number, month: number): string {
  return `${year} 年 ${month} 月`;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 从日报正文解析「今日速览」头条列表（单一实现，复用 parser 状态机） */
export function extractHeadlines(body: string): string[] {
  return parseDaily(body).headlines;
}

/** 计算某年某月有多少天 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 该年月的所有日报 id（YYYY-MM-DD 数组） */
export function monthDays(year: number, month: number): string[] {
  const n = daysInMonth(year, month);
  return Array.from({ length: n }, (_, i) => {
    const day = String(i + 1).padStart(2, '0');
    return `${year}-${String(month).padStart(2, '0')}-${day}`;
  });
}

/**
 * 周一开头的月历格子：null = 月外空白，数字 = 当月的日。
 * 长度恒为 7 的倍数（5 或 6 周）。
 * 1 号星期必须走 Date.UTC(...).getUTCDay()——本地 getter 在负偏移构建环境
 * 会把 UTC 午夜算成前一天，整月错位一天（同 P1-4 的教训）。
 */
export function calendarCells(year: number, month: number): (number | null)[] {
  const n = daysInMonth(year, month);
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 周日=0
  const lead = (first + 6) % 7; // 转周一开头的前置空白数
  const cells: (number | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= n; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}