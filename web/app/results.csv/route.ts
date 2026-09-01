import { fetchAllGameResults, fetchAllPropResults } from '@/lib/gary/results';
import { resultsCsv } from '@/lib/gary/ledger';

export const revalidate = 3600;

export async function GET() {
  const [games, props] = await Promise.all([fetchAllGameResults(), fetchAllPropResults()]);
  return new Response(resultsCsv(games, props), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="gary-public-results.csv"',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}
