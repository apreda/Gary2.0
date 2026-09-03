import { liveStats } from '@/lib/gary/press';

export const runtime = 'nodejs';
export const revalidate = 3600;

const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, character => XML_ENTITIES[character] ?? character);
}

function badgeSvg(record: string, detail: string): string {
  const safeRecord = escapeXml(record);
  const safeDetail = escapeXml(detail);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="520" height="112" viewBox="0 0 520 112" role="img" aria-labelledby="title description">
  <title id="title">Gary AI public game-pick record</title>
  <desc id="description">${safeDetail}</desc>
  <rect width="520" height="112" rx="16" fill="#0A0908"/>
  <rect x="1" y="1" width="518" height="110" rx="15" fill="none" stroke="#C9A227" stroke-opacity=".45"/>
  <circle cx="57" cy="56" r="31" fill="#211D12" stroke="#C9A227" stroke-opacity=".55"/>
  <text x="57" y="63" text-anchor="middle" fill="#C9A227" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700">G</text>
  <text x="105" y="35" fill="#C9A227" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing="1.4">GARY AI · PUBLIC GAME-PICK RECORD</text>
  <text x="105" y="68" fill="#F0EEE8" font-family="Arial, Helvetica, sans-serif" font-size="29" font-weight="700">${safeRecord}</text>
  <text x="105" y="91" fill="#A9A69F" font-family="Arial, Helvetica, sans-serif" font-size="12">Every game-pick result published · betwithgary.ai/results/audit</text>
</svg>`;
}

export async function GET() {
  let record = 'RECORD TEMPORARILY UNAVAILABLE';
  let detail = 'The live Gary AI record could not be verified when this badge was rendered.';

  try {
    const { allTime, asOf } = await liveStats();
    record = `${allTime.wins}-${allTime.losses}-${allTime.pushes} · ${allTime.pct}%`;
    detail = `${allTime.graded} graded game picks through ${asOf}: ${allTime.wins} wins, ${allTime.losses} losses, and ${allTime.pushes} pushes.`;
  } catch {
    // The badge remains useful if the public results source is temporarily unavailable.
  }

  return new Response(badgeSvg(record, detail), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
