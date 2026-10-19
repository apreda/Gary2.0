// GARY'S NFL BOARD (Oct 19 2026, the new NFL system; founder: "solve this so he doesnt have to bet every game he only
// bets the ones he actaully wants to bet"). Gary picks every NFL game for the Picks page; that is his lean. His bets
// are a separate look, the way a bettor scans the board: about 110 minutes before the first kickoff he hasn't boarded,
// he sees every picked game of the day still to start, fresh (no write-ups, no picks shown): the line and how it moved,
// the quarterbacks, who's out, how good both teams are, the spot and the news desk's report. He names the games he
// would put his own money on, in the order he likes them, any number or none. The answer is saved per game
// (winners_nfl_board); SQL seat_nfl_board seats a bet whose pick is on the same side, his top five, 75 minutes before
// kickoff, after the late-news check. A game picked after its slate was boarded gets its own board. Never fatal.
import { createModelSession, sendToSessionWithRetry } from '../gary/agentic/orchestrator/sessionManager.js';
import { GAME_PICK_MODEL } from '../gary/agentic/orchestrator/orchestratorConfig.js';
import { nflSystemPrompt, nflBoardMessage, NFL_BOARD_FORMAT_ONLY } from '../gary/agentic/orchestrator/nflKnowledge.js';
import { buildNflBoardEntry } from '../gary/agentic/orchestrator/nflRead.js';
import { loadBettorData, etDate } from '../sports/nfl/nflBettorData.js';
import { nflSeason } from '../../utils/dateUtils.js';

export const BOARD_LEAD_MS = 110 * 60_000;   // board the slate this long before its first kickoff
const LAST_CALL_MS = 25 * 60_000;            // a game this close to kickoff is past boarding
let running = false;

const nick = (team) => String(team || '').trim().split(/\s+/).pop().toLowerCase();
const city = (team) => String(team || '').trim().split(/\s+/).slice(0, -1).join(' ').toLowerCase();
// Which of a game's two teams a phrase names: the nickname, or the city when the two teams don't share one.
const named = (text, g) => {
  const t = String(text || '').toLowerCase();
  const sameCity = city(g.home) === city(g.away);
  const home = t.includes(nick(g.home)) || (!sameCity && city(g.home) && t.includes(city(g.home)));
  const away = t.includes(nick(g.away)) || (!sameCity && city(g.away) && t.includes(city(g.away)));
  return { home, away };
};
/** The bets in his answer's JSON block, or null when there is no readable block. */
export function parseBoardBets(text) {
  const raw = String(text || '');
  const fenced = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]).reverse();
  const tail = raw.lastIndexOf('{"bets"') >= 0 ? [raw.slice(raw.lastIndexOf('{"bets"'), raw.lastIndexOf('}') + 1)] : [];
  for (const body of [...fenced, ...tail]) {
    try { const j = JSON.parse(body); if (Array.isArray(j?.bets)) return j.bets; } catch { /* next */ }
  }
  return null;
}
/** Each board game's decision: the bet (resolved to the game's own team name, in his order) or a pass. */
export function boardDecisions(games, bets) {
  const out = new Map(games.map((g) => [g.id, { ...g, decision: 'pass', side: null, why: null, rank: null }]));
  let rank = 0;
  for (const b of bets || []) {
    const g = games.find((x) => out.get(x.id).decision === 'pass' && (({ home, away }) => home && away)(named(b?.game, x)))
      || games.find((x) => out.get(x.id).decision === 'pass' && (({ home, away }) => home !== away)(named(b?.side, x)));
    if (!g) continue;
    const pick = named(b?.side, g);
    const side = pick.home && !pick.away ? g.home : pick.away && !pick.home ? g.away : null;
    if (!side) continue;
    out.set(g.id, { ...g, decision: 'bet', side, why: String(b?.why || '').trim() || null, rank: ++rank });
  }
  return [...out.values()];
}

/** Board today's NFL slate when its first unboarded kickoff is near. Returns what it did. */
export async function runNflBoard(client, date, { now = new Date(), log = console } = {}) {
  if (running) return 'busy';
  running = true;
  try {
    const { data: cands, error } = await client.from('winners_candidates')
      .select('id,game_id,pick_text,commence_time,admitted_at,home:pick_snapshot->>homeTeam,away:pick_snapshot->>awayTeam')
      .eq('game_date', date).eq('league', 'NFL').eq('kind', 'game');
    if (error) throw error;
    if (!cands?.length) return 'no_games';
    const { data: boarded, error: e2 } = await client.from('winners_nfl_board').select('game_id').in('game_id', cands.map((c) => String(c.game_id)));
    if (e2) throw e2;
    const done = new Set((boarded || []).map((b) => String(b.game_id)));
    const open = cands.filter((c) => !done.has(String(c.game_id)) && Date.parse(c.commence_time) > now.getTime() + LAST_CALL_MS && c.home && c.away);
    // One row per game: a game picked twice (a re-run) boards once.
    const games = [...new Map(open.map((c) => [String(c.game_id), c])).values()];
    if (!games.length) return 'nothing_open';
    const first = Math.min(...games.map((c) => Date.parse(c.commence_time)));
    if (first > now.getTime() + BOARD_LEAD_MS) return 'waiting';

    const data = await loadBettorData(nflSeason());
    const entries = [];
    for (const c of games.sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))) {
      // One candidate at a time: the desk and the news desk's report the pick read.
      const { data: ev, error: e3 } = await client.from('winners_candidates')
        .select('desk:evidence_snapshot->>deskText,news:evidence_snapshot->>researchBriefing').eq('id', c.id).single();
      if (e3 || !ev?.desk) { log.warn(`[NFL Board] ${c.away} @ ${c.home}: no desk on the candidate; left off the board`); continue; }
      entries.push({ c, text: await buildNflBoardEntry(ev.desk, ev.news, { homeTeam: c.home, awayTeam: c.away, gameId: c.game_id, gameDate: date, kickoff: c.commence_time, asOf: now, data }) });
    }
    if (!entries.length) return 'no_desks';

    const today = new Date(`${date}T16:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const session = await createModelSession({ modelName: GAME_PICK_MODEL, systemPrompt: nflSystemPrompt(today), tools: null, browse: false, thinkingLevel: process.env.GARY_BRAIN_EFFORT || 'xhigh', enableCache: true });
    let answer = (await sendToSessionWithRetry(session, nflBoardMessage(entries.map((e) => e.text), today))).content || '';
    let bets = parseBoardBets(answer);
    if (!bets) { answer = (await sendToSessionWithRetry(session, NFL_BOARD_FORMAT_ONLY)).content || ''; bets = parseBoardBets(answer); }
    if (!bets) log.warn('[NFL Board] no readable bets after the format ask; every game on this board is a pass');
    const decided = boardDecisions(entries.map((e) => ({ id: e.c.id, gameId: String(e.c.game_id), home: e.c.home, away: e.c.away })), bets || []);
    const nBets = decided.filter((d) => d.decision === 'bet').length;
    const rows = decided.map((d) => ({ game_date: date, game_id: d.gameId, matchup: `${d.away} @ ${d.home}`, decision: d.decision, side: d.side, why: d.why,
      rank: d.rank, bets: nBets, games: decided.length, model: session.modelName }));
    const { error: e4 } = await client.from('winners_nfl_board').upsert(rows, { onConflict: 'game_id', ignoreDuplicates: true });
    if (e4) throw e4;
    log.log(`🏈 NFL BOARD ${date}: ${decided.length} game(s), ${nBets} bet(s)${nBets ? ` — ${decided.filter((d) => d.decision === 'bet').sort((a, b) => a.rank - b.rank).map((d) => d.side).join(', ')}` : ''} (${session.modelName})`);
    return `boarded ${decided.length}, bet ${nBets}`;
  } catch (e) {
    log.warn(`[NFL Board] ${date}: ${e?.message || e}; next loop retries`);
    return 'failed';
  } finally {
    running = false;
  }
}

export { etDate };
