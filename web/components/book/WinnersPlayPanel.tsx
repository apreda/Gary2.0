'use client';

import { useEffect, useRef, useState } from 'react';
import { money, shortMatchup, clockET } from '@/lib/gary/ticket-format';
import { netUnits, payout, unitsNet, type WinnersPlay } from '@/lib/book/winners-play';
import { isLongShot } from '@/lib/gary/prop-lanes';
import { Icon } from '@/components/site/Icon';
import { BookDayProvider } from './BookDay';
import { PropTailFadeRow, TailFadeRow } from './TailFadeRow';
import { StateLine, TicketStub, type PlayState } from './WinnersCards';

// The play, opened (the app's LabPlayView, as a panel beside the board): the
// ticket, then why it made the board, then Gary's take.
export function WinnersPlayPanel({ play, state, date, now, onClose }: {
  play: WinnersPlay;
  state: PlayState;
  date: string;
  now: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      dialog.focus();
    }
  }, []);
  const stake = money(play.stakeUnits);
  const toWin = play.stakeUnits ? money(play.stakeUnits * payout(play.price)) : '';
  const net = play.result && !play.scratched ? unitsNet(netUnits(play)) : '';
  const clock = clockET(play.commence);
  const take = (play.rationale ?? '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const snap = play.snapshot;
  const share = async () => {
    const url = new URL(`/winners?date=${date}`, location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title: `Gary · ${play.title}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice('Link copied.');
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setNotice('Copy the page link from your browser.');
    }
  };
  return (
    <dialog
      ref={ref}
      className="win-panel"
      tabIndex={-1}
      aria-label={play.title}
      onCancel={onClose}
      onClose={onClose}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="win-panel-inner">
        <div className="win-panel-bar">
          <button type="button" onClick={share} aria-label={`Share ${play.title}`}><Icon name="share" /></button>
          <span role="status">{notice}</span>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="win-panel-ticket">
          <div className="win-card-head">
            <b>{play.league}</b>
            <span className="win-card-matchup">{shortMatchup(play.matchup, play.league)}</span>
            {clock && <span className="win-card-clock">{clock}</span>}
          </div>
          <h2>{play.title}</h2>
          <div className="win-card-state">
            <StateLine state={state} now={now} commence={play.commence} />
            <TicketStub play={play} />
          </div>
          {stake && (
            <dl className="win-panel-money">
              <div><dt>Risk</dt><dd>{stake}</dd></div>
              {net
                ? <div><dt>Result</dt><dd className={play.result ?? ''}>{net}</dd></div>
                : toWin && <div><dt>To win</dt><dd>{toWin}</dd></div>}
            </dl>
          )}
        </div>

        {play.reasons.length > 0 && (
          <section>
            <h3>Why it made the board</h3>
            <ol className="win-panel-reasons">
              {play.reasons.map((r, i) => (
                <li key={r.claim}>
                  <span className="win-panel-n">{i + 1}</span>
                  <div>
                    <strong>{r.claim}</strong>
                    {r.why && <p>{r.why}</p>}
                    {r.stat && <p className="win-panel-stat"><b>{r.stat}</b>{r.note && <span>{r.note}</span>}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {take.length > 0 && (
          <section>
            <h3>Gary&apos;s take</h3>
            <div className="win-panel-take">{take.map((p, i) => <p key={i}>{p}</p>)}</div>
          </section>
        )}

        {play.keyStats.length > 0 && (
          <section>
            <h3>Stats behind the pick</h3>
            <ul className="win-panel-stats">{play.keyStats.map(s => <li key={s}>{s}</li>)}</ul>
          </section>
        )}

        <BookDayProvider date={date}>
          {play.kind === 'game' ? (
            <TailFadeRow pickText={snap.pick ?? ''} pickId={snap.pick_id} commence={snap.commence_time} />
          ) : !isLongShot(snap) && (
            <PropTailFadeRow
              player={snap.player ?? ''}
              prop={snap.prop ?? ''}
              commence={snap.commence_time}
              gameId={snap.game_id != null || snap.bdl_game_id != null ? String(snap.game_id ?? snap.bdl_game_id) : null}
              line={snap.line != null && Number.isFinite(Number(snap.line)) ? Number(snap.line) : null}
              side={snap.bet}
            />
          )}
        </BookDayProvider>
      </div>
    </dialog>
  );
}
