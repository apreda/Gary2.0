import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';

// App-FAITHFUL pick card for X — a server-side rebuild of the in-app CompactPickRow (the June 11 headline card):
// gold "GARY'S PICK" eyebrow + bear, the pick as big stacked BarlowCondensed display type, a sport-accent league
// token + opponent + gold odds meta line, divider, gold start time + "GARY'S TAKE" footer. One pick per card
// (the app shows a 2-pick game as two adjacent cards). Tokens mirror the app exactly.
// GET /api/pick-card-app?token=WORLD CUP&hero1=AUSTRIA&hero2=%2B1.5&opp=@ Argentina&odds=-120&time=1:00 PM ET
const GOLD = '#C9A227', CARD = '#121110', WHITE = '#FFFFFF', TEAL = '#14B8A6';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const eyebrow = (searchParams.get('eyebrow') ?? "GARY'S PICK").toUpperCase();
  const token = (searchParams.get('token') ?? 'WORLD CUP').toUpperCase();
  const hero1 = (searchParams.get('hero1') ?? '').toUpperCase();
  const hero2 = (searchParams.get('hero2') ?? '').toUpperCase();
  const opp = searchParams.get('opp') ?? '';
  const odds = searchParams.get('odds') ?? '';
  const time = searchParams.get('time') ?? '';

  const [barlow, jbmono, interRg, interMd, bear] = await Promise.all([
    readFile(join(process.cwd(), 'assets/og/BarlowCondensed-Bold.ttf')),
    readFile(join(process.cwd(), 'assets/og/JetBrainsMono-Bold.ttf')),
    readFile(join(process.cwd(), 'assets/og/Inter-Regular.ttf')),
    readFile(join(process.cwd(), 'assets/og/Inter-SemiBold.ttf')),
    readFile(join(process.cwd(), 'assets/og/GaryIconBG.png')),
  ]);
  const bearSrc = `data:image/png;base64,${bear.toString('base64')}`;

  // Stacked hero scales to the longest line so long country names never clip (mirrors the app's minimumScaleFactor).
  const maxLen = Math.max(hero1.length, hero2.length);
  const heroSize = maxLen > 12 ? 150 : maxLen > 9 ? 178 : 206;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#000' }}>
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: CARD, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 28, padding: '60px 64px' }}>
          {/* eyebrow + bear */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: 'JBMono', fontSize: 30, color: GOLD, letterSpacing: 6 }}>{eyebrow}</div>
            <img src={bearSrc} width={92} height={92} style={{ borderRadius: 18 }} />
          </div>

          {/* stacked hero: picked team over the bet */}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14 }}>
            <div style={{ fontFamily: 'Barlow', fontSize: heroSize, color: WHITE, lineHeight: 0.96 }}>{hero1}</div>
            <div style={{ fontFamily: 'Barlow', fontSize: heroSize, color: WHITE, lineHeight: 0.96 }}>{hero2}</div>
          </div>

          {/* meta line: teal token + opponent + gold odds */}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 28 }}>
            <div style={{ fontFamily: 'JBMono', fontSize: 26, color: TEAL, letterSpacing: 2 }}>{token}</div>
            <div style={{ display: 'flex', fontFamily: 'Inter', fontWeight: 500, fontSize: 30, marginLeft: 20 }}>
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>{opp}</span>
              {odds ? <span style={{ color: 'rgba(255,255,255,0.40)' }}>{'  ·  '}</span> : null}
              {odds ? <span style={{ color: GOLD }}>{odds}</span> : null}
            </div>
          </div>

          {/* divider */}
          <div style={{ display: 'flex', height: 1, background: 'rgba(255,255,255,0.12)', marginTop: 'auto', marginBottom: 26 }} />

          {/* footer: gold start time + Gary's Take affordance */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'JBMono', fontSize: 24, color: GOLD, letterSpacing: 1 }}>{time}</div>
            <div style={{ fontFamily: 'JBMono', fontSize: 24, color: 'rgba(201,162,39,0.75)', letterSpacing: 2 }}>GARY'S TAKE  ›</div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 760,
      fonts: [
        { name: 'Barlow', data: barlow, style: 'normal', weight: 700 },
        { name: 'JBMono', data: jbmono, style: 'normal', weight: 700 },
        { name: 'Inter', data: interRg, style: 'normal', weight: 400 },
        { name: 'Inter', data: interMd, style: 'normal', weight: 500 },
      ],
    },
  );
}
