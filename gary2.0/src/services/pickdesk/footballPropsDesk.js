import { assessPropEvidence, recordJevDecision, JEV_PROPS_SHA } from '../jev/propAssessments.js';
import { RATIONALE_WRITING_RULE } from '../copy/writingRules.js';
import { filterStandardPropMarkets, STANDARD_PROPS_SHA } from '../standardPropMarkets.js';
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
import { readFileSync } from 'fs';
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
import { ncaafSlateDateForInstant } from '../ncaafGamePolicy.js';
import {
  buildGaryPropsSystemPrompt,
  buildPropBoardV2,
  buildScreenedBoard,
  runPropsDeskBrain,
  snapshotPropMenu,
  todayLong,
} from './propsBrain.js';
import { buildNflGameContext, nflPlayerProfile, screenNflBoard } from './nflPropModel.js';
import { rankScore } from './propModel.js';
import { propOddsService } from '../propOddsService.js';
import { loadPriceHistory } from './priceHistory.js';
import { refreshNflRedZone, loadNflRedZone } from '../nflRedZone.js';
import { gameDays, snapCounts, defenseByPosition, weeklyRows } from '../nflPlayerContext.js';
import { ballDontLieService } from '../ballDontLieService.js';
import { TEAM_NAMES } from '../nflStreaksService.js';

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


// Prompt-era fingerprint — template hash, date placeholder; moves only when
// the contract wording moves. Same scheme as PROPS_PROMPT_SHA (MLB).
// The screen's model is part of the era (Sep 23 2026): a change to it is a new era.
const NFL_MODEL_SOURCE = (() => { try { return readFileSync(new URL('./nflPropModel.js', import.meta.url), 'utf8'); } catch { return 'missing:nflPropModel.js'; } })();
export const FOOTBALL_PROPS_PROMPT_SHA = createHash('sha256')
  .update(buildGaryPropsSystemPrompt('{date}') + FOOTBALL_PROPS_ASK + footballPropsAsk.toString() + NFL_MODEL_SOURCE + JEV_PROPS_SHA + STANDARD_PROPS_SHA)
  .digest('hex')
  .slice(0, 12);

export const NCAAF_FOOTBALL_PROPS_PROMPT_SHA = createHash('sha256')
  .update(FOOTBALL_PROPS_PROMPT_SHA + NCAAF_PROPS_EVIDENCE_SHA)
  .digest('hex').slice(0, 12);

// ── GARY'S GAME CALL (published pick as DATA, same as the MLB desk) ─────────
// NFL game picks live in weekly_nfl_picks keyed (week_start, season) and carry
// the provider id as bdl_game_id; NCAAF game picks live in daily_picks keyed
// by the NCAAF slate date and carry it as game_id. Fail-soft by contract: no
// call, no section.
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
    if (!resp.ok) throw Object.assign(new Error('Stored football game-call read failed'), { status: resp.status });
    const rawPicks = (await resp.json())?.[0]?.picks;
    const picks = Array.isArray(rawPicks)
      ? rawPicks
      : JSON.parse(rawPicks || '[]');
    const p = picks.find((x) => String(x?.bdl_game_id ?? x?.game_id) === String(gameId));
    if (!p?.pick) return null;
    return { pick: p.pick, rationale: p.rationale || '' };
  } catch (error) {
    console.warn(`   [Football Props] game call unavailable (${error.message}) — the desk runs without it`);
    return null;
  }
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

/**
 * THE NFL MENU (founder GO, Sep 24 2026): football prop lines are two-sided at
 * about -105 to -115, where the MLB pocket (the favorite side priced -130 to
 * -179) barely exists, so the NFL menu has its own rule: the volume model's
 * gap on either side of the line, best first by the capped rank, inside the
 * takeable window and never +151 or longer; a one-priced anytime touchdown is
 * measured on the same footing (screenNflBoard blends it). Three candidates,
 * at most two per player. The screen itself (nflPropModel) is unchanged.
 */
export function selectNflCandidates(screened, { candidates = 3, perPlayer = 2 } = {}) {
  const eligible = (screened || []).filter((s) => s.edge > 0 && Number(s.odds) <= 150
    && propOddsService.isOddsTakeable(s.odds, s.market.prop_type));
  eligible.sort((a, b) => (rankScore(b.edge) - rankScore(a.edge)) || (b.pModel - a.pModel));
  const out = [];
  const count = new Map();
  for (const s of eligible) {
    if (out.length >= candidates) break;
    const k = norm(s.market.player);
    if ((count.get(k) || 0) >= perPlayer) continue;
    count.set(k, (count.get(k) || 0) + 1);
    out.push(s);
  }
  return out;
}

/** The facts the NFL sheets carry beyond the game logs (Sep 24 2026); a source that fails is left out. */
async function loadNflSheetContext({ season, game, players }) {
  let supabase = null;
  try { ({ supabaseAdmin: supabase } = await import('../../supabaseClient.js')); } catch { /* the red zone is left out */ }
  if (supabase) await refreshNflRedZone({ supabase, seasons: [season], log: { warn: () => {} } }).catch(() => 0);
  const [rz, days, snaps, defCur, defPrev, rows, injuries, history] = await Promise.all([
    supabase ? loadNflRedZone({ supabase, seasons: [season, season - 1] }).catch(() => null) : null,
    gameDays(), snapCounts(season), defenseByPosition(season), defenseByPosition(season - 1), weeklyRows(season),
    ballDontLieService.getNflPlayerInjuries().catch(() => []),
    loadPriceHistory(supabase, { league: 'NFL', players, date: new Date(game.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), days: 21 }).catch(() => new Map()),
  ]);
  const weeksByName = new Map();
  for (const r of [...(rows || [])].sort((a, b) => Number(b.week) - Number(a.week))) {
    const k = String(r.player_display_name || '').toLowerCase().trim();
    if (!weeksByName.has(k)) weeksByName.set(k, []);
    weeksByName.get(k).push(r);
  }
  const abbrOf = (full) => Object.entries(TEAM_NAMES).find(([, name]) => name === full)?.[0] || null;
  return { season, rz, days, snaps, defCur, defPrev, weeksByName, injuries, history, homeAbbr: abbrOf(game.home_team), awayAbbr: abbrOf(game.away_team) };
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

  boardProps = await filterStandardPropMarkets(boardProps, { league, game });

  // 2. The scout report — the exact desk the game pick read when it is
  // stored; otherwise built fresh.
  const publishedDesk = options.nocache ? null : await fetchPublishedDesk(league, game);
  const scoutText = publishedDesk || await (async () => {
    const scout = await buildScoutReport(game, sportKey, { nocache: options.nocache, sportsbookOdds: options.sportsbookOdds });
    return scout?.garyText || scout?.text || '';
  })();
  console.log(`   [Football Props] desk: ${publishedDesk ? 'the game pick\'s stored desk' : 'built fresh'} (${scoutText.length} chars)`);
  if (!scoutText) throw new Error(`${league} props desk: football scout report rendered empty`);

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

  // THE NFL VOLUME MODEL (founder GO, Sep 23 2026): the board is screened
  // like MLB's — team volume, opponent, player share and efficiency priced
  // against the consensus — and Gary reads the ranked shortlist. A failed
  // team read leaves the full board, exactly as before.
  let readBoard = board;
  let screenedCount = null;
  const screenByKey = new Map();
  if (league === 'NFL' && process.env.GARY_PROPS_SCREEN !== '0') {
    const env = context.gameSummary?.gameEnvironment || {};
    const nflContext = await buildNflGameContext({ game, season: Number(context.dataWindow?.season), spreadHome: env.spread, total: env.total });
    if (nflContext) {
      const sideOf = (team) => {
        const t = norm(team);
        if (!t) return null;
        if (t === nflContext.names.home || nflContext.names.home.includes(t) || t.includes(nflContext.names.home)) return 'home';
        if (t === nflContext.names.away || nflContext.names.away.includes(t) || t.includes(nflContext.names.away)) return 'away';
        return null;
      };
      const profiles = new Map();
      const profileFor = (key, market) => {
        if (!profiles.has(key)) {
          const side = nflContext[sideOf(market.team)] || null;
          profiles.set(key, {
            side,
            profile: side ? nflPlayerProfile({ current: gamesByName.get(key)?.games || [], prior: priorGamesByName.get(key)?.games || [], position: positionByName.get(key), teamSide: side }) : null,
          });
        }
        return profiles.get(key);
      };
      const screened = screenNflBoard(board.markets, { context: nflContext, profileFor });
      const candidates = selectNflCandidates(screened);
      candidates.forEach((c, i) => screenByKey.set(`${norm(c.market.player)}|${norm(c.market.prop_type)}|${c.side}`, { ...c, rank: i + 1 }));
      const screenedBoard = buildScreenedBoard(candidates, { headerLabel: `today's board` });
      readBoard = { ...board, text: screenedBoard.text, players: new Set(screenedBoard.players) };
      screenedCount = candidates.length;
      if (board.stats) board.stats.board_version = 4;
      console.log(`   [NFL Model] ${awayTeam} ${nflContext.away.plays.toFixed(0)} plays / ${(100 * nflContext.away.dropbackRate).toFixed(0)}% dropbacks · ${homeTeam} ${nflContext.home.plays.toFixed(0)} / ${(100 * nflContext.home.dropbackRate).toFixed(0)}% · screen: ${candidates.length} of ${screened.length} priced markets (gaps ${candidates.map(c => (100 * c.edge).toFixed(0) + '%').join(' ')})`);
      if (!candidates.length) return { picks: [], explicitPass: true, validatedPlayers, boardProps, winnersEvidence: null };
    }
  }

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
    const sheetMarkets = readBoard === board ? board.markets : board.markets.filter((m) => readBoard.players.has(norm(m.player)));
    const sheetContext = await loadNflSheetContext({ season: Number(context.dataWindow?.season), game, players: [...new Set(sheetMarkets.map((m) => m.player))] })
      .catch((e) => { console.warn(`   [Football Props] sheet context unavailable: ${e.message}`); return {}; });
    const sheets = buildFootballPropSheets({
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
      sheetsBlock = `\n\n${sheets.text}`;
      console.log(`   [Football Props] sheets: ${sheets.players} player(s) of ${readBoard.players.size} on the board`);
    }
  }

  const jev = await assessPropEvidence({ league, game, markets: screenByKey.size ? [...screenByKey.values()].map((c) => c.market) : board.markets,
    evidence: [{ kind: 'desk', text: scoutText }, { kind: 'player_stats', text: context.playerStats },
      { kind: 'prop_sheets', text: sheetsBlock }] });

  const userMessage = `## THE DESK — ${matchup}\n\n${scoutText}${playersShelf}${gameCall}\n\n${readBoard.text}${sheetsBlock}${jev.text}\n\n${footballPropsAsk({ coreCount: screenedCount })}`;

  const winnersEvidence = { deskText: `${scoutText}${playersShelf}${gameCall}\n${readBoard.text}${sheetsBlock}${jev.text}`, jev: jev.metadata, observedAt: new Date().toISOString(), homeTeam, awayTeam };

  const { parsed, audits, usage, explicitPass, respondingModel } = await runPropsDeskBrain({
    // Every college pick runs Opus (founder, Sep 22 2026), the same cascade
    // the piggyback uses. NFL keeps the props desk model.
    college: league === 'NCAAF',
    systemPrompt: buildGaryPropsSystemPrompt(todayLong()),
    userMessage,
    corpus: [{ content: `${scoutText}${playersShelf}${gameCall}\n${readBoard.text}${sheetsBlock}` }],
    recentScores: null,
  });

  await recordJevDecision(jev, parsed.picks, { explicitPass });

  // A screened NFL board is the exact contract: off-menu picks are dropped,
  // each pick keeping its own index for the audit notes.
  const onMenu = (p) => !screenByKey.size || screenByKey.has(`${norm(p.player)}|${norm(p.prop_type)}|${normalizePropBetDirection(p.bet)}`);
  const offMenu = parsed.picks.filter((p) => !onMenu(p));
  if (offMenu.length) console.warn(`   [NFL Model] dropped ${offMenu.length} off-menu pick(s): ${offMenu.map((p) => `${p.player} ${p.prop_type} ${p.bet}`).join('; ')}`);
  const picks = parsed.picks.map((p, i) => [p, i]).filter(([p]) => onMenu(p)).map(([p, i]) => ({
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
    // THE NFL MODEL's numbers for the ledger (never shown to Gary).
    ...(() => {
      const c = screenByKey.get(`${norm(p.player)}|${norm(p.prop_type)}|${normalizePropBetDirection(p.bet)}`);
      return c ? { screen_p: Number(c.pModel.toFixed(3)), price_p: Number(c.pMarket.toFixed(3)), screen_gap: Number(c.edge.toFixed(3)), screen_rank: c.rank,
        fair_books: c.fairBooks ?? null, screen_adj: c.adjust } : {};
    })(),
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
