import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';

// "GARY'S TAKE" card for X — a server rebuild of the in-app PickCardBack (the card back / Gary's case): gold header +
// matchup, the pick(s) in gold, then Gary's written read as the body. Posts as the WORDLESS reply under the pick card,
// so a WC thread is all branded cards, no plain-text paragraphs. Same brand tokens as pick-card-app, gold border.
// GET /api/take-card?matchup=Austria @ Argentina&picks=AUSTRIA +1.5 · UNDER 2.5&take=...the read...
const GOLD = '#C9A227', CARD = '#1C1A1A', WHITE = '#FFFFFF';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const matchup = (searchParams.get('matchup') ?? '').toUpperCase();
  const picks = (searchParams.get('picks') ?? '').toUpperCase();
  const take = searchParams.get('take') ?? '';

  const [barlow, jbmono, interRg, interSb, bear] = await Promise.all([
    readFile(join(process.cwd(), 'assets/og/BarlowCondensed-Bold.ttf')),
    readFile(join(process.cwd(), 'assets/og/JetBrainsMono-Bold.ttf')),
    readFile(join(process.cwd(), 'assets/og/Inter-Regular.ttf')),
    readFile(join(process.cwd(), 'assets/og/Inter-SemiBold.ttf')),
    readFile(join(process.cwd(), 'assets/og/GaryIconBG.png')),
  ]);
  const bearSrc = `data:image/png;base64,${bear.toString('base64')}`;

  // Scale the read down as it gets longer so it never overflows the card (the app back-card scrolls; a static image can't).
  const takeSize = take.length > 320 ? 34 : take.length > 220 ? 40 : 46;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#000' }}>
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: CARD, border: `1px solid rgba(201,162,39,0.34)`, borderRadius: 28, padding: '56px 60px' }}>
          {/* header: GARY'S TAKE + matchup + bear */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ fontFamily: 'JBMono', fontSize: 28, color: GOLD, letterSpacing: 4 }}>GARY'S TAKE</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ fontFamily: 'JBMono', fontSize: 20, color: 'rgba(255,255,255,0.42)', letterSpacing: 1, marginRight: 20 }}>{matchup}</div>
              <img src={bearSrc} width={64} height={64} style={{ borderRadius: 14 }} />
            </div>
          </div>

          {/* the pick(s), in gold */}
          <div style={{ fontFamily: 'Barlow', fontSize: 64, color: GOLD, marginTop: 26, lineHeight: 1 }}>{picks}</div>

          {/* divider */}
          <div style={{ display: 'flex', height: 1, background: 'rgba(201,162,39,0.25)', marginTop: 26, marginBottom: 30 }} />

          {/* the read */}
          <div style={{ display: 'flex', fontFamily: 'Inter', fontWeight: 600, fontSize: takeSize, color: 'rgba(255,255,255,0.93)', lineHeight: 1.4, flex: 1 }}>{take}</div>

          {/* footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 24 }}>
            <div style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 24, color: 'rgba(255,255,255,0.45)' }}>The numbers and the full read are in the app.</div>
            <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 26, color: GOLD }}>betwithgary.ai</div>
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
        { name: 'Inter', data: interSb, style: 'normal', weight: 600 },
      ],
    },
  );
}
