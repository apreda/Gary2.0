/**
 * THE NBA PROPS DESK (Oct 19 2026, for the Oct 20 opener; founder: "picks page is just for people wanting picks for
 * each game with 2 props"). The NFL props desk's shape: the game as the game pick reads it (nbaRead.js, from Oct 22)
 * with the day's news, the props people bet for each team's main players, each
 * player's own recent games, and the question. No formula, no projection, no hit rates.
 *
 * The menu: points, rebounds, assists, threes and points + rebounds + assists, the main over/under line of each.
 * A player is on it when the books price him as a main player (a points line of 12.5 or more, rebounds 7.5 or
 * more, or assists 5.5 or more); his other markets come with him when they're lines people bet (MARKET_FLOOR).
 *
 * The sheets: this season's games only, every row a game he played, newest first (founder, Oct 23 2026: no last
 * season, ever; opening week's last-season sheets read "cleared 8.5 in 8 of 10" and the props they carried were sized
 * $550-600 on Winners). A player with no games yet this season says so.
 */
import { createHash } from 'crypto';
import { ballDontLieService } from '../../providers/ballDontLieService.js';
import { buildScoutReport } from '../agentic/scoutReport/scoutReportBuilder.js';
import { normalizePropBetDirection } from '../agentic/propsSharedUtils.js';
import { RATIONALE_WRITING_RULE } from '../../content/copy/writingRules.js';
import { nbaSeason } from '../../../utils/dateUtils.js';
import { buildNbaReadStory } from '../agentic/orchestrator/nbaRead.js';
import { teamRecords, seasonSummaries } from '../../gamebygame/gameRecordStore.js';
import { nbaGameRows } from '../darts/nbaDartsBoard.js';
import { summariesByTeam } from '../../sports/nba/nbaGameRecordText.js';
import {
  buildGaryPropsSystemPrompt,
  buildPropBoardV2,
  runPropsDeskBrain,
  snapshotPropMenu,
  todayLong,
} from './propsBrain.js';

const norm = (s) => String(s || '').toLowerCase().trim();

/** The markets on the NBA menu, by BDL prop type, with the game-log field each settles on. */
export const NBA_PROP_STAT = Object.freeze({
  points: 'pts', rebounds: 'reb', assists: 'ast', threes: 'fg3m', points_rebounds_assists: 'pra',
});
const MARKET_WORDS = { points: 'points', rebounds: 'rebounds', assists: 'assists', threes: 'threes made', points_rebounds_assists: 'points + rebounds + assists' };
const MAIN_LINE = { points: 12.5, rebounds: 7.5, assists: 5.5 };
// Each market is also a line people bet on its own: a rebounding center's 6.5 points is off the board (the first
// test took Mitchell Robinson under 6.5 points), his rebounds stay.
const MARKET_FLOOR = { points: 10.5, rebounds: 4.5, assists: 3.5, threes: 1.5, points_rebounds_assists: 15.5 };

/** The main over/under lines of the menu's markets for each team's main players. */
export function nbaMenu(markets, { homeTeam, awayTeam } = {}) {
  const teams = new Set([norm(homeTeam), norm(awayTeam)]);
  const twoSided = (markets || []).filter((m) => NBA_PROP_STAT[norm(m?.prop_type)] && m.line != null
    && m.over_odds != null && m.under_odds != null && (!homeTeam || teams.has(norm(m.team))));
  const main = new Set(twoSided.filter((m) => MAIN_LINE[norm(m.prop_type)] != null && Number(m.line) >= MAIN_LINE[norm(m.prop_type)])
    .map((m) => norm(m.player)));
  return twoSided.filter((m) => main.has(norm(m.player)) && Number(m.line) >= MARKET_FLOOR[norm(m.prop_type)]);
}

// Oct 27 2026 (founder GO, as the game picks' question went on Oct 25): one question. The walk-through of how to read
// the game, "a prop's line is the number; you aren't setting one of your own" (the deferral the game picks lost on
// Oct 23) and the "what beats it" case went; the line, the odds and the reason stay for the card.
export const NBA_PROPS_ASK = `Which two props from THE PROP BOARD would you bet, over or under, and why?

For each card, give the line, the offered odds and your reason. Reasons are in words: no hit rates, percentages or probabilities.

Output:

\`\`\`json
{ "picks": [ { "player": "[full name]", "team": "[team]", "prop_type": "[key from the board]", "line": 1.5, "bet": "over", "odds": "[exact odds]", "confidence_score": 0.XX, "rationale": "Gary's Take\\n\\n[the prose]" } ] }
\`\`\`

bet is "over" or "under".
confidence_score (0.50–1.00): your conviction in this bet at its price — the bet, not the outcome.

${RATIONALE_WRITING_RULE}`;

export const NBA_PROPS_PROMPT_SHA = createHash('sha256')
  .update(buildGaryPropsSystemPrompt('{date}') + NBA_PROPS_ASK + nbaMenu.toString() + JSON.stringify([MAIN_LINE, MARKET_FLOOR]))
  .digest('hex').slice(0, 12);

const CALL_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const CALL_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const etDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** The desk the game pick stored for this game (pick_desks, one row), when it is from today's slate. */
async function publishedDesk(game) {
  if (!CALL_URL || !CALL_KEY || !game?.commence_time) return null;
  try {
    const url = `${CALL_URL}/rest/v1/pick_desks?game_date=eq.${etDate(game.commence_time)}&matchup=eq.${encodeURIComponent(`${game.away_team} @ ${game.home_team}`)}&select=desk,created_at&limit=1`;
    const resp = await fetch(url, { headers: { apikey: CALL_KEY, Authorization: `Bearer ${CALL_KEY}` }, signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const row = (await resp.json())?.[0];
    if (!row?.desk || Date.now() - Date.parse(row.created_at) > 12 * 60 * 60 * 1000) return null;
    return row.desk;
  } catch { return null; }
}


/** One player's sheet: his menu markets, then his team's games newest first, each with the stats they settle on.
 * The game rows are the darts board's (nbaGameRows), from the stored game records in the official box's counts: the
 * date, the opponent, the score with overtime, started or off the bench, his minutes and stats, the regulars his team was
 * without, or the game he missed and why (Oct 29 2026, founder: no season averages, "give Gary the numbers behind the
 * average"; the sheet read "This season, 4 games: 26.8 min, 11.3 pts a game" over bare numbers with no dates). */
const SHEET_GAMES = 10;
// The season's stored summaries once a day, for each row's opponent who was out (round 16).
const summariesOnce = new Map();
const byTeamOn = (season, day) => { const k = `${season}|${day}`; if (!summariesOnce.has(k)) summariesOnce.set(k, seasonSummaries('NBA', season, day).then(summariesByTeam).catch(() => { summariesOnce.delete(k); return null; })); return summariesOnce.get(k); };
export async function playerSheet(player, markets, asOf) {
  const season = nbaSeason(asOf);
  const fields = [...new Set(markets.map((m) => NBA_PROP_STAT[norm(m.prop_type)]).filter(Boolean))];
  const lines = [`${player.player} (${player.team}) — ${markets.map((m) => `${MARKET_WORDS[norm(m.prop_type)]} ${m.line}`).join(' · ')}`];
  const teams = (await ballDontLieService.getTeams('basketball_nba').catch(() => [])) || [];
  const team = teams.find((t) => t.full_name === player.team) || teams.find((t) => norm(t.full_name) === norm(player.team));
  const today = new Date(asOf).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const records = team ? await teamRecords('NBA', season, team.id, today, 100).catch(() => null) : null;
  if (!records) { lines.push("  This season's games are not on file (the game records did not load)."); return lines.join('\n'); }
  const rows = nbaGameRows({ teamId: String(team.id), playerId: player.player_id, player: player.player }, records, fields,
    new Map(teams.map((t) => [String(t.id), t.abbreviation])), null, await byTeamOn(season, today));
  if (!rows.length) { lines.push('  His team has not played yet this season.'); return lines.join('\n'); }
  lines.push(`  His team's games${rows.length > SHEET_GAMES ? `, the last ${SHEET_GAMES} of ${rows.length}` : ''}, newest first:`, ...rows.slice(0, SHEET_GAMES).map((r) => `    ${r}`));
  return lines.join('\n');
}

/**
 * The NBA props brain, in the props CLI's mapping shape ({ picks, explicitPass, validatedPlayers, boardProps,
 * winnersEvidence }); the CLI's gates, odds reconciliation and storage are shared with MLB and NFL.
 */
export async function analyzeNbaPropsDesk(game, playerProps, { nocache = false, deskText: givenDesk = null } = {}) {
  const homeTeam = game.home_team, awayTeam = game.away_team;
  const matchup = `${awayTeam} @ ${homeTeam}`;
  const menu = nbaMenu(playerProps, { homeTeam, awayTeam });
  if (!menu.length) throw new Error('NBA props board has no main player with a priced over/under market');

  const board = buildPropBoardV2(menu, { headerLabel: `today's live prop prices`, excludedNote: '' });
  if (!board.players.size) throw new Error('NBA props board rendered empty');
  const boardMarkets = board.markets || menu;

  // givenDesk: a test's stand-in when the game's desk can't be built yet (the night before, lineups don't exist).
  const scoutText = givenDesk || (!nocache && await publishedDesk(game)) || await (async () => {
    const scout = await buildScoutReport(game, 'basketball_nba', { nocache });
    return scout?.garyText || scout?.text || '';
  })();
  if (!scoutText) throw new Error('NBA props desk: scout report rendered empty');
  // The game as the side pick reads it (nbaRead.js, Oct 22 2026), built from the same desk, with the day's news. No
  // fallback to the full desk, which carries what the story filters out (founder, Oct 23 2026: no fallback that gives
  // different data); a story that fails fails the props run, and the scheduler's next window tries again.
  const read = await buildNbaReadStory(scoutText, { homeTeam, awayTeam });
  const deskText = `${read.story}${read.news ? `\n\nTODAY'S NEWS\n${read.news}` : ''}`;
  console.log(`   [NBA Props] desk ${deskText.length} chars · board ${board.players.size} players, ${boardMarkets.length} markets`);

  await snapshotPropMenu({ markets: boardMarkets, matchup, gameId: game.bdl_game_id ?? game.id, gameDate: etDate(game.commence_time), league: 'NBA' });

  const byPlayer = new Map();
  for (const m of boardMarkets) {
    const k = norm(m.player);
    if (!byPlayer.has(k)) byPlayer.set(k, { player: m.player, team: m.team, player_id: m.player_id ?? m.playerId, markets: [] });
    byPlayer.get(k).markets.push(m);
  }
  const asOf = new Date(game.commence_time);
  // A sheet that fails says so under the player's name (Oct 28 2026 sweep: it dropped him from the sheets while his
  // markets stayed on the board).
  const sheets = await Promise.all([...byPlayer.values()].map((p) => playerSheet(p, p.markets, asOf)
    .catch((e) => `${p.player} (${p.team})\n  This season's games are not on file (${e.message}).`)));
  const sheetsBlock = sheets.length ? `\n\n═══ THE PLAYERS — each one's own games, for the stats his markets settle on ═══\n${sheets.join('\n\n')}` : '';

  // Gary's published game pick no longer rides the desk (Oct 27 2026, founder GO; see footballPropsDesk.js).

  const userMessage = `## THE DESK — ${matchup}\n\n${deskText}\n\n${board.text}${sheetsBlock}\n\n${NBA_PROPS_ASK}`;
  const winnersEvidence = { deskText: `${deskText}\n${board.text}${sheetsBlock}`, observedAt: new Date().toISOString(), homeTeam, awayTeam };

  const { parsed, audits, usage, explicitPass, respondingModel } = await runPropsDeskBrain({
    systemPrompt: buildGaryPropsSystemPrompt(todayLong()),
    userMessage,
    corpus: [{ content: `${deskText}\n${board.text}${sheetsBlock}` }],
    recentScores: null,
  });

  const picks = parsed.picks.map((p, i) => ({
    player: p.player,
    team: p.team ?? null,
    prop: String(p.prop_type || '').trim(),
    line: p.line != null ? p.line : null,
    bet: normalizePropBetDirection(p.bet),
    odds: p.odds != null ? String(p.odds) : null,
    confidence: p.confidence_score ?? null,
    rationale: p.rationale,
    prompt_sha: NBA_PROPS_PROMPT_SHA,
    model: respondingModel,
    lane: 'CORE',
    _statAuditWarnings: audits[i]?.warnings ?? null,
  }));

  return {
    picks,
    explicitPass,
    validatedPlayers: new Set([...byPlayer.keys()]),
    boardProps: boardMarkets,
    winnersEvidence,
    _usage: usage,
  };
}
