// GARY'S COLLEGE BOARD (Oct 22 2026, from Oct 23; founder: "college should work the same way the other sports do").
// Gary picks every college game for the Picks page; that is his lean. His bets are a separate look, as for the NFL and
// the NBA: about 110 minutes before the first kickoff he hasn't boarded (college picks run from T-240, Saturdays from
// 9:30 AM), he sees every picked college game still to start, fresh, without his write-ups, read the way the pick reads
// it (ncaafRead.js): the line and how it got here, the quarterbacks and coaches, the availability report, how good both
// teams are, the situation and the news desk's report. He names the games he would put his own money on, in his order,
// any number or none. Saved per game (winners_ncaaf_board); SQL seat_ncaaf_board seats a bet whose pick is on the same
// side, five a day spread over the kickoff times as the NBA's are (the first third can take two, the first two thirds
// four), 75 minutes before kickoff, after the late-news check. It replaces the card's bottom five, the big-game sweep
// and the daily floor for college. A game picked after its wave was boarded gets its own board. Never fatal.
import { createModelSession, sendToSessionWithRetry } from '../gary/agentic/orchestrator/sessionManager.js';
import { GAME_PICK_MODEL } from '../gary/agentic/orchestrator/orchestratorConfig.js';
import { ncaafSystemPrompt, ncaafBoardMessage, NCAAF_BOARD_FORMAT_ONLY } from '../gary/agentic/orchestrator/ncaafKnowledge.js';
import { buildNcaafBoardEntry } from '../gary/agentic/orchestrator/ncaafRead.js';
import { parseBoardBets, boardDecisions } from './nflBoard.js';

export const NCAAF_BOARD_LEAD_MS = 110 * 60_000;   // board the next kickoffs this long before the first one
const LAST_CALL_MS = 25 * 60_000;                  // a game this close to kickoff is past boarding
const FIRST_BOARD_DATE = '2026-10-23';
let running = false;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9&]+/g, ' ').trim();
/**
 * Each board game's decision. College nicknames repeat (Auburn and LSU are both Tigers), so a bet is first matched by
 * the full team names its heading shows; anything else falls back to the NFL board's matching.
 */
export function ncaafBoardDecisions(games, bets) {
  const out = new Map(games.map((g) => [g.id, { ...g, decision: 'pass', side: null, why: null, rank: null }]));
  let rank = 0;
  for (const b of bets || []) {
    const open = games.filter((x) => out.get(x.id).decision === 'pass');
    const game = norm(b?.game), side = norm(b?.side);
    const g = open.find((x) => game.includes(norm(x.home)) && game.includes(norm(x.away)));
    const named = g ? [g.home, g.away].filter((t) => side.includes(norm(t))) : [];
    if (g && named.length === 1) {
      out.set(g.id, { ...g, decision: 'bet', side: named[0], why: String(b?.why || '').trim() || null, rank: ++rank });
      continue;
    }
    const [d] = boardDecisions(open, [b]).filter((x) => x.decision === 'bet');
    if (d) out.set(d.id, { ...d, rank: ++rank });
  }
  return [...out.values()];
}

/** Board the next college kickoffs when the first unboarded one is near. Returns what it did; never throws. */
export async function runNcaafBoard(client, date, { now = new Date(), log = console } = {}) {
  if (date < FIRST_BOARD_DATE) return 'card';
  if (running) return 'busy';
  running = true;
  try {
    const { data: cands, error } = await client.from('winners_candidates')
      .select('id,game_id,pick_text,commence_time,home:pick_snapshot->>homeTeam,away:pick_snapshot->>awayTeam')
      .eq('game_date', date).eq('league', 'NCAAF').eq('kind', 'game');
    if (error) throw error;
    if (!cands?.length) return 'no_games';
    const { data: boarded, error: e2 } = await client.from('winners_ncaaf_board').select('game_id').in('game_id', cands.map((c) => String(c.game_id)));
    if (e2) throw e2;
    const done = new Set((boarded || []).map((b) => String(b.game_id)));
    const open = cands.filter((c) => !done.has(String(c.game_id)) && Date.parse(c.commence_time) > now.getTime() + LAST_CALL_MS && c.home && c.away);
    // One row per game: a game picked twice (a re-run) boards once.
    const games = [...new Map(open.map((c) => [String(c.game_id), c])).values()];
    if (!games.length) return 'nothing_open';
    const first = Math.min(...games.map((c) => Date.parse(c.commence_time)));
    if (first > now.getTime() + NCAAF_BOARD_LEAD_MS) return 'waiting';

    const entries = [];
    for (const c of games.sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))) {
      // One candidate at a time: the desk and the news desk's report the pick read.
      const { data: ev, error: e3 } = await client.from('winners_candidates')
        .select('desk:evidence_snapshot->>deskText,news:evidence_snapshot->>researchBriefing').eq('id', c.id).single();
      if (e3 || !ev?.desk) { log.warn(`[College Board] ${c.away} @ ${c.home}: no desk on the candidate; left off the board`); continue; }
      entries.push({ c, text: await buildNcaafBoardEntry(ev.desk, ev.news, { homeTeam: c.home, awayTeam: c.away, gameId: c.game_id, kickoff: c.commence_time, asOf: now }) });
    }
    if (!entries.length) return 'no_desks';

    const today = new Date(`${date}T16:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const session = await createModelSession({ modelName: GAME_PICK_MODEL, systemPrompt: ncaafSystemPrompt(today), tools: null, browse: false, thinkingLevel: process.env.GARY_BRAIN_EFFORT || 'xhigh', enableCache: true });
    let answer = (await sendToSessionWithRetry(session, ncaafBoardMessage(entries.map((e) => e.text), today))).content || '';
    let bets = parseBoardBets(answer);
    if (!bets) { answer = (await sendToSessionWithRetry(session, NCAAF_BOARD_FORMAT_ONLY)).content || ''; bets = parseBoardBets(answer); }
    if (!bets) log.warn('[College Board] no readable bets after the format ask; every game on this board is a pass');
    const decided = ncaafBoardDecisions(entries.map((e) => ({ id: e.c.id, gameId: String(e.c.game_id), home: e.c.home, away: e.c.away })), bets || []);
    const nBets = decided.filter((d) => d.decision === 'bet').length;
    const rows = decided.map((d) => ({ game_date: date, game_id: d.gameId, matchup: `${d.away} @ ${d.home}`, decision: d.decision, side: d.side, why: d.why,
      rank: d.rank, bets: nBets, games: decided.length, model: session.modelName }));
    const { error: e4 } = await client.from('winners_ncaaf_board').upsert(rows, { onConflict: 'game_id', ignoreDuplicates: true });
    if (e4) throw e4;
    log.log(`🏈 COLLEGE BOARD ${date}: ${decided.length} game(s), ${nBets} bet(s)${nBets ? ` — ${decided.filter((d) => d.decision === 'bet').sort((a, b) => a.rank - b.rank).map((d) => d.side).join(', ')}` : ''} (${session.modelName})`);
    return `boarded ${decided.length}, bet ${nBets}`;
  } catch (e) {
    log.warn(`[College Board] ${date}: ${e?.message || e}; next loop retries`);
    return 'failed';
  } finally {
    running = false;
  }
}
