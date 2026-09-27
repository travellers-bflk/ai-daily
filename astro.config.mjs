import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://439952066.xyz",
  // 404 已 noindex，sitemap 主动收口不收录它（@astrojs/sitemap 默认不过滤）
  integrations: [sitemap({ filter: (page) => !page.includes("/404") })],
});
