/**
 * 板块元数据：颜色 + 图标 + 备用配色。
 * AI 使用未识别的板块名时，会基于名字哈希从调色板挑一个稳定配色。
 */

export interface SectionMeta {
  color: string;
  icon: string;
}

const KNOWN: Record<string, SectionMeta> = {
  要闻: { color: 'orange', icon: 'star' },
  模型发布: { color: 'teal', icon: 'rocket' },
  产品应用: { color: 'indigo', icon: 'apps' },
  行业动态: { color: 'green', icon: 'trending' },
  技术与洞察: { color: 'blue', icon: 'chart' },
  开发生态: { color: 'purple', icon: 'code' },
  传闻与爆料: { color: 'amber', icon: 'eye' },
  模型与产品: { color: 'teal', icon: 'rocket' },
  观点与技术洞察: { color: 'blue', icon: 'chart' },
  融资: { color: 'green', icon: 'cash' },
  监管: { color: 'slate', icon: 'shield' },
  综合: { color: 'gray', icon: 'inbox' },
};

const FALLBACK_PALETTE: SectionMeta[] = [
  { color: 'pink', icon: 'spark' },
  { color: 'cyan', icon: 'wave' },
  { color: 'lime', icon: 'leaf' },
  { color: 'rose', icon: 'flame' },
  { color: 'violet', icon: 'orbit' },
  { color: 'amber', icon: 'sun' },
  { color: 'sky', icon: 'cloud' },
  { color: 'fuchsia', icon: 'gem' },
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function getSectionMeta(title: string): SectionMeta {
  if (KNOWN[title]) return KNOWN[title];
  const palette = FALLBACK_PALETTE;
  return palette[hash(title) % palette.length];
}

export const COLOR_VARS: Record<string, { hue: string; soft: string; ring: string }> = {
  orange: { hue: '#ea580c', soft: '#fff3ec', ring: '#fed7aa' },
  teal: { hue: '#0d9488', soft: '#ecfdf8', ring: '#99eede' },
  indigo: { hue: '#4f46e5', soft: '#eef0ff', ring: '#c4c9ff' },
  green: { hue: '#16a34a', soft: '#ecfdf3', ring: '#bbf7d0' },
  blue: { hue: '#2563eb', soft: '#eaf2ff', ring: '#bfd6ff' },
  purple: { hue: '#9333ea', soft: '#f6edff', ring: '#e2c8ff' },
  amber: { hue: '#d97706', soft: '#fef5e7', ring: '#fcd9a4' },
  slate: { hue: '#475569', soft: '#eef1f5', ring: '#cbd5e1' },
  gray: { hue: '#6b7280', soft: '#f1f2f4', ring: '#d1d5db' },
  pink: { hue: '#db2777', soft: '#fceaf3', ring: '#f9b4d6' },
  cyan: { hue: '#0891b2', soft: '#e6f8fc', ring: '#a5e3f0' },
  lime: { hue: '#65a30d', soft: '#f4fae6', ring: '#d9efb0' },
  rose: { hue: '#e11d48', soft: '#fdecef', ring: '#fbb6c4' },
  violet: { hue: '#7c3aed', soft: '#f1ebff', ring: '#d6c0ff' },
  sky: { hue: '#0284c7', soft: '#e7f4fd', ring: '#b3dffc' },
  fuchsia: { hue: '#c026d3', soft: '#faeafc', ring: '#f1b8f5' },
};

export function colorVars(name: string) {
  return COLOR_VARS[name] || COLOR_VARS.gray;
}