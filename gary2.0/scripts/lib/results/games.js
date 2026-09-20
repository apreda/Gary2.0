/** Game settlement orchestration; keeps published identity, finality and write policy together. */
import { pickGameId as storedPickGameId, isFinalGameStatus, buildNflResultWritePayload, nflSeasonTypeForGame } from '../resultsGradingReliability.js';
import { WINNERS_CUTOVER_DATE } from '../../../src/services/pickdesk/winnersAdmissions.js';
import { admittedGameKeys, isWinnersGame } from '../../../src/services/pickdesk/winnersBook.js';
import { matchGame, canGroundGameScore } from '../../../src/services/teamMatch.js';
import { ncaafSlateDateForKickoff } from '../../../src/services/ncaafGamePolicy.js';
import { emptySettlementStats, normalizeToETDate, gradeGame as gradeStoredGame } from './grading.js';

export function createGameSettlement({ supabase, fetchGames, fetchMlbGamesForETDate, fetchNCAAFGames,
  getScoreGrounding, supportsExactGameResultIdentity, supportsExactNFLResultIdentity,
  fetchExistingGameResult, factCheckGradedPick, recapGradedPick, readBackPersistedResults,
  gradeGame = gradeStoredGame, console = globalThis.console }) {
  async function processGenericGames(table, date, leagueFilter = null, { settlementOnly = false } = {}) {
    console.log(`\n📂 Processing ${table.toUpperCase()} for ${date}...`);
    const query = supabase.from(table).select('*');
    if (table === 'daily_picks') query.eq('date', date);
    else query.eq('week_start', date);

    const { data: rows, error: rowsError } = await query;
    if (rowsError) throw new Error(`Could not read ${table} for ${date}: ${rowsError.message}`);
    const stats = emptySettlementStats();
    if (!rows?.length) return stats;

    for (const row of rows) {
      const picks = typeof row.picks === 'string' ? JSON.parse(row.picks) : (row.picks || row.picks_array || []);

      // Since Sep 4, only an exact immutable Winners publication can stamp a
      // result. Never manufacture admission from confidence or a missing review.
      const ids = [...new Set(picks.map(storedPickGameId).filter(Boolean))];
      let boardKeys = new Set();
      if (ids.length) {
        const { data: board, error: boardError } = await supabase.from('winners_board')
          .select('game_date,league,kind,game_id,pick_snapshot')
          .eq('kind', 'game').gte('game_date', WINNERS_CUTOVER_DATE).in('game_id', ids);
        // Do not overwrite an existing true flag with false during a read outage.
        if (boardError) throw new Error(`Winners admission read failed: ${boardError.message}`);
        boardKeys = admittedGameKeys(board);
      }

      // Preserve the historical definition only for dates before the cutover.
      const winnerKey = p => `${(p.league || '').toUpperCase()}|${p.pick}|${p.awayTeam} @ ${p.homeTeam}`;
      const winnerKeys = new Set();
      const reviewByKey = new Map();
      if (date < WINNERS_CUTOVER_DATE) {
        try {
          if (ids.length) {
            const { data: wr, error: wrErr } = await supabase.from('winners_reviews')
              .select('league,game_id,on_board').lt('game_date', WINNERS_CUTOVER_DATE).in('game_id', ids);
            if (wrErr) throw wrErr;
            for (const review of wr || []) reviewByKey.set(`${String(review.league || '').toUpperCase()}|${String(review.game_id)}`, review.on_board === true);
          }
        } catch (error) {
          console.warn(`   ⚠️ historical winners_reviews read failed (${error.message}) — retaining the legacy top-3 rule before ${WINNERS_CUTOVER_DATE}`);
        }
        const leaguesReviewed = new Set([...reviewByKey.keys()].map(key => key.split('|')[0]));
        const byLeague = {};
        for (const pick of picks) (byLeague[(pick.league || 'UNKNOWN').toUpperCase()] ||= []).push(pick);
        for (const [league, leaguePicks] of Object.entries(byLeague)) {
          if (leaguesReviewed.has(league)) {
            for (const pick of leaguePicks) if (reviewByKey.get(`${league}|${storedPickGameId(pick)}`)) winnerKeys.add(winnerKey(pick));
          } else {
            const ranked = leaguePicks.slice().sort((a, b) => Number(!!b.is_top_pick) - Number(!!a.is_top_pick) || (b.confidence ?? 0) - (a.confidence ?? 0));
            for (const pick of ranked.slice(0, 3)) winnerKeys.add(winnerKey(pick));
          }
        }
      }

      for (const pick of picks) {
        if (leagueFilter && pick.league?.toUpperCase() !== leagueFilter) continue;
        const league = pick.league || (table === 'weekly_nfl_picks' ? 'NFL' : 'UNKNOWN');
        stats.candidates++;

        // For weekly NFL, search a range around the date to handle UTC and different game days
        let gameDate = date;
        let hs = null, vs = null;
        let matchedGame = null;
        let swapped = false;
        // Set when the provider HAS this game but reports it non-final. Blocks the
        // grounding fallback below so an in-progress game is never graded off an LLM
        // "final score" guess (Jul 9: a live Mariners @ Marlins game graded a 4-1 loss
        // while it was in the 4th inning, then went out as a result tweet).
        let gameFoundNotFinal = false;
        let scoreGroundingAllowed = false;

        // Pick may store the BDL game id as `game_id` or `bdl_game_id` (we add this
        // at pick-generation time). Match by ID first to avoid grabbing a different
        // day's same-teams game (UTC bleed) or the wrong half of a doubleheader.
        const pickGameId = storedPickGameId(pick);

        // College slates are too large for matchup-only attribution. Every new
        // NCAAF pick is stamped with its BDL game id; a legacy/id-less row remains
        // pending rather than risking another game with similar team names.
        if (['NFL', 'NCAAF'].includes(league) && pickGameId == null) {
          stats.invalidIdentity++;
          console.log(`  ⏳ EXACT GAME ID MISSING — leaving ${league} pick pending: ${pick.awayTeam} @ ${pick.homeTeam}`);
          continue;
        }

        if (table === 'weekly_nfl_picks') {
          const dateObj = new Date(`${date}T12:00:00Z`);
          // Include the following UTC date so a Monday-night ET game filed by
          // the provider on Tuesday UTC still settles inside this Tue–Mon row.
          for (let i = 0; i <= 7; i++) {
            const checkDate = new Date(dateObj);
            checkDate.setUTCDate(dateObj.getUTCDate() + i);
            const dStr = checkDate.toISOString().split('T')[0];
            const games = await fetchGames(league, dStr);
            const result = matchGame(games, pick.homeTeam, pick.awayTeam, pickGameId);
            if (result) {
              const statusStr = String(result.game.status ?? '').trim();
              if (!isFinalGameStatus(statusStr)) {
                console.log(`  ⏳ NOT FINAL — skipping grade for ${pick.awayTeam} @ ${pick.homeTeam} (status: ${statusStr || 'missing'})`);
                gameFoundNotFinal = true;
              } else {
                matchedGame = result.game;
                swapped = result.swapped;
                // `dStr` is the UTC DAY THE PROVIDER FILED THE GAME UNDER, not the
                // ET slate day: UTC rolls at 8 PM ET, so a late Saturday college
                // kickoff files under Sunday and was stored that way (Sep 18 2026 —
                // Washington State @ Washington, Wisconsin @ Notre Dame and
                // Louisville @ Ole Miss all sat on "Sunday" 2026-09-06). Apply the
                // same ET/slate normalization the non-weekly path below already
                // uses, so both football paths agree with picks, live scores and iOS.
                const weeklyNormalized = league === 'NCAAF'
                  ? ncaafSlateDateForKickoff(result.game)
                  : normalizeToETDate(result.game);
                gameDate = typeof weeklyNormalized === 'string'
                  ? weeklyNormalized.slice(0, 10)
                  : (weeklyNormalized || dStr);
              }
              // Once the exact weekly game is found, never continue into another
              // date or let grounding invent a final for an in-progress game.
              break;
            }
          }
        } else {
          // MLB: use ET-aware fetch to handle BDL's UTC-based date indexing.
          // Other sports: single-date fetch is fine (their date field aligns with ET).
          const games = league === 'MLB'
            ? await fetchMlbGamesForETDate(date)
            : league === 'NCAAF' ? await fetchNCAAFGames(date)
              : await fetchGames(league, date);
          scoreGroundingAllowed = canGroundGameScore(games, pick.homeTeam, pick.awayTeam, pickGameId);
          const result = matchGame(games, pick.homeTeam, pick.awayTeam, pickGameId);
          if (result) {
            // FINALITY GATE — never grade a non-final game. A suspended or
            // in-progress game carries partial scores in the same fields, and the
            // results dedup makes a wrong grade PERMANENT. Status shapes include
            // NFL 'Final/OT', MLB/NHL 'STATUS_FINAL', and NBA 'Final'. A missing
            // NFL status is not proof of completion and remains pending.
            const statusStr = String(result.game.status ?? '').trim();
            const finalStatus = isFinalGameStatus(statusStr);
            if ((['NFL', 'NCAAF'].includes(league) && !finalStatus) || (statusStr && !finalStatus)) {
              console.log(`  ⏳ NOT FINAL — skipping grade for ${pick.awayTeam} @ ${pick.homeTeam} (status: ${statusStr || 'missing'})`);
              gameFoundNotFinal = true; // provider has it but it isn't over — do NOT fall through to grounding
            } else {
              if (!statusStr) {
                console.warn(`  ⚠️ No status on matched game for ${pick.awayTeam} @ ${pick.homeTeam} — grading anyway`);
              }
              matchedGame = result.game;
              swapped = result.swapped;
            }
          }
        }

        if (matchedGame) {
          // MLB: scores are in scoring_summary (last entry has final scores), not top-level fields
          let homeScore = matchedGame.home_team_score ?? matchedGame.home_score ?? null;
          let awayScore = matchedGame.visitor_team_score ?? matchedGame.away_score ?? matchedGame.visitor_score ?? null;
          if (homeScore == null && Array.isArray(matchedGame.scoring_summary) && matchedGame.scoring_summary.length > 0) {
            const final = matchedGame.scoring_summary[matchedGame.scoring_summary.length - 1];
            homeScore = final.home_score ?? null;
            awayScore = final.away_score ?? null;
          }
          if (swapped) {
            hs = awayScore;
            vs = homeScore;
          } else {
            hs = homeScore;
            vs = awayScore;
          }
          // Normalize the game date to ET to ensure it aligns with app's "Yesterday" view.
          // Strip any time component — game_results.game_date is a DATE column and existing
          // rows are stored as YYYY-MM-DD. Passing a full ISO datetime works in Postgres
          // (it truncates) but produces inconsistent date strings in iOS lookups.
          // A confirmed NCAAF kickoff before 6 AM ET belongs to the prior Gary
          // slate everywhere (picks, live scores, proof, results, and iOS). Store
          // that slate key rather than its wall-clock calendar date.
          const normalized = league === 'NCAAF'
            ? ncaafSlateDateForKickoff(matchedGame)
            : normalizeToETDate(matchedGame);
          gameDate = typeof normalized === 'string' ? normalized.slice(0, 10) : normalized;
        }

        // Only an ID-less legacy game absent from the provider may use team/date
        // grounding. It must never reopen an exact-ID miss, ambiguous doubleheader,
        // missing provider score, or a game known to be in progress.
        if (hs === null && scoreGroundingAllowed && !gameFoundNotFinal && league !== 'NCAAF' && !(settlementOnly && league === 'NFL')) {
          const g = await getScoreGrounding(league, pick.homeTeam, pick.awayTeam, date);
          if (g) { hs = g.h; vs = g.v; }
        }

        if (hs !== null && vs !== null) {
          stats.finalEligible++;
          const res = gradeGame(pick.pick, pick.homeTeam, pick.awayTeam, hs, vs);

          // gradeGame couldn't classify this pick as a team-score bet (e.g. a
          // player prop) — leave it pending rather than writing a null/garbage
          // result. See the Jul 15 2026 comment on gradeGame's final return.
          if (res == null) {
            stats.unresolvedFinal++;
            console.log(`  ⏭️  UNGRADEABLE (not a team-score bet) — leaving pending: ${league} "${pick.pick}"`);
            continue;
          }

          // NFL picks go to nfl_results table, others go to game_results.
          // pick_id resolves to the per-pick UUID from the picks[] JSON (so a future
          // server-side join can target the specific pick), with the parent daily_picks
          // row id as a backwards-compatible fallback.
          // Insert with error handling. Prior version used bare `await
          // supabase.from(...).insert(...)` with no { error } check, then
          // unconditionally incremented stats and logged ✅. Silent failures
          // (RLS, schema mismatch, key expired, etc.) produced summary lines
          // claiming wins/losses that never actually landed — and the iOS app
          // showed no W/L badges because game_results was empty. The audit
          // flagged this as the #1 critical correctness issue; this is the fix.
          //
          // pick_id MUST be a UUID — the column is typed UUID. A previous "fix"
          // tried to use the per-pick slug id from picks[] JSON
          // ("pick-2026-05-28-mlb-tigers-angelsml112-0"), which Postgres rejected
          // with code 22P02. The slug isn't a UUID; the daily_picks row PK is.
          // iOS doesn't read pick_id so storing the parent row id is correct.
          const perPickId = row.id;
          const targetTable = league === 'NFL' ? 'nfl_results' : 'game_results';
          const resolvedGameId = matchedGame?.id == null ? pickGameId : String(matchedGame.id);
          const exactGameIdentity = targetTable === 'game_results'
            ? await supportsExactGameResultIdentity()
            : targetTable === 'nfl_results'
              ? await supportsExactNFLResultIdentity()
              : false;
          const isWinnersPick = isWinnersGame({ gameDate, league, gameId: resolvedGameId, pickText: pick.pick, odds: pick.odds,
            boardKeys, legacyWinner: winnerKeys.has(winnerKey(pick)) });
          const insertPayload = league === 'NFL'
            ? buildNflResultWritePayload({
                mode: 'insert',
                weeklyRow: row,
                pick,
                nflPickId: perPickId,
                gameDate,
                gameId: exactGameIdentity ? resolvedGameId : null,
                result: res,
                homeScore: hs,
                awayScore: vs,
                isWinnersPick,
                // The helper's own date fallback covers a missing matched game
                // (July/August ET = preseason), so the stamp is always present.
                seasonType: nflSeasonTypeForGame(matchedGame ?? { date: gameDate }),
              })
            : {
                pick_id: perPickId, game_date: gameDate, league, result: res,
                final_score: `${vs}-${hs}`, pick_text: pick.pick,
                matchup: `${pick.awayTeam} @ ${pick.homeTeam}`,
                is_winners_pick: isWinnersPick,
                ...(exactGameIdentity && resolvedGameId ? { game_id: resolvedGameId } : {}),
              };

          let alreadyExists = false;
          let insertFailed = false;
          let persistedResultId = null;
          let exist = null;
          let dedupError = null;
          try {
            exist = await fetchExistingGameResult({
              targetTable,
              league,
              gameDate,
              gameId: resolvedGameId,
              pickText: pick.pick,
              matchup: `${pick.awayTeam} @ ${pick.homeTeam}`,
              exactGameIdentity,
            });
          } catch (error) {
            dedupError = error;
          }
          if (dedupError) {
            console.error(`  ❌ DEDUP CHECK FAILED [${targetTable}] ${league} "${pick.pick}" (${gameDate}): ${dedupError.message}`);
            insertFailed = true;
          } else if (exist) {
            // Row exists from an earlier (possibly mid-game or glitched-"final") grade —
            // RE-GRADE and UPDATE to the current result/score so a wrong early grade
            // self-corrects once the game truly settles, instead of being skipped
            // forever. The game path was still insert-once; this mirrors the prop
            // grader's re-grade fix (the Jun 18 Soto-HR bug). For an already-correct
            // row the update writes the same values — a harmless no-op.
            alreadyExists = true;
            const updatePayload = league === 'NFL'
              ? buildNflResultWritePayload({
                  mode: 'update',
                  weeklyRow: row,
                  pick,
                  gameId: exactGameIdentity ? resolvedGameId : null,
                  result: res,
                  homeScore: hs,
                  awayScore: vs,
                  isWinnersPick,
                  seasonType: nflSeasonTypeForGame(matchedGame ?? { date: gameDate }),
                })
              : {
                  result: res,
                  final_score: `${vs}-${hs}`,
                  is_winners_pick: isWinnersPick,
                  updated_at: new Date().toISOString(),
                  ...(exactGameIdentity && resolvedGameId
                    ? { game_id: resolvedGameId }
                    : {}),
                };
            const { error: updErr } = await supabase
              .from(targetTable)
              .update(updatePayload)
              .eq('id', exist.id);
            if (updErr) {
              console.error(`  ❌ UPDATE FAILED [${targetTable}] ${league} "${pick.pick}" (${gameDate}): ${updErr.message}`);
              insertFailed = true;
            } else {
              persistedResultId = exist.id;
            }
          } else {
            const insertQuery = supabase.from(targetTable).insert(insertPayload);
            const { data: inserted, error: insertErr } = settlementOnly
              ? await insertQuery.select('id').single()
              : await insertQuery;
            if (insertErr) {
              console.error(`  ❌ INSERT FAILED [${targetTable}] ${league} "${pick.pick}" (${gameDate}): ${insertErr.message}${insertErr.code ? ' [code=' + insertErr.code + ']' : ''}${insertErr.details ? ' details=' + insertErr.details : ''}${insertErr.hint ? ' hint=' + insertErr.hint : ''}`);
              insertFailed = true;
            } else if (settlementOnly) {
              persistedResultId = inserted?.id ?? null;
              if (!persistedResultId) {
                console.error(`  ❌ INSERT READBACK ID MISSING [${targetTable}] ${league} "${pick.pick}" (${gameDate})`);
                insertFailed = true;
              }
            }
          }

          if (insertFailed) {
            stats.errors.push(`${targetTable} write failed for ${league} ${pick.pick}`);
            stats.unresolvedFinal++;
            // Don't fictionalize the W/L count when the row didn't land — iOS
            // reads game_results directly, so an uncounted stat is more honest
            // than a counted-but-missing row.
            console.error(`  ⛔ Skipped stats counter for ${league} "${pick.pick}" due to insert failure (row not in ${targetTable})`);
          } else {
            stats.persisted++;
            if (settlementOnly && persistedResultId) stats.persistedResultIds.push(persistedResultId);
            stats[res[0]]++;
            const tag = alreadyExists ? '⏩ ALREADY' : '✅';
            console.log(`  ${tag} ${league}: ${pick.pick} -> ${res.toUpperCase()} (${vs}-${hs}) on ${gameDate}`);

            if (!settlementOnly) {
              // Fact-check the rationale against the actual outcome. Runs on
              // re-grades too (alreadyExists) — its own dedup makes that a no-op
              // unless the fact check is missing. Never fatal to grading.
              try {
                await factCheckGradedPick({ pick, league, gameDate, result: res, hs, vs, matchedGame });
              } catch (e) {
                console.warn(`  ⚠️ Fact-check failed (non-fatal) for ${league} "${pick.pick}": ${e.message}`);
              }

              // Betting recap of the game itself (game_recaps). Same re-grade /
              // dedup semantics as the fact check. Never fatal to grading.
              try {
                await recapGradedPick({ pick, league, gameDate, result: res, hs, vs, matchedGame });
              } catch (e) {
                console.warn(`  ⚠️ Recap failed (non-fatal) for ${league} "${pick.pick}": ${e.message}`);
              }
            }
          }
        } else if (gameFoundNotFinal) {
          stats.pendingNonFinal++;
        } else if (matchedGame) {
          stats.finalEligible++;
          stats.unresolvedFinal++;
          console.error(`  ❌ FINAL SCORE MISSING — ${league} ${pick.awayTeam} @ ${pick.homeTeam}`);
        } else {
          stats.unmatched++;
        }
      }
    }
    if (settlementOnly) {
      const targetTable = table === 'weekly_nfl_picks' ? 'nfl_results' : 'game_results';
      stats.readBack = await readBackPersistedResults(
        targetTable,
        stats.persistedResultIds,
        `${leagueFilter || table} ${date}`,
      );
    }
    return stats;
  }

  return { processGenericGames };
}
