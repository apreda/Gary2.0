/** Confirm stored tickets before recording their original evidence and queuing Winners. */
import path from 'node:path';
import { pickGameDate } from './calendar.js';
import { originalGameEvidence as defaultEvidence } from '../../../src/services/pickdesk/originalGameEvidence.js';
import { mlbCaseHeadings as defaultCaseHeadings } from '../../../src/services/agentic/orchestrator/mlbCaseMenu.js';

export function createGamePublication({ picksService, winnersAdmin, storePicks,
  enqueueWinnersCandidate, confirmedPublishedGame, MLB_TEST_SYSTEMS_ON = false, buildShadowPick,
  originalGameEvidence = defaultEvidence, mlbCaseHeadings = defaultCaseHeadings,
  loadShadowDatabase = () => import('../../../src/supabaseClient.js'),
  loadChildProcess = () => import('node:child_process'), loadFs = () => import('node:fs'),
  process = globalThis.process, console = globalThis.console }) {
  async function routeToWinners({ league, game, cleanPick, evidence }) {
    try {
      const kickoff = cleanPick.commence_time || game?.commence_time;
      const gameDate = pickGameDate(league, kickoff);
      await enqueueWinnersCandidate(winnersAdmin, {
        date: gameDate, league, kind: 'game', pick: cleanPick,
        evidence,
      });
      console.log(`🏆 [Winners] Queued exact-ticket review: ${cleanPick.pick}`);
    } catch (e) {
      console.warn(`⚠️ [Winners] queue failed (${e.message}); reconciliation will record the publication gap`);
    }
  }

  async function publishGame({ config, picksForGame, cleanPick, result, game }) {
    console.log(`\n📤 [${config.name}] Storing ${picksForGame.length} pick(s) immediately: ${picksForGame.map(p => p.pick).join(' | ')}`);
    await storePicks(picksForGame);
    console.log(`✅ [${config.name}] Pick(s) stored to Supabase`);
    const publishedDate=pickGameDate(config.key, cleanPick.commence_time || game?.commence_time);
    let publishedPick=null;
    try {
      publishedPick=await confirmedPublishedGame({date:publishedDate,league:config.name,pick:cleanPick},{readPublished:picksService.pickAlreadyStoredByGameId});
      if(!publishedPick)console.warn('[Winners] Incoming decision was not the stored ticket; original published evidence left intact');
    }catch(e){console.warn(`[Winners] Publication verification unavailable: ${e.message}; public pick remains stored`);}
    // THE DESK snapshot (spec 2026-07-26): the pick is a pure
    // function of the desk — persist exactly what Gary read.
    // Non-blocking by contract. (Sep 2: the orchestrator returns
    // the desk as _context.scoutReport — the old `deskText` key
    // never existed, so no desk was stored from Jul 26 to Sep 2.)
    const deskText = result?._context?.scoutReport || null;
    let judgmentPublished = !result._mlbJudgmentJournal;
    if (publishedPick && result._mlbJudgmentJournal) {
      try {
        const receipt = await result._mlbJudgmentJournal.publish(publishedPick);
        result._mlbJudgment.receipts.published = receipt;
        judgmentPublished = true;
      } catch (error) {
        console.warn(`[MLB Journal] Public ticket stored, publication receipt unavailable: ${error.message}; Winners remains ineligible until exact recovery`);
      }
    }
    const evidence = publishedPick ? originalGameEvidence({ result, pick: publishedPick, deskText,
      first: config.name === 'MLB' && mlbCaseHeadings(cleanPick.homeTeam, cleanPick.awayTeam, game).order === 'away-first' ? 'away' : 'home',
    }) : null;
    if (deskText && publishedPick) {
      await picksService.storeDeskSnapshot({
        game_date: publishedDate,
        matchup: `${cleanPick.awayTeam} @ ${cleanPick.homeTeam}`,
        pick: cleanPick.pick,
        desk: deskText,
        research_briefing: result?._context?.researchBriefing || null,
        decision_evidence: evidence,
      });
    }
    // Every newly published ticket enters the same review queue;
    // feature status and underdog status do not admit it.
    if(publishedPick && judgmentPublished)await routeToWinners({ league: config.name, game, cleanPick:publishedPick, evidence });
    // THE SHADOW MODEL (founder GO, Sep 3 2026): a second system's
    // bet for the same game, stored beside Gary's and never shown
    // to him or to fans; graded and read nightly against his.
    if (config.name === 'MLB' && MLB_TEST_SYSTEMS_ON) {
      try {
        const { supabaseAdmin, supabase } = await loadShadowDatabase();
        const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const shadow = await buildShadowPick({
          game, homeTeam: cleanPick.homeTeam, awayTeam: cleanPick.awayTeam, todayEt,
          garyPick: cleanPick.pick, deskText, db: supabaseAdmin || supabase,
        });
        if (shadow.ok) {
          const r = shadow.row;
          console.log(`🧪 [Shadow] ${r.pick_text} (market ${(r.p_market * 100).toFixed(1)}% → ${(r.p_adj * 100).toFixed(1)}% home, ${r.adjustment_pts >= 0 ? '+' : ''}${r.adjustment_pts} pts: ${(r.drivers || []).map((d) => d.name).join(', ') || 'no tonight adjustment'}) · Gary ${cleanPick.pick} · ${r.agree_with_gary === false ? 'DIFFERENT side' : r.agree_with_gary ? 'same side' : 'side unread'}`);
        } else {
          console.warn(`   ⚠️ [Shadow] no shadow pick (${shadow.error})`);
        }
      } catch (shadowErr) {
        console.warn(`   ⚠️ [Shadow] skipped (${shadowErr.message}) — pick unaffected`);
      }
      // THE NOTEBOOK SHADOW (founder GO, Sep 3 2026): Gary with a
      // memory — a second read of the same desk with his notebook
      // appended, in its own detached process so it never delays
      // this child or touches the real pick. It reads the desk
      // snapshot stored above; if that store failed there is no
      // desk to re-read and the shadow simply skips.
      if (deskText && publishedPick && MLB_TEST_SYSTEMS_ON) {
        try {
          const { spawn } = await loadChildProcess();
          const { openSync, mkdirSync } = await loadFs();
          const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
          const logDir = path.join(process.cwd(), 'logs', 'scheduler');
          mkdirSync(logDir, { recursive: true });
          const logFd = openSync(path.join(logDir, `diary-${todayEt}-${cleanPick.game_id ?? game?.id ?? 'game'}.log`), 'a');
          const child = spawn(process.execPath, [
            path.join(process.cwd(), 'scripts', 'run-diary-pick.js'),
            '--game-id', String(cleanPick.game_id ?? game?.id ?? ''),
            '--date', todayEt,
            '--matchup', `${cleanPick.awayTeam} @ ${cleanPick.homeTeam}`,
          ], { detached: true, stdio: ['ignore', logFd, logFd], env: { ...process.env, ANTHROPIC_API_KEY: '' } });
          child.unref();
          console.log(`📓 [Diary] notebook shadow started for ${cleanPick.awayTeam} @ ${cleanPick.homeTeam} (pid ${child.pid})`);
        } catch (diaryErr) {
          console.warn(`   ⚠️ [Diary] not started (${diaryErr.message}) — pick unaffected`);
        }
      }
    }
    return publishedPick;
  }
  return { publishGame, routeToWinners };
}
