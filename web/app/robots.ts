import type { MetadataRoute } from 'next';
import { BASE_URL, SITEMAP_INDEX_PATH } from '@/lib/seo/sitemap';

export const revalidate = 3600;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'Claude-Web', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
    ],
    sitemap: `${BASE_URL}${SITEMAP_INDEX_PATH}`,
  };
}
