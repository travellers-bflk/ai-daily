export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day} 周${WEEKDAYS[d.getDay()]}`;
}

export function formatMonth(d: Date): string {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
}

/** 从日报正文中提取「今日速览」的头条列表 */
export function extractHeadlines(body: string): string[] {
  const match = body.match(/##\s*今日速览\s*\n([\s\S]*?)(?=\n##\s|$)/);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+[.、]\s*\S/.test(line))
    .map((line) => line.replace(/^\d+[.、]\s*/, ''));
}
