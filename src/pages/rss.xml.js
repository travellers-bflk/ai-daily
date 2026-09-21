import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { extractHeadlines } from '../lib/utils';

export async function GET(context) {
  const reports = (await getCollection('daily')).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );

  return rss({
    title: 'AI 日报',
    description: '每日 AI 行业资讯，由 AI 搜集整理发布。信息密度优先，克制客观。',
    site: context.site,
    // channel 自声明 <atom:link rel="self"> 与 <lastBuildDate>：缺失时部分聚合器
    // 会把订阅判为可疑或不判更高的抓取优先级（第四轮审查 P3-10）
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    items: reports.map((report) => {
      const headlines = extractHeadlines(report.body ?? '');
      // @astrojs/rss 无法输出 CDATA（xmlOptions 未设 cdataPropName），HTML 标签会被
      // 转义成字面量；转义也由 XMLBuilder 独自负责，此处不得再调 escapeHtml，否则双重转义。
      const description = headlines.length
        ? headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')
        : '每日 AI 行业资讯日报。';
      return {
        title: report.data.title,
        pubDate: report.data.date,
        link: `/daily/${report.id}/`,
        description,
      };
    }),
    customData: '<language>zh-cn</language>',
    customElements: [
      {
        'atom:link': [
          {
            _attr: {
              rel: 'self',
              type: 'application/rss+xml',
              href: new URL('rss.xml', context.site).toString(),
            },
          },
        ],
      },
      { lastBuildDate: (reports[0]?.data.date ?? new Date()).toUTCString() },
    ],
  });
}
