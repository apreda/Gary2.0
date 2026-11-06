import { cardTeamName } from '@/components/picks/model';
import { nativeTeamLabel } from '@/components/picks/score-labels';

// How a Winners ticket reads, from ios/GaryApp/WinnersLab/LabDesign.swift
// (LabFormat). The home page's free pick and the Winners page share these.

export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
export const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** "Giants +6.5 -102" → "Giants +6.5". */
export function ticketBody(text: string): string {
  return text.replace(/\s*[+-]\d{3,4}\s*$/, '').trim();
}

/** "Giants +6.5 -102" → -102. */
export function trailingPrice(text: string): number | null {
  const m = text.match(/([+-]\d{3,4})\s*$/);
  return m ? Number(m[1]) : null;
}

/** "Nick Martinez over 4.5 hits" → over, "Nick Martinez 4.5 hits"; a bare total gets the league's word. */
export function splitDirection(body: string, league: string): { direction: 'over' | 'under' | null; body: string } {
  const m = body.match(/\b(over|under)\s+(?=[0-9])/i);
  if (!m || m.index === undefined) return { direction: null, body };
  const direction = m[1].toLowerCase() === 'over' ? 'over' : 'under';
  let rest = (body.slice(0, m.index) + body.slice(m.index + m[0].length)).trim();
  if (/^[0-9]+(\.[0-9]+)?$/.test(rest)) {
    const l = league.toUpperCase();
    rest += l === 'MLB' ? ' runs' : ['NFL', 'NCAAF', 'NBA', 'NCAAB'].includes(l) ? ' points' : ' goals';
  }
  return { direction, body: rest };
}

/** "pitcher_earned_runs 2.5" → "earned runs". */
export function marketWords(raw: string | null): string {
  if (!raw) return '';
  let s = raw.toLowerCase().replace(/\s*[0-9]+(\.[0-9]+)?$/, '');
  s = s.replace('pitcher_', '').replace('batter_', '').replace(/_/g, ' ');
  if (s === 'hits runs rbis') return 'hits + runs + RBI';
  if (s === 'hits allowed') return 'hits';
  if (s === 'rbi' || s === 'rbis') return 'RBI';
  return s;
}

export function propTicket(snap: Record<string, unknown>): string | null {
  const player = str(snap.player);
  const prop = str(snap.prop);
  const bet = (str(snap.bet) ?? '').toLowerCase();
  if (prop && /^(first|1st)_inning/i.test(prop)) return bet === 'under' ? 'No Run 1st Inning' : 'Yes Run 1st Inning';
  const line = str(snap.line) ?? num(snap.line)?.toString() ?? prop?.match(/[0-9]+(\.[0-9]+)?$/)?.[0] ?? null;
  const parts = [player, bet || null, line, marketWords(prop) || null].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/** The book as it writes its own name. */
export function bookName(raw: string | null): string | null {
  switch ((raw ?? '').toLowerCase()) {
    case 'fanduel': return 'FanDuel';
    case 'draftkings': return 'DraftKings';
    case 'betmgm': return 'BetMGM';
    case 'caesars': return 'Caesars';
    case 'betrivers': return 'BetRivers';
    case 'fanatics': return 'Fanatics';
    case '': return null;
    default: return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : null;
  }
}

export const BOOK_TINT: Record<string, string> = {
  fanduel: '#1493FF',
  draftkings: '#61B510',
  betmgm: '#C0A971',
  caesars: '#BB9D5E',
  betrivers: '#FDB61B',
  fanatics: '#F6F1E7',
};

/** "New York Giants @ Los Angeles Rams" → "Giants @ Rams"; colleges by school. */
export function shortMatchup(matchup: string, league: string): string {
  const sides = matchup.split(' @ ');
  if (sides.length !== 2) return matchup;
  return sides.map(s => cardTeamName(s, league)).join(' @ ');
}

function countWords(value: number, market: string | null): string {
  let words = marketWords(market);
  if (value === 1) {
    const singular: Record<string, string> = {
      hits: 'hit', strikeouts: 'strikeout', outs: 'out', walks: 'walk', runs: 'run', rbis: 'RBI',
      'home runs': 'home run', 'total bases': 'total base', 'earned runs': 'earned run',
      receptions: 'reception', touchdowns: 'touchdown', 'receiving yards': 'receiving yard',
      'rushing yards': 'rushing yard', 'passing yards': 'passing yard',
    };
    words = singular[words.toLowerCase()] ?? words;
  }
  return words ? `${value} ${words}` : String(value);
}

/** "JAX 33 · BAL 10" for a game, "57 rushing yards" for a prop. */
export function scoreLine(
  ticket: {
    result?: { away_score?: unknown; home_score?: unknown; final_score?: unknown; actual_value?: unknown } | null;
    pick_snapshot?: Record<string, unknown> | null;
  },
  league: string,
  kind: string,
): string | null {
  const r = ticket.result;
  const snap = ticket.pick_snapshot ?? {};
  if (!r) return null;
  if (kind === 'prop') {
    const actual = num(r.actual_value);
    return actual === null ? null : countWords(actual, str(snap.prop));
  }
  const away = str(snap.awayTeam), home = str(snap.homeTeam);
  const a = num(r.away_score), h = num(r.home_score);
  if (away && home && a !== null && h !== null) {
    return `${nativeTeamLabel(away, league)} ${a} · ${nativeTeamLabel(home, league)} ${h}`;
  }
  return str(r.final_score);
}

/**
 * The pick with the player's first name or the club's city dropped, the way
 * the app's ticket reads on a phone ("BUCCANEERS +8.5", "KIM 0.5 HITS").
 * A first-inning ticket names no player and is never shortened.
 */
export function shortTitle(full: string, player: string | null, matchup: string, league: string): string {
  if (/run 1st inning$/i.test(full)) return full;
  if (player && full.toLowerCase().startsWith(player.toLowerCase())) {
    const last = player.trim().split(/\s+/).at(-1) ?? player;
    return last + full.slice(player.length);
  }
  for (const side of matchup.split(' @ ')) {
    const nick = cardTeamName(side.trim(), league);
    const at = nick ? full.toLowerCase().indexOf(nick.toLowerCase()) : -1;
    if (at > 0) return full.slice(at);
  }
  return full;
}

/** The stake as money: one unit is $100 of Gary's bankroll. */
export function money(units: number | null): string {
  if (!units || units <= 0) return '';
  const dollars = units * 100;
  const whole = Math.round(dollars) === dollars;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}

/** Bigger money, brighter gold: $500 and up is full, $250 and up is most of it. */
export function stampOpacity(units: number | null): number {
  if (!units) return 0.5;
  if (units >= 5) return 1;
  if (units >= 2.5) return 0.85;
  return 0.7;
}

export function priceText(odds: number | null): string {
  if (odds === null) return '';
  return odds > 0 ? `+${odds}` : String(odds);
}

export function clockET(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
}
