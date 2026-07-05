import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';

// THE APP'S SHARE CARD, verbatim — a server-side rebuild of HeadlineShareCardView(square: true)
// (ios/GaryApp/Views.swift), the exact image a user gets from the in-app share button. Gary tweeting a pick
// should be indistinguishable from someone sharing it from the app (founder, Jul 5). 540x540 @2x = 1080x1080.
// GET /api/share-card?hero=BRAZIL|MONEYLINE&league=WORLD CUP&meta=vs Norway · 4:00 PM ET · -130[&result=won]
// hero = pipe-separated stacked lines (the app stacks one word per line, ML spelled out MONEYLINE).
const GOLD = '#C9A227', CARD = '#121110', WHITE = '#FFFFFF';
const ACCENTS: Record<string, string> = {
  'WC': '#14B8A6', 'WORLD CUP': '#14B8A6',
  'MLB': '#63D17E', 'MLB HR': '#63D17E',
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const heroLines = (searchParams.get('hero') ?? '').toUpperCase().split('|').map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const league = (searchParams.get('league') ?? '').toUpperCase();
  const meta = searchParams.get('meta') ?? '';
  const accent = searchParams.get('accent') ?? ACCENTS[league] ?? GOLD;
  const result = (searchParams.get('result') ?? '').toLowerCase();
  const stamp = result === 'won' ? 'CASHED' : result === 'lost' ? 'LOST' : null;

  const [barlow, jbmono, interMd, bear] = await Promise.all([
    readFile(join(process.cwd(), 'assets/og/BarlowCondensed-Bold.ttf')),
    readFile(join(process.cwd(), 'assets/og/JetBrainsMono-Bold.ttf')),
    readFile(join(process.cwd(), 'assets/og/Inter-SemiBold.ttf')),
    readFile(join(process.cwd(), 'assets/og/GaryIconBG.png')),
  ]);
  const bearSrc = `data:image/png;base64,${bear.toString('base64')}`;

  // Mirror the app's minimumScaleFactor: shrink to the longest line (width) and the line count (height).
  const longest = Math.max(1, ...heroLines.map((l) => l.length));
  const byWidth = Math.min(124, Math.floor(1560 / longest));
  const byHeight = Math.floor(540 / (0.98 * Math.max(1, heroLines.length)));
  const heroSize = Math.max(62, Math.min(byWidth, byHeight));

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundImage: 'radial-gradient(circle at 50% 0%, #151311 0%, #0B0A09 100%)' }}>
        {/* the floating card (width 460@2x, radius 28@2x, #121110, hairline stroke, drop shadow) */}
        <div style={{ width: 920, display: 'flex', flexDirection: 'column', background: CARD, borderRadius: 56, border: '2px solid rgba(255,255,255,0.10)', padding: 60, boxShadow: '0 28px 52px rgba(0,0,0,0.55)' }}>
          {/* GARY'S PICK + bear */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: 'JBMono', fontSize: 28, color: GOLD, letterSpacing: 6, paddingTop: 16 }}>GARY'S PICK</div>
            <img src={bearSrc} width={108} height={108} style={{ borderRadius: 20 }} />
          </div>

          {/* stacked hero, one line per word, BarlowCondensed */}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 32 }}>
            {heroLines.map((line, i) => (
              <div key={i} style={{ fontFamily: 'Barlow', fontSize: heroSize, color: WHITE, lineHeight: 0.98 }}>{line}</div>
            ))}
          </div>

          {/* league token (the card's one sport-color touch) + meta line */}
          <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 28 }}>
            <div style={{ fontFamily: 'JBMono', fontSize: 26, color: accent, letterSpacing: 3 }}>{league}</div>
            <div style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 36, color: 'rgba(255,255,255,0.55)', marginLeft: 18 }}>{meta}</div>
          </div>

          {/* divider */}
          <div style={{ display: 'flex', height: 2, background: 'rgba(255,255,255,0.12)', marginTop: 36, marginBottom: 36 }} />

          {/* footer */}
          <div style={{ display: 'flex' }}>
            <div style={{ fontFamily: 'JBMono', fontSize: 25, color: 'rgba(201,162,39,0.8)' }}>betwithgary.ai</div>
          </div>
        </div>

        {/* result stamp, rotated over the whole canvas (the app's CASHED/LOST overlay) */}
        {stamp ? (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', fontFamily: 'JBMono', fontSize: 76, letterSpacing: 8, color: 'rgba(201,162,39,0.92)', border: '6px solid rgba(201,162,39,0.85)', padding: '20px 44px', transform: 'rotate(-12deg)' }}>{stamp}</div>
          </div>
        ) : null}
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      fonts: [
        { name: 'Barlow', data: barlow, style: 'normal', weight: 700 },
        { name: 'JBMono', data: jbmono, style: 'normal', weight: 700 },
        { name: 'Inter', data: interMd, style: 'normal', weight: 500 },
      ],
    },
  );
}
