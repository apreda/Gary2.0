/**
 * THE DESK — the complete, board-and-world-first input for the MLB pick brain
 * (spec docs/superpowers/specs/2026-07-26-mlb-pick-rebuild-design.md).
 *
 * One desk, one read: the brain gets no tools, so this desk is Gary's entire
 * evidence for the night. Section order IS the design:
 *   1. THE BOARD  — every book's prices; the bet is the question.
 *   2. THE STAKES — records, division position, GB, seed, streak, deadline.
 *   3. THE WORLD  — the grounded same-day news, moved up from the report tail.
 *   4. THE SHELF  — the full stats scout report, unchanged, as reference.
 *
 * Facts only, no interpretive labels — the reasoning model does the reasoning.
 */
import { buildScoutReport } from '../agentic/scoutReport/scoutReportBuilder.js';
import { ballDontLieService } from '../ballDontLieService.js';
import { extractSection, insertAfterHeader } from './sectionText.js';

const TRADE_DEADLINE = '2026-07-31'; // MLB calendar fact; update each season
// (Bet-mechanics legend deleted Jul 26 2026 — founder razor: never explain a
// run line to a frontier model. The board rows carry the offered bets.)
const INJURY_LEGEND = `Tags: [NEW] = listed/scratched within 3 days (may not be in the line yet). [KNOWN] = 4+ days (the line and recent stats already reflect it). [SP SCRATCH] = scheduled starter replaced.`;
const NEWS_HEADER = `═══ TODAY'S BREAKING NEWS ═══`;
const INJURIES_HEADER = `═══ INJURIES (BDL Structured) ═══`;

const todayEST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const lastWord = (name) => String(name || '').toLowerCase().split(' ').pop();

function findRow(standings, teamName) {
  const lw = lastWord(teamName);
  return (standings || []).find(s => {
    const dn = (s.team?.display_name || s.team?.full_name || '').toLowerCase();
    const ab = (s.team?.abbreviation || '').toLowerCase();
    return dn.includes(lw) || ab === lw;
  }) || null;
}

const ordinal = (n) => {
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][Math.min(n % 10, 4)] || 'th'}`;
};

export function stakesLine(standings, teamName) {
  const t = findRow(standings, teamName);
  if (!t) return `${teamName}: standings unavailable.`;
  const div = t.division_name || t.team?.division || null;
  let pos = null;
  if (div) {
    const rows = (standings || [])
      .filter(s => (s.division_name || s.team?.division) === div)
      .sort((a, b) => (b.wins || 0) - (a.wins || 0));
    const i = rows.indexOf(t);
    if (i >= 0) pos = i + 1;
  }
  const bits = [`${t.wins || 0}-${t.losses || 0}`];
  if (pos && div) bits.push(`${ordinal(pos)} in the ${div}`);
  const gb = t.division_games_behind ?? t.games_behind;
  if (gb != null) bits.push(`${gb} GB`);
  if (t.playoff_seed != null) bits.push(`playoff seed ${t.playoff_seed}`);
  if (t.streak != null && t.streak !== '') bits.push(`streak ${t.streak}`);
  if (t.last_ten_games) bits.push(`L10 ${t.last_ten_games}`);
  return `${teamName}: ${bits.join(', ')}`;
}

export function deadlineLine(today = todayEST()) {
  const days = Math.round(
    (new Date(`${TRADE_DEADLINE}T00:00:00-04:00`) - new Date(`${today}T00:00:00-04:00`)) / 86400000
  );
  if (days < 0) return `Trade deadline: passed (July 31).`;
  if (days === 0) return `Trade deadline: TODAY (July 31).`;
  return `Trade deadline: July 31 (${days} day${days === 1 ? '' : 's'} away).`;
}

/**
 * Drop board rows whose moneyline is a per-book glitch (frozen in-play price,
 * fat-finger, crossed market). A row survives only when both ML sides sit
 * within 15 implied-probability points of the cross-book median — with one
 * honest majority of books, a +5000 artifact can never reach Gary's desk.
 * (Caught live on the Jul 26 smoke run: a settled game's frozen +5000 row.)
 */
export function sanitizeBoardRows(rows) {
  const num = (v) => (v == null ? null : Number(v));
  const implied = (o) => (o == null || !Number.isFinite(o) || o === 0)
    ? null
    : (o < 0 ? -o / (-o + 100) : 100 / (o + 100));
  const median = (a) => {
    const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  };
  const homeMed = median((rows || []).map((r) => implied(num(r.moneyline_home_odds))));
  const awayMed = median((rows || []).map((r) => implied(num(r.moneyline_away_odds))));
  return (rows || []).filter((r) => {
    const h = implied(num(r.moneyline_home_odds));
    const a = implied(num(r.moneyline_away_odds));
    if (h == null && a == null) return true; // RL-only row — keep
    if (homeMed != null && h != null && Math.abs(h - homeMed) > 0.15) return false;
    if (awayMed != null && a != null && Math.abs(a - awayMed) > 0.15) return false;
    return true;
  });
}

export function buildBoardSection(rows, homeTeam, awayTeam) {
  const lines = (rows || []).map(r =>
    `${r.vendor}: ML ${awayTeam} ${r.moneyline_away_odds} / ${homeTeam} ${r.moneyline_home_odds}` +
    (r.spread_home_value != null
      ? ` | Run line ${awayTeam} ${r.spread_away_value} (${r.spread_away_odds}) / ${homeTeam} ${r.spread_home_value} (${r.spread_home_odds})`
      : '')
  ).join('\n') || 'No board rows.';
  return `═══ THE BOARD ═══\n${lines}`;
}

function boardMeta(rows, homeTeam, awayTeam) {
  const first = (rows || []).find(r => r.moneyline_home_odds != null) || {};
  const spread = (rows || []).find(r => r.spread_home_value != null) || {};
  return {
    homeTeam,
    awayTeam,
    moneylineHome: first.moneyline_home_odds ?? null,
    moneylineAway: first.moneyline_away_odds ?? null,
    spreadHome: spread.spread_home_value ?? null,
    spreadAway: spread.spread_away_value ?? null,
    spreadHomeOdds: spread.spread_home_odds ?? null,
    spreadAwayOdds: spread.spread_away_odds ?? null,
    total: first.total ?? null,
  };
}

/**
 * Build the complete desk for one MLB game.
 * Returns { deskText, tapeRows, verifiedTaleOfTape, recentScores, scout, meta }.
 * Throws when the scout builder hard-fails (lineup gate) — the runner's retry
 * tiers own that, unchanged.
 */
export async function buildMlbDesk(game, options = {}) {
  const homeTeam = game.homeTeam || game.home_team?.full_name || game.home_team;
  const awayTeam = game.awayTeam || game.away_team?.full_name || game.away_team;

  const scout = await buildScoutReport(game, 'baseball_mlb', options);
  const scoutText = scout.garyText || scout.text || '';

  const season = new Date().getFullYear();
  const gameIds = [game.bdl_game_id ?? game.id].filter(Boolean);
  const [oddsRowsRaw, standings] = await Promise.all([
    gameIds.length
      ? ballDontLieService.getOddsV2({ game_ids: gameIds }, 'baseball_mlb').catch(() => [])
      : Promise.resolve([]),
    ballDontLieService.getMlbStandings(season).catch(() => []),
  ]);
  const oddsRows = sanitizeBoardRows(oddsRowsRaw);
  if (oddsRows.length < (oddsRowsRaw || []).length) {
    console.warn(`   [Desk] dropped ${(oddsRowsRaw || []).length - oddsRows.length} outlier board row(s)`);
  }

  const board = buildBoardSection(oddsRows, homeTeam, awayTeam);
  const stakes = `═══ THE STAKES ═══\n${stakesLine(standings, homeTeam)}\n${stakesLine(standings, awayTeam)}\n${deadlineLine()}`;

  const { section: news, rest: shelfBase } = extractSection(scoutText, NEWS_HEADER);
  const worldBody = news ? news.replace(NEWS_HEADER, '').trim() : 'No same-day news.';
  const world = `═══ THE WORLD ═══\n${worldBody}`;

  const shelf = insertAfterHeader(shelfBase, INJURIES_HEADER, INJURY_LEGEND);

  const deskText = `${board}\n\n${stakes}\n\n${world}\n\n${shelf}`;
  return {
    deskText,
    tapeRows: scout.verifiedTaleOfTape?.rows || [],
    verifiedTaleOfTape: scout.verifiedTaleOfTape || null,
    recentScores: scout.recentScores || null,
    scout,
    meta: boardMeta(oddsRows, homeTeam, awayTeam),
  };
}
