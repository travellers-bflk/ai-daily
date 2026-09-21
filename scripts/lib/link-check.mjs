/**
 * 来源行 markdown 链接的独立校验。
 *
 * 刻意不复用渲染器（src/lib/parser.ts 的 INLINE_LINK_RE）的正则，而是逐字符走一遍
 * 并用深度计数定位右括号：两套不同算法互为制衡，渲染器正则若有缺陷，这里不会跟着
 * 一起漏检。这也是 validate-content.mjs 文件头声明的设计意图。
 *
 * 抽成独立模块以便单元测试直接 import（validate-content.mjs 在模块加载时就会扫描
 * 目录并可能 process.exit）。本模块不得有任何副作用。
 */

/**
 * 检查一段来源串里的所有 markdown 链接。
 * @param {string} src 来源串原文
 * @param {(msg: string) => void} report 命中问题时调用，参数为不含条目编号的描述
 */
export function checkLinksIn(src, report) {
  for (const m of src.matchAll(/\[([^\]]+)\]\(/g)) {
    const label = m[1];
    const urlStart = m.index + m[0].length;
    let depth = 1;
    let maxDepth = 1;
    let end = -1;
    for (let i = urlStart; i < src.length; i++) {
      const ch = src[i];
      if (/\s/.test(ch)) break; // URL 中不允许空白，遇到即视为未闭合
      if (ch === '(') {
        depth++;
        if (depth > maxDepth) maxDepth = depth;
      } else if (ch === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) {
      report(`链接括号未闭合: [${label}](…`);
      continue;
    }
    const url = src.slice(urlStart, end);
    // 渲染器只支持一层平衡括号，更深的嵌套会被截断成坏 href，提前报出来
    if (maxDepth > 2) {
      report(`链接 URL 括号嵌套超过一层，渲染器会截断: [${label}](${url})`);
    }
    if (!/^https?:\/\//.test(url)) {
      report(`非 http(s) 链接: ${url}`);
    }
    // http 属协议降级：HTTPS 页面跳出去会被降级或剥离（第四轮审查 P2-2 曾清理 5 条）
    if (/^http:\/\//.test(url)) {
      report(`非 https 链接（http 属协议降级）: ${url}`);
    }
    // 追踪 / 分享参数：utm_* 系列与各家的分享令牌。这类参数把读者的访问绑到分享者
    // 账号（纽约时报的 unlocked_article_code、华尔街日报的 st=），或只是统计标识，
    // 都不该写进永久归档（第四轮审查 P2-2）。
    // 注意只解析 query 部分：163 的文章 slug 里的 _pdya11y 位于路径中，不是参数，
    // 不得误伤。
    const qIdx = url.indexOf('?');
    if (qIdx >= 0) {
      const keys = url
        .slice(qIdx + 1)
        .split('#')[0]
        .split('&')
        .map((kv) => kv.split('=')[0])
        .filter(Boolean);
      const tracked = keys.filter((k) =>
        /^(?:utm_.+|st|smid|scene|refer|agt|commTag|unlocked_article_code)$/i.test(k)
      );
      if (tracked.length) {
        report(`链接带追踪/分享参数（${tracked.join('、')}）: ${url}`);
      }
    }
    // 「一个链接一个来源」：剥掉（转载：…）括号内的出处说明后再检查顿号，
    // `[腾讯新闻（转载：工信部、新华社报道）]` 合法，`[Hugging Face、腾讯新闻]` 违规
    const labelOutsideParens = label.replace(/[（(][^）)]*[）)]/g, '');
    if (labelOutsideParens.includes('、')) {
      report(`多个媒体名共用一个链接: [${label}](${url})`);
    }
  }
}
