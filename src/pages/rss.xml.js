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
    items: reports.map((report) => ({
      title: report.data.title,
      pubDate: report.data.date,
      link: `/daily/${report.id}/`,
      description:
        extractHeadlines(report.body).join('\n') ||
        '每日 AI 行业资讯日报。',
    })),
    customData: '<language>zh-cn</language>',
  });
}
