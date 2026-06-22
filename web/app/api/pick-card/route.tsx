import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';

// Branded PICK card (1200x1200) for X. Sibling of results-card. Shows one game and Gary's play(s) on it.
// Same-game picks share ONE card (a clean, readable list), mirroring the app's "group picks by game" rule.
// GET /api/pick-card?league=WORLD CUP&away=Austria&home=Argentina&time=1:00 PM ET&picks=Austria +1.5 -120|Under 2.5 -120
//   league  eyebrow shown top-right (e.g. "WORLD CUP")
//   away    away team
//   home    home team
//   time    kickoff label (e.g. "1:00 PM ET")
//   picks   pipe-separated full pick strings, trailing odds parsed out and right-aligned
const GOLD = '#C9A227', BLACK = '#0A0908', SILVER = '#C7CCD6', GRAY = '#8A8F99', WHITE = '#E9EBEF';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const league = (searchParams.get('league') ?? 'PICK').toUpperCase();
  const away = searchParams.get('away') ?? '';
  const home = searchParams.get('home') ?? '';
  const time = searchParams.get('time') ?? '';
  const picks = (searchParams.get('picks') ?? '').split('|').map((s) => s.trim()).filter(Boolean);

  const [anton, interSb, interRg] = await Promise.all([
    readFile(join(process.cwd(), 'assets/og/Anton-Regular.ttf')),
    readFile(join(process.cwd(), 'assets/og/Inter-SemiBold.ttf')),
    readFile(join(process.cwd(), 'assets/og/Inter-Regular.ttf')),
  ]);

  // Split a pick string into its body and trailing American odds so odds can sit right-aligned.
  const rows = picks.map((p) => {
    const m = p.match(/([+-]\d+)\s*$/);
    return { body: (m ? p.slice(0, m.index).trim() : p), odds: m ? m[1] : '' };
  });

  // Keep the horizontal matchup on one line: scale the type down for long country pairings.
  const mLen = (away.length + home.length);
  const matchSize = mLen > 22 ? 62 : mLen > 16 ? 76 : 92;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: BLACK, padding: '72px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontFamily: 'Anton', fontSize: 46, color: GOLD }}>GARY A.I.</div>
          <div style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 26, color: GRAY, letterSpacing: 2, paddingTop: 8 }}>
            {league}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 48 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', fontFamily: 'Anton', fontSize: matchSize, color: WHITE, lineHeight: 1 }}>
            <span>{away.toUpperCase()}</span>
            <span style={{ color: GOLD, fontSize: matchSize * 0.6, margin: '0 22px' }}>VS</span>
            <span>{home.toUpperCase()}</span>
          </div>
          {time ? <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 32, color: SILVER, marginTop: 18 }}>{time}</div> : null}
        </div>

        <div style={{ display: 'flex', height: 3, background: '#26262A', marginTop: 44, marginBottom: 40 }} />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 14, height: 14, borderRadius: 7, background: GOLD, marginRight: 26 }} />
                <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 44, color: WHITE }}>{r.body}</div>
              </div>
              {r.odds ? <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 40, color: SILVER }}>{r.odds}</div> : null}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
          <div style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 26, color: GRAY }}>Posted before kickoff. Full read in the app.</div>
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
