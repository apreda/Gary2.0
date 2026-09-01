import { fetchAllGameResults, fetchAllPropResults } from '@/lib/gary/results';
import { publicResultsLedger } from '@/lib/gary/ledger';

export const revalidate = 3600;

export async function GET() {
  const [games, props] = await Promise.all([fetchAllGameResults(), fetchAllPropResults()]);
  return Response.json(
    publicResultsLedger(games, props),
    {
      headers: {
        'Content-Disposition': 'attachment; filename="gary-public-results.json"',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'X-Robots-Tag': 'noindex, follow',
      },
    },
  );
}
