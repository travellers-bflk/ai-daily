/**
 * 给 Cloudflare 边缘注入的脚本发一次性 CSP nonce。
 *
 * 背景：Bot Fight Mode（Free 计划下自动开启、且无法关闭的 JavaScript Detections）
 * 会往每个 HTML 响应里注入一段**内联**引导脚本，用来加载
 * /cdn-cgi/challenge-platform/scripts/jsd/main.js 做客户端机器人检测。
 * 这段脚本里嵌着每次请求都不同的 __CF$cv$params={r:…,t:…}（随机请求 ID + 时间戳），
 * 因此它的 hash 每次都变，无法用 CSP hash 放行；剩下的两条路是：
 *
 *   1. script-src 加 'unsafe-inline' —— 官方明确不推荐。本站的 CSP 正是最后一道
 *      XSS 防线（即使某处转义漏了，注入的脚本也不会执行），加上它等于自废武功。
 *   2. **用 nonce** —— Cloudflare 官方文档：「If your CSP uses a nonce for script
 *      tags, Cloudflare will add these nonces to the scripts it injects by parsing
 *      your CSP response header.」即它会读我们的响应头，把同一个 nonce 盖到它
 *      注入的脚本上。这条路两边都不用让步。
 *
 * 实现要点：
 *   - 不复制一份 CSP。直接读 _headers 已经设好的头，往 script-src 里插 nonce，
 *     避免「两处各写一份、迟早漂移」。
 *   - 只动 HTML 响应；已是 nonce 策略或没有 CSP 的原样返回。
 *   - 任何异常都不改变原有响应——中间件只能是加分项，不能成为新的故障点。
 *   - 若 Pages 对静态资源不执行中间件（或函数未部署），响应仍是 _headers 里那份
 *     严格策略：Web Analytics 照常工作，只有 JSD 的内联引导脚本继续被拦。
 *
 * 缓存注意：nonce 必须与响应一一对应。Cloudflare 默认不缓存 HTML，此处无需处理；
 * 若将来给 HTML 配了长缓存，nonce 会在缓存有效期内复用，安全性等同静态 nonce，
 * 届时不应再走 nonce 方案。
 */

const NONCE_BYTES = 16;

/** 生成 URL/属性安全的随机 nonce（去掉 base64 的 + / =） */
function randomNonce() {
  const buf = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(buf);
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/[+/=]/g, '');
}

function withNonce(csp, nonce) {
  // 只替换第一条 script-src；没有该指令时不改动
  return csp.replace(/\bscript-src\b/, `script-src 'nonce-${nonce}'`);
}

export async function onRequest(context) {
  let response;
  try {
    response = await context.next();
  } catch {
    // 拿不到响应就完全不介入，交给 Pages 自己的错误处理
    return new Response('Internal Error', { status: 500 });
  }

  try {
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;

    const csp = response.headers.get('content-security-policy');
    if (!csp || csp.includes("'nonce-")) return response;

    const patched = withNonce(csp, randomNonce());
    if (patched === csp) return response;

    response.headers.set('Content-Security-Policy', patched);
    return response;
  } catch {
    // 改不动头（例如不可变响应）时原样放行，绝不因为本中间件让站点出错
    return response;
  }
}
