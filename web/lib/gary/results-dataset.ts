import type { GameResultRow, PropResultRow } from '@/lib/gary/types';
import { SITE_URL } from '@/lib/seo/metadata';

export function datasetTemporalCoverage(
  games: GameResultRow[],
  props: PropResultRow[],
): string | undefined {
  const dates = [...games, ...props]
    .map(row => row.game_date)
    .filter((date): date is string => !!date && /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  return dates.length > 0 ? `${dates[0]}/${dates[dates.length - 1]}` : undefined;
}

export function resultsDataset(games: GameResultRow[], props: PropResultRow[]) {
  const temporalCoverage = datasetTemporalCoverage(games, props);
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': `${SITE_URL}/results/audit#dataset`,
    name: 'Gary AI public sports picks results ledger',
    description: 'Game-pick and player-prop outcomes published by Gary AI, including losses and pushes.',
    url: `${SITE_URL}/results/audit`,
    creator: { '@type': 'Organization', name: 'Gary A.I. LLC', url: SITE_URL },
    isAccessibleForFree: true,
    keywords: [
      'sports pick results',
      'sports prediction outcomes',
      'confidence calibration',
      'flat-stake units',
    ],
    ...(temporalCoverage ? { temporalCoverage } : {}),
    variableMeasured: [
      'Outcome (win, loss, or push)',
      'Listed odds',
      'Confidence label',
      'Flat-stake net units',
    ],
    distribution: [
      {
        '@type': 'DataDownload',
        name: 'Gary AI results ledger (CSV)',
        encodingFormat: 'text/csv',
        contentUrl: `${SITE_URL}/results.csv`,
      },
      {
        '@type': 'DataDownload',
        name: 'Gary AI results ledger (JSON)',
        encodingFormat: 'application/json',
        contentUrl: `${SITE_URL}/results.json`,
      },
    ],
  };
}
