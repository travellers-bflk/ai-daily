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
  });
}
