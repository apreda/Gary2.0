/**
 * Gary's own bets on the live game, for the strip under the Cash Rail
 * scoreboard (founder, Oct 29–30 2026: track Gary's game pick, props and
 * darts on the game). Three boxes at most — GAME PICK, PROPS, DARTS — each
 * with its progress from the plays so far, settled at the final whistle.
 */
import { playerTotals } from './settle.js';

const MINUS = '−';
const STAT = { anytime_td: 'tds' };
const SHORT = {
  passing_yards: 'PASS YDS', rushing_yards: 'RUSH YDS', receiving_yards: 'REC YDS', receptions: 'REC',
  passing_tds: 'PASS TD', anytime_td: 'TD', rushing_receiving_yards: 'RUSH+REC YDS', passing_completions: 'COMP',
  passing_attempts: 'ATT', interceptions: 'INT', rushing_attempts: 'CARRIES', longest_reception: 'LONG REC',
};
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `${MINUS}${-n}` : 'PK');
const lastName = name => String(name || '').trim().split(/\s+/).slice(-1)[0].toUpperCase();

/** One player bet's state: over cashes the moment it clears; under only at the final. */
function grade(bet, totals, final) {
  const [type, lineText] = String(bet.prop || '').split(' ');
  const line = Number(bet.line ?? lineText);
  const now = totals.get(`${bet.player_id}|${STAT[type] ?? type}`) ?? 0;
  const over = (bet.bet || 'over') === 'over';
  const status = over ? (now > line ? 'won' : final ? 'lost' : 'live') : (now > line ? 'lost' : final ? 'won' : 'live');
  return {
    label: `${lastName(bet.player)} ${over ? 'O' : 'U'} ${line} ${SHORT[type] ?? type.replace(/_/g, ' ').toUpperCase()}`,
    now, line, note: `${now} OF ${line}`, progress: line > 0 ? Math.min(1, now / line) : null,
    ok: over ? now > line : now < line, status,
  };
}

function pickBox(garyPick, game, last, final) {
  const home = Number(last?.home_score ?? game.home_team_score) || 0;
  const away = Number(last?.away_score ?? game.visitor_team_score) || 0;
  const team = garyPick.side === 'home' ? game.home_team : game.visitor_team;
  const name = String(team?.name || garyPick.side).toUpperCase();
  if (garyPick.type === 'total') {
    const pts = home + away;
    const ok = pts > garyPick.line;
    return { kind: 'pick', title: 'GAME PICK', label: `OVER ${garyPick.line}`, note: `${pts} OF ${garyPick.line}`,
      progress: Math.min(1, pts / garyPick.line), ok, status: final ? (ok ? 'won' : 'lost') : (ok ? 'won' : 'live') };
  }
  const margin = garyPick.side === 'home' ? home - away : away - home;
  const lead = margin > 0 ? `UP ${margin}` : margin < 0 ? `DOWN ${-margin}` : 'TIED';
  if (garyPick.type === 'ml') {
    const ok = margin > 0;
    return { kind: 'pick', title: 'GAME PICK', label: `${name} ML`, note: lead, progress: null, ok,
      status: final ? (ok ? 'won' : 'lost') : 'live' };
  }
  const ok = margin + garyPick.line > 0;
  const need = garyPick.line < 0 ? ` · NEEDS ${Math.ceil(-garyPick.line)}+` : '';
  return { kind: 'pick', title: 'GAME PICK', label: `${name} ${signed(garyPick.line)}`, note: `${lead}${need}`,
    progress: null, ok, status: final ? (ok ? 'won' : 'lost') : 'live' };
}

/** @returns {Array<object>} the strip's boxes, in order: pick, props, darts. */
export function garyBets({ plays = [], game = {}, garyPick = null, props = [], darts = [] }) {
  const { totals, last } = playerTotals(plays);
  const final = game.status_state === 'final' || plays.some(p => p.type_slug === 'end-of-game');
  const boxes = [];
  if (garyPick) boxes.push(pickBox(garyPick, game, last, final));
  if (props.length) {
    const graded = props.map(p => grade(p, totals, final));
    boxes.push({ kind: 'props', title: 'PROPS', focus: graded.find(g => g.status === 'live') ?? graded[0],
      dots: graded.map(g => g.status) });
  }
  if (darts.length) {
    const dots = darts.map(d => grade(d, totals, final).status);
    boxes.push({ kind: 'darts', title: 'DARTS', label: `${dots.filter(d => d === 'won').length} OF ${dots.length} HIT`, dots });
  }
  return boxes;
}
