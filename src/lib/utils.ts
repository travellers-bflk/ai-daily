export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day} 周${WEEKDAYS[d.getDay()]}`;
}

export function formatMonthTitle(year: number, month: number): string {
  return `${year} 年 ${month} 月`;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 从 markdown 正文解析「今日速览」头条列表（首页卡片预览用） */
export function extractHeadlines(body: string): string[] {
  const match = body.match(/##\s*今日速览\s*\n([\s\S]*?)(?=\n##\s|$)/);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+[.、]\s*\S/.test(line))
    .map((line) => line.replace(/^\d+[.、]\s*/, ''));
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