/**
 * THE PROP SHEETS (Sep 2 2026) — for every player on THE PROP BOARD, the
 * exact stat each of his markets settles on, as the numbers a bettor pulls
 * up before pricing it: his last games' actual values for that stat (newest
 * first), his season rate per game, and tonight's frame — lineup slot, his
 * hand, the opposing starter and that arm's hand; for a starter, the hands
 * he faces and his last starts' strikeouts, outs, hits, walks, earned runs
 * and pitch counts.
 *
 * Numbers only, from the same BDL game rows the cleared counts use. Never a
 * projection, never a lean, never a rate dressed as a prediction: the line is
 * on the board, the history is here, and the comparison is Gary's.
 *
 * Why this exists: through Sep 1 2026 the props desk read a 120K-character
 * game desk and a board of ~40 markets carrying one "over in 6 of his last
 * 15" clause each — 844 graded core picks at 48.8%, a coin flip minus the
 * vig. The one thing a prop decision needs that the game desk never carried
 * is the player's own distribution against the number.
 */
import { statForProp } from './propsBrain.js';

const norm = (s) => String(s || '').toLowerCase().trim();

const HITTER_GAMES = 15;
const PITCHER_STARTS = 8;

/** "R" | "L" | "S" from a BDL "bats/throws" string; null when unknown. */
const batSide = (batsThrows) => {
  const b = String(batsThrows || '').split('/')[0]?.trim().toUpperCase();
  return b && b !== '?' ? b : null;
};
const throwHand = (batsThrows) => {
  const t = String(batsThrows || '').split('/')[1]?.trim().toUpperCase();
  return t && t !== '?' ? t : null;
};
const handLabel = (h) => (h === 'L' ? 'LHP' : h === 'R' ? 'RHP' : null);

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const fmtRate = (v) => (v == null ? null : (Math.round(v * 10) / 10).toFixed(1));

/** Rows where the hitter actually came to the plate, oldest → newest. */
export function hitterGames(rows) {
  return (rows || []).filter((r) => Number(r?.plate_appearances ?? r?.at_bats ?? 0) > 0 || Number(r?.at_bats ?? 0) > 0);
}

/** Rows where the pitcher started, oldest → newest (relief outings excluded). */
export function pitcherStarts(rows) {
  const pitched = (rows || []).filter((r) => r?.ip != null && parseFloat(r.ip) > 0);
  const starts = pitched.filter((r) => Number(r?.games_started) === 1);
  return starts.length ? starts : pitched;
}

const outsOf = (r) => (r?.pitching_outs != null ? Number(r.pitching_outs) : statForProp(r, 'pitcher_outs'));

/** One market's line on a hitter sheet: last-N values newest first + the season rate. */
export function hitterMarketLine(rows, propType, line, priceText) {
  const games = hitterGames(rows);
  if (!games.length) return null;
  const vals = games.map((r) => statForProp(r, propType)).filter((v) => v != null);
  if (!vals.length) return null;
  const recent = vals.slice(-HITTER_GAMES).reverse();
  const season = vals.reduce((a, b) => a + b, 0) / vals.length;
  return `${propType} ${line}${priceText ? ` (${priceText})` : ''} — last ${recent.length}: ${recent.join(' ')} · season ${fmtRate(season)} per game (${vals.length} g)`;
}

/** One market's line on a pitcher sheet: last starts' values newest first + the per-start rate. */
export function pitcherMarketLine(rows, propType, line, priceText) {
  const starts = pitcherStarts(rows);
  if (!starts.length) return null;
  const valueOf = (r) => (norm(propType) === 'pitcher_outs' ? outsOf(r) : statForProp(r, propType));
  const vals = starts.map(valueOf).filter((v) => v != null);
  if (!vals.length) return null;
  const recent = vals.slice(-PITCHER_STARTS).reverse();
  const season = vals.reduce((a, b) => a + b, 0) / vals.length;
  return `${propType} ${line}${priceText ? ` (${priceText})` : ''} — last ${recent.length} starts: ${recent.join(' ')} · season ${fmtRate(season)} per start (${vals.length} starts)`;
}

/** Pitch counts of the last starts, newest first — null when the feed carries none. */
export function pitchCountLine(rows) {
  const starts = pitcherStarts(rows);
  const counts = starts.map((r) => (r?.pitch_count != null ? Number(r.pitch_count) : null));
  const known = counts.filter((c) => c != null);
  if (!known.length) return null;
  const recent = counts.slice(-PITCHER_STARTS).reverse().map((c) => (c == null ? '?' : c));
  return `pitches, last ${recent.length} starts: ${recent.join(' ')}`;
}

/** Home runs allowed by start, newest first — the arm the HR board's hitters face. */
export function homeRunsAllowedLine(rows) {
  const starts = pitcherStarts(rows);
  const vals = starts.map((r) => (r?.p_hr != null ? Number(r.p_hr) : null)).filter((v) => v != null);
  if (!vals.length) return null;
  const recent = vals.slice(-PITCHER_STARTS).reverse();
  return `home runs allowed, last ${recent.length} starts: ${recent.join(' ')} · ${vals.reduce((a, b) => a + b, 0)} in ${vals.length} starts`;
}

/** Plate appearances per game this season. */
export function paPerGame(rows) {
  const games = hitterGames(rows);
  const pas = games.map((r) => Number(r?.plate_appearances)).filter((v) => Number.isFinite(v) && v > 0);
  if (!pas.length) return null;
  return pas.reduce((a, b) => a + b, 0) / pas.length;
}

/**
 * The opposing nine's season strikeout and walk tendencies, from the chrono
 * rows the board already fetched for them — "tonight's nine, season: 22 of
 * every 100 plate appearances a strikeout, 8 a walk (8 of 9 with numbers)".
 * Null when fewer than five of them have rows; the count of who's covered
 * always prints, so a thin read is never mistaken for the whole lineup.
 */
export function lineupTendencies(batters, chronoByPlayer) {
  let pa = 0, k = 0, bb = 0, covered = 0;
  const total = (batters || []).length;
  for (const b of batters || []) {
    const rows = chronoByPlayer?.get(norm(b?.name));
    if (!rows) continue;
    const games = hitterGames(rows);
    const paSum = games.reduce((a, r) => a + (Number(r?.plate_appearances) || 0), 0);
    if (!paSum) continue;
    covered += 1;
    pa += paSum;
    k += games.reduce((a, r) => a + (Number(r?.k) || 0), 0);
    bb += games.reduce((a, r) => a + (Number(r?.bb) || 0), 0);
  }
  if (covered < 5 || !pa) return null;
  const per100 = (n) => Math.round((100 * n) / pa);
  return `tonight's nine, season: ${per100(k)} of every 100 plate appearances a strikeout, ${per100(bb)} a walk (${covered} of ${total} with numbers)`;
}

/** "5 LHB / 3 RHB / 1 switch" for a lineup's batters. */
export function handsFaced(batters) {
  let l = 0, r = 0, s = 0, unknown = 0;
  for (const b of batters || []) {
    const side = batSide(b?.batsThrows);
    if (side === 'L') l += 1;
    else if (side === 'R') r += 1;
    else if (side === 'S') s += 1;
    else unknown += 1;
  }
  if (!l && !r && !s) return null;
  const parts = [`${l} LHB`, `${r} RHB`];
  if (s) parts.push(`${s} switch`);
  if (unknown) parts.push(`${unknown} unlisted`);
  return parts.join(' / ');
}

const priceOf = (m) => {
  const f = (v) => (v == null ? null : (v > 0 ? `+${v}` : `${v}`));
  const over = f(m.over_odds);
  const under = f(m.under_odds);
  if (over != null && under != null) return `Over ${over} / Under ${under}`;
  if (over != null) return `Over ${over}`;
  if (under != null) return `Under ${under}`;
  return null;
};

/**
 * Build the sheets for one game.
 *
 * @param {object} args
 * @param {Array}  args.markets        the board's primary markets (player, team, prop_type, line, over_odds, under_odds)
 * @param {Map}    args.chronoByPlayer normalized name → chrono BDL rows (oldest → newest)
 * @param {object} args.lineups        { home: { batters, pitcher }, away: { batters, pitcher } } from the desk scout
 * @param {string} args.homeTeam
 * @param {string} args.awayTeam
 * @returns {{ text: string, players: number }}
 */
export function buildPropSheets({ markets, chronoByPlayer, lineups, homeTeam, awayTeam }) {
  const byPlayer = new Map();
  for (const m of markets || []) {
    if (!m?.player || !m?.prop_type) continue;
    const key = norm(m.player);
    if (!byPlayer.has(key)) byPlayer.set(key, { name: m.player, team: m.team ?? null, markets: [] });
    byPlayer.get(key).markets.push(m);
  }
  if (!byPlayer.size) return { text: '', players: 0 };

  const sides = [
    { label: awayTeam, tag: 'away', mine: lineups?.away, theirs: lineups?.home },
    { label: homeTeam, tag: 'home', mine: lineups?.home, theirs: lineups?.away },
  ];

  const blocks = [];
  const placed = new Set();
  let players = 0;

  for (const side of sides) {
    const lines = [];
    const oppPitcher = side.theirs?.pitcher;
    const oppHand = handLabel(throwHand(oppPitcher?.batsThrows));
    const oppLabel = oppPitcher?.name
      ? `vs ${oppHand ? `${oppHand} ` : ''}${oppPitcher.name}`
      : 'opposing starter not yet announced';

    for (const b of side.mine?.batters || []) {
      const key = norm(b?.name);
      const entry = byPlayer.get(key);
      if (!entry || placed.has(key)) continue;
      const rows = chronoByPlayer?.get(key);
      const marketLines = entry.markets
        .filter((m) => !norm(m.prop_type).startsWith('pitcher_'))
        .map((m) => hitterMarketLine(rows, m.prop_type, m.line, priceOf(m)))
        .filter(Boolean);
      if (!marketLines.length) continue;
      placed.add(key);
      players += 1;
      const pa = paPerGame(rows);
      const head = [
        `${b.battingOrder != null ? `${ordinal(Number(b.battingOrder))} ` : ''}${entry.name}${batSide(b.batsThrows) ? ` (${batSide(b.batsThrows)})` : ''}${b.position ? ` ${b.position}` : ''}`,
        oppLabel,
        pa != null ? `${fmtRate(pa)} PA per game` : null,
      ].filter(Boolean).join(' · ');
      lines.push(head, ...marketLines.map((l) => `   ${l}`));
    }

    const sp = side.mine?.pitcher;
    const spKey = norm(sp?.name);
    const spEntry = spKey ? byPlayer.get(spKey) : null;
    if (spEntry && !placed.has(spKey)) {
      const rows = chronoByPlayer?.get(spKey);
      const marketLines = spEntry.markets
        .filter((m) => norm(m.prop_type).startsWith('pitcher_'))
        .map((m) => pitcherMarketLine(rows, m.prop_type, m.line, priceOf(m)))
        .filter(Boolean);
      if (marketLines.length) {
        placed.add(spKey);
        players += 1;
        const faced = handsFaced(side.theirs?.batters);
        const hand = throwHand(sp.batsThrows);
        const head = [
          `SP ${spEntry.name}${hand ? ` (${hand})` : ''}`,
          faced ? `faces ${faced}` : 'the opposing lineup is not yet posted',
        ].join(' · ');
        const pitches = pitchCountLine(rows);
        const hrAllowed = homeRunsAllowedLine(rows);
        const nine = lineupTendencies(side.theirs?.batters, chronoByPlayer);
        lines.push(head, ...marketLines.map((l) => `   ${l}`), ...(pitches ? [`   ${pitches}`] : []), ...(hrAllowed ? [`   ${hrAllowed}`] : []), ...(nine ? [`   ${nine}`] : []));
      }
    }

    if (lines.length) blocks.push(`${String(side.label).toUpperCase()} (${side.tag}) — batting order, then the starter\n${lines.join('\n')}`);
  }

  // Board players the lineups did not place (a reliever with a market, a
  // name spelled differently by the book): their numbers still print.
  const leftovers = [];
  for (const [key, entry] of byPlayer) {
    if (placed.has(key)) continue;
    const rows = chronoByPlayer?.get(key);
    const marketLines = entry.markets.map((m) => (norm(m.prop_type).startsWith('pitcher_')
      ? pitcherMarketLine(rows, m.prop_type, m.line, priceOf(m))
      : hitterMarketLine(rows, m.prop_type, m.line, priceOf(m)))).filter(Boolean);
    if (!marketLines.length) continue;
    players += 1;
    leftovers.push(`${entry.name}${entry.team ? ` (${entry.team})` : ''}`, ...marketLines.map((l) => `   ${l}`));
  }
  if (leftovers.length) blocks.push(`ALSO ON THE BOARD\n${leftovers.join('\n')}`);

  if (!blocks.length) return { text: '', players: 0 };
  return {
    text: `═══ THE PROP SHEETS — the numbers each market settles on, newest first ═══\n${blocks.join('\n\n')}`,
    players,
  };
}
