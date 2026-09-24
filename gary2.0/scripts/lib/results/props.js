/** Prop settlement orchestration; preserves exact-game evidence and missing-data policy. */
import { fetchEspnCollegeSettlement as defaultFetchEspnCollegeSettlement, espnActualForProp, espnNonParticipation } from '../../../src/services/espnCollegeService.js';
import { buildNcaafTouchdownLedger, ncaafAnytimeTouchdownActual } from '../ncaafPlaySettlement.js';
import { findExactNcaafStatRow } from '../../../src/services/ncaafPropStats.js';
import { shiftDateKey } from '../../../supabase/functions/_shared/dateKeys.js';
import { requiredPropSourceSports, propGameId, isFinalGameStatus, normalizeStoredPropType, propResultIdentity, statsForGame, canonicalNFLPropType, gradePropResult } from '../resultsGradingReliability.js';
import { sportAllowed } from '../resultsRunMode.js';
import { NFL_PLAY_SETTLEMENT_MARKETS, nflPlayActualForProp } from '../nflPlaySettlement.js';
import { NFL_BOXED_ZERO_MARKETS, nflBoxedPlayerZero } from '../nflParticipationSettlement.js';
import { emptySettlementStats, getStatValue } from './grading.js';

const RUSH_NEEDS_TEAM_BOX = new Set(['rushing_yards', 'rushing_attempts', 'rushing_receiving_yards']);

export function createPropSettlement({ supabase, fetchGames, fetchNCAAFGames, fetchBoxScores, fetchMLBStats,
  fetchNFLStats, fetchNCAAFStats, fetchNFLPlayEvidence, fetchNCAAFPlayEvidence = async () => null, fetchNFLReceivingZero = async () => null,
  fetchNFLTeamStats = async () => null,
  fetchEspnCollegeSettlement = defaultFetchEspnCollegeSettlement, getPropGrounding,
  supportsExactPropResultIdentity, fetchExistingPropResult, readBackPersistedResults,
  console = globalThis.console }) {
  async function processPropBets(date, sportFilter = null, { settlementOnly = false } = {}) {
    console.log(`\n🎯 Processing PROP BETS for ${date}...`);
    const nextStr = shiftDateKey(date, 1);
    const allowedSports = sportFilter
      ? new Set([...sportFilter].map((sport) => String(sport).trim().toUpperCase()))
      : null;
    const propsForRow = (row) => typeof row.props === 'string'
      ? JSON.parse(row.props)
      : (row.props || row.picks || []);

    const { data: rows, error: rowsError } = await supabase.from('prop_picks').select('*').in('date', [date, nextStr]);
    if (rowsError) throw new Error(`Could not read prop_picks for ${date}/${nextStr}: ${rowsError.message}`);
    const stats = emptySettlementStats();
    if (!rows?.length) return stats;
    const storedProps = rows.flatMap(propsForRow);
    const sourceSports = requiredPropSourceSports(storedProps, allowedSports);
    if (allowedSports && sourceSports.size === 0) {
      console.log(`  ⏭️  No ${[...allowedSports].join('/')} props stored for this window.`);
      return stats;
    }
    const referencedNFLGameIds = new Set();
    const referencedNCAAFGameIds = new Set();
    for (const pick of storedProps) {
      const gameId = propGameId(pick);
      if (!gameId) continue;
      const sport = String(pick?.sport ?? '').trim().toUpperCase();
      if (sport === 'NFL') referencedNFLGameIds.add(gameId);
      if (sport === 'NCAAF') referencedNCAAFGameIds.add(gameId);
    }
    const exactPropIdentity = await supportsExactPropResultIdentity();

    const dates = [date, nextStr];
    // A normal full run opens only the provider lanes represented by stored
    // props. The explicit football settlement filter remains an intersection,
    // so it cannot call an unrelated source even when the same date row is mixed.
    const wants = (sport) => sourceSports.has(String(sport).trim().toUpperCase());
    const nbaBox = wants('NBA') ? (await Promise.all(dates.map(d => fetchBoxScores('NBA', d)))).flat() : [];
    const nhlBox = wants('NHL') ? (await Promise.all(dates.map(d => fetchBoxScores('NHL', d)))).flat() : [];
    const nflGames = wants('NFL') ? (await Promise.all(dates.map(d => fetchGames('NFL', d)))).flat() : [];
    const ncaafGames = wants('NCAAF') ? (await Promise.all(dates.map(d => fetchNCAAFGames(d)))).flat() : [];
    // MLB: no box_scores endpoint — fetch games then stats by game_ids (same pattern as NFL)
    const mlbGames = wants('MLB') ? (await Promise.all(dates.map(d => fetchGames('MLB', d)))).flat() : [];
    const mlbStats = wants('MLB')
      ? await fetchMLBStats([...new Set(mlbGames.map(g => g.id).filter(Boolean))])
      : [];
    // FINALITY GATE source (props): the set of MLB games that are FINAL. A prop whose game
    // isn't final must NOT be graded — an in-progress/unstarted game returns 0/partial stats
    // and settles the player prematurely (today's live game graded "0 TB -> LOST" before first
    // pitch). This mirrors the cloud grade-props gate.
    const mlbFinalIds = new Set(mlbGames.filter(g => isFinalGameStatus(g.status)).map(g => String(g.id)));
    const nflFinalIds = new Set(nflGames.filter(g => isFinalGameStatus(g.status)).map(g => String(g.id)));
    const ncaafFinalIds = new Set(ncaafGames.filter(g => isFinalGameStatus(g.status)).map(g => String(g.id)));
    // Only fetch NFL player stats for games proven final, then keep the source-id
    // stamp so each prop reads its own game's stat line.
    const nflStats = wants('NFL')
      ? await fetchNFLStats(
          nflGames.filter((game) => nflFinalIds.has(String(game.id)) && referencedNFLGameIds.has(String(game.id))),
        )
      : [];
    const ncaafStats = wants('NCAAF')
      ? await fetchNCAAFStats(
          [...ncaafFinalIds].filter((gameId) => referencedNCAAFGameIds.has(gameId)),
        )
      : [];

    console.log(`  📊 Data loaded: NBA=${nbaBox.length} box scores, NHL=${nhlBox.length} box scores, MLB=${mlbStats.length} player stats, NFL=${nflStats.length} player stats, NCAAF=${ncaafStats.length} player stats`);

    const handled = new Set();
    const claimedExistingResultIds = new Set();
    const nflPlayEvidenceByGame = new Map();
    const ncaafPlayEvidenceByGame = new Map();
    const espnCollegeByGame = new Map();
    let skippedNotFinal = 0;

    for (const row of rows) {
      const picks = propsForRow(row);
      for (const p of picks) {
        const name = p.player || p.player_name, rawProp = p.prop || p.prop_type;
        // 'MLB HR' is the dedicated home-run lane's sport label: it keeps its
        // own label in prop_results (own record, never mixed into the main MLB
        // props record) but routes to MLB data sources for grading.
        const sport = String(p.sport ?? '').trim().toUpperCase();
        const dataSport = sport === 'MLB HR' ? 'MLB' : sport;
        if (!sportAllowed(dataSport, allowedSports)) continue;
        const type = dataSport === 'NFL'
          ? normalizeStoredPropType(rawProp)
          : (rawProp?.split(/\s+/)?.[0] || rawProp);
        const line = p.line ?? p.line_value;
        const bet = String(p.bet ?? p.direction ?? '').trim().toLowerCase();
        const gameId = propGameId(p);
        if (!name || !type || line == null || !bet || !sport) {
          stats.candidates++;
          stats.invalidIdentity++;
          continue;
        }

        // FINALITY GATE (props) — never grade a prop whose game isn't final. An in-progress or
        // unstarted game returns 0/partial stats and settles the player prematurely (a live MLB
        // game graded "0 total bases -> LOST" before first pitch). Skip -> the prop stays pending
        // and grades correctly once the game is final. Missing exact ids stay pending.
        if (dataSport === 'MLB' && gameId == null) { stats.candidates++; stats.invalidIdentity++; continue; }
        if (dataSport === 'MLB' && !mlbFinalIds.has(gameId)) { skippedNotFinal++; stats.pendingNonFinal++; continue; }
        // NFL stat rows can report zero/partial production while a game is live.
        // Unlike legacy lanes, an NFL prop must carry an exact game id and that
        // provider game must be final before API stats OR grounding may settle it.
        if (dataSport === 'NFL' && gameId == null) { stats.candidates++; stats.invalidIdentity++; continue; }
        if (dataSport === 'NFL' && !nflFinalIds.has(gameId)) { skippedNotFinal++; stats.candidates++; stats.pendingNonFinal++; continue; }
        // NCAAF follows the same hard identity/finality law as NFL. Legacy
        // matchup-only props are not safe on a large college slate and remain
        // pending until they carry an exact provider game id.
        if (dataSport === 'NCAAF' && gameId == null) { stats.candidates++; stats.invalidIdentity++; continue; }
        if (dataSport === 'NCAAF' && !ncaafFinalIds.has(gameId)) { skippedNotFinal++; stats.candidates++; stats.pendingNonFinal++; continue; }

        const key = propResultIdentity({
          gameId, sport, playerName: name, propType: type, bet, line, gameDate: row.date,
        });
        if (handled.has(key)) continue; handled.add(key);
        stats.candidates++;
        if (['NFL', 'NCAAF'].includes(dataSport)) stats.finalEligible++;

        // Re-grade every eligible FINAL run (no early settled-row skip). That lets
        // corrected provider stats repair a prior result while the finality gates
        // above prevent partial/live stats from creating one in the first place.
        let actual = null;
        let source = 'none';
        let forcedResult = null;
        if (dataSport === 'NBA') actual = getStatValue('NBA', nbaBox, name, type);
        else if (dataSport === 'NHL') actual = getStatValue('NHL', nhlBox, name, type);
        else if (dataSport === 'MLB') {
          // The exact stored identity and validated box prevent cross-game matches.
          const pool = mlbStats.filter(s => s._game_id === gameId);
          actual = getStatValue('MLB', pool, name, type, p.player_id);
        }
        else if (['NFL', 'NCAAF'].includes(dataSport)) {
          const gameRows = statsForGame(dataSport === 'NFL' ? nflStats : ncaafStats, gameId);
          const lookupMeta = {};
          actual = getStatValue(dataSport, gameRows, name, type,
            p.player_id, lookupMeta);
          const nflMarket = dataSport === 'NFL' ? canonicalNFLPropType(type) : null;
          if (actual === null && lookupMeta.playerId != null && NFL_PLAY_SETTLEMENT_MARKETS.has(nflMarket)) {
            // At most one bounded play fetch per game in this settlement pass,
            // including an unavailable result; another prop must not fan out
            // the same failed provider request. A later pass can retry.
            if (!nflPlayEvidenceByGame.has(gameId)) {
              nflPlayEvidenceByGame.set(gameId, await fetchNFLPlayEvidence(gameId, gameRows));
            }
            const evidence = nflPlayEvidenceByGame.get(gameId);
            actual = nflPlayActualForProp(evidence, { playerId: lookupMeta.playerId, propType: nflMarket });
          }
          // COLLEGE ANYTIME TD NO (Sep 21 2026): the player box alone cannot
          // prove a zero (no special-teams scores in it), so the complete play
          // ledger has to account for every one of his team's touchdowns first.
          if (actual === null && dataSport === 'NCAAF' && lookupMeta.playerFound === true
            && /anytime_?(?:td|touchdown)/i.test(String(type || ''))) {
            if (!ncaafPlayEvidenceByGame.has(gameId)) {
              ncaafPlayEvidenceByGame.set(gameId, await fetchNCAAFPlayEvidence(gameId));
            }
            const plays = ncaafPlayEvidenceByGame.get(gameId);
            const game = ncaafGames.find(candidate => String(candidate.id) === gameId);
            const ledger = plays ? buildNcaafTouchdownLedger({ gameId, plays, playerStats: gameRows, game }) : null;
            actual = ncaafAnytimeTouchdownActual(ledger, findExactNcaafStatRow(gameRows, p.player_id));
            if (actual !== null) source = 'bdl_box+play_ledger';
          }
          // ESPN, THE FREE COLLEGE SECOND SOURCE (founder GO, Sep 22 2026): the
          // college analog of nflverse. Only for a ticket BDL left pending, only
          // on a final game, and only on an exact unique name match. Its box
          // carries the return and defensive scores BDL's omits, and its plays
          // name every scorer by athlete id.
          if (actual === null && dataSport === 'NCAAF') {
            const game = ncaafGames.find(candidate => String(candidate.id) === gameId);
            const homeTeam = game?.home_team?.full_name ?? game?.home_team?.name ?? null;
            const awayTeam = (game?.visitor_team ?? game?.away_team)?.full_name ?? (game?.visitor_team ?? game?.away_team)?.name ?? null;
            if (homeTeam && awayTeam) {
              if (!espnCollegeByGame.has(gameId)) {
                espnCollegeByGame.set(gameId, await fetchEspnCollegeSettlement({ date: row.date, homeTeam, awayTeam, commenceTime: game?.date ?? game?.datetime ?? null }));
              }
              const evidence = espnCollegeByGame.get(gameId);
              actual = espnActualForProp(evidence, { name, team: p.team ?? null, propType: type });
              if (actual !== null) source = 'espn_box+plays';
              // DID NOT PLAY (founder, Sep 22 2026): a player on his team's game
              // roster who appears in no play of the complete ledger and has no
              // line in either box did not participate. The sportsbook rule is a
              // void; the record's settled no-decision state is a push, so the
              // ticket settles as a push with no measurement. Proof, not absence.
              if (actual === null && p.team && await espnNonParticipation(evidence, { name, team: p.team })) {
                forcedResult = 'push';
                source = 'espn_roster_no_participation';
                console.log(`    [DNP] ${dataSport}: ${name} "${type}" rostered, in no play, no line — void, settled as push`);
              }
            }
          }
          if (actual === null && dataSport === 'NFL' && lookupMeta.playerFound === false
            && ['receiving_yards', 'receptions'].includes(nflMarket)) {
            actual = await fetchNFLReceivingZero(nflGames.find(game => String(game.id) === gameId), p, gameRows, nflMarket);
            if (actual !== null) source = 'nflverse_snaps+reconciled_bdl_box';
          }
          // A player IN the box with a blank rushing/receiving line: a zero
          // only when the team's totals reconcile without him.
          if (actual === null && dataSport === 'NFL' && lookupMeta.playerFound === true
            && lookupMeta.playerId != null && NFL_BOXED_ZERO_MARKETS.has(nflMarket)) {
            const game = nflGames.find(candidate => String(candidate.id) === gameId);
            const teamStats = RUSH_NEEDS_TEAM_BOX.has(nflMarket) ? await fetchNFLTeamStats(game) : null;
            actual = nflBoxedPlayerZero({ game, playerId: lookupMeta.playerId, rows: gameRows, teamStats, market: nflMarket });
            if (actual !== null) source = 'reconciled_bdl_box';
          }
          // A complete stats box is a contributor list, not proof of game
          // inactivity: the actual NFL play feed includes participants absent
          // from that box. No football DNP void without authoritative separate
          // nonparticipation evidence; absent or ambiguous rows stay pending.

        }

        if (actual !== null || forcedResult) {
          if (source === 'none') source = 'api';
        } else if (['MLB', 'NFL', 'NCAAF'].includes(dataSport)) {
          // Exact final-game BDL stats are the MLB/football grading authority.
          // Missing measurements and ambiguous players stay pending; model
          // grounding cannot undo the validated box's unavailable result.
          console.error(`    [BDL Miss] ${dataSport}: ${name} "${type}" missing from exact game ${gameId}; leaving pending`);
          stats.unresolvedFinal++;
          continue;
        } else {
          console.warn(`    [BDL Miss] ${sport}: ${name} "${type}" not found in box scores — trying grounding`);
          actual = await getPropGrounding(dataSport, name, type, row.date);
          if (actual !== null) source = 'grounding';
        }

        if (actual !== null || forcedResult) {
          const res = forcedResult ?? gradePropResult(actual, line, bet);
          if (res == null) {
            if (['NFL', 'NCAAF'].includes(dataSport)) stats.unresolvedFinal++;
            console.error(`  ❌ ${sport}: ${name} ${type} — invalid grade inputs (${bet} ${line}, actual ${actual}).`);
            continue;
          }
          let propInsertFailed = false;
          let propAlreadyExists = false;
          let persistedResultId = null;
          const persistentIdentity = {
            propPickId: row.id,
            gameDate: row.date,
            gameId,
            sport,
            playerName: name,
            propType: type,
            bet,
            line,
            matchup: p.matchup ?? null,
          };
          let exist = null;
          try {
            exist = await fetchExistingPropResult(persistentIdentity, {
              exactColumns: exactPropIdentity,
              claimedIds: claimedExistingResultIds,
            });
            if (exist) claimedExistingResultIds.add(exist.id);
          } catch (error) {
            console.error(`  ❌ DEDUP CHECK FAILED [prop_results] ${sport} "${name} ${type}" (${row.date}): ${error.message}`);
            propInsertFailed = true;
          }

          const identityStamp = exactPropIdentity && gameId
            ? { game_id: gameId, sport }
            : {};
          if (!propInsertFailed && exist?.result_note) {
            // Settled by hand (e.g. an injury-protection void): kept as recorded.
            propAlreadyExists = true;
            persistedResultId = exist.id;
            console.log(`  ⏸ ${sport}: ${name} ${type} ${bet} ${line} — manual settlement kept (${exist.result_note})`);
            continue;
          }
          if (!propInsertFailed && exist) {
            // Row exists from an earlier (possibly mid-game) grade — RE-GRADE and UPDATE to
            // the current box-score value so a premature miss self-corrects once the game is
            // final, instead of being skipped forever (the Jun 18 Soto-HR bug).
            propAlreadyExists = true;
            const { error: updErr } = await supabase.from('prop_results')
              .update({ actual_value: actual, result: res, pick_text: `${name} ${bet} ${line} ${type}`,
                        odds: p.odds != null ? String(p.odds) : null,
                        ...identityStamp,
                        updated_at: new Date().toISOString() })
              .eq('id', exist.id);
            if (updErr) {
              console.error(`  ❌ UPDATE FAILED [prop_results] ${sport} "${name} ${type}" (${row.date}): ${updErr.message}`);
              propInsertFailed = true;
            } else {
              persistedResultId = exist.id;
            }
          } else if (!propInsertFailed) {
            const insertPayload = {
              prop_pick_id: row.id, game_date: row.date, player_name: name,
              prop_type: type, line_value: line, actual_value: actual,
              result: res, pick_text: `${name} ${bet} ${line} ${type}`,
              matchup: p.matchup, bet: bet,
              odds: p.odds != null ? String(p.odds) : null,
              // The pick's lane rides to the result (Sep 24 2026): the app keeps a
              // CORE touchdown in the props record instead of the old TD lane.
              ...(typeof p.lane === 'string' && p.lane ? { lane: p.lane.toUpperCase() } : {}),
              ...identityStamp,
            };
            const insertQuery = supabase.from('prop_results').insert(insertPayload);
            const { data: inserted, error: insertErr } = settlementOnly
              ? await insertQuery.select('id').single()
              : await insertQuery;
            if (insertErr) {
              console.error(`  ❌ INSERT FAILED [prop_results] ${sport} "${name} ${type}" (${row.date}): ${insertErr.message}${insertErr.code ? ' [code=' + insertErr.code + ']' : ''}${insertErr.details ? ' details=' + insertErr.details : ''}${insertErr.hint ? ' hint=' + insertErr.hint : ''}`);
              propInsertFailed = true;
            } else if (settlementOnly) {
              persistedResultId = inserted?.id ?? null;
              if (!persistedResultId) {
                console.error(`  ❌ INSERT READBACK ID MISSING [prop_results] ${sport} "${name} ${type}" (${row.date})`);
                propInsertFailed = true;
              }
            }
          }

          if (propInsertFailed) {
            stats.errors.push(`prop_results write failed for ${sport} ${name} ${type}`);
            if (['NFL', 'NCAAF'].includes(dataSport)) stats.unresolvedFinal++;
            console.error(`  ⛔ Skipped prop stats counter for ${sport} "${name} ${type}" due to insert failure`);
          } else {
            stats.persisted++;
            if (settlementOnly && persistedResultId) stats.persistedResultIds.push(persistedResultId);
            // HR bets are the fun lane, not official picks (founder, Jul 29):
            // they tally separately and never touch the official props record.
            if (/home_run/i.test(String(type || ''))) {
              stats[res === 'won' ? 'hrW' : res === 'lost' ? 'hrL' : 'hrP']++;
            } else {
              stats[res[0]]++;
            }
            const tag = propAlreadyExists ? '⏩ ALREADY' : '🎯';
            console.log(`  ${tag} ${sport}: ${name} ${type} ${bet} ${line} -> ${res.toUpperCase()} (${actual}) [${source}]`);
          }
        } else {
          if (['NFL', 'NCAAF'].includes(dataSport)) stats.unresolvedFinal++;
          console.error(`  ❌ ${sport}: ${name} ${type} — NO DATA from API or grounding. Prop not graded.`);
        }
      }
    }
    if (skippedNotFinal) console.log(`  ⏳ Props finality gate: skipped ${skippedNotFinal} pick(s) whose game isn't final yet (will grade once final).`);
    if (settlementOnly) {
      stats.readBack = await readBackPersistedResults('prop_results', stats.persistedResultIds, `football props ${date}`);
    }
    return stats;
  }

  return { processPropBets };
}
