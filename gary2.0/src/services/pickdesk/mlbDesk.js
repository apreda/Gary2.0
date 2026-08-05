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
import axios from 'axios';
import { buildScoutReport } from '../agentic/scoutReport/scoutReportBuilder.js';
import { ballDontLieService } from '../ballDontLieService.js';
import { fetchStats } from '../agentic/tools/statRouters/index.js';
import { summarizeStatForContext } from '../agentic/orchestrator/orchestratorHelpers.js';
import { extractSection, insertAfterHeader } from './sectionText.js';

// daily_slate read for the morning-board line (same env resolution as the
// other REST readers — anon can SELECT it).
const SLATE_SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SLATE_SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY || '';

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

// (MORNING BOARD line + fetcher DELETED — founder, Aug 4 night: the
// open-vs-now feed taught a nightly "unjustified move" fade template.
// The daily_slate 5:30 AM snapshot itself still publishes; nothing here
// reads it anymore.)

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
  // AT-BAT-GRAIN SECTIONS OFF THE GAME DESK (founder GO, Aug 5 2026 PM):
  // hitters-vs-pitch-types, per-hitter platoon rows, per-hitter RISP, and
  // individual batter-vs-pitcher careers reason at the at-bat level — "an
  // at-bat doesn't produce a run"; they are props-lane material (those desks
  // keep their own surfaces). The game desk reasons at team grain: the
  // lineup's COMBINED history vs tonight's SP replaces the per-bat rows,
  // the PITCHER's platoon split stays in his SP block, and lineup recency
  // stays in LINEUP RECENT BATTING. No team-vs-hand source exists in BDL —
  // stated per the founder's rule rather than faked with a proxy.
  ['MLB_LINEUP_VS_SP', `═══ LINEUP vs TONIGHT'S SP — career, team totals ═══`],
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

// ═══════════════════════════════════════════════════════════════════════════
// YOUR BOOK (founder GO, Aug 4 evening — the Nationals-streak autopsy: Gary
// took the same club's side 8 straight nights, 4-5, and could not know it).
// His OWN recent picks touching tonight's clubs — the raw rows and NOTHING
// else. Founder, Aug 4 night: a computed tally ("you took the opponent in N
// straight") is steering wearing a ledger's clothes — it hands Gary a reason
// to switch sides. If there's a pattern, he reads it; we never announce it.
// Fail-soft to '' (the desk simply carries no book on a quiet matchup).
// ═══════════════════════════════════════════════════════════════════════════

/** Pure formatter: one club's recent-pick rows → ledger lines. Exported for pins. */
export function yourBookSection(clubs) {
  const blocks = [];
  for (const { club, rows } of clubs) {
    if (!rows.length) continue;
    const lines = rows.slice(0, 5).map((r) =>
      `  ${r.date}: ${r.pick} — ${r.result}${r.score ? ` (${r.score})` : ''}`);
    blocks.push(`${club} — your last ${lines.length} pick(s) on their games:\n${lines.join('\n')}`);
  }
  if (!blocks.length) return '';
  return `═══ YOUR BOOK — your recent picks touching tonight's clubs ═══\n${blocks.join('\n')}`;
}

/** Last-14-days graded picks touching either club, newest first. */
async function fetchYourBook(homeTeam, awayTeam) {
  if (!SLATE_SUPABASE_URL || !SLATE_SUPABASE_KEY) return '';
  try {
    const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const nick = (t) => String(t || '').split(' ').pop();
    const resp = await axios.get(`${SLATE_SUPABASE_URL}/rest/v1/game_results`, {
      params: {
        game_date: `gte.${since}`, league: 'eq.MLB',
        select: 'game_date,pick_text,result,final_score,matchup',
        order: 'game_date.desc', limit: '200',
      },
      headers: { apikey: SLATE_SUPABASE_KEY, Authorization: `Bearer ${SLATE_SUPABASE_KEY}` },
      timeout: 8000,
    });
    const rows = Array.isArray(resp.data) ? resp.data : [];
    const clubs = [awayTeam, homeTeam].map((team) => {
      const n = nick(team);
      const mine = rows.filter((r) => String(r.matchup || '').includes(n));
      return {
        club: team,
        rows: mine.map((r) => ({
          date: r.game_date,
          pick: r.pick_text,
          result: r.result || 'pending',
          score: r.final_score || null,
        })),
      };
    });
    return yourBookSection(clubs);
  } catch { return ''; }
}

// TEAM SAMPLE flag (founder GO, Aug 4 — post-deadline twin of the pitcher
// sample flags): season/L10 team aggregates include games played by players
// since traded away. Provenance facts about what the sample contains.

/** Pure formatter: departures per club → the sample note lines. Exported for pins. */
export function teamSampleNote(departuresByClub) {
  const lines = [];
  for (const [club, deps] of Object.entries(departuresByClub)) {
    if (!deps.length) continue;
    lines.push(`${club}: season/L10 numbers include games with since-departed players — ${deps.map((d) => `${d.player} (${d.date})`).join(', ')}.`);
  }
  return lines.length ? `Sample note:\n${lines.join('\n')}` : '';
}

/** Trades OUT of each club, last 10 days, via MLB Stats API transactions. */
async function fetchDepartures(homeTeam, awayTeam) {
  try {
    const { findMlbTeam, getMlbTransactions } = await import('../mlbStatsApiService.js');
    const end = todayEST();
    const start = new Date(Date.now() - 10 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const out = {};
    for (const team of [awayTeam, homeTeam]) {
      out[team] = [];
      const t = await findMlbTeam(team).catch(() => null);
      if (!t?.id) continue;
      const tx = await getMlbTransactions(t.id, start, end).catch(() => []);
      const seen = new Set(); // the feed repeats entries — dedupe by player
      for (const row of tx) {
        const d = String(row.description || '');
        // "Washington Nationals traded 2B Luis García Jr. to New York Yankees."
        const m = d.match(new RegExp(`^${t.name}.{0,10}traded\\s+(?:[A-Z0-9]{1,3}\\s+)?(.+?)\\s+to\\s`, 'i'));
        if (m && !seen.has(m[1])) { seen.add(m[1]); out[team].push({ player: m[1], date: row.date }); }
      }
    }
    return teamSampleNote(out);
  } catch { return ''; }
}

/**
 * Tonight's stored game pick for one game (the props desk reads it so the
 * two brains stop telling opposite stories about the same night — founder GO
 * Aug 4, the Seymour/Luzardo autopsies). Null when no pick is stored yet.
 */
export async function fetchTonightsGameCall(dateEt, gameId) {
  if (!SLATE_SUPABASE_URL || !SLATE_SUPABASE_KEY || gameId == null) return null;
  try {
    const resp = await axios.get(`${SLATE_SUPABASE_URL}/rest/v1/daily_picks`, {
      params: { date: `eq.${dateEt}`, select: 'picks' },
      headers: { apikey: SLATE_SUPABASE_KEY, Authorization: `Bearer ${SLATE_SUPABASE_KEY}` },
      timeout: 8000,
    });
    const picks = resp.data?.[0]?.picks || [];
    const p = picks.find((x) => String(x.game_id) === String(gameId));
    if (!p) return null;
    return { pick: p.pick, rationale: p.rationale || '' };
  } catch { return null; }
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
  const [oddsRowsRaw, standings, matchupLab, seasonIndex, yourBook, sampleNote] = await Promise.all([
    gameIds.length
      ? ballDontLieService.getOddsV2({ game_ids: gameIds }, 'baseball_mlb').catch(() => [])
      : Promise.resolve([]),
    ballDontLieService.getMlbStandings(season).catch(() => []),
    buildMatchupLab(game, homeTeam, awayTeam, scout.gamePk).catch(() => ''),
    ballDontLieService.getMlbSeasonGameIndex(season).catch(() => null),
    // YOUR BOOK (Aug 4) — his own recent picks touching tonight's clubs.
    fetchYourBook(homeTeam, awayTeam).catch(() => ''),
    // TEAM SAMPLE flag (Aug 4) — trades out of either club, last 10 days.
    fetchDepartures(homeTeam, awayTeam).catch(() => ''),
  ]);
  const oddsRows = sanitizeBoardRows(oddsRowsRaw);
  if (oddsRows.length < (oddsRowsRaw || []).length) {
    console.warn(`   [Desk] dropped ${(oddsRowsRaw || []).length - oddsRows.length} outlier board row(s)`);
  }

  // (Morning-board line REMOVED — founder, Aug 4 night: the open-vs-now
  // feed taught a nightly "that move isn't justified" template — three
  // identical no-news-drift fades in one slate, 0-for-3. "Give everything
  // at face value." Tonight's board rows carry the only prices.)
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
    `${deadlineLine()}` +
    (sampleNote ? `\n${sampleNote}` : '');

  const { section: news, rest: shelfWithOdds } = extractSection(scoutText, NEWS_HEADER);
  // BLIND SPLIT (Aug 5): the scout report's own odds block is dropped from the
  // desk entirely — THE LINES section is the only price surface, and it reaches
  // the session in the ticket turn alone. Without this the "blind" read desk
  // carried moneyline and run line through the shelf.
  const { rest: shelfBase } = extractSection(shelfWithOdds, '═══ BETTING CONTEXT ═══');
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

  // THE BLIND SPLIT (founder GO, Aug 5 2026): the read turn gets the desk with
  // no prices on it — deskTextBlind. THE LINES arrive only with the ticket ask
  // (boardText). deskText stays the full surface, board first, for the stored
  // snapshot: the audit record is everything Gary saw across both turns.
  const deskTextBlind = `${stakes}\n\n${yourBook ? `${yourBook}\n\n` : ''}${world}\n\n${shelf}`;
  const deskText = `${board}\n\n${deskTextBlind}`;
  return {
    deskText,
    deskTextBlind,
    boardText: board,
    tapeRows: scout.verifiedTaleOfTape?.rows || [],
    verifiedTaleOfTape: scout.verifiedTaleOfTape || null,
    recentScores: scout.recentScores || null,
    scout,
    meta: boardMeta(oddsRows, homeTeam, awayTeam),
  };
}
