import type { Metadata } from 'next';

export const SITE_URL = 'https://www.betwithgary.ai';
export const RSS_FEED_PATH = '/feed.xml';

const sharedOpenGraph = {
  siteName: 'Gary AI',
  type: 'website' as const,
};

const sharedAlternateTypes = {
  'application/rss+xml': RSS_FEED_PATH,
};

type PageMetadataInput = Omit<Metadata, 'alternates' | 'openGraph'> & {
  canonical: string;
  alternates?: Metadata['alternates'];
  openGraph?: Metadata['openGraph'];
};

/**
 * Build page metadata without losing nested values inherited from the root.
 * Next.js replaces `alternates` and `openGraph` objects rather than deep-merging
 * them, so every page that declares a canonical needs to re-emit the RSS feed,
 * and every page that declares an OG URL needs the shared OG fields as well.
 */
export function pageMetadata({
  canonical,
  alternates,
  openGraph,
  ...metadata
}: PageMetadataInput): Metadata {
  const title = typeof metadata.title === 'string' ? metadata.title : undefined;

  return {
    ...metadata,
    alternates: {
      ...alternates,
      canonical,
      types: {
        ...sharedAlternateTypes,
        ...alternates?.types,
      },
    },
    openGraph: {
      ...sharedOpenGraph,
      ...(title ? { title } : {}),
      ...(metadata.description ? { description: metadata.description } : {}),
      ...openGraph,
      // Keep the canonical URL and the social share URL in lockstep.
      url: canonical,
    },
  };
}
