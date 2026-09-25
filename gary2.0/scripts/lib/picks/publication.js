/** Confirm stored tickets before recording their original evidence and queuing Winners. */
import { pickGameDate } from './calendar.js';
import { originalGameEvidence as defaultEvidence } from '../../../src/services/pickdesk/originalGameEvidence.js';
import { mlbCaseHeadings as defaultCaseHeadings } from '../../../src/services/agentic/orchestrator/mlbCaseMenu.js';

export function createGamePublication({ picksService, winnersAdmin, storePicks,
  enqueueWinnersCandidate, confirmedPublishedGame,
  originalGameEvidence = defaultEvidence, mlbCaseHeadings = defaultCaseHeadings,
  console = globalThis.console }) {
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
    if (publishedPick) await routeToWinners({ league: config.name, game, cleanPick: publishedPick, evidence });
    return publishedPick;
  }
  return { publishGame, routeToWinners };
}
