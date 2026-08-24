#!/usr/bin/env node
/**
 * Agentic Props CLI Runner
 * Generic CLI for running agentic prop picks pipeline
 */
// Load environment variables FIRST
import '../src/loadEnv.js';
import { createClient } from '@supabase/supabase-js';
import {
  etDayBounds,
  formatPropRunOutcome,
  propGameDiscoveryOptions,
  propGameRejectionReason,
  propPickDedupeKey,
  reconcilePropTeam,
  samePropGame,
} from './lib/propsRunReliability.js';
import { stampFootballTdCategory, storePropPicksAtomic } from './lib/propPicksStorage.js';
import { ncaafSlateDateForInstant } from '../src/services/ncaafGamePolicy.js';

// Dynamic imports after env is loaded (services read env at import time)
const { oddsService } = await import('../src/services/oddsService.js');
const { propOddsService } = await import('../src/services/propOddsService.js');
const { getPropsConstitution, applyPropsPerGameConstraint, isExplicitPropsPass, normalizePropBetDirection, stripInternalFields } = await import('../src/services/agentic/propsSharedUtils.js');
const { analyzeGame } = await import('../src/services/agentic/orchestrator/index.js');
const { analyzeMlbPropsDesk, PROPS_PROMPT_SHA } = await import('../src/services/pickdesk/propsBrain.js');
const { analyzeFootballPropsDesk, FOOTBALL_PROPS_PROMPT_SHA } = await import('../src/services/pickdesk/footballPropsDesk.js');

// ERA LIVE — fresh process, module cache == disk truth. Ledger append feeds
// the grading-side drift check (see scripts/lib/eraTruth.js). Fail-open.
try {
  const { recordEraRun, gitStamp, PROJECT_DIR } = await import('./lib/eraTruth.js');
  const etToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  console.log(`🧬 ERA LIVE: props ${PROPS_PROMPT_SHA} · commit ${gitStamp()} @ ${PROJECT_DIR}`);
  recordEraRun('props', etToday, PROPS_PROMPT_SHA);
} catch (e) { console.log(`🧬 ERA LIVE: (unavailable — ${e.message})`); }

// Football props leagues: provider-empty boards are market reality (preseason
// NFL, small-school NCAAF Saturdays) and grade as a verified pass below.
const FOOTBALL_PROP_LEAGUES = new Set(['NFL', 'NCAAF']);

const defaultArgv = process.argv.slice(2);

function parseArgs(argv = defaultArgv) {
  // Supports both `--key=value` and `--key value` styles. Bare flags become true.
  const acc = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      const key = arg.slice(2, eqIdx);
      acc[key] = arg.slice(eqIdx + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next != null && !next.startsWith('--')) {
      acc[key] = next;
      i++;
    } else {
      acc[key] = true;
    }
  }
  return acc;
}

function getESTDate() {
  // DST-safe: Use Intl with America/New_York timezone
  const now = new Date();
  const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
  const estDate = new Intl.DateTimeFormat('en-US', options).format(now);
  const [month, day, year] = estDate.split('/');
  return `${year}-${month}-${day}`;
}

// The ET calendar date (YYYY-MM-DD) of a game from its commence_time. Props are
// keyed by THIS, not the run's "today" — a late / cross-midnight run must file a
// game's props under the game's date, never tomorrow's (the bug where June 14
// games landed under the June 15 prop_picks key). Falls back to today on a bad
// timestamp.
function estDateFromISO(iso) {
  if (!iso) return getESTDate();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return getESTDate();
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // en-CA → YYYY-MM-DD
}

export async function runAgenticPropsCli({
  sportKey,
  leagueLabel,
  buildContext,
  windowHours = 24 * 7,
  limitDefault = 5,
  useESTDayFiltering = false,  // If true, filter by EST day instead of rolling window
  regularOnly = false,  // If true for NFL, only generate yards/receptions props (no TDs - use when TDs already stored)
  hrOnly = false         // If true for MLB HR, only include home_runs props
}) {
  // Desk-lane sports (MLB, NFL, NCAAF) carry no context builder — the desk IS
  // the context. NBA/NHL still require one for the orchestrator path.
  const DESK_LANE_SPORTS = new Set(['baseball_mlb', 'americanfootball_nfl', 'americanfootball_ncaaf']);
  if (!sportKey || (!buildContext && !DESK_LANE_SPORTS.has(sportKey))) {
    throw new Error('runAgenticPropsCli requires sportKey and buildContext');
  }

  const args = parseArgs();
  const parsedLimit = Number.parseInt(args.limit || process.env.AGENTIC_PROPS_LIMIT || String(limitDefault), 10);
  const limit = Number.isNaN(parsedLimit) ? limitDefault : parsedLimit;
  const nocache = args.nocache === '1' || args.nocache === 'true';
  const shouldStore = args.store !== '0' && args.store !== 'false'; // Default TRUE, pass --store=0 to skip
  // --force=1 bypasses the early-skip dedup (used when manually re-running a game whose
  // props you want to regenerate, e.g. after a lineup correction).
  const forceRun = args.force === '1' || args.force === 'true' || args.force === true;
  const matchupFilter = args.matchup || null;
  // --game-id: exact BDL game id filter (used by scheduler — no substring collisions)
  const gameIdFilter = args['game-id'] != null ? String(args['game-id']) : null;
  const requestedSlateDate = leagueLabel === 'NCAAF' && args.date != null
    ? String(args.date).trim()
    : null;
  if (requestedSlateDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(requestedSlateDate)) {
    throw new Error('NCAAF --date must be a YYYY-MM-DD slate date');
  }
  const slateDateFromISO = (iso) => {
    if (leagueLabel !== 'NCAAF') return estDateFromISO(iso);
    return requestedSlateDate || ncaafSlateDateForInstant(iso);
  };
  // CLI override for regularOnly: --regular=1 or --no-td=1
  const cliRegularOnly = regularOnly || args.regular === '1' || args['no-td'] === '1';
  // --test flag: store to test_prop_picks table instead of production (for testing)
  const useTestTable = args.test === true || args.test === '1' || args.test === 'true';
  const testTableName = useTestTable ? 'test_prop_picks' : 'prop_picks';
  const existingGameIds = [];
  const passedGameIds = [];
  const finishOutcome = (status, extra = {}) => {
    const outcome = {
      status,
      sport: leagueLabel,
      game_ids: [...new Set([...existingGameIds, ...passedGameIds, ...(extra.game_ids || [])])],
      existing_game_ids: [...new Set(existingGameIds)],
      passed_game_ids: [...new Set(passedGameIds)],
      pick_count: extra.pick_count || 0,
      ...(extra.added_count != null ? { added_count: extra.added_count } : {}),
      ...(extra.skipped_count != null ? { skipped_count: extra.skipped_count } : {}),
      ...(extra.replaced_count != null ? { replaced_count: extra.replaced_count } : {}),
    };
    console.log(formatPropRunOutcome(outcome));
    return outcome;
  };

  // Era ledger truth for the football desk lane: football picks stamp their
  // own prompt sha, so the drift guard needs a matching ledger entry per run
  // (the module-scope ERA LIVE line above records the MLB desk sha).
  if (FOOTBALL_PROP_LEAGUES.has(leagueLabel)) {
    try {
      const { recordEraRun } = await import('./lib/eraTruth.js');
      console.log(`🧬 ERA LIVE (football props desk): ${FOOTBALL_PROPS_PROMPT_SHA}`);
      recordEraRun('props', getESTDate(), FOOTBALL_PROPS_PROMPT_SHA);
    } catch (e) { console.log(`🧬 ERA LIVE (football props desk): unavailable — ${e.message}`); }
  }

  const isDeskLane = DESK_LANE_SPORTS.has(sportKey);
  console.log(`\n🏈 Agentic ${leagueLabel} Props Runner Starting...`);
  console.log(`${'='.repeat(50)}`);
  console.log(`📅 Date: ${requestedSlateDate || getESTDate()}`);
  console.log(`🎯 Sport: ${leagueLabel}`);
  console.log(`📊 Games limit: ${limit}`);
  console.log(`🔧 Pipeline: ${isDeskLane ? 'PROPS DESK (one call over the desk + board)' : 'ORCHESTRATOR (multi-pass)'}`);
  console.log(`💾 Store: ${shouldStore ? 'Yes' : 'No (pass --store=1 to save)'}${useTestTable ? ' (TEST MODE → test_prop_picks)' : ''}`);
  if (cliRegularOnly && leagueLabel === 'NFL') console.log(`🏈 Mode: Regular props only (yards/receptions - TDs handled separately)`);
  if (matchupFilter) console.log(`🔍 Matchup filter: ${matchupFilter}`);
  if (gameIdFilter) console.log(`🔍 Game ID filter: ${gameIdFilter}`);
  console.log(`${'='.repeat(50)}\n`);

  // Fetch upcoming games
  const games = await oddsService.getUpcomingGames(sportKey, propGameDiscoveryOptions({
    sportKey,
    nocache,
    gameIdFilter,
    etDate: requestedSlateDate
      || (leagueLabel === 'NCAAF' ? ncaafSlateDateForInstant(new Date()) : getESTDate()),
  }));
  const now = Date.now();
  
  // Calculate time window based on filtering mode
  let todayStart, tomorrowStart;
  if (useESTDayFiltering) {
    const todayEST = getESTDate();
    ({ start: todayStart, end: tomorrowStart } = etDayBounds(todayEST));
    console.log(`📅 ET Day Filter: ${todayEST}, todayStart=${new Date(todayStart).toISOString()}, tomorrowStart=${new Date(tomorrowStart).toISOString()}`);
  }
  const windowMs = windowHours ? windowHours * 60 * 60 * 1000 : null;

  // DEBUG: Log all games before filtering
  console.log(`\n🔍 DEBUG: ${games.length} games returned from oddsService:`);
  for (const g of games) {
    console.log(`   - ${g.away_team} @ ${g.home_team} | commence_time: ${g.commence_time} | id: ${g.id}`);
  }
  console.log(`🔍 DEBUG: now = ${new Date(now).toISOString()}, windowMs = ${windowMs}ms (${windowHours}h)\n`);

  const filtered = games
    .filter((game) => {
      const tip = new Date(game.commence_time).getTime();
      const rejection = propGameRejectionReason(game, {
        now,
        useESTDayFiltering,
        todayStart,
        tomorrowStart,
        windowMs,
        gameIdFilter,
        matchupFilter,
      });
      if (rejection) {
        console.log(`🚫 FILTERED OUT: ${game.away_team} @ ${game.home_team}`);
        console.log(`   commence_time: ${game.commence_time}, tip: ${tip}, reason: ${rejection}`);
        return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))
    .slice(0, Math.max(limit, 1));

  console.log(`Found ${filtered.length} ${leagueLabel} games to process.\n`);

  if (filtered.length === 0) {
    throw new Error(`No eligible upcoming ${leagueLabel} game matched this run${gameIdFilter ? ` (game ${gameIdFilter})` : ''}`);
  }

  const allPropPicks = [];

  // Early-skip dedup so the scheduler's multi-tier retry windows (T-90 / T-60 /
  // T-30) don't re-spend the full ~$0.07 prop pipeline on a game that already
  // has props for today. Pulls the existing per-day row once and bails per
  // game if any of today's prop picks already carry this exact game id. The existing
  // atomic path below still handles an intentional exact-game replacement
  // when force-run is requested (just run with --force).
  let existingPropsForToday = [];
  if (shouldStore && !forceRun) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        // Dedup against the row where these props WILL land — keyed by the
        // game's ET date (not the run's "today"), so the check matches storage.
        const dateParam = slateDateFromISO(filtered[0]?.commence_time);
        const { data } = await supabase
          .from(testTableName)
          .select('picks')
          .eq('date', dateParam)
          .single();
        existingPropsForToday = Array.isArray(data?.picks) ? data.picks : [];
      }
    } catch (_) { /* non-fatal — fall through to full processing */ }
  }
  for (const game of filtered) {
    const matchup = `${game.away_team} @ ${game.home_team}`;
    const gameId = game.bdl_game_id ?? game.id ?? null;
    const gameIdentity = { game_id: gameId, matchup };
    const gameTime = new Date(game.commence_time).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    if (existingPropsForToday.some((pick) => pick?.sport === leagueLabel && samePropGame(pick, gameIdentity))) {
      console.log(`🚫 GAME ALREADY HAS PROPS: ${leagueLabel} ${matchup} — skipping (use --force=1 to override)`);
      existingGameIds.push(String(gameId));
      continue;
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`🏈 ${matchup}`);
    console.log(`⏰ ${gameTime} EST`);
    console.log(`${'='.repeat(50)}`);

    try {
      // Fetch available props for this game
      console.log(`\n📡 Fetching player props...`);
      let playerProps = [];
      try {
        if (sportKey === 'baseball_mlb') {
          // BOARD V2 (cutover Aug 3 2026): MLB fetches MARKET rows — one row
          // per player+type+line carrying BOTH sides' best prices, with NO
          // odds-window filtering. The -200..+400 window is enforced at the
          // odds gate below as a BET rule, never at board construction (the
          // per-side filter built a 58.6%-over-only menu and its split rows
          // made the reconciliation below kill under picks as "unverified").
          playerProps = await propOddsService.getMlbPlayerPropMarkets(game.bdl_game_id ?? game.id ?? null);
        } else {
          playerProps = await propOddsService.getPlayerPropOdds(sportKey, game.home_team, game.away_team, game.commence_time, game.bdl_game_id ?? game.id ?? null);
        }
        console.log(`✅ Found ${playerProps.length} prop lines`);
      } catch (propsError) {
        // NCAAF's market adapter throws a typed error when the matched game
        // simply has no posted player-prop markets — that is the same
        // no-board-exists condition as an empty NFL fetch, not a failure.
        // Every OTHER code (credentials, unmatched event, payload mismatch)
        // stays fatal.
        if (FOOTBALL_PROP_LEAGUES.has(leagueLabel) && propsError?.code === 'NO_LIVE_PROP_MARKETS') {
          playerProps = [];
        } else {
          throw new Error(`Could not fetch prop lines for ${matchup}: ${propsError.message}`, { cause: propsError });
        }
      }

      // PROVIDER-EMPTY BOARD = VERIFIED PASS for football (founder GO, Aug 20
      // 2026): books list few or no props for NFL preseason games and for many
      // college games, so a game where the provider offers NOTHING has no
      // board to pick from — that is a pass, not a crash (the old throw fired
      // a props-miss alert every preseason night). A fetch FAILURE above still
      // fails loud, and MLB keeps its hard fail: an empty MLB board on a real
      // slate game means a provider hole, never market reality.
      if (playerProps.length === 0 && FOOTBALL_PROP_LEAGUES.has(leagueLabel)) {
        console.log(`↪️ No player-prop markets posted for ${matchup} — verified pass (no board exists to pick from)`);
        passedGameIds.push(String(gameId));
        continue;
      }

      // HR-only mode: filter to home_runs props only
      if (hrOnly) {
        const beforeCount = playerProps.length;
        playerProps = playerProps.filter(p => (p.prop_type || '').toLowerCase().includes('home_run'));
        console.log(`🏠 HR-only mode: ${beforeCount} total → ${playerProps.length} HR props`);
      }

      // HR props now ride the SAME MLB run (user, Jun 18) — no separate paid HR
      // pass. They're evaluated alongside the regular props in one orchestrator
      // call; the per-game cap (propsSharedUtils) keeps AT MOST ONE HR per game,
      // and the pick mapping below re-stamps HR picks as sport:"MLB HR" so they
      // route to the Home Run Threats lane. (run-mlb-hr-picks.js still works for
      // a manual on-demand HR-only run, but the daily slate no longer needs it.)

      if (playerProps.length === 0) {
        throw new Error(`No${hrOnly ? ' HR' : ''} prop lines available for ${matchup}`);
      }

      let result;

      {
        // PROPS DESK LANE (MLB Jul 26 2026; NFL+NCAAF Aug 20 2026 — founder:
        // "the same system as MLB"): props read the SAME desk as game picks —
        // one call over the sport's dossier + THE PROP BOARD (spec
        // docs/superpowers/specs/2026-07-26-props-desk.md). The validated pool
        // is the board's players (MLB: lineup-filtered; football: roster/stat
        // validated). NBA/NHL keep the orchestrator path until their revival
        // pass. Every gate below (no-stats, odds reconciliation + hard gate,
        // caps, HR/TD routing) is shared chassis.
        let validatedPlayerNames;
        if (sportKey === 'baseball_mlb') {
          const deskRes = await analyzeMlbPropsDesk(game, playerProps, { nocache, hrOnly });
          if (deskRes.error) throw new Error(`MLB props desk failed: ${deskRes.error}`);
          result = {
            picks: deskRes.picks || [],
            explicitPass: deskRes.explicitPass === true,
          };
          validatedPlayerNames = deskRes.validatedPlayers || new Set();
        } else if (FOOTBALL_PROP_LEAGUES.has(leagueLabel)) {
          const deskRes = await analyzeFootballPropsDesk(game, playerProps, {
            league: leagueLabel,
            nocache,
            regularOnly: cliRegularOnly,
          });
          if (deskRes.error) throw new Error(`${leagueLabel} props desk failed: ${deskRes.error}`);
          result = {
            picks: deskRes.picks || [],
            explicitPass: deskRes.explicitPass === true,
          };
          validatedPlayerNames = deskRes.validatedPlayers || new Set();
          // Adopt the desk's validated board for BOTH the odds reconciliation
          // and the NCAAF player-id stamp below — it is the narrowed market
          // set that passed roster/stat validation (exact BDL ids attached).
          if (Array.isArray(deskRes.boardProps) && deskRes.boardProps.length) {
            playerProps = deskRes.boardProps;
          }
        } else {
          console.log(`[Orchestrator Props] Building context for ${matchup}...`);
          const context = await buildContext(game, playerProps, { nocache, regularOnly: cliRegularOnly });

          // A sport context may narrow the provider board after authoritative
          // roster/stat validation. Adopt that exact board for BOTH the lines
          // shown to Gary and the provider-price reconciliation below. NCAAF,
          // for example, rejects any The Odds API player who is not on one of
          // the two current BDL rosters or lacks the BDL field for that market.
          if (Array.isArray(context.playerProps)) {
            playerProps = context.playerProps;
          }

          // Prepare prop candidates and available lines for orchestrator
          const propCandidates = (context.propCandidates || []).slice(0, 14).map(p => ({
            player: p.player,
            team: p.team,
            props: p.props,
            recentForm: p.recentForm ? {
              targetTrend: p.recentForm.targetTrend,
              usageTrend: p.recentForm.usageTrend,
              formTrend: p.recentForm.formTrend
            } : null
          }));

          // Filter available lines to only validated players
          validatedPlayerNames = new Set(
            (context.propCandidates || []).map(p => p.player.toLowerCase())
          );
          const availableLines = playerProps
            .filter(p => validatedPlayerNames.has(p.player.toLowerCase()))
            .slice(0, 80)
            .map(p => ({
              player: p.player,
              prop_type: p.prop_type,
              line: p.line,
              over_odds: p.over_odds,
              under_odds: p.under_odds
            }));

          const propsConstitution = getPropsConstitution(leagueLabel);

          result = await analyzeGame(game, sportKey, {
            mode: 'props',
            propContext: {
              propCandidates,
              availableLines,
              playerStats: context.playerStats || '',
              gameSummary: context.gameSummary || {},
              propsConstitution,
              narrativeContext: context.narrativeContext || null
            }
          });
        }

        // Post-process picks (both lanes): normalize line + format prop for iOS display
        if (result.picks && result.picks.length > 0) {
          // HR lane (hrOnly) must store ONLY home-run props. The candidate pool is
          // already HR-filtered, but the orchestrator can still surface non-HR props
          // (total_bases, strikeouts, ...) from its tools/context — and they'd get
          // stamped sport:"MLB HR" below, polluting the Home Run Threats lane. Drop
          // any non-HR pick here so the lane stays pure.
          if (hrOnly) {
            const beforeHR = result.picks.length;
            result.picks = result.picks.filter(p =>
              (p.prop || '').toLowerCase().includes('home_run') ||
              (p.prop_type || '').toLowerCase().includes('home_run')
            );
            if (result.picks.length !== beforeHR) {
              console.log(`🏠 HR-only OUTPUT filter: dropped ${beforeHR - result.picks.length} non-HR pick(s) the orchestrator emitted`);
            }
          }
          // (A) NO-STATS GATE: drop any pick whose player is NOT a validated stat candidate
          // (no real provider stats this run). Mirrors the game-pick countRealStats HARD FAIL
          // — stops a prop shipping on model-knowledge when a player/provider is ungrounded
          // (the WC "provider dark" + invented-player class). validatedPlayerNames is the
          // candidate pool that passed upstream stat validation.
          {
            const beforeStats = result.picks.length;
            result.picks = result.picks.filter(p => validatedPlayerNames.has((p.player || '').toLowerCase()));
            const droppedNoStats = beforeStats - result.picks.length;
            if (droppedNoStats > 0) console.warn(`[Props CLI] 🛑 No-stats gate: dropped ${droppedNoStats} pick(s) for players with no validated stats (${matchup})`);
          }

          result.picks = result.picks.map(pick => {
            // Extract line from prop string if embedded (e.g. "player_points 25.5")
            let prop = pick.prop || '';
            let line = pick.line;
            const propParts = prop.match(/^([a-z_]+)\s+([\d.]+)$/i);
            if (propParts) {
              prop = propParts[1];
              if (!line) line = parseFloat(propParts[2]);
            }
            // If line is still missing, look it up from available lines
            if (!line && pick.player && prop) {
              const match = playerProps.find(p =>
                p.player.toLowerCase() === pick.player.toLowerCase() &&
                p.prop_type.toLowerCase() === prop.toLowerCase()
              );
              if (match) line = match.line;
            }
            if (!line) {
              console.log(`⚠️ Missing line for ${pick.player} ${prop} — could not resolve from available lines`);
            }

            // Format prop for iOS propDisplay():
            // Strip "player_" prefix → "player_points" becomes "points"
            // Append line number → "points 25.5"
            // iOS propDisplay("points 25.5") renders as "Points 25.5"
            let displayProp = prop.replace(/^player_/i, '');
            if (line) displayProp = `${displayProp} ${line}`;

            // (C) ODDS RECONCILIATION: store the PROVIDER (BDL) price, not the model's
            // free-text odds (which flow straight into the stored card + the units/ROI math).
            // Match player + prop_type + line + side; null when no book line matches → the
            // pick is dropped below as unverified. Never trust the model's number.
            const _side = normalizePropBetDirection(pick.bet ?? pick.direction);
            const _over = _side === 'over';
            const _oddsRow = playerProps.find(pp =>
              (pp.player || '').toLowerCase() === (pick.player || '').toLowerCase() &&
              (pp.prop_type || '').toLowerCase() === prop.toLowerCase() &&
              (line == null || Number(pp.line) === Number(line))
            );
            const _providerOdds = _side && _oddsRow
              ? (_over ? _oddsRow.over_odds : _oddsRow.under_odds)
              : null;

            return {
              ...pick,
              team: reconcilePropTeam(pick.team, _oddsRow?.team),
              ...(leagueLabel === 'NCAAF' ? { player_id: _oddsRow?.player_id ?? null } : {}),
              odds: _providerOdds != null ? String(_providerOdds) : (pick.odds != null ? String(pick.odds) : null),
              _oddsUnverified: _side == null || _providerOdds == null,
              prop: displayProp,
              line: line != null ? String(line) : null,
              // HR picks route to the "MLB HR" lane even though they came from the
              // regular MLB run (same orchestrator pass, no extra cost). Everything
              // else keeps the run's own label.
              sport: (sportKey === 'baseball_mlb' && displayProp.toLowerCase().includes('home_run')) ? 'MLB HR' : leagueLabel,
              matchup,
              commence_time: game.commence_time,
              // BDL game id — pins the prop to the exact game (doubleheaders,
              // same-series UTC-window collisions) for dedupe + future grading
              game_id: game.bdl_game_id ?? game.id ?? null,
              bet: _side,
              confidence: pick.confidence || null
            };
          });

          // (C) ODDS HARD GATE (F-5, Jul 5 2026 audit): a price users can bet must exist at
          // a book. The Jul 5 audit measured 25-40% of stored props/day carrying model-quoted
          // odds that matched no BDL line — those shipped fictional prices. Per this block's
          // original design note ("flip to a hard drop once live runs confirm"), unverified
          // odds are now DROPPED, not flagged.
          {
            const beforeOdds = result.picks.length;
            result.picks = result.picks.filter(p => {
              if (!p.bet) { console.warn(`[Props CLI] 🛑 Direction gate: dropped ${p.player} ${p.prop} — bet must be over, under, or yes`); return false; }
              if (leagueLabel === 'NCAAF' && p.player_id == null) { console.warn(`[Props CLI] 🛑 Player-id gate: dropped ${p.player} ${p.prop} — no exact BDL roster id`); return false; }
              if (p.odds == null) { console.warn(`[Props CLI] 🛑 Odds gate: dropped ${p.player} ${p.prop} — no price at all (model + BDL both missing)`); return false; }
              if (p._oddsUnverified) { console.warn(`[Props CLI] 🛑 Odds gate: dropped ${p.player} ${p.prop} @ ${p.odds} — no BDL line matched the pick (model-quoted price)`); return false; }
              // BET-WINDOW PERMISSION — every sport (founder, Aug 3: props
              // were broken everywhere; ONE system). The -200..+400 window
              // (HR +900) lives HERE, on the side actually picked: the board
              // shows whole markets, an off-window side is visible but never
              // takeable.
              {
                const _tok = (p.prop || '').split(' ')[0].toLowerCase();
                const _num = Number(p.odds);
                if (!propOddsService.isOddsTakeable(Number.isFinite(_num) ? _num : null, _tok)) {
                  console.warn(`[Props CLI] 🛑 Odds gate: dropped ${p.player} ${p.bet} ${p.prop} @ ${p.odds} — price outside the bet window`);
                  return false;
                }
              }
              return true;
            });
            const droppedOdds = beforeOdds - result.picks.length;
            if (droppedOdds > 0) console.log(`[Props CLI] Odds gate dropped ${droppedOdds} pick(s) without a verifiable book price`);
          }

          // TD scorer identity is a storage/UI contract, not model prose. Once
          // the provider-price hard gate has passed, deterministically stamp an
          // anytime scorer as Regular (< +200) or Value (+200 and above). This
          // applies identically to NFL and NCAAF and clears stray categories
          // from ordinary football props.
          result.picks = result.picks.map((pick) => stampFootballTdCategory(pick, leagueLabel));

          // Apply 2-per-game cap + Gary Specials correlation for every sport.
          // Previously this only ran for NBA/NHL — MLB and NFL bypassed the cap
          // and never got correlation flags. There's no reason to skip it.
          if (['NBA', 'NHL', 'MLB', 'NFL', 'NCAAF'].includes(leagueLabel)) {
            const { constrainedPicks } = applyPropsPerGameConstraint(result.picks, `${leagueLabel}-post`);
            result.picks = constrainedPicks;
          }
        }
      }

      if (result.picks && result.picks.length > 0) {
        console.log(`✅ Generated ${result.picks.length} picks for ${matchup}`);

        // DEBUG: Print full pick details with rationale
        for (const pick of result.picks) {
          console.log(`\n📊 PICK: ${pick.player} (${pick.team})`);
          console.log(`   Prop: ${pick.bet?.toUpperCase()} ${pick.prop} @ ${pick.odds}`);
          console.log(`   Confidence: ${Math.round((pick.confidence || 0) * 100)}%`);
          console.log(`   Gary's Take: ${pick.rationale || pick.analysis || 'N/A'}`);
          if (pick.key_stats) console.log(`   Key Stats: ${JSON.stringify(pick.key_stats)}`);
        }

        allPropPicks.push(...result.picks);
      } else if (result.explicitPass === true || isExplicitPropsPass(result)) {
        console.log(`↪️ Gary explicitly passed props for ${matchup}`);
        passedGameIds.push(String(gameId));
      } else {
        throw new Error(`Props generation for ${matchup} produced no valid picks and no explicit pass`);
      }

    } catch (error) {
      console.error(`❌ Error processing ${matchup}:`, error.message);
      throw new Error(`Props processing failed for ${matchup}: ${error.message}`, { cause: error });
    }
  }

  // Deduplicate and Prepare Final Picks
  if (allPropPicks.length === 0) {
    if (existingGameIds.length > 0) {
      console.log(`\n✅ Every eligible game already has stored props.`);
      return finishOutcome('stored');
    }
    if (passedGameIds.length > 0) {
      console.log(`\n↪️ Gary explicitly passed every eligible game.`);
      return finishOutcome('pass');
    }
    throw new Error('No prop picks generated and no explicit pass was recorded');
  }

  // Deduplicate within the exact game. Player+prop alone collides when the
  // same clubs play twice on one date.
  const deduped = new Map();
  for (const pick of allPropPicks) {
    const key = propPickDedupeKey(pick);
    const existing = deduped.get(key);
    if (!existing || 
        (pick.confidence || 0) > (existing.confidence || 0) ||
        ((pick.confidence || 0) === (existing.confidence || 0) && (pick.ev || 0) > (existing.ev || 0))) {
      deduped.set(key, pick);
    }
  }

  const sortedPicks = Array.from(deduped.values()).sort((a, b) => {
    const confDiff = (b.confidence || 0) - (a.confidence || 0);
    if (confDiff !== 0) return confDiff;
    return (b.ev || 0) - (a.ev || 0);
  });

  // Validate picks before storage
  const validPicks = sortedPicks.filter(pick => {
    const hasPlayer = !!pick.player;
    const hasProp = !!(pick.prop || pick.prop_type);
    const hasBet = !!(pick.bet || pick.direction);
    const hasLine = pick.line !== undefined && pick.line !== null;
    if (!hasPlayer || !hasProp || !hasBet || !hasLine) {
      console.warn(`[Props CLI] ⚠️ Filtering invalid pick — missing fields:`, { player: pick.player, prop: pick.prop, bet: pick.bet, line: pick.line });
      return false;
    }
    return true;
  });

  if (validPicks.length < sortedPicks.length) {
    console.log(`[Props CLI] Filtered out ${sortedPicks.length - validPicks.length} invalid pick(s). ${validPicks.length} valid picks remain.`);
  }
  if (validPicks.length === 0) {
    throw new Error('Generated prop picks failed required-field validation');
  }

  // STORAGE (Do this BEFORE the big summary print)
  let storageSucceeded = false;
  let storageSummary = null;
  if (shouldStore) {
    console.log(`\n💾 Storing ${validPicks.length} picks in Supabase...`);
    
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    } else {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      // Store under the GAME's ET date (from commence_time), never the run's
      // "today" — fixes props from a game landing under tomorrow's key when the
      // run crosses ET midnight (the June 14 → June 15 mis-dating bug).
      if (!useTestTable) {
        // Every production sport takes the same Postgres date lock. Leaving
        // MLB on the old client-side merge would let it overwrite a football
        // child even if every football child used the RPC correctly.
        const picksByDate = new Map();
        for (const pick of validPicks.map(stripInternalFields)) {
          const pickDate = slateDateFromISO(pick.commence_time);
          if (!picksByDate.has(pickDate)) picksByDate.set(pickDate, []);
          picksByDate.get(pickDate).push(pick);
        }

        const writes = [];
        for (const [dateParam, datePicks] of picksByDate) {
          writes.push(await storePropPicksAtomic({
            client: supabase,
            date: dateParam,
            leagueLabel,
            picks: datePicks,
            forceRun,
          }));
        }

        storageSummary = writes.reduce((summary, result) => ({
          added: summary.added + result.added,
          skipped: summary.skipped + result.skipped,
          replaced: summary.replaced + result.replaced,
          total: summary.total + result.total,
          game_ids: [...new Set([...summary.game_ids, ...result.game_ids])],
          added_game_ids: [...new Set([...summary.added_game_ids, ...result.added_game_ids])],
          skipped_game_ids: [...new Set([...summary.skipped_game_ids, ...result.skipped_game_ids])],
          replaced_game_ids: [...new Set([...summary.replaced_game_ids, ...result.replaced_game_ids])],
          mode: writes.length === 1 ? result.mode : 'multi_date',
        }), {
          added: 0,
          skipped: 0,
          replaced: 0,
          total: 0,
          game_ids: [],
          added_game_ids: [],
          skipped_game_ids: [],
          replaced_game_ids: [],
          mode: 'append',
        });
        console.log(`✅ Atomic prop storage: ${storageSummary.added} added, ${storageSummary.skipped} already present, ${storageSummary.replaced} replaced`);
        storageSucceeded = true;
      } else {
        // Preserve the isolated test table's existing read/merge/upsert path;
        // production never falls back here.
        const dateParam = slateDateFromISO(validPicks[0]?.commence_time);
        const { data: existingData, error: existingError } = await supabase
          .from(testTableName)
          .select('picks')
          .eq('date', dateParam)
          .maybeSingle();
        if (existingError) {
          throw new Error(`Could not read existing ${testTableName} row for ${dateParam}: ${existingError.message}`);
        }

        let existingPicks = [];
        const newHasTdPicks = validPicks.some(p => p.td_category);
        const ownedLanes = leagueLabel === 'MLB' ? new Set(['MLB', 'MLB HR']) : new Set([leagueLabel]);

        if (existingData?.picks) {
          existingPicks = existingData.picks.filter(p => {
            if (!ownedLanes.has(p.sport)) return true;

            const pickMatchup = p.matchup?.toLowerCase();
            const isSameGame = validPicks.some((newPick) => samePropGame(p, newPick));

            if (leagueLabel === 'NFL' && p.td_category && newHasTdPicks && isSameGame) {
              console.log(`[Storage] Replacing existing ${p.td_category} TD pick for ${pickMatchup}`);
              return false;
            }
            if (p.td_category && !newHasTdPicks) return true;
            return !isSameGame;
          });
        }

        const mergedPicks = [...existingPicks, ...validPicks].map(stripInternalFields);
        const { error: upsertError } = await supabase
          .from(testTableName)
          .upsert({
            date: dateParam,
            picks: mergedPicks,
            created_at: new Date().toISOString()
          }, {
            onConflict: 'date'
          });

        if (upsertError) {
          throw new Error(`Could not store ${testTableName} row for ${dateParam}: ${upsertError.message}`);
        }
        console.log(`✅ Successfully stored picks for ${dateParam}`);
        storageSucceeded = true;
      }
    }
  }

  // FINAL SUMMARY
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🏆 FINAL ${leagueLabel} PICKS SUMMARY`);
  console.log(`${'='.repeat(50)}`);
  
  validPicks.forEach((pick, i) => {
    const conf = pick.confidence ? (pick.confidence * 100).toFixed(0) : '?';
    const bet = pick.bet ? pick.bet.toUpperCase() : '?';
    // pick.prop already carries the line ("total_bases 1.5") — don't print it twice.
    console.log(`${i + 1}. ${pick.player || 'Unknown'} (${pick.team || '?'}): ${bet} ${pick.prop || '?'} @ ${pick.odds || '?'} (${conf}% confidence)`);
  });

  console.log(`\n🏁 Agentic ${leagueLabel} Props Runner Complete.\n`);
  const pickedGameIds = validPicks
    .map((pick) => pick.game_id)
    .filter((id) => id != null)
    .map(String);
  if (shouldStore && !storageSucceeded) {
    throw new Error('Props storage did not complete');
  }
  return finishOutcome(shouldStore ? 'stored' : 'dry_run', {
    game_ids: shouldStore && storageSummary ? storageSummary.game_ids : pickedGameIds,
    pick_count: validPicks.length,
    added_count: storageSummary?.added,
    skipped_count: storageSummary?.skipped,
    replaced_count: storageSummary?.replaced,
  });
}
