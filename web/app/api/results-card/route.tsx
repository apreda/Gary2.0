import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';

// Branded daily RESULTS card (1200x1200) for X. Built to be screenshot/repost-worthy proof.
// GET /api/results-card?record=14-5&date=June 17&w=Marlins ML +102|Mets ML -134&l=Tigers ML -112|Algeria +1.5
//   record  the day's W-L (e.g. "14-5")
//   date    label shown top-right (e.g. "June 17")
//   w       wins, pipe-separated picks
//   l       losses, pipe-separated picks
const GOLD = '#C9A227', BLACK = '#0A0908', SILVER = '#C7CCD6', GRAY = '#8A8F99', WHITE = '#E9EBEF', GREEN = '#3FB950', RED = '#E5534B';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const record = searchParams.get('record') ?? '0-0';
  const date = searchParams.get('date') ?? '';
  const wins = (searchParams.get('w') ?? '').split('|').map((s) => s.trim()).filter(Boolean);
  const losses = (searchParams.get('l') ?? '').split('|').map((s) => s.trim()).filter(Boolean);

  const [anton, interSb, interRg] = await Promise.all([
    readFile(join(process.cwd(), 'assets/og/Anton-Regular.ttf')),
    readFile(join(process.cwd(), 'assets/og/Inter-SemiBold.ttf')),
    readFile(join(process.cwd(), 'assets/og/Inter-Regular.ttf')),
  ]);

  const rows = [
    ...wins.map((p) => ({ win: true, p })),
    ...losses.map((p) => ({ win: false, p })),
  ];

  const mark = (win: boolean) => (
    <svg width="36" height="36" viewBox="0 0 24 24" style={{ marginRight: 24 }}>
      {win ? (
        <path d="M4 12.5 L9.5 18 L20 6" stroke={GREEN} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M6 6 L18 18 M18 6 L6 18" stroke={RED} strokeWidth={3} fill="none" strokeLinecap="round" />
      )}
    </svg>
  );

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: BLACK, padding: '72px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontFamily: 'Anton', fontSize: 46, color: GOLD }}>GARY A.I.</div>
          <div style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 26, color: GRAY, letterSpacing: 2, paddingTop: 8 }}>
            {(date ? date.toUpperCase() + '  ' : '') + 'RESULTS'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 24 }}>
          <div style={{ fontFamily: 'Anton', fontSize: 178, color: GOLD, lineHeight: 1 }}>{record}</div>
          <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 36, color: SILVER, marginTop: 10 }}>on the day</div>
        </div>

        <div style={{ display: 'flex', height: 3, background: '#26262A', marginTop: 38, marginBottom: 32 }} />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
              {mark(r.win)}
              <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 38, color: r.win ? WHITE : '#B6B6BC' }}>{r.p}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
          <div style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 26, color: GRAY }}>Every result graded, win or loss.</div>
          <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 28, color: GOLD }}>betwithgary.ai</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 1200,
      fonts: [
        { name: 'Anton', data: anton, style: 'normal', weight: 400 },
        { name: 'Inter', data: interSb, style: 'normal', weight: 600 },
        { name: 'Inter', data: interRg, style: 'normal', weight: 400 },
      ],
    },
  );
}
