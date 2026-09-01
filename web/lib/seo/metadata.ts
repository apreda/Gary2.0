import type { Metadata } from 'next';

export const SITE_URL = 'https://www.betwithgary.ai';
export const RSS_FEED_PATH = '/feed.xml';
export const OPEN_GRAPH_IMAGE_PATH = '/opengraph-image';
export const TWITTER_IMAGE_PATH = '/twitter-image';

const socialImageAlt = 'Gary A.I. — Every game. Every day. On the record.';

const sharedOpenGraphImage = {
  url: OPEN_GRAPH_IMAGE_PATH,
  width: 1200,
  height: 630,
  alt: socialImageAlt,
};

const sharedTwitterImage = {
  url: TWITTER_IMAGE_PATH,
  width: 1200,
  height: 630,
  alt: socialImageAlt,
};

const sharedOpenGraph = {
  siteName: 'Gary AI',
  type: 'website' as const,
};

const sharedAlternateTypes = {
  'application/rss+xml': RSS_FEED_PATH,
};

type PageMetadataInput = Omit<Metadata, 'alternates' | 'openGraph' | 'twitter'> & {
  canonical: string;
  alternates?: Metadata['alternates'];
  openGraph?: Metadata['openGraph'];
  twitter?: Metadata['twitter'];
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
  twitter,
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
      // Declaring page-level Open Graph metadata stops Next.js from inheriting
      // the root file-based image. Re-emit it unless the page has a custom card.
      images: openGraph?.images ?? [sharedOpenGraphImage],
      // Keep the canonical URL and the social share URL in lockstep.
      url: canonical,
    },
    twitter: {
      card: 'summary_large_image',
      ...(title ? { title } : {}),
      ...(metadata.description ? { description: metadata.description } : {}),
      ...twitter,
      // Preserve custom Twitter cards while guaranteeing a share image for
      // every page that uses this helper.
      images: twitter?.images ?? openGraph?.images ?? [sharedTwitterImage],
    },
  };
}
