import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { extractHeadlines } from '../lib/utils';
import { escapeHtml } from '../lib/parser';

export async function GET(context) {
  const reports = (await getCollection('daily')).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );

  return rss({
    title: 'AI 日报',
    description: '每日 AI 行业资讯，由 AI 搜集整理发布。信息密度优先，克制客观。',
    site: context.site,
    items: reports.map((report) => {
      const headlines = extractHeadlines(report.body);
      // RSS description 按 HTML 渲染：速览输出为列表（@astrojs/rss 自动 CDATA 包裹）
      const description = headlines.length
        ? `<ul>${headlines.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>`
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
