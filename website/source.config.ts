import { defineDocs, defineConfig } from 'fumadocs-mdx/config';
import { remarkEmbed } from './lib/remark-embed.mjs';

export const docs = defineDocs({
  dir: 'content/docs',
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkEmbed],
  },
});
