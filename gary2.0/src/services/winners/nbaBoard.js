// GARY'S NBA BOARD (Oct 19 2026, from Oct 21; founder: "winners picks are Gary's real bets while picks page is just for
// people wanting picks for each game with 2 props"). Gary picks every NBA game for the Picks page; that is his lean.
// His bets are a separate look: about 50 minutes before the first tip he hasn't boarded (the picks run 90 minutes out),
// he sees every picked game still to tip, fresh, without his write-ups: the line, who's out, the lineups, rest, the
// last game, the season series. He names the games he would put his own money on, in his order, any number or none.
// Saved per game (winners_nba_board); SQL seat_nba_board seats a bet whose pick is on the same side, his top five a
// day, 28 minutes before tip, after the late-news check. Oct 20 is opening night (every NBA pick goes on Winners).
import { createModelSession, sendToSessionWithRetry } from '../gary/agentic/orchestrator/sessionManager.js';
import { GAME_PICK_MODEL } from '../gary/agentic/orchestrator/orchestratorConfig.js';
import { parseBoardBets, boardDecisions } from './nflBoard.js';

export const NBA_BOARD_LEAD_MS = 50 * 60_000;   // board the next tips this long before the first one
const LAST_CALL_MS = 15 * 60_000;               // a game this close to tip is past boarding
const FIRST_BOARD_DATE = '2026-10-21';
let running = false;

// The desk's facts for the board, never its write-ups: the sections a bettor scans before he bets.
const KEEP = [/^INJURY REPORT/, /^STARTING LINEUPS/, /^BEFORE THE FIRST GAME/, /^REST & SCHEDULE/, /^LAST GAME/, /^HEAD-TO-HEAD/, /^BETTING CONTEXT/,
  /TEAM (STATS|NUMBERS|PROFILE)/, /SEASON (STATS|NUMBERS)/, /EFFICIENCY/];
const SKIP = [/AS WRITTEN/, /^CURRENT STATE/];
const RULE = /^━{8,}/;

/** The desk cut to its fact sections, each capped, the odds dump left out. */
export function nbaBoardFacts(desk) {
  const lines = String(desk || '').split('\n');
  const out = [];
  let cur = null;
  const flush = () => { if (cur && cur.body.length) out.push(`${cur.head}\n${cur.body.join('\n').trim().slice(0, 1600)}`); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (RULE.test(line)) continue;
    if (/^[A-Z][A-Z0-9 '’&/:,()—+.-]{5,}$/.test(line.trim()) && (RULE.test(lines[i + 1] || '') || RULE.test(lines[i - 1] || ''))) {
      flush();
      const head = line.trim();
      cur = KEEP.some((r) => r.test(head)) && !SKIP.some((r) => r.test(head)) ? { head, body: [] } : null;
      continue;
    }
    if (!cur) continue;
    if (/^RAW ODDS VALUES/.test(line.trim())) { flush(); cur = null; continue; }
    cur.body.push(line);
  }
  flush();
  return out.join('\n\n');
}

export const nbaBoardSystemPrompt = (today) => `You are Gary. You read NBA games the way a sharp bettor does before putting money down.

What a spread is:
- The spread holds everything public: who's playing, how both teams have played, rest, travel and the day's news. Take it as the number; you aren't out to show it's wrong or to set one of your own.
- Every spread has two sides, and in a given game one of them is the better side to be on at that number. That isn't the same as the better team or the healthier roster.
- A factor counts by what it does to this game at this number: what the favorite has to do to cover it, and what the underdog has to do.

Today is ${today}. The board is current on rosters, injuries and every number; your memory of those may be out of date. Only mention players the board names, and never write a number that isn't on the board.`;

export const nbaBoardMessage = (entries, today) => `## TODAY'S NBA BOARD — ${today}

${entries.join('\n\n')}

You'll give your lean on every one of these games for the Picks page; that's separate. This is your betting card: which of these games would you actually put your own money on, and on which side? A lean isn't a bet. Bet only the games you'd really back with your own money: any number of them, including none.

For each game you'd bet, say why in a sentence or two. Then end with this JSON block, listing the games you'd bet from the one you like most:
\`\`\`json
{"bets": [{"game": "Away Team at Home Team", "side": "the team you're backing", "why": "one sentence"}]}
\`\`\``;

const FORMAT_ONLY = 'Your answer did not end with the JSON block. Add it now, the same bets in the same order: {"bets": [{"game": "Away Team at Home Team", "side": "the team you\'re backing", "why": "one sentence"}]}, or {"bets": []} if you would bet none.';

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
    const open = cands.filter((c) => !done.has(String(c.game_id)) && Date.parse(c.commence_time) > now.getTime() + LAST_CALL_MS && c.home && c.away);
    const games = [...new Map(open.map((c) => [String(c.game_id), c])).values()];
    if (!games.length) return 'nothing_open';
    const first = Math.min(...games.map((c) => Date.parse(c.commence_time)));
    if (first > now.getTime() + NBA_BOARD_LEAD_MS) return 'waiting';

    const entries = [];
    for (const c of games.sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))) {
      const { data: ev, error: e3 } = await client.from('winners_candidates').select('desk:evidence_snapshot->>deskText').eq('id', c.id).single();
      if (e3 || !ev?.desk) { log.warn(`[NBA Board] ${c.away} @ ${c.home}: no desk on the candidate; left off the board`); continue; }
      const tip = new Date(c.commence_time).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });
      entries.push({ c, text: `### ${c.away} at ${c.home} · ${tip} ET\n${nbaBoardFacts(ev.desk)}` });
    }
    if (!entries.length) return 'no_desks';

    const today = new Date(`${date}T16:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const session = await createModelSession({ modelName: GAME_PICK_MODEL, systemPrompt: nbaBoardSystemPrompt(today), tools: null, browse: false, thinkingLevel: process.env.GARY_BRAIN_EFFORT || 'xhigh', enableCache: true });
    let answer = (await sendToSessionWithRetry(session, nbaBoardMessage(entries.map((e) => e.text), today))).content || '';
    let bets = parseBoardBets(answer);
    if (!bets) { answer = (await sendToSessionWithRetry(session, FORMAT_ONLY)).content || ''; bets = parseBoardBets(answer); }
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
