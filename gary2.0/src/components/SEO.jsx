import React from 'react';
import { Helmet } from 'react-helmet-async';

/**
 * Per-page SEO. Sets <title>, <meta description>, canonical URL, and the
 * OpenGraph + Twitter card pair so the page works correctly in search results
 * and on social shares (X, iMessage, etc).
 *
 * Defaults match the marketing landing — pass overrides for inner pages.
 */
export default function SEO({
  title = 'Gary AI — Smarter Sports Bets',
  description = 'Daily AI-driven sports betting picks across NBA, NHL, MLB, NCAAB, and NCAAF. Three AI models investigate, debate, and lock the pick. Free on iOS.',
  path = '/',
  image = '/coin2.png',
  noindex = false,
}) {
  const url = `https://www.gary.ai${path}`;
  const absImage = image.startsWith('http') ? image : `https://www.gary.ai${image}`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={absImage} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={absImage} />
    </Helmet>
  );
}
