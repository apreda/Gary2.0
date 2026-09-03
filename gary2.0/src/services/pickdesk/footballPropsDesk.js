/**
 * THE FOOTBALL PROPS DESK — NFL + NCAAF props on the same system as MLB
 * (founder GO, Aug 20 2026: "it needs to be the same system as MLB").
 *
 * One call over the complete desk + THE PROP BOARD, exactly like the MLB
 * props desk (propsBrain.js, Jul 26 2026): no tools, no multi-pass — the
 * picks are a pure function of the desk. The desk here is the football scout
 * report (the same dossier the game-pick brain reads) plus a validated
 * players shelf built by the existing sport context builders:
 *   - NFL:   BDL season stats + L5 game logs + usage/consistency + injuries
 *            (nflPropsAgenticContext — the data layer survives, the
 *            multi-pass orchestrator around it does not).
 *   - NCAAF: The Odds API markets validated player-by-player against BDL
 *            rosters and season-stat evidence (ncaafPropsAgenticContext),
 *            exact player_id carried for the CLI's player-id gate.
 *
 * Board rules are Board V2 with football's sanctioned one-sided fun lane:
 * anytime touchdown (the HR analog — the feed offers no "no TD" side).
 * Anytime-TD picks stamp lane "TD" the way MLB HR picks stamp lane "HR".
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
import { buildFootballPropSheets } from './footballPropSheets.js';
import { buildScoutReport } from '../agentic/scoutReport/scoutReportBuilder.js';
import { normalizePropBetDirection } from '../agentic/propsSharedUtils.js';
import { ncaafSlateDateForInstant } from '../ncaafGamePolicy.js';
import {
  buildGaryPropsSystemPrompt,
  buildPropBoardV2,
  runPropsDeskBrain,
  snapshotPropMenu,
  todayLong,
} from './propsBrain.js';

const norm = (s) => String(s || '').toLowerCase().trim();

const SPORT_KEY_BY_LEAGUE = {
  NFL: 'americanfootball_nfl',
  NCAAF: 'americanfootball_ncaaf',
};

/** Football's sanctioned one-sided market family (the HR analog). */
export const isFootballFunLane = (propType) => /anytime_?(?:td|touchdown)/.test(norm(propType));

// Football props ask — the MLB contract with football's day grammar (the
// founder's tonight→today porting rule, c3691c04) and the TD fun-lane label.
export const FOOTBALL_PROPS_ASK = `Take two prop bets from today's board — two prop cards is what this game publishes.

Injuries: an absence already games old is already in the price and in the team's recent results; fresh news — today's inactive — is the exception.

Output:

\`\`\`json
{ "picks": [ { "player": "[full name]", "team": "[team]", "prop_type": "[key from the board]", "line": 1.5, "bet": "over", "odds": "[exact odds]", "confidence_score": 0.XX, "rationale": "Gary's Take\\n\\n[the prose]" } ] }
\`\`\`

bet is "over" or "under" — "over" for one-priced lines.
confidence_score (0.50–1.00): your conviction in this bet at its price — the bet, not the outcome.`;

// Prompt-era fingerprint — template hash, date placeholder; moves only when
// the contract wording moves. Same scheme as PROPS_PROMPT_SHA (MLB).
export const FOOTBALL_PROPS_PROMPT_SHA = createHash('sha256')
  .update(buildGaryPropsSystemPrompt('{date}') + FOOTBALL_PROPS_ASK)
  .digest('hex')
  .slice(0, 12);

// ── GARY'S GAME CALL (published pick as DATA, same as the MLB desk) ─────────
// NFL game picks live in weekly_nfl_picks keyed (week_start, season); NCAAF
// game picks live in daily_picks keyed by the NCAAF slate date. Fail-soft by
// contract: no call, no section.
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

async function fetchFootballGameCall(league, game) {
  const gameId = game.bdl_game_id ?? game.id;
  if (!CALL_URL || !CALL_KEY || gameId == null) return null;
  try {
    const headers = { apikey: CALL_KEY, Authorization: `Bearer ${CALL_KEY}` };
    let url;
    if (league === 'NFL') {
      const weekStart = nflWeekStartForInstant(game.commence_time);
      const season = nflSeasonForInstant(game.commence_time);
      url = `${CALL_URL}/rest/v1/weekly_nfl_picks?week_start=eq.${weekStart}&season=eq.${season}&select=picks&limit=1`;
    } else {
      const slateDate = ncaafSlateDateForInstant(game.commence_time);
      url = `${CALL_URL}/rest/v1/daily_picks?date=eq.${slateDate}&select=picks&limit=1`;
    }
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const rawPicks = (await resp.json())?.[0]?.picks;
    const picks = Array.isArray(rawPicks)
      ? rawPicks
      : (() => { try { return JSON.parse(rawPicks || '[]'); } catch { return []; } })();
    const p = picks.find((x) => String(x?.game_id) === String(gameId));
    if (!p?.pick) return null;
    return { pick: p.pick, rationale: p.rationale || '' };
  } catch { return null; }
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
  const priorSeason = String(context?.dataWindow?.priorSeason ?? '');

  for (const c of context?.propCandidates || []) {
    const key = norm(c?.player);
    const id = c?.playerId;
    if (!key || id == null) continue;
    const currentLogs = context?.playerGameLogs?.[id];
    const priorLogs = context?.priorGameLogs?.[id];
    const current = Array.isArray(currentLogs?.games) ? currentLogs.games : null;
    const prior = Array.isArray(priorLogs?.games) ? priorLogs.games : null;
    if (current?.length) gamesByName.set(key, currentLogs);
    if (prior?.length) priorGamesByName.set(key, priorLogs);
    // A count reads whichever season it actually came from, and says which.
    if (current && current.length >= 3) countingWindow.set(key, { games: current, label: season });
    else if (prior?.length) countingWindow.set(key, { games: prior, label: priorSeason });
    const seasonStat = context?.playerSeasonStats?.[id] || context?.priorSeasonStats?.[id];
    const position = seasonStat?.player?.position_abbreviation || seasonStat?.player?.position;
    if (position) positionByName.set(key, position);
  }
  return { gamesByName, priorGamesByName, positionByName, countingWindow };
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
 * reconciliation (it carries NCAAF's exact player_id).
 */
export async function analyzeFootballPropsDesk(game, playerProps, options = {}) {
  const league = options.league;
  const sportKey = SPORT_KEY_BY_LEAGUE[league];
  if (!sportKey) throw new Error(`analyzeFootballPropsDesk requires league NFL or NCAAF (got ${league})`);

  // 1. The sport context: roster/stat validation + the players shelf. This is
  // the same data layer the old orchestrator path used — kept verbatim.
  const context = league === 'NFL'
    ? await buildNflPropsAgenticContext(game, playerProps, { nocache: options.nocache, regularOnly: options.regularOnly })
    : await buildNcaafPropsAgenticContext(game, playerProps, { nocache: options.nocache });

  // The validated board. NCAAF narrows to roster+stat-validated rows (exact
  // player_id attached); NFL returns the (regularOnly-filtered) feed, so
  // narrow it here to supported market types and validated candidates.
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

  // 2. The scout report — the same game dossier the football pick brain reads
  // (warm from the game-pick run's shared disk cache in production).
  const scout = await buildScoutReport(game, sportKey, { nocache: options.nocache, sportsbookOdds: options.sportsbookOdds });
  const scoutText = scout?.garyText || scout?.text || '';
  if (!scoutText) throw new Error(`${league} props desk: football scout report rendered empty`);

  // 3. Cleared counts from NFL game logs ("over in 4 of his last 5 games").
  // NCAAF has season totals only — no per-game logs, so no counts (fail-soft;
  // never a fabricated rate).
  const evidence = league === 'NFL' ? buildNflEvidenceMaps(context) : EMPTY_EVIDENCE;
  const { gamesByName, priorGamesByName, positionByName, countingWindow } = evidence;
  const clearedClauseFor = (playerKey, propType, line) => clearedCountClause(countingWindow, playerKey, propType, line);

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

  await snapshotPropMenu({
    markets: board.markets,
    matchup,
    gameId: game.bdl_game_id ?? game.id,
    gameDate: league === 'NCAAF'
      ? ncaafSlateDateForInstant(game.commence_time)
      : new Date(game.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
    league,
  });

  // 5. GARY'S GAME CALL — the published pick rides the desk as data.
  let gameCall = '';
  const call = await fetchFootballGameCall(league, game);
  if (call?.pick) {
    gameCall = `\n\n═══ GARY'S GAME CALL — this game, already published ═══\n${call.pick}\n\n${call.rationale}`;
  }

  const playersShelf = context.playerStats
    ? `\n\n═══ THE PLAYERS — provider-verified stats for today's board ═══\n${context.playerStats}`
    : '';

  // THE PROP SHEETS (Sep 3 2026) — the football half of the MLB sheets: every
  // board player's own values against the exact stat his markets settle on.
  // NCAAF has season totals only, no per-game logs, so it prints no sheets.
  let sheetsBlock = '';
  if (league === 'NFL') {
    const sheets = buildFootballPropSheets({
      markets: board.markets,
      gamesByName,
      priorGamesByName,
      positionByName,
      seasonLabel: String(context.dataWindow?.season ?? ''),
      priorSeasonLabel: String(context.dataWindow?.priorSeason ?? ''),
      homeTeam,
      awayTeam,
    });
    if (sheets.text) {
      sheetsBlock = `\n\n${sheets.text}`;
      console.log(`   [Football Props] sheets: ${sheets.players} player(s) of ${board.players.size} on the board`);
    }
  }

  const userMessage = `## THE DESK — ${matchup}\n\n${scoutText}${playersShelf}${gameCall}\n\n${board.text}${sheetsBlock}\n\n${FOOTBALL_PROPS_ASK}`;

  const { parsed, audits, usage, explicitPass, respondingModel } = await runPropsDeskBrain({
    systemPrompt: buildGaryPropsSystemPrompt(todayLong()),
    userMessage,
    corpus: [{ content: `${scoutText}${playersShelf}${gameCall}\n${board.text}${sheetsBlock}` }],
    recentScores: null,
  });

  const picks = parsed.picks.map((p, i) => ({
    player: p.player,
    team: p.team ?? null,
    prop: String(p.prop_type || '').trim(),
    line: p.line != null ? p.line : null,
    bet: normalizePropBetDirection(p.bet),
    odds: p.odds != null ? String(p.odds) : null,
    confidence: p.confidence_score ?? null,
    rationale: p.rationale,
    prompt_sha: FOOTBALL_PROPS_PROMPT_SHA,
    model: respondingModel,
    // TD SPLIT — the football fun lane, same definition as MLB's HR lane:
    // anytime TD is drama, never the core props record.
    lane: isFootballFunLane(p.prop_type) ? 'TD' : 'CORE',
    ...(board.stats ? { board_version: board.stats.board_version, board_two_sided_pct: board.stats.two_sided_pct } : {}),
    _statAuditWarnings: audits[i]?.warnings ?? null,
  }));

  return {
    picks,
    explicitPass,
    validatedPlayers,
    boardProps,
    _usage: usage,
  };
}
