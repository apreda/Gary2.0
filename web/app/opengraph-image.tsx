import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const alt = 'Gary A.I. — Every game. Every day. On the record. betwithgary.ai';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const [jbMono, barlow, bear] = await Promise.all([
    readFile(join(process.cwd(), 'assets/og/JetBrainsMono-Bold.ttf')),
    readFile(join(process.cwd(), 'assets/og/BarlowCondensed-Bold.ttf')),
    readFile(join(process.cwd(), 'public/brand/gary-head.png'), 'base64'),
  ]);
  const bearSrc = `data:image/png;base64,${bear}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#0A0908',
          padding: '64px 80px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '100%',
          }}
        >
          <div
            style={{
              fontFamily: 'JetBrains Mono',
              fontSize: 34,
              color: '#C9A227',
              letterSpacing: 10,
            }}
          >
            GARY A.I.
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'Barlow Condensed',
              fontSize: 92,
              lineHeight: 1.04,
              color: '#FFFFFF',
              textTransform: 'uppercase',
            }}
          >
            <div>Every game.</div>
            <div>Every day.</div>
            <div>On the record.</div>
          </div>
          <div
            style={{
              fontFamily: 'JetBrains Mono',
              fontSize: 24,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: 2,
            }}
          >
            betwithgary.ai
          </div>
        </div>
        <img src={bearSrc} width={360} height={360} alt="" />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'JetBrains Mono', data: jbMono, style: 'normal', weight: 700 },
        { name: 'Barlow Condensed', data: barlow, style: 'normal', weight: 700 },
      ],
    }
  );
}
