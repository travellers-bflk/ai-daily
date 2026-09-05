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

// 注：板块配色的实际生效实现在 global.css 的 .section-block.color-* 类，
// 这里只需提供 color 名称，无需在 TS 侧维护第二份色值表。