import type { Metadata } from 'next';
import { PropLanePage } from '@/components/board/PropLanePage';
import { PROP_LANES } from '@/lib/gary/prop-lane-pages';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 600;

const lane = PROP_LANES['home-runs'];

export const metadata: Metadata = pageMetadata({
  canonical: lane.path,
  title: lane.metaTitle,
  description: lane.description,
});

export default function HomeRunPicksPage() {
  return <PropLanePage lane="home-runs" />;
}
