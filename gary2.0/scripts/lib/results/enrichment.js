/** Post-settlement rationale checks and recap persistence; never a grading prerequisite. */
import { factCheckPick as defaultFactCheckPick, buildGameEvidence as defaultBuildGameEvidence } from '../../../src/services/factCheck.js';
import { headlineNeedsRepair as defaultHeadlineNeedsRepair, filterPropsForGame as defaultFilterPropsForGame, generateRecap as defaultGenerateRecap } from '../../../src/services/gameRecap.js';
import { recapBoxComplete as defaultRecapBoxComplete, loadRecapBox as defaultLoadRecapBox } from '../../../src/services/recapBox.js';

// THE NFL RECAP READS THE SAME EVIDENCE MLB DOES (founder, Sep 21 2026: the
// NFL recap is written the way MLB's is). factCheck.buildGameEvidence has read
// football per-game lines since Sep 18 and the manual backfill supplied them;
// this nightly path handed the writer the final score only, so every NFL
// headline restated the scoreboard. Same grouped BDL shape as the backfill.
async function defaultFetchFootballStatsByGame(gameId) {
  const { ballDontLieService } = await import('../../../src/services/ballDontLieService.js');
  const byGame = (await ballDontLieService.getNflPlayerStatsByGameIds([String(gameId)])) || {};
  return byGame[String(gameId)] || byGame[gameId] || null;
}

export function createResultsEnrichment({ supabase, apiKey: BDL_API_KEY, fetchMLBStats, fetchGradedPropRowsAround,
  fetchFootballStatsByGame = defaultFetchFootballStatsByGame,
  factCheckPick = defaultFactCheckPick,
  buildGameEvidence = defaultBuildGameEvidence,
  headlineNeedsRepair = defaultHeadlineNeedsRepair,
  recapBoxComplete = defaultRecapBoxComplete,
  loadRecapBox = defaultLoadRecapBox,
  filterPropsForGame = defaultFilterPropsForGame,
  generateRecap = defaultGenerateRecap, console = globalThis.console }) {
  /**
   * Rationale Fact Check
   * After a game pick is graded, grade Gary's RATIONALE claim-by-claim against
   * what actually happened (rows land in pick_fact_checks; the app reads them to
   * show "what Gary got right"). Game picks only — props never reach this path.
   * Non-fatal by design: callers wrap it in try/catch so a fact-check failure
   * can never break results grading.
   */
  async function factCheckGradedPick({ pick, league, gameDate, result, hs, vs, matchedGame }) {
    if (!pick.rationale || !String(pick.rationale).trim()) return;
    const matchup = `${pick.awayTeam} @ ${pick.homeTeam}`;

    // Idempotency: skip matchups already fact-checked for this date (mirrors the
    // game_results dedup check above).
    const { data: exist, error: dedupErr } = await supabase
      .from('pick_fact_checks')
      .select('id')
      .eq('game_date', gameDate)
      .eq('league', league)
      .eq('matchup', matchup)
      .maybeSingle();
    if (dedupErr) {
      console.warn(`  ⚠️ Fact-check dedup failed for ${matchup}: ${dedupErr.message}`);
      return;
    }
    if (exist) {
      console.log(`  ⏩ Fact-check exists: ${league} ${matchup} (${gameDate})`);
      return;
    }

    // Evidence: final score + (MLB) the per-game BDL player stats we already
    // fetch for prop grading — pitcher lines, HRs, team hit totals.
    let mlbStats = null;
    if (league === 'MLB' && matchedGame?.id != null) {
      mlbStats = await fetchMLBStats([matchedGame.id]);
    }
    const evidence = buildGameEvidence({
      league,
      homeTeam: pick.homeTeam,
      awayTeam: pick.awayTeam,
      homeScore: hs,
      awayScore: vs,
      mlbStats,
    });

    const fc = await factCheckPick({ pick, result, evidence });
    if (!fc) {
      console.warn(`  ⚠️ Fact-check produced no claims for ${league} ${matchup}`);
      return;
    }

    const { error: insertErr } = await supabase.from('pick_fact_checks').insert({
      game_date: gameDate,
      league,
      matchup,
      pick_text: pick.pick,
      result,
      claims: fc.claims,
      right_count: fc.right_count,
      wrong_count: fc.wrong_count,
    });
    if (insertErr) {
      console.error(`  ❌ FACT-CHECK INSERT FAILED [pick_fact_checks] ${league} ${matchup} (${gameDate}): ${insertErr.message}`);
    } else {
      const unclear = fc.claims.length - fc.right_count - fc.wrong_count;
      console.log(`  🔍 Fact-checked ${league} ${matchup}: ${fc.right_count} right / ${fc.wrong_count} wrong / ${unclear} unclear`);
    }
  }

  /**
   * Betting Recap
   * After a game pick is graded, write a 2-4 sentence ESPN-style recap of the
   * game from the betting perspective (rows land in game_recaps; the app reads
   * them to tell last night's story). Same evidence pack as the fact check —
   * fetchMLBStats is cached, so the second build is free. Game picks only —
   * props never reach this path. Non-fatal by design: callers wrap it in
   * try/catch so a recap failure can never break results grading.
   */
  async function recapGradedPick({ pick, league, gameDate, result, hs, vs, matchedGame }) {
    const matchup = `${pick.awayTeam} @ ${pick.homeTeam}`;

    // Idempotency: skip matchups already recapped for this date (mirrors the
    // pick_fact_checks dedup check above) — UNLESS the stored recap's result no
    // longer matches the freshly-computed grade (Jul 10 2026 fix: game_recaps has
    // no updated_at column, so a re-grade that corrected game_results previously
    // left a stale recap narrating the old, wrong outcome forever — same class of
    // bug as writeRecap() in the cloud grade-results function).
    const { data: exist, error: dedupErr } = await supabase
      .from('game_recaps')
      .select('id, result, headline, box')
      .eq('game_date', gameDate)
      .eq('league', league)
      .eq('matchup', matchup)
      // One recap per pick (Sep 23 2026 key): a doubleheader has two rows for
      // one matchup, and the matchup-only lookup failed for both games.
      .eq('pick_text', pick.pick)
      .maybeSingle();
    if (dedupErr) {
      console.warn(`  ⚠️ Recap dedup failed for ${matchup}: ${dedupErr.message}`);
      return;
    }
    const stale = !!exist && exist.result !== result;
    const editorialRepair = !!exist && headlineNeedsRepair(exist.headline);
    let mlbStats = null;
    let box = exist?.box ?? null;
    if (stale || !recapBoxComplete(box, league) || box.away.runs !== vs || box.home.runs !== hs) {
      if (league === 'MLB' && matchedGame?.id != null) mlbStats = await fetchMLBStats([matchedGame.id]);
      box = await loadRecapBox({ league, gameId: matchedGame?.id ?? pick.game_id,
        awayTeam: pick.awayTeam, homeTeam: pick.homeTeam, awayScore: vs, homeScore: hs,
        mlbStats, apiKey: BDL_API_KEY });
    }
    if (exist && !stale && !editorialRepair) {
      if (box && JSON.stringify(box) !== JSON.stringify(exist.box)) {
        const { error } = await supabase.from('game_recaps').update({ box }).eq('id', exist.id);
        if (error) throw new Error(`Recap box update failed: ${error.message}`);
      }
      console.log(`  ⏩ Recap exists: ${league} ${matchup} (${gameDate})`);
      return;
    }

    // Evidence: final score + (MLB) the per-game BDL player stats we already
    // fetch for prop grading — pitcher lines, HRs, team hit totals — plus this
    // game's graded props WITH their real prices, so bullets can carry the
    // betting lens without inventing odds.
    if (!mlbStats && league === 'MLB' && matchedGame?.id != null) {
      mlbStats = await fetchMLBStats([matchedGame.id]);
    }
    // A missing football stat pack degrades the recap to score-only; it never
    // takes settlement down (the manual backfill's rule).
    let footballStats = null;
    const footballGameId = matchedGame?.id ?? pick.game_id;
    if (league === 'NFL' && footballGameId != null) {
      try { footballStats = await fetchFootballStatsByGame(footballGameId); }
      catch (e) { console.warn(`  ⚠️ NFL player stats unavailable for ${matchup} (recap falls back to score-only): ${e.message}`); }
    }
    const propRows = await fetchGradedPropRowsAround(gameDate);
    const gradedProps = filterPropsForGame(propRows, pick.homeTeam, pick.awayTeam);
    const evidence = buildGameEvidence({
      league,
      homeTeam: pick.homeTeam,
      awayTeam: pick.awayTeam,
      homeScore: hs,
      awayScore: vs,
      mlbStats,
      footballStats,
      gradedProps,
    });

    // recapGradedPick runs on RE-grades too (its game_recaps dedup above makes it a no-op
    // once a recap exists), so a re-run of any day backfills missing recaps — including days
    // the cloud grader graded without recapping. The one thing that silently dropped a recap
    // on 2026-06-24 was a transient Gemini "Request aborted" throw, so retry generateRecap
    // once before giving up.
    let recap = null;
    for (let attempt = 1; attempt <= 2 && !recap; attempt++) {
      try {
        recap = await generateRecap({ pick, result, evidence });
      } catch (e) {
        console.warn(`  ⚠️ Recap gen attempt ${attempt} failed for ${matchup}: ${e.message}`);
        if (attempt === 1) await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (!recap) {
      console.warn(`  ⚠️ Recap produced nothing for ${league} ${matchup}`);
      return;
    }

    if (stale || editorialRepair) {
      const { error: updateErr } = await supabase
        .from('game_recaps')
        .update({ result, headline: recap.headline, recap: recap.recap, bullets: recap.bullets || [], box })
        .eq('id', exist.id);
      if (updateErr) {
        console.error(`  ❌ RECAP UPDATE FAILED [game_recaps] ${league} ${matchup} (${gameDate}): ${updateErr.message}`);
      } else {
        console.log(`  📰 Re-recapped ${league} ${matchup} (${stale ? 'grade changed' : 'headline repaired'}): "${recap.headline}"`);
      }
      return;
    }

    const { error: insertErr } = await supabase.from('game_recaps').insert({
      game_date: gameDate,
      league,
      matchup,
      pick_text: pick.pick,
      result,
      headline: recap.headline,
      recap: recap.recap,
      bullets: recap.bullets || [],
      box,
    });
    if (insertErr) {
      console.error(`  ❌ RECAP INSERT FAILED [game_recaps] ${league} ${matchup} (${gameDate}): ${insertErr.message}`);
    } else {
      console.log(`  📰 Recapped ${league} ${matchup}: "${recap.headline}"`);
    }
  }

  return { factCheckGradedPick, recapGradedPick };
}
