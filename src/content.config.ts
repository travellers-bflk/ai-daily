import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const daily = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/daily' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    // 可选：内容在首发后被修订时填写，用于 JSON-LD 的 dateModified
    updated: z.coerce.date().optional(),
  }).strict(), // 多余键（如误写 update:）构建期即报错，不静默通过
});

export const collections = { daily };
