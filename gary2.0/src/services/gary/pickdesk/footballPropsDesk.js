import { assessPropEvidence, recordJevDecision, JEV_PROPS_SHA } from '../../providers/jev/propAssessments.js';
import { RATIONALE_WRITING_RULE } from '../../content/copy/writingRules.js';
import { filterStandardPropMarkets, STANDARD_PROPS_SHA } from '../standardPropMarkets.js';
import { nflLadderAllowance } from './nflPropLadders.js';
import { withPickDataIntegrity, assertPickDataIntegrity } from '../pickDataIntegrity.js';
/**
 * THE FOOTBALL PROPS DESK — NFL + NCAAF props on the same system as MLB
 * (founder GO, Aug 20 2026: "it needs to be the same system as MLB").
 *
 * One call over the complete desk + THE PROP BOARD, exactly like the MLB
 * props desk (propsBrain.js, Jul 26 2026): no tools, no multi-pass — the
 * picks are a pure function of the desk. The desk here is the football scout
 * report (the same dossier the game-pick brain reads) plus a validated
 * players shelf built by the existing sport context builders:
 *   - NFL:   BDL season stats + recent game logs + injuries
 *            (nflPropsAgenticContext).
 *   - NCAAF: The Odds API markets validated player-by-player against BDL
 *            rosters and season-stat evidence (ncaafPropsAgenticContext),
 *            exact player_id carried for the CLI's player-id gate.
 *
 * Board rules are Board V2 with football's one-sided exception: anytime
 * touchdown keeps its yes-only price on the board (the feed offers no "no TD"
 * side). Since Sep 23 2026 a touchdown pick is a core prop like any other.
 *
 * Rails unchanged and shared (runPropsDeskBrain): statAudit + one corrective
 * retry, model cascade with overload retries, responder stamp. Odds/no-stats/
 * cap/TD-category gates live in the CLI chassis, shared with MLB.
 */
import { createHash } from 'crypto';
import {
  buildNflPropsAgenticContext,
  isSupportedNflPropType,
  calculateNflHitRate,
} from '../agentic/nflPropsAgenticContext.js';
import { buildNcaafPropsAgenticContext } from '../agentic/ncaafPropsAgenticContext.js';
import { NCAAF_PROPS_EVIDENCE_SHA } from '../agentic/ncaafPropsEvidenceSha.js';
import { buildFootballPropSheets } from './footballPropSheets.js';
import { buildScoutReport } from '../agentic/scoutReport/scoutReportBuilder.js';
import { normalizePropBetDirection } from '../agentic/propsSharedUtils.js';
import { ncaafSlateDateForInstant } from '../../sports/ncaaf/ncaafGamePolicy.js';
import {
  buildGaryPropsSystemPrompt,
  buildPropBoardV2,
  runPropsDeskBrain,
  snapshotPropMenu,
  todayLong,
} from './propsBrain.js';
import { normName, isNflSkillRow } from '../darts/dartsCommon.js';
import { refreshNflRedZone, loadNflRedZone } from '../../sports/nfl/nflRedZone.js';
import { gameDays, snapCounts, defenseByPosition, weeklyRows, teamTargetTotals, aliasByRoster, withOfficialReport, weekPassers, rosterWeekWords, qbPressure, regularsOut, receiverDrops } from '../../sports/nfl/nflPlayerContext.js';
import { getPlayLedger } from '../../sports/nfl/nflPlayLedger.js';
import { loadNflverseFile, getPracticeReport, nflverseCode } from '../../providers/nflverseService.js';
import { ballDontLieService } from '../../providers/ballDontLieService.js';
import { TEAM_NAMES } from '../../sports/nfl/nflStreaksService.js';
import { buildNflReadStory, nflNewsFor, NEWS_NOT_ON_FILE as NFL_NEWS_NOT_ON_FILE } from '../agentic/orchestrator/nflRead.js';
import { etDate, defensesFaced } from '../../sports/nfl/nflBettorData.js';
import { finalReportNotDue, finalReportIn } from '../../sports/nfl/nflAvailability.js';
import { getNflSchedule, scheduleRowFor } from '../../sports/nfl/nflSchedule.js';

const norm = (s) => String(s || '').toLowerCase().trim();

const SPORT_KEY_BY_LEAGUE = {
  NFL: 'americanfootball_nfl',
  NCAAF: 'americanfootball_ncaaf',
};

/** Football's sanctioned one-sided market family (the HR analog). */
export const isFootballFunLane = (propType) => /anytime_?(?:td|touchdown)/.test(norm(propType));

// Football props ask — the MLB contract with football's day grammar (the
// founder's tonight→today porting rule, c3691c04). The forced pair of anytime
// touchdown cards (Sep 9) is retired with MLB's home-run card (founder, Sep 23
// 2026); Darts throws the touchdowns. Anytime TD stays on the board as a bet.
export const FOOTBALL_PROPS_ASK = `Take two prop bets from today's board — two prop cards is what this game publishes.

For each card, explain the exact line and offered odds, the specific supported matchup reason, and the strongest contrary evidence. Keep sample sizes and player roles clear. Reasons are in words: no hit rates, percentages or probabilities.

Injuries: an absence already games old is already in the price and in the team's recent results; fresh news — today's inactive — is the exception.

Output:

\`\`\`json
{ "picks": [ { "player": "[full name]", "team": "[team]", "prop_type": "[key from the board]", "line": 1.5, "bet": "over", "odds": "[exact odds]", "confidence_score": 0.XX, "rationale": "Gary's Take\\n\\n[the prose]" } ] }
\`\`\`

bet is "over" or "under" — "over" for one-priced lines.
confidence_score (0.50–1.00): your conviction in this bet at its price — the bet, not the outcome.

${RATIONALE_WRITING_RULE}`;

// A thin screened menu must never ask the brain to invent a second bet (the
// MLB rule, mlbPropsAsk). NFL boards are screened since Sep 23 2026.
export function footballPropsAsk({ coreCount = null } = {}) {
  const regular = "Take two prop bets from today's board — two prop cards is what this game publishes.";
  if (coreCount === 0) return FOOTBALL_PROPS_ASK.replace(regular, '').trimStart();
  if (coreCount === 1) return FOOTBALL_PROPS_ASK.replace(regular, "Take at most one prop bet from today's board; only one eligible candidate is offered.");
  return FOOTBALL_PROPS_ASK;
}


// THE NFL PROPS ASK (Oct 19 2026, the new NFL system): the game as the side pick reads it, the props people bet for
// each team's main players, and the question. No formula, no projection, no scores from a second model.
// Oct 27 2026 (founder GO; see nbaPropsDesk.js): one question, without the walk-through, the deferral to the line or
// the "what beats it" case.
export const NFL_PROPS_ASK = `Which two props from THE PROP BOARD would you bet, over or under, and why?

For each card, give the line, the offered odds and your reason. Reasons are in words: no hit rates, percentages or probabilities.

Output:

\`\`\`json
{ "picks": [ { "player": "[full name]", "team": "[team]", "prop_type": "[key from the board]", "line": 1.5, "bet": "over", "odds": "[exact odds]", "confidence_score": 0.XX, "rationale": "Gary's Take\\n\\n[the prose]" } ] }
\`\`\`

bet is "over" or "under" — "over" for one-priced lines.
confidence_score (0.50–1.00): your conviction in this bet at its price — the bet, not the outcome.

${RATIONALE_WRITING_RULE}`;

// Each team's main players (Oct 19 2026): the books post lines for backups and fringe receivers too, and the old
// formula, hunting gaps, put "Cyrus Allen under 1.5 receptions" and "Pierre Strong under 11.5 receiving yards" on the
// card. A player is on the menu when the books price him as a starter in a yardage market; all his board markets
// come with him.
const yardMarket = (t) => {
  const x = norm(t);
  if (/^(?:player_)?pass(?:ing)?_y(?:ar)?ds$/.test(x)) return 'pass';
  if (/^(?:player_)?rush(?:ing)?_y(?:ar)?ds$/.test(x)) return 'rush';
  if (/^(?:player_)?rec(?:eiving)?_y(?:ar)?ds$/.test(x)) return 'rec';
  return null;
};
const STARTER_LINE = { pass: 150, rush: 35, rec: 30 };
export function nflMainPlayers(markets) {
  const main = new Set((markets || []).filter((m) => { const k = yardMarket(m?.prop_type); return k && Number(m.line) >= STARTER_LINE[k]; }).map((m) => norm(m.player)));
  return (markets || []).filter((m) => main.has(norm(m?.player)));
}

// Prompt-era fingerprint — template hash, date placeholder; moves only when
// the contract wording moves. Same scheme as PROPS_PROMPT_SHA (MLB).
export const FOOTBALL_PROPS_PROMPT_SHA = createHash('sha256')
  .update(buildGaryPropsSystemPrompt('{date}') + FOOTBALL_PROPS_ASK + footballPropsAsk.toString() + NFL_PROPS_ASK + nflMainPlayers.toString() + JEV_PROPS_SHA + STANDARD_PROPS_SHA)
  .digest('hex')
  .slice(0, 12);

export const NCAAF_FOOTBALL_PROPS_PROMPT_SHA = createHash('sha256')
  .update(FOOTBALL_PROPS_PROMPT_SHA + NCAAF_PROPS_EVIDENCE_SHA)
  .digest('hex').slice(0, 12);

// NFL game picks live in weekly_nfl_picks keyed (week_start, season); the week helpers below name that week.
const CALL_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const CALL_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

/** Tuesday start of the NFL publication week (Tue–Mon, ET) for an instant. */
export function nflWeekStartForInstant(instant) {
  const etDate = new Date(instant).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [year, month, dayOfMonth] = etDate.split('-').map(Number);
  const civil = new Date(Date.UTC(year, month - 1, dayOfMonth));
  const daysSinceTuesday = (civil.getUTCDay() - 2 + 7) % 7;
  civil.setUTCDate(civil.getUTCDate() - daysSinceTuesday);
  return civil.toISOString().slice(0, 10);
}

/** NFL season year for an instant (Jan–Jul belongs to the prior year). */
export function nflSeasonForInstant(instant) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: 'numeric',
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  return values.month >= 8 ? values.year : values.year - 1;
}


// ── THE DESK THE GAME PICK READ (Sep 24 2026) ──────────────────────────────
// The game pick stores the exact desk Gary read (pick_desks) moments before
// props run for the same game. Reading it back gives props the same desk
// without a second round of article discovery, web searches and provider
// reads. Missing or older than a day's slate: the desk is built fresh.
const PUBLISHED_DESK_MAX_AGE_MS = 12 * 60 * 60 * 1000;
async function fetchPublishedDesk(league, game) {
  if (!CALL_URL || !CALL_KEY || !game?.commence_time) return null;
  try {
    const gameDate = league === 'NCAAF'
      ? ncaafSlateDateForInstant(game.commence_time)
      : new Date(game.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const matchup = `${game.away_team} @ ${game.home_team}`;
    const headers = { apikey: CALL_KEY, Authorization: `Bearer ${CALL_KEY}` };
    const url = `${CALL_URL}/rest/v1/pick_desks?game_date=eq.${gameDate}&matchup=eq.${encodeURIComponent(matchup)}&select=desk,created_at&limit=1`;
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const row = (await resp.json())?.[0];
    if (!row?.desk || Date.now() - Date.parse(row.created_at) > PUBLISHED_DESK_MAX_AGE_MS) return null;
    return row.desk;
  } catch {
    return null;
  }
}

const EMPTY_EVIDENCE = {
  gamesByName: new Map(), priorGamesByName: new Map(), positionByName: new Map(), countingWindow: new Map(),
};

/**
 * The evidence maps behind the sheets and the cleared counts, keyed by the
 * board's player names: this season's games, last season's games (the Week 1
 * carry — BDL has no rows for a season until its first game is final), the
 * position, and the window the counts are actually allowed to read.
 */
export function buildNflEvidenceMaps(context) {
  const gamesByName = new Map();
  const priorGamesByName = new Map();
  const positionByName = new Map();
  const countingWindow = new Map();
  const season = String(context?.dataWindow?.season ?? '');

  for (const c of context?.propCandidates || []) {
    const key = norm(c?.player);
    const id = c?.playerId;
    if (!key || id == null) continue;
    const currentLogs = context?.playerGameLogs?.[id];
    const current = Array.isArray(currentLogs?.games) ? currentLogs.games : null;
    // This season only (founder, Oct 23 2026: no last season, ever): last season's games no longer sit beside this
    // season's or stand in for them when a player has fewer than three. priorGamesByName stays empty.
    if (current?.length) {
      gamesByName.set(key, currentLogs);
      countingWindow.set(key, { games: current, label: season });
    }
    const seasonStat = context?.playerSeasonStats?.[id];
    const position = seasonStat?.player?.position_abbreviation || seasonStat?.player?.position;
    if (position) positionByName.set(key, position);
  }
  return { gamesByName, priorGamesByName, positionByName, countingWindow };
}

/** The facts the NFL sheets carry beyond the game logs (Sep 24 2026); a source that fails is left out. */
async function loadNflSheetContext({ season, game, players }) {
  let supabase = null;
  try { ({ supabaseAdmin: supabase } = await import('../../../supabaseClient.js')); } catch { /* the red zone is left out */ }
  if (supabase) await refreshNflRedZone({ supabase, seasons: [season], log: { warn: () => {} } }).catch(() => 0);
  // This season only, and no prop price history: a prop's line and price before today are the market's opinion, and
  // Gary reads the player and the game (founder, Oct 23 2026). The board still prints today's line he bets.
  const [rz, days, snapFile, defCur, rows, injuries, schedule, roster] = await Promise.all([
    supabase ? loadNflRedZone({ supabase, seasons: [season] }).catch(() => null) : null,
    gameDays(), snapCounts(season), defenseByPosition(season), weeklyRows(season),
    ballDontLieService.getNflPlayerInjuries().catch(() => []),
    getNflSchedule().catch(() => null),
    loadNflverseFile('roster_weekly', season).catch(() => null),
  ]);
  const snaps = aliasByRoster(snapFile, rows, roster && !roster.unavailable ? roster.rows : null);
  // The league's official report for this game's week over the feed's rows (withOfficialReport).
  const week = schedule && !schedule.unavailable ? Number(scheduleRowFor(schedule, season, nflverseCode(game.home_team), nflverseCode(game.away_team), game.commence_time)?.week) || null : null;
  const pending = finalReportNotDue(game.commence_time);
  const reports = week ? await Promise.all([game.home_team, game.away_team].map((team) => getPracticeReport(team, season, week)
    .then((report) => ({ team, report: report?.unavailable ? null : report, pending, final: report?.unavailable ? null : finalReportIn(report, game.commence_time) })).catch(() => ({ team, report: null, pending })))) : [];
  const reported = withOfficialReport(injuries, reports, roster && !roster.unavailable ? roster.rows : null);
  // Who each game's defense is this season, beside the player's games (Oct 26 2026); a schedule that did not load
  // leaves the rows as they were.
  const defenses = schedule && !schedule.unavailable ? defensesFaced(schedule.rows, season, etDate(), new Date().toISOString()) : null;
  const defPrev = null, history = null;
  const weeksByName = new Map();
  // Keyed the way the sheets look players up (normName strips Jr./Sr./III: nflverse writes "Michael Pittman",
  // the board "Michael Pittman Jr."), skill positions only (audit, Oct 13 2026).
  for (const r of [...(rows || [])].filter(isNflSkillRow).sort((a, b) => Number(b.week) - Number(a.week))) {
    const k = normName(r.player_display_name);
    if (!weeksByName.has(k)) weeksByName.set(k, []);
    weeksByName.get(k).push(r);
  }
  const abbrOf = (full) => Object.entries(TEAM_NAMES).find(([, name]) => name === full)?.[0] || null;
  return { season, rz, days, snaps, defCur, defPrev, defenses, weeksByName, teamTargets: teamTargetTotals(rows), injuries: reported, history, homeAbbr: abbrOf(game.home_team), awayAbbr: abbrOf(game.away_team),
    passers: weekPassers(rows), rosterWords: rosterWeekWords(roster && !roster.unavailable ? roster.rows : null, await loadNflverseFile('injuries', season).then((f) => (f?.unavailable ? null : f?.rows)).catch(() => null)), weeksMissing: !rows,
    pressure: await qbPressure(season).catch(() => null),
    // Regulars out each week and in-game injuries, as the dart rows have them (round 14).
    without: regularsOut(snapFile, roster && !roster.unavailable ? roster.rows : null),
    drops: await receiverDrops(season, roster && !roster.unavailable ? roster.rows : null).catch(() => null),
        plays: await getPlayLedger(season).then((L) => new Map((L?.games || []).flatMap((g) => Object.keys(g.teamLastQ || {}).map((t) => [`${g.week}|${t}`, { lastPlay: Object.fromEntries(Object.entries(g.lastPlay || {}).filter(([k]) => k.startsWith(`${t}|`))), lastNamed: g.lastNamed || {}, teamLastQ: g.teamLastQ }])))).catch(() => null),
        hurt: await getPlayLedger(season).then((L) => { const m = new Map(); for (const g of L?.games || []) for (const e of g.hurt || []) { const k = `${g.week}|${e.team}`; m.set(k, [...(m.get(k) || []), e]); } return m; }).catch(() => null) };
}

/** "over in 6 of his last 10 games in 2025" — the season is never implied. */
export function clearedCountClause(countingWindow, playerKey, propType, line) {
  const window = countingWindow?.get(playerKey);
  if (!window) return null;
  const hitRate = calculateNflHitRate(window.games, propType, line);
  if (!hitRate || hitRate.totalGames < 3) return null;
  return `over in ${hitRate.hitsOver} of his last ${hitRate.totalGames} games${window.label ? ` in ${window.label}` : ''}`;
}

/**
 * The football props brain. Returns { picks, explicitPass, validatedPlayers,
 * boardProps } in the props CLI's mapping shape — the chassis (gates, caps,
 * TD category stamp, store) is shared with MLB unchanged. boardProps is the
 * validated market board the CLI must adopt for provider-price
 * reconciliation (it carries football's exact player_id).
 */
export async function analyzeFootballPropsDesk(game, playerProps, options = {}) {
  // Partial data publishes, as on the MLB desk (founder, Sep 22 2026: "let
  // the software work"): one failed search or lookup no longer blocks a
  // game's props.
  return withPickDataIntegrity(() => analyzeFootballPropsDeskWithData(game, playerProps, options), { partialDataAllowed: true });
}

async function analyzeFootballPropsDeskWithData(game, playerProps, options = {}) {
  const league = options.league;
  const sportKey = SPORT_KEY_BY_LEAGUE[league];
  if (!sportKey) throw new Error(`analyzeFootballPropsDesk requires league NFL or NCAAF (got ${league})`);

  // 1. The sport context: roster/stat validation + the players shelf. This is
  // the same data layer the old orchestrator path used — kept verbatim.
  const context = league === 'NFL'
    ? await buildNflPropsAgenticContext(game, playerProps, { nocache: options.nocache })
    : await buildNcaafPropsAgenticContext(game, playerProps, { nocache: options.nocache });

  // Both contexts return player- and market-stat-validated rows with the
  // exact provider player_id attached. Keep the supported-market boundary.
  const validatedPlayers = new Set((context.propCandidates || []).map((c) => norm(c.player)));
  if (!validatedPlayers.size) {
    throw new Error(`${league} props desk has no roster/stat-validated player candidates`);
  }
  let boardProps = Array.isArray(context.playerProps) ? context.playerProps : playerProps;
  if (league === 'NFL') {
    boardProps = boardProps.filter((p) => isSupportedNflPropType(p?.prop_type));
  }
  boardProps = boardProps.filter((p) => validatedPlayers.has(norm(p?.player)));
  if (!boardProps.length) {
    throw new Error(`${league} props board has no validated player with a supported market`);
  }

  // NFL ladder bets (founder, Sep 25 2026): 3+/4+ passing TDs, the two
  // reception counts above the line for each team's top four receivers, two
  // rushing-yard rungs for the top two rushers, and 2+ touchdowns for them.
  let allowLadder = null;
  if (league === 'NFL') {
    const raw = await ballDontLieService.getNflPlayerProps(game.bdl_game_id ?? game.id).catch(() => []);
    allowLadder = nflLadderAllowance(raw, boardProps);
  }
  boardProps = await filterStandardPropMarkets(boardProps, { league, game, allowLadder });
  if (league === 'NFL') {
    boardProps = nflMainPlayers(boardProps);
    if (!boardProps.length) throw new Error('NFL props board has no main player with a priced market');
  }

  // 2. The scout report — the exact desk the game pick read when it is
  // stored; otherwise built fresh.
  const publishedDesk = options.nocache ? null : await fetchPublishedDesk(league, game);
  const scoutText = publishedDesk || await (async () => {
    const scout = await buildScoutReport(game, sportKey, { nocache: options.nocache, sportsbookOdds: options.sportsbookOdds });
    return scout?.garyText || scout?.text || '';
  })();
  console.log(`   [Football Props] desk: ${publishedDesk ? 'the game pick\'s stored desk' : 'built fresh'} (${scoutText.length} chars)`);
  if (!scoutText) throw new Error(`${league} props desk: football scout report rendered empty`);
  // NFL: the game as the side pick reads it (nflRead.js), built from the same desk, with the news desk's report on it. No
  // fallback to the full desk, which carries last season and the line (Oct 29 2026 hunt; the NBA props desk the same):
  // a story that fails fails the props run.
  let deskText = scoutText;

  // 3. Cleared counts from NFL game logs ("over in 4 of his last 5 games").
  // NCAAF has season totals only — no per-game logs, so no counts (fail-soft;
  // never a fabricated rate).
  const evidence = league === 'NFL' ? buildNflEvidenceMaps(context) : EMPTY_EVIDENCE;
  const { gamesByName, priorGamesByName, positionByName } = evidence;
  // No count clause on the board (founder, Sep 24 2026): the sheets carry the games.
  const clearedClauseFor = () => null;

  // 4. THE PROP BOARD — Board V2 with football's fun lane.
  const board = buildPropBoardV2(boardProps, {
    isFunLane: isFootballFunLane,
    clearedClauseFor,
    headerLabel: `today's live prop prices`,
    excludedNote: `(Only roster-verified players with real provider stats are on the board.)`,
  });
  if (!board.players.size) {
    throw new Error(`${league} props board has no priced market for a validated player`);
  }

  const homeTeam = context.gameSummary?.homeTeam || game.home_team;
  const awayTeam = context.gameSummary?.awayTeam || game.away_team;
  const matchup = `${awayTeam} @ ${homeTeam}`;

  // NFL reads the whole board (Oct 19 2026): the volume formula that chose three markets for him is gone.
  const readBoard = board;
  const screenedCount = null;

  assertPickDataIntegrity();
  await snapshotPropMenu({
    markets: board.markets,
    matchup,
    gameId: game.bdl_game_id ?? game.id,
    gameDate: league === 'NCAAF'
      ? ncaafSlateDateForInstant(game.commence_time)
      : new Date(game.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
    league,
  });

  // 5. Gary's published game pick no longer rides the desk (Oct 27 2026, founder GO): it anchored the props to the side
  // the game read took, wrong or right; a team can lose while its back runs for 120, and the props read the game for
  // themselves.

  // The NFL's prop sheets below carry every game of each board player's own line, opponent and snaps; the shelf of
  // summaries above them repeated them in other windows (five recent games beside the sheets' six) and added labels and
  // sums of its own (Oct 28 2026 sweep: "Usage: ELITE (L5 21.0 touches/g)" for a back the sheets put at 17.4, "LOW"
  // usage for a quarterback, a two-game "SPIKE", "Consistency: 81%"), so the NFL reads the sheets alone.
  const playersShelf = context.playerStats && league !== 'NFL'
    ? `\n\n═══ THE PLAYERS — provider-verified stats for today's board ═══\n${context.playerStats}`
    : '';

  // THE PROP SHEETS (Sep 3 2026) — the football half of the MLB sheets: every
  // board player's own values against the exact stat his markets settle on.
  // NCAAF has season totals only, no per-game logs, so it prints no sheets.
  let sheetsBlock = '';
  let sheetsOk = false;
  if (league === 'NFL') {
    const sheetMarkets = board.markets;
    const sheetContext = await loadNflSheetContext({ season: Number(context.dataWindow?.season), game, players: [...new Set(sheetMarkets.map((m) => m.player))] })
      .catch((e) => { console.warn(`   [Football Props] sheet context unavailable: ${e.message}`); return {}; });
    const sheets = buildFootballPropSheets({
      storyHasReport: true,
      context: sheetContext,
      markets: sheetMarkets,
      gamesByName,
      priorGamesByName,
      positionByName,
      seasonLabel: String(context.dataWindow?.season ?? ''),
      priorSeasonLabel: String(context.dataWindow?.priorSeason ?? ''),
      homeTeam,
      awayTeam,
    });
    if (sheets.text) {
      sheetsOk = true;
      sheetsBlock = `\n\n${sheets.text}`;
      console.log(`   [Football Props] sheets: ${sheets.players} player(s) of ${readBoard.players.size} on the board`);
    } else {
      sheetsBlock = "\n\n═══ THE PROP SHEETS ═══\nNot on file: the players' games did not load.";
    }
  }

  // The story after the sheets: CARRIES AND TARGETS leaves out the players whose sheet is below and keeps their
  // teammates, so who else gets the work is still said (round 16). Without sheets, everyone stays.
  if (league === 'NFL') {
    const keyOf = (nm) => String(nm || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
    const sheetPlayers = sheetsOk ? new Set(board.markets.map((m) => keyOf(m.player))) : null;
    const { story } = await buildNflReadStory(scoutText, { homeTeam: game.home_team, awayTeam: game.away_team, gameId: game.bdl_game_id ?? game.id,
      gameDate: game.commence_time ? etDate(game.commence_time) : null, sheetPlayers });
    const news = await nflNewsFor(story, sportKey, game.home_team, game.away_team, { game, gameId: game.id, gameTime: game.commence_time }).catch(() => null);
    deskText = `${story}\n\nTODAY'S NEWS\n${news || NFL_NEWS_NOT_ON_FILE}`;
  }

  // NFL: no second model's scores (Oct 19 2026); Gary reads the evidence himself.
  const jev = league === 'NFL' ? { text: '', metadata: null } : await assessPropEvidence({ league, game, markets: board.markets,
    evidence: [{ kind: 'desk', text: scoutText }, { kind: 'player_stats', text: context.playerStats },
      { kind: 'prop_sheets', text: sheetsBlock }] });

  const userMessage = `## THE DESK — ${matchup}\n\n${deskText}${playersShelf}\n\n${readBoard.text}${sheetsBlock}${jev.text}\n\n${league === 'NFL' ? NFL_PROPS_ASK : footballPropsAsk({ coreCount: screenedCount })}`;

  const winnersEvidence = { deskText: `${deskText}${playersShelf}\n${readBoard.text}${sheetsBlock}${jev.text}`, jev: jev.metadata, observedAt: new Date().toISOString(), homeTeam, awayTeam };

  const { parsed, audits, usage, explicitPass, respondingModel } = await runPropsDeskBrain({
    // Every college pick runs Opus (founder, Sep 22 2026), the same cascade
    // the piggyback uses. NFL keeps the props desk model.
    college: league === 'NCAAF',
    systemPrompt: buildGaryPropsSystemPrompt(todayLong()),
    userMessage,
    corpus: [{ content: `${deskText}${playersShelf}\n${readBoard.text}${sheetsBlock}` }],
    recentScores: null,
  });

  await recordJevDecision(jev, parsed.picks, { explicitPass });

  const picks = parsed.picks.map((p, i) => ({
    player: p.player,
    team: p.team ?? null,
    prop: String(p.prop_type || '').trim(),
    line: p.line != null ? p.line : null,
    bet: normalizePropBetDirection(p.bet),
    odds: p.odds != null ? String(p.odds) : null,
    confidence: p.confidence_score ?? null,
    rationale: p.rationale,
    prompt_sha: league === 'NCAAF' ? NCAAF_FOOTBALL_PROPS_PROMPT_SHA : FOOTBALL_PROPS_PROMPT_SHA,
    model: respondingModel,
    ...(jev.metadata ? { jev: jev.metadata } : {}),
    // A touchdown Gary picks as a prop is a prop (founder, Sep 23 2026): it
    // counts in his record like any other. Darts' touchdowns stay separate.
    lane: 'CORE',
    ...(board.stats ? { board_version: board.stats.board_version, board_two_sided_pct: board.stats.two_sided_pct } : {}),
    _statAuditWarnings: audits[i]?.warnings ?? null,
  }));

  return {
    picks,
    explicitPass,
    validatedPlayers,
    boardProps,
    winnersEvidence,
    _usage: usage,
  };
}
