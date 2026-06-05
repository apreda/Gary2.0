import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Gary AI — Every Game. Everyday. Always Free.';

export default function Image() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: 80, background: '#08080A',
        borderBottom: '6px solid #C9A227',
      }}>
        <div style={{ color: '#C9A227', fontSize: 28, letterSpacing: 4, fontFamily: 'monospace' }}>
          BETWITHGARY.AI
        </div>
        <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 84, fontWeight: 700, marginTop: 24, lineHeight: 1.05 }}>
          Every Game. Everyday.
        </div>
        <div style={{ color: '#C9A227', fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>
          Always Free.
        </div>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 30, marginTop: 28 }}>
          Free AI sports picks with written reasoning and a public track record.
        </div>
      </div>
    ),
    size,
  );
}
