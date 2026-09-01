/**
 * 内联 SVG 图标库（Lucide 风格线条图标）
 * 渲染时由 SectionIcon 组件按 name 取 path，注入到共享 <svg> 中。
 */

export const ICONS: Record<string, string> = {
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91 0 0-1.09-1.79-2.91-.09Z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  apps: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  trending: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  chart: '<line x1="3" y1="20" x2="21" y2="20"/><rect x="5" y="11" width="3" height="9"/><rect x="11" y="6" width="3" height="14"/><rect x="17" y="14" width="3" height="6"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>',
  spark: '<path d="M12 2v6m0 12v6M4.93 4.93l4.24 4.24m5.66 5.66 4.24 4.24M2 12h6m12 0h6M4.93 19.07l4.24-4.24m5.66-5.66 4.24-4.24"/>',
  wave: '<path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-3.5 2.5-9 8-9 1.5 0 3 .5 4 1.5-2 6.5-6 10.5-9 11.5Z"/><path d="M2 22c1.5-3 4-6 8-9"/>',
  flame: '<path d="M12 2s4 4 4 9-3 7-4 7-4-2-4-7 4-9 4-9Z"/>',
  orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(45 12 12)"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  cloud: '<path d="M17.5 19a4.5 4.5 0 1 0-1.5-8.74A6 6 0 1 0 6.5 19Z"/>',
  gem: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
  chevronRight: '<polyline points="9 18 15 12 9 6"/>',
  arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  default: '<circle cx="12" cy="12" r="9"/>',
};