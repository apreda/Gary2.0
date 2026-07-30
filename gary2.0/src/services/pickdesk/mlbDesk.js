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
import { fetchStats } from '../agentic/tools/statRouters/index.js';
import { summarizeStatForContext } from '../agentic/orchestrator/orchestratorHelpers.js';
import { extractSection, insertAfterHeader } from './sectionText.js';

const TRADE_DEADLINE = '2026-07-31'; // MLB calendar fact; update each season
// (Bet-mechanics legend deleted Jul 26 2026 — founder razor: never explain a
// run line to a frontier model. The board rows carry the offered bets.)
const INJURY_LEGEND = `Tags: [NEW] = the absence itself is days old — he played within the last 3 days (may not be in the line yet). [KNOWN] = this team has already been playing without him; the line and recent results reflect it. [SP SCRATCH] = scheduled starter replaced.`;
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

export function stakesLine(standings, teamName, oneRun = null) {
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
  if (oneRun) bits.push(`one-run ${oneRun}`);
  return `${teamName}: ${bits.join(', ')}`;
}

/**
 * One-run record computed from the season game index (Jul 30: BDL standings
 * carry NO one-run field — a probe for one never fired; this is the real
 * count from final scores). Null under 5 decided one-run games — small-
 * sample honesty, the desk never prints a 2-1 as an identity.
 */
export function oneRunRecordFrom(index, teamId) {
  if (!index || typeof index.values !== 'function' || teamId == null) return null;
  let w = 0, l = 0;
  for (const g of index.values()) {
    if (g.status !== 'STATUS_FINAL' || g.seasonType === 'spring_training') continue;
    const hr = Number(g.homeRuns), ar = Number(g.awayRuns);
    if (!Number.isFinite(hr) || !Number.isFinite(ar) || Math.abs(hr - ar) !== 1) continue;
    if (g.homeId === teamId) { hr > ar ? w++ : l++; }
    else if (g.awayId === teamId) { ar > hr ? w++ : l++; }
  }
  return (w + l) >= 5 ? `${w}-${l}` : null;
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

// ONE standard book (founder, Jul 26: "there are only 4 options… I just want
// standard normal"). DraftKings preferred, then the next most-used book that
// has tonight's lines. All books are still fetched (the app's multi-book
// dropdown keeps them; the outlier filter needs them) — Gary sees one.
const BOOK_PREFERENCE = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'betrivers', 'fanatics'];
const BOOK_LABELS = { draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM', caesars: 'Caesars', betrivers: 'BetRivers', fanatics: 'Fanatics' };

export function chooseBook(rows) {
  const usable = (rows || []).filter(r => r.moneyline_home_odds != null && r.moneyline_away_odds != null);
  for (const v of BOOK_PREFERENCE) {
    const hit = usable.find(r => (r.vendor || '').toLowerCase() === v);
    if (hit) return hit;
  }
  return usable[0] || (rows || [])[0] || null;
}

const fmtOdds = (o) => (o == null ? '—' : (o > 0 ? `+${o}` : `${o}`));

export function buildBoardSection(rows, homeTeam, awayTeam) {
  const book = chooseBook(rows);
  if (!book) return `═══ THE LINES ═══\nNo lines available.`;
  const label = BOOK_LABELS[(book.vendor || '').toLowerCase()] || book.vendor || 'Book';
  const lines = [
    `${awayTeam} ML ${fmtOdds(book.moneyline_away_odds)} | ${homeTeam} ML ${fmtOdds(book.moneyline_home_odds)}`,
  ];
  if (book.spread_home_value != null) {
    lines.push(`${awayTeam} ${fmtOdds(book.spread_away_value)} (${fmtOdds(book.spread_away_odds)}) | ${homeTeam} ${book.spread_home_value} (${fmtOdds(book.spread_home_odds)})`);
  }
  return `═══ THE LINES (${label}) ═══\n${lines.join('\n')}`;
}

function boardMeta(rows, homeTeam, awayTeam) {
  const book = chooseBook(rows) || {};
  return {
    homeTeam,
    awayTeam,
    book: (book.vendor || null),
    moneylineHome: book.moneyline_home_odds ?? null,
    moneylineAway: book.moneyline_away_odds ?? null,
    spreadHome: book.spread_home_value ?? null,
    spreadAway: book.spread_away_value ?? null,
    spreadHomeOdds: book.spread_home_odds ?? null,
    spreadAwayOdds: book.spread_away_odds ?? null,
    total: book.total ?? null,
  };
}

// THE MATCHUP LAB (Jul 26 2026): every data layer that previously lived only
// in the research assistant's tool lane. No tools in the new system, so they
// are permanent desk sections — same fetchers, now data instead of calls.
// (Second wave, same day: RISP, defenses, catcher, closer/pen detail, park.)
const MATCHUP_SECTIONS = [
  ['MLB_PITCH_TYPES_SP', '═══ SP PITCH TYPES (usage / whiff / xwOBA per pitch) ═══'],
  ['MLB_PITCH_TYPES_HITTERS', '═══ HITTERS vs PITCH TYPES ═══'],
  ['MLB_BATTER_VS_PITCHER', `═══ BATTER vs PITCHER — career vs tonight's starters ═══`],
  ['MLB_PLAYER_SPLITS', '═══ HITTER L/R SPLITS ═══'],
  ['MLB_RISP_SITUATIONAL', '═══ SITUATIONAL HITTING (RISP) ═══'],
  ['MLB_TEAM_DEFENSE', '═══ TEAM DEFENSE ═══'],
  ['MLB_CATCHER_DEFENSE', '═══ CATCHERS (framing / arm / SB game) ═══'],
  ['MLB_CLOSER_RELIEVER_STATS', '═══ CLOSERS & HIGH-LEVERAGE ARMS ═══'],
  ['MLB_BULLPEN', '═══ BULLPEN (season numbers) ═══'],
  ['MLB_BULLPEN_WORKLOAD', '═══ BULLPEN WORKLOAD (recent appearances) ═══'],
  ['MLB_PARK_FACTORS', '═══ THE PARK ═══'],
];

async function buildMatchupLab(game, homeTeam, awayTeam, gamePk) {
  const opt = { game: { ...game, gamePk: gamePk ?? game.gamePk, id: game.id ?? game.bdl_game_id } };
  const parts = await Promise.all(MATCHUP_SECTIONS.map(async ([token, header]) => {
    try {
      const r = await fetchStats('baseball_mlb', token, homeTeam, awayTeam, opt);
      if (!r || r.error) return null;
      const text = summarizeStatForContext(r, token, homeTeam, awayTeam);
      if (!text || text.trim().length < 20) return null;
      return `${header}\n${text.trim()}`;
    } catch { return null; }
  }));
  return parts.filter(Boolean).join('\n\n');
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
  const [oddsRowsRaw, standings, matchupLab, seasonIndex] = await Promise.all([
    gameIds.length
      ? ballDontLieService.getOddsV2({ game_ids: gameIds }, 'baseball_mlb').catch(() => [])
      : Promise.resolve([]),
    ballDontLieService.getMlbStandings(season).catch(() => []),
    buildMatchupLab(game, homeTeam, awayTeam, scout.gamePk).catch(() => ''),
    ballDontLieService.getMlbSeasonGameIndex(season).catch(() => null),
  ]);
  const oddsRows = sanitizeBoardRows(oddsRowsRaw);
  if (oddsRows.length < (oddsRowsRaw || []).length) {
    console.warn(`   [Desk] dropped ${(oddsRowsRaw || []).length - oddsRows.length} outlier board row(s)`);
  }

  const board = buildBoardSection(oddsRows, homeTeam, awayTeam);
  const teamIdFor = (name) => {
    const norm = (s) => String(s || '').toLowerCase();
    const row = (standings || []).find((s) =>
      norm(s.team?.display_name || s.team?.name || s.team_name).includes(norm(name).split(' ').pop()));
    return row?.team?.id ?? null;
  };
  const stakes = `═══ THE STAKES ═══\n` +
    `${stakesLine(standings, homeTeam, oneRunRecordFrom(seasonIndex, teamIdFor(homeTeam)))}\n` +
    `${stakesLine(standings, awayTeam, oneRunRecordFrom(seasonIndex, teamIdFor(awayTeam)))}\n` +
    `${deadlineLine()}`;

  const { section: news, rest: shelfBase } = extractSection(scoutText, NEWS_HEADER);
  const worldBody = news ? news.replace(NEWS_HEADER, '').trim() : 'No same-day news.';
  const world = `═══ THE WORLD ═══\n${worldBody}`;

  let shelf = insertAfterHeader(shelfBase, INJURIES_HEADER, INJURY_LEGEND);
  // The matchup lab slots ahead of the lineups; if the marker ever drifts,
  // append at the end — the data must reach the desk either way.
  if (matchupLab) {
    const LINEUPS_HEADER = '═══ CONFIRMED LINEUPS ═══';
    shelf = shelf.includes(LINEUPS_HEADER)
      ? shelf.replace(LINEUPS_HEADER, `${matchupLab}\n\n${LINEUPS_HEADER}`)
      : `${shelf}\n\n${matchupLab}`;
  }

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
