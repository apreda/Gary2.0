/* eslint-disable @next/next/no-head-element -- this component renders email HTML, not a Next.js page */
import type { ReactNode } from 'react';

const colors = {
  ink: '#0A0908',
  card: '#16140E',
  line: '#332D1D',
  gold: '#C9A227',
  high: '#F0EEE8',
  mid: '#B8B4AA',
};

function EmailShell({
  preview,
  eyebrow,
  title,
  children,
  unsubscribeUrl,
  postalAddress,
}: {
  preview: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
  unsubscribeUrl: string;
  postalAddress: string;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
        <title>{title}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: colors.ink, color: colors.high }}>
        <span style={{ display: 'none', maxHeight: 0, overflow: 'hidden', opacity: 0 }}>
          {preview}
        </span>
        <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={{ backgroundColor: colors.ink }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: '32px 16px' }}>
                <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={{ maxWidth: 580 }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '0 0 18px', color: colors.gold, fontFamily: 'Arial, sans-serif', fontSize: 16, fontWeight: 700, letterSpacing: 1.2 }}>
                        GARY A.I.
                      </td>
                    </tr>
                    <tr>
                      <td style={{ border: `1px solid ${colors.line}`, borderRadius: 16, backgroundColor: colors.card, padding: '30px 28px' }}>
                        <div style={{ color: colors.gold, fontFamily: 'Arial, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase' }}>
                          {eyebrow}
                        </div>
                        <h1 style={{ margin: '10px 0 18px', color: colors.high, fontFamily: 'Arial, sans-serif', fontSize: 32, lineHeight: 1.05 }}>
                          {title}
                        </h1>
                        {children}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '22px 8px 0', color: colors.mid, fontFamily: 'Arial, sans-serif', fontSize: 12, lineHeight: 1.6 }}>
                        Gary provides sports analysis for informational and entertainment purposes only. 18+. No wager is placed through Gary.
                        <br />
                        You asked for Gary&rsquo;s website updates.{' '}
                        <a href={unsubscribeUrl} style={{ color: colors.gold }}>Unsubscribe from these updates</a>.
                        <br />
                        Gary A.I. LLC · {postalAddress} · betwithgary.ai
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

function Button({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      style={{ display: 'inline-block', marginTop: 22, borderRadius: 10, backgroundColor: colors.gold, color: colors.ink, fontFamily: 'Arial, sans-serif', fontSize: 15, fontWeight: 700, padding: '13px 20px', textDecoration: 'none' }}
    >
      {children}
    </a>
  );
}

const paragraphStyle = {
  margin: '0 0 14px',
  color: colors.mid,
  fontFamily: 'Arial, sans-serif',
  fontSize: 16,
  lineHeight: 1.65,
};

export function ConfirmationEmail({
  cadence,
  confirmUrl,
  unsubscribeUrl,
  postalAddress,
}: {
  cadence: string;
  confirmUrl: string;
  unsubscribeUrl: string;
  postalAddress: string;
}) {
  const cadenceLabel = cadence === 'daily' ? 'daily board alert' : cadence === 'weekly' ? 'Sunday record recap' : 'daily board alert and Sunday record recap';
  return (
    <EmailShell
      preview={`Confirm Gary's ${cadenceLabel}.`}
      eyebrow="Confirm your request"
      title="Make sure this was you."
      unsubscribeUrl={unsubscribeUrl}
      postalAddress={postalAddress}
    >
      <p style={paragraphStyle}>
        Someone requested Gary&rsquo;s {cadenceLabel} for this address. Confirm below before we send anything recurring.
      </p>
      <p style={paragraphStyle}>If that wasn&rsquo;t you, ignore this message. The request expires in 24 hours and an existing opt-out stays in place unless you confirm.</p>
      <Button href={confirmUrl}>Confirm Gary updates</Button>
    </EmailShell>
  );
}

export function DailyBoardEmail({
  dateLabel,
  gameCount,
  propCount,
  leagues,
  unsubscribeUrl,
  postalAddress,
}: {
  dateLabel: string;
  gameCount: number;
  propCount: number;
  leagues: string[];
  unsubscribeUrl: string;
  postalAddress: string;
}) {
  const boardSummary = gameCount > 0
    ? `${gameCount} game ${gameCount === 1 ? 'pick' : 'picks'}${propCount > 0 ? ` and ${propCount} props` : ''}`
    : 'the latest published calls';
  return (
    <EmailShell
      preview={`Gary's ${dateLabel} board is live with ${boardSummary}.`}
      eyebrow={`${dateLabel} · Daily board`}
      title="Today’s board is live."
      unsubscribeUrl={unsubscribeUrl}
      postalAddress={postalAddress}
    >
      <p style={paragraphStyle}>
        Gary has {boardSummary} on the public board{leagues.length > 0 ? ` across ${leagues.join(', ')}` : ''}. Every call includes the reasoning and stays on the graded record, win or loss.
      </p>
      <Button href="https://www.betwithgary.ai/today?utm_source=gary_email&utm_medium=email&utm_campaign=daily_board">See today&rsquo;s complete board</Button>
    </EmailShell>
  );
}

export function WeeklyRecordEmail({
  dateLabel,
  wins,
  losses,
  pushes,
  pct,
  graded,
  unsubscribeUrl,
  postalAddress,
}: {
  dateLabel: string;
  wins: number;
  losses: number;
  pushes: number;
  pct: number;
  graded: number;
  unsubscribeUrl: string;
  postalAddress: string;
}) {
  return (
    <EmailShell
      preview={`Gary's seven-day record: ${wins}-${losses}-${pushes} across ${graded} graded picks.`}
      eyebrow={`${dateLabel} · Sunday receipt`}
      title={`${wins}-${losses}-${pushes} this week.`}
      unsubscribeUrl={unsubscribeUrl}
      postalAddress={postalAddress}
    >
      <p style={paragraphStyle}>
        That&rsquo;s a {pct}% win rate across {graded} graded game picks over the last seven days. The complete ledger—including every loss—is public and downloadable.
      </p>
      <Button href="https://www.betwithgary.ai/results/audit?utm_source=gary_email&utm_medium=email&utm_campaign=weekly_record">Audit the record</Button>
    </EmailShell>
  );
}
