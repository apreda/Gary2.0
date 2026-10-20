/**
 * THE NBA PROPS DESK (Oct 19 2026, for the Oct 20 opener; founder: "picks page is just for people wanting picks for
 * each game with 2 props"). The NFL props desk's shape: the game as the game pick read it, Gary's published side as
 * data, the props people bet for each team's main players, each player's own recent games, and the question. No
 * formula, no projection, no hit rates.
 *
 * The menu: points, rebounds, assists, threes and points + rebounds + assists, the main over/under line of each.
 * A player is on it when the books price him as a main player (a points line of 12.5 or more, rebounds 7.5 or
 * more, or assists 5.5 or more); his other markets come with him when they're lines people bet (MARKET_FLOOR).
 *
 * The sheets: this season's games once he has three; before that, last season's, labeled as last season (opening
 * week has no current games at all). Every row is a game he played, newest first.
 */
import { createHash } from 'crypto';
import { ballDontLieService } from '../../providers/ballDontLieService.js';
import { buildScoutReport } from '../agentic/scoutReport/scoutReportBuilder.js';
import { normalizePropBetDirection } from '../agentic/propsSharedUtils.js';
import { RATIONALE_WRITING_RULE } from '../../content/copy/writingRules.js';
import { nbaSeason } from '../../../utils/dateUtils.js';
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

export const NBA_PROPS_ASK = `Read this game the way you would before putting your own money on a player prop: how it's likely to be played, who has the ball and the minutes, and what in this matchup decides each player's night. A prop's line is the number; you aren't setting one of your own. Then take the two props from THE PROP BOARD you would bet, over or under.

For each card, give the line and the offered odds, the reason in this game, and what beats it. Reasons are in words: no hit rates, percentages or probabilities.

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

/** Gary's published side on this game (daily_picks, the one row for the date), as data. */
async function publishedCall(game) {
  if (!CALL_URL || !CALL_KEY || !game?.commence_time) return null;
  try {
    const url = `${CALL_URL}/rest/v1/daily_picks?date=eq.${etDate(game.commence_time)}&select=picks&limit=1`;
    const resp = await fetch(url, { headers: { apikey: CALL_KEY, Authorization: `Bearer ${CALL_KEY}` }, signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const raw = (await resp.json())?.[0]?.picks;
    const picks = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    const id = String(game.bdl_game_id ?? game.id ?? '');
    const p = picks.find((x) => (String(x?.league || x?.sport || '').toUpperCase().includes('NBA') || /basketball_nba/.test(String(x?.sport || '')))
      && (String(x?.bdl_game_id ?? x?.game_id ?? '') === id || (norm(x?.homeTeam) === norm(game.home_team) && norm(x?.awayTeam) === norm(game.away_team))));
    return p?.pick ? { pick: p.pick, rationale: p.rationale || '' } : null;
  } catch { return null; }
}

const n1 = (v) => (v == null ? '–' : Number.isInteger(v) ? String(v) : v.toFixed(1));
const avg = (games, f) => { const xs = games.map((g) => g[f]).filter((v) => v != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };

/** One player's sheet: his menu markets, then his games for exactly the stats they settle on. */
async function playerSheet(player, markets, asOf) {
  const season = nbaSeason(asOf);
  const [cur, prev] = await Promise.all([
    ballDontLieService.getNbaPlayerGameLogs(player.player_id, 100, {}, { season, asOf }).catch(() => null),
    ballDontLieService.getNbaPlayerGameLogs(player.player_id, 100, {}, { season: season - 1, asOf }).catch(() => null),
  ]);
  const thisSeason = cur?.games || [];
  const useCurrent = thisSeason.length >= 3;
  const games = useCurrent ? thisSeason : (prev?.games || []);
  const label = useCurrent ? 'this season' : `last season (${season - 1}-${String(season).slice(2)})`;
  const fields = [...new Set(['min', ...markets.map((m) => NBA_PROP_STAT[norm(m.prop_type)])])];
  const name = (f) => ({ min: 'min', pts: 'pts', reb: 'reb', ast: 'ast', fg3m: '3PM', pra: 'PRA' }[f]);
  const lines = [`${player.player} (${player.team}) — ${markets.map((m) => `${MARKET_WORDS[norm(m.prop_type)]} ${m.line}`).join(' · ')}`];
  if (!useCurrent && thisSeason.length) lines.push(`  This season so far (${thisSeason.length} game${thisSeason.length === 1 ? '' : 's'}): ${thisSeason.map((g) => `${g.isHome ? 'vs' : '@'} ${g.opponent || '?'} ${fields.map((f) => `${n1(g[f])} ${name(f)}`).join(', ')}`).join(' | ')}`);
  if (!games.length) { lines.push(`  No games on file for ${label}.`); return lines.join('\n'); }
  lines.push(`  ${label[0].toUpperCase()}${label.slice(1)}, ${games.length} games: ${fields.map((f) => `${n1(avg(games, f))} ${name(f)}`).join(', ')} a game`);
  lines.push(`  Last ${Math.min(10, games.length)} of them, newest first:`);
  for (const f of fields.filter((x) => x !== 'min')) lines.push(`    ${name(f)}: ${games.slice(0, 10).map((g) => n1(g[f])).join(', ')}`);
  lines.push(`    min: ${games.slice(0, 10).map((g) => n1(g.min)).join(', ')}`);
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
  const deskText = givenDesk || (!nocache && await publishedDesk(game)) || await (async () => {
    const scout = await buildScoutReport(game, 'basketball_nba', { nocache });
    return scout?.garyText || scout?.text || '';
  })();
  if (!deskText) throw new Error('NBA props desk: scout report rendered empty');
  console.log(`   [NBA Props] desk ${deskText.length} chars · board ${board.players.size} players, ${boardMarkets.length} markets`);

  await snapshotPropMenu({ markets: boardMarkets, matchup, gameId: game.bdl_game_id ?? game.id, gameDate: etDate(game.commence_time), league: 'NBA' });

  const byPlayer = new Map();
  for (const m of boardMarkets) {
    const k = norm(m.player);
    if (!byPlayer.has(k)) byPlayer.set(k, { player: m.player, team: m.team, player_id: m.player_id ?? m.playerId, markets: [] });
    byPlayer.get(k).markets.push(m);
  }
  const asOf = new Date(game.commence_time);
  const sheets = (await Promise.all([...byPlayer.values()].map((p) => playerSheet(p, p.markets, asOf).catch(() => null)))).filter(Boolean);
  const sheetsBlock = sheets.length ? `\n\n═══ THE PLAYERS — each one's own games, for the stats his markets settle on ═══\n${sheets.join('\n\n')}` : '';

  const call = await publishedCall(game);
  const gameCall = call ? `\n\n═══ GARY'S GAME CALL — this game, already published ═══\n${call.pick}\n\n${call.rationale}` : '';

  const userMessage = `## THE DESK — ${matchup}\n\n${deskText}${gameCall}\n\n${board.text}${sheetsBlock}\n\n${NBA_PROPS_ASK}`;
  const winnersEvidence = { deskText: `${deskText}${gameCall}\n${board.text}${sheetsBlock}`, observedAt: new Date().toISOString(), homeTeam, awayTeam };

  const { parsed, audits, usage, explicitPass, respondingModel } = await runPropsDeskBrain({
    systemPrompt: buildGaryPropsSystemPrompt(todayLong()),
    userMessage,
    corpus: [{ content: `${deskText}${gameCall}\n${board.text}${sheetsBlock}` }],
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
