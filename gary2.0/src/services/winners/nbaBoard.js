// GARY'S NBA BOARD (Oct 19 2026, from Oct 21; founder: "winners picks are Gary's real bets while picks page is just for
// people wanting picks for each game with 2 props"). Gary picks every NBA game for the Picks page; that is his lean.
// His bets are a separate look: about 110 minutes before the first tip he hasn't boarded (50 while the picks ran 90
// minutes out; from five hours since Oct 28 2026, so the board goes up when football's does),
// he sees every picked game still to tip, fresh, without his write-ups, read the way the pick reads it (nbaRead.js,
// Oct 22 2026): the line and how it got here, who's playing, how good both teams are, the situation. He names the
// games he would put his own money on, in his order, any number or none.
// Saved per game (winners_nba_board); SQL seat_nba_board seats a bet whose pick is on the same side, two a night beside
// the national-TV big games (Oct 23 2026; one at most from the first third of tip times), when the board names them (Oct 25 2026; no later than 10 minutes before tip), as
// the late-news check. Big games and the night's two worst matchups stay off the board (powerRatings.js).
import { createModelSession, sendToSessionWithRetry } from '../gary/agentic/orchestrator/sessionManager.js';
import { GAME_PICK_MODEL } from '../gary/agentic/orchestrator/orchestratorConfig.js';
import { nbaSystemPrompt, nbaBoardMessage, NBA_BOARD_FORMAT_ONLY } from '../gary/agentic/orchestrator/nbaKnowledge.js';
import { buildNbaBoardEntry, ratingsOrMissing } from '../gary/agentic/orchestrator/nbaRead.js';
import { parseBoardBets, boardDecisions } from './nflBoard.js';
import { offTheBoard } from './powerRatings.js';

export const NBA_BOARD_LEAD_MS = 110 * 60_000;   // board the next tips this long before the first one
const LAST_CALL_MS = 15 * 60_000;               // a game this close to tip is past boarding
const FIRST_BOARD_DATE = '2026-10-21';
let running = false;
const offLogged = new Set();   // each game left off is logged once a day

/** Board the next NBA tips when the first unboarded one is near. Returns what it did; never throws. */
export async function runNbaBoard(client, date, { now = new Date(), log = console } = {}) {
  if (date < FIRST_BOARD_DATE) return 'opening_night';
  if (running) return 'busy';
  running = true;
  try {
    const { data: cands, error } = await client.from('winners_candidates')
      .select('id,game_id,pick_text,commence_time,home:pick_snapshot->>homeTeam,away:pick_snapshot->>awayTeam')
      .eq('game_date', date).eq('league', 'NBA').eq('kind', 'game');
    if (error) throw error;
    if (!cands?.length) return 'no_games';
    const { data: boarded, error: e2 } = await client.from('winners_nba_board').select('game_id').in('game_id', cands.map((c) => String(c.game_id)));
    if (e2) throw e2;
    const done = new Set((boarded || []).map((b) => String(b.game_id)));
    // Off the board (Oct 23 2026, winners/powerRatings.js): the day's big games, which go on Winners as big games, and
    // for the NFL and NBA the slate's two worst matchups of bottom-third teams. Worked out from the whole day's slate.
    const slate = [...new Map(cands.filter((c) => c.home && c.away).map((c) => [String(c.game_id), { gameId: String(c.game_id), home: c.home, away: c.away }])).values()];
    const off = await offTheBoard(client, { date, league: 'NBA', slate, log });
    for (const [id, why] of off) if (!offLogged.has(`${date}|${id}`)) { offLogged.add(`${date}|${id}`); const g = slate.find((x) => x.gameId === id); if (g) log.log(`[NBA Board] ${g.away} @ ${g.home} stays off the board: ${why}`); }
    const open = cands.filter((c) => !done.has(String(c.game_id)) && !off.has(String(c.game_id)) && Date.parse(c.commence_time) > now.getTime() + LAST_CALL_MS && c.home && c.away);
    const games = [...new Map(open.map((c) => [String(c.game_id), c])).values()];
    if (!games.length) return 'nothing_open';
    const first = Math.min(...games.map((c) => Date.parse(c.commence_time)));
    if (first > now.getTime() + NBA_BOARD_LEAD_MS) return 'waiting';

    // A failed load says so in each team's head, as the pick's read does (Oct 29 2026 hunt, round 7).
    const ratings = await ratingsOrMissing(now);
    const entries = [];
    for (const c of games.sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))) {
      const { data: ev, error: e3 } = await client.from('winners_candidates').select('desk:evidence_snapshot->>deskText').eq('id', c.id).single();
      if (e3 || !ev?.desk) { log.warn(`[NBA Board] ${c.away} @ ${c.home}: no desk on the candidate; left off the board`); continue; }
      const tip = new Date(c.commence_time).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });
      entries.push({ c, text: await buildNbaBoardEntry(ev.desk, { homeTeam: c.home, awayTeam: c.away, gameId: c.game_id, tip, asOf: now, ratings }) });
    }
    if (!entries.length) return 'no_desks';

    const today = new Date(`${date}T16:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const session = await createModelSession({ modelName: GAME_PICK_MODEL, systemPrompt: nbaSystemPrompt(today), tools: null, browse: false, thinkingLevel: process.env.GARY_BRAIN_EFFORT || 'xhigh', enableCache: true });
    let answer = (await sendToSessionWithRetry(session, nbaBoardMessage(entries.map((e) => e.text), today))).content || '';
    let bets = parseBoardBets(answer);
    if (!bets) { answer = (await sendToSessionWithRetry(session, NBA_BOARD_FORMAT_ONLY)).content || ''; bets = parseBoardBets(answer); }
    if (!bets) log.warn('[NBA Board] no readable bets after the format ask; every game on this board is a pass');
    const decided = boardDecisions(entries.map((e) => ({ id: e.c.id, gameId: String(e.c.game_id), home: e.c.home, away: e.c.away })), bets || []);
    const nBets = decided.filter((d) => d.decision === 'bet').length;
    const rows = decided.map((d) => ({ game_date: date, game_id: d.gameId, matchup: `${d.away} @ ${d.home}`, decision: d.decision, side: d.side, why: d.why,
      rank: d.rank, bets: nBets, games: decided.length, model: session.modelName }));
    const { error: e4 } = await client.from('winners_nba_board').upsert(rows, { onConflict: 'game_id', ignoreDuplicates: true });
    if (e4) throw e4;
    log.log(`🏀 NBA BOARD ${date}: ${decided.length} game(s), ${nBets} bet(s)${nBets ? ` — ${decided.filter((d) => d.decision === 'bet').sort((a, b) => a.rank - b.rank).map((d) => d.side).join(', ')}` : ''} (${session.modelName})`);
    return `boarded ${decided.length}, bet ${nBets}`;
  } catch (e) {
    log.warn(`[NBA Board] ${date}: ${e?.message || e}; next loop retries`);
    return 'failed';
  } finally {
    running = false;
  }
}
