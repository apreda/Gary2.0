#!/usr/bin/env node

// Narrow football proof refresh. This does not generate or change a pick. It
// reads Gary's immutable stored NFL/NCAAF calls, refreshes the exact live proof
// attached to those calls, and writes only THE SWEAT / AFTER GARY identities.

import './src/loadEnv.js';

import axios from 'axios';
import { getESTDate } from './src/utils/dateUtils.js';
import { exitAfterFlushing } from './scripts/lib/processLifecycle.js';

const { ballDontLieService } = await import('./src/services/ballDontLieService.js');
const { footballSeasonForDate } = await import('./src/services/insights/footballData.js');
const {
  computeTheSweat,
  loadStoredFootballPicks,
  loadFootballLiveScores,
  loadFootballSettledScores,
} = await import('./src/services/insights/computers/theSweat.js');
const {
  computeAfterGary,
  loadPublishedFootballPicks,
} = await import('./src/services/insights/computers/afterGary.js');
const {
  footballProofIdentity,
  loadFootballProofIdentities,
  replaceFootballProofRows,
} = await import('./scripts/lib/footballProofStorage.js');
const {
  hydrateExactFootballGames,
  mergeFootballProofScore,
} = await import('./scripts/lib/footballProofExactGame.js');
const {
  assertAfterGaryPickCoverage,
  partitionFootballProofPicks,
} = await import('./scripts/lib/footballProofLegacyPolicy.js');

const SUPPORTED_LEAGUES = new Set(['NFL', 'NCAAF']);
const SPORT_KEYS = Object.freeze({
  NFL: 'americanfootball_nfl',
  NCAAF: 'americanfootball_ncaaf',
});

function argValue(flag) {
  const args = process.argv.slice(2);
  const equals = args.find((value) => value.startsWith(`${flag}=`));
  if (equals) return equals.slice(flag.length + 1);
  const index = args.indexOf(flag);
  const next = index >= 0 ? args[index + 1] : null;
  return next && !next.startsWith('--') ? next : null;
}

function parseLeagues(raw) {
  const values = String(raw || 'NFL,NCAAF')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (!values.length || values.some((value) => !SUPPORTED_LEAGUES.has(value))) {
    throw new Error(`Unsupported football proof league list: ${raw || ''}`);
  }
  return [...new Set(values)];
}

function exactGameId(pick) {
  const value = pick?.bdl_game_id ?? pick?.game_id;
  return value == null ? null : String(value);
}

function pickTeam(pick, side) {
  const prefix = side === 'home' ? 'home' : 'away';
  const name = pick?.[`${prefix}Team`] ?? pick?.[`${prefix}_team`] ?? side.toUpperCase();
  const abbreviation = pick?.[`${prefix}Abbreviation`]
    ?? pick?.[`${prefix}TeamAbbreviation`]
    ?? pick?.[`${prefix}_abbreviation`]
    ?? null;
  return { full_name: name, name, abbreviation };
}

// Stored picks already passed the exact provider game-id and pre-kickoff gates.
// Rebuilding this tiny game shell avoids a broad schedule fetch every 15 minutes.
function gameFromPick(pick) {
  const id = exactGameId(pick);
  if (!id) return null;
  const away = pickTeam(pick, 'away');
  const home = pickTeam(pick, 'home');
  return {
    id,
    date: pick?.commence_time ?? null,
    commence_time: pick?.commence_time ?? null,
    season_type: pick?.season_type ?? null,
    visitor_team: away,
    away_team: away,
    home_team: home,
  };
}

function storedRow(connection, league, date) {
  return {
    date,
    league,
    generated_by: 'football-proof-cli',
    category: connection.category,
    headline: connection.headline,
    detail: connection.detail,
    game: connection.game,
    value: connection.value != null ? String(connection.value) : null,
    tone: connection.tone,
    spark: connection.spark ?? null,
    line_val: connection.line_val ?? null,
    relevance_score: connection.relevance_score ?? null,
    player_id: connection.player_id != null ? String(connection.player_id) : null,
    team_id: connection.team_id != null ? String(connection.team_id) : null,
    game_id: connection.game_id != null ? String(connection.game_id) : null,
    meta: connection.meta ?? null,
  };
}

async function run() {
  const date = argValue('--date') || getESTDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid ET date: ${date}`);
  const leagues = parseLeagues(argValue('--league'));
  const dryRun = process.argv.includes('--dry-run');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const readKey = serviceKey
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !readKey) {
    throw new Error('Football proof reads require SUPABASE_URL and a Supabase API key');
  }
  if (!dryRun && (!supabaseUrl || !serviceKey)) {
    throw new Error('Football proof writes require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  const restUrl = supabaseUrl ? `${supabaseUrl}/rest/v1/insight_connections` : null;
  const headers = { apikey: readKey, Authorization: `Bearer ${readKey}` };
  const summary = { date, dry_run: dryRun, leagues: {}, failures: [] };

  for (const league of leagues) {
    const key = league.toLowerCase();
    const season = footballSeasonForDate(date);
    try {
      const rawPicks = await loadStoredFootballPicks({ league: key, date, season });
      const gameIds = new Set(rawPicks.map(exactGameId).filter(Boolean));
      if (!gameIds.size) {
        summary.leagues[league] = {
          picks: 0,
          the_sweat: 0,
          after_gary: 0,
          after_gary_legacy_skipped: 0,
        };
        continue;
      }
      const {
        proofRecords,
        afterGaryGameIds,
        afterGaryPickIds,
        legacyAfterGarySkipped,
      } = partitionFootballProofPicks(rawPicks);
      const afterGaryRecords = afterGaryGameIds.size
        ? await loadPublishedFootballPicks({
          league: key,
          date,
          season,
          slateGameIds: afterGaryGameIds,
        })
        : [];
      assertAfterGaryPickCoverage(afterGaryPickIds, afterGaryRecords);
      const gameById = new Map();
      for (const record of proofRecords) {
        const game = gameFromPick(record.pick);
        if (game) gameById.set(String(game.id), game);
      }
      const picks = proofRecords.map((record) => record.pick);
      const [liveRows, settledRows] = await Promise.all([
        loadFootballLiveScores({ league: key, date }),
        loadFootballSettledScores({ league: key, date }),
      ]);
      const scoreByGame = new Map();
      for (const row of liveRows.concat(settledRows)) {
        const gameId = exactGameId(row);
        if (!gameId) continue;
        scoreByGame.set(gameId, mergeFootballProofScore(scoreByGame.get(gameId), row));
      }
      await hydrateExactFootballGames({
        records: proofRecords,
        gameById,
        scoreByGame,
        bdl: ballDontLieService,
        sportKey: SPORT_KEYS[league],
      });
      const games = [...gameById.values()];
      const liveScores = [...scoreByGame.values()];
      const base = { league: key, date, season, games, bdl: ballDontLieService };

      const generated = {};
      const computers = [
        ['the_sweat', () => computeTheSweat({
          ...base,
          proofData: { picks, liveScores },
        })],
        ['after_gary', () => computeAfterGary({
          ...base,
          afterGaryPicks: afterGaryRecords,
        })],
      ];
      for (const [category, compute] of computers) {
        let rowCount = 0;
        try {
          const rows = (await compute()).map((row) => storedRow(row, league, date));
          rowCount = rows.length;
          generated[category] = rowCount;
          if (dryRun) {
            console.log(JSON.stringify({ league, category, rows }, null, 2));
          } else {
            await replaceFootballProofRows({
              httpClient: axios,
              restUrl,
              headers,
              date,
              league,
              category,
              rows,
            });
          }
          if (category === 'the_sweat') {
            const expected = new Set(picks.map((pick) => footballProofIdentity({
              category,
              game_id: exactGameId(pick),
              meta: { pick_id: pick?.pick_id, factor_code: 'THE_NUMBER' },
            })).filter(Boolean));
            const fresh = new Set(rows.map(footballProofIdentity).filter(Boolean));
            const stored = await loadFootballProofIdentities({
              httpClient: axios,
              restUrl,
              headers,
              date,
              league,
              category,
            });
            const missing = [...expected].filter((identity) => !fresh.has(identity) && !stored.has(identity));
            if (missing.length) {
              throw new Error(`${missing.length}/${expected.size} stored pick(s) lack THE NUMBER proof`);
            }
          }
        } catch (error) {
          generated[category] = rowCount;
          summary.failures.push({ league, category, message: error.message });
        }
      }
      summary.leagues[league] = {
        picks: picks.length,
        games: games.length,
        the_sweat: generated.the_sweat ?? 0,
        after_gary: generated.after_gary ?? 0,
        after_gary_legacy_skipped: legacyAfterGarySkipped.length,
        sport_key: SPORT_KEYS[league],
      };
    } catch (error) {
      summary.failures.push({ league, category: 'load', message: error.message });
      summary.leagues[league] = {
        picks: 0,
        the_sweat: 0,
        after_gary: 0,
        after_gary_legacy_skipped: 0,
      };
    }
  }

  const status = summary.failures.length ? 'failed' : 'complete';
  console.log(`FOOTBALL_PROOF_OUTCOME=${JSON.stringify({ status, ...summary })}`);
  return summary.failures.length ? 1 : 0;
}

run()
  .then((code) => exitAfterFlushing(code))
  .catch(async (error) => {
    console.error(`FOOTBALL_PROOF_OUTCOME=${JSON.stringify({ status: 'failed', message: error.message })}`);
    await exitAfterFlushing(1);
  });
