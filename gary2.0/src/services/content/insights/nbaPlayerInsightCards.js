// NBA Player Insight Cards (Oct 19 2026, for the Oct 20 opener): the same PlayerInsightPack payload the MLB and NFL
// builders ship, so a tap on an NBA name anywhere in the app opens the one player card. Before this the card job ran
// NBA and built nothing, and every NBA name read NO CARD.
//
// Who: each game's players the books price as rotation players (an over/under points line of 6.5 or more, rebounds
// 4.5 or assists 3.5), the people the Picks page, Darts and Winners name.
// Sections, every one a real feed value:
//   * season line — per-game points, rebounds, assists, threes and minutes over the window
//   * formRows    — the last five games, newest first
//   * splits      — home and road points a game, and the injury report's status
//   * props       — tonight's main lines, with how many of the window's games went over
//   * log         — the last 20 games' points, rebounds, assists, threes and PRA for the HIT RATES ruler
// The window is this season once a player has three games, last season before that, labeled as last season.
// Never throws; a missing source drops its section, a player with no games is skipped.

import { safeCall as safeCallShared } from './shared.js';
import { nbaSeason } from '../../../utils/dateUtils.js';
import { propMarketLine } from '../../gary/propMarketLine.js';

const safeCall = (fn, fallback) => safeCallShared(fn, fallback, 'nbaPlayerCards');
const KEEP = 20;
const ROTATION = { points: 6.5, rebounds: 4.5, assists: 3.5 };
const PROP_LABEL = { points: 'POINTS', rebounds: 'REBOUNDS', assists: 'ASSISTS', threes: 'THREES', points_rebounds_assists: 'PTS+REB+AST' };
const PROP_STAT = { points: 'pts', rebounds: 'reb', assists: 'ast', threes: 'fg3m', points_rebounds_assists: 'pra' };

const finite = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const one = (v) => (v == null ? null : Math.round(v * 10) / 10);
const avg = (games, f) => { const xs = games.map((g) => finite(g[f])).filter((v) => v != null); return xs.length ? one(xs.reduce((a, b) => a + b, 0) / xs.length) : null; };
const odds = (v) => { const n = finite(v); return n == null ? null : n > 0 ? `+${n}` : String(n); };
const seasonName = (s) => `${s}-${String(s + 1).slice(2)}`;

function seasonLine(games, label) {
  const pts = avg(games, 'pts'), reb = avg(games, 'reb'), ast = avg(games, 'ast'), threes = avg(games, 'fg3m'), min = avg(games, 'min');
  const line1 = [pts != null && `${pts} pts`, reb != null && `${reb} reb`, ast != null && `${ast} ast`].filter(Boolean).join(' · ');
  if (!line1) return null;
  const line2 = [threes != null && `${threes} 3PM`, min != null && `${min} min`, `${games.length} games`].filter(Boolean).join(' · ');
  return { line1, line2: `${line2} — ${label}` };
}

function formRows(games, label) {
  const last = games.slice(0, 5);
  if (!last.length) return null;
  const rows = [{ label: `LAST ${last.length}${label ? ` · ${label.toUpperCase()}` : ''}`, value: `${avg(last, 'pts')} pts/g`, detail: null }];
  for (const g of last) {
    rows.push({ label: `${g.isHome ? 'vs' : 'at'} ${g.opponent || '—'}`,
      value: `${g.pts ?? 0} pts, ${g.reb ?? 0} reb, ${g.ast ?? 0} ast, ${g.fg3m ?? 0} 3PM`, detail: g.min != null ? `${Math.round(g.min)} min` : null });
  }
  return rows;
}

function splits(games, injury) {
  const rows = [];
  for (const [label, home] of [['HOME', true], ['ROAD', false]]) {
    const side = games.filter((g) => g.isHome === home);
    if (side.length) rows.push({ label, value: `${avg(side, 'pts')} pts/g`, detail: `${side.length} game${side.length === 1 ? '' : 's'}` });
  }
  if (injury) rows.push({ label: 'STATUS', value: injury.status || null, detail: injury.detail || null });
  return rows.length ? rows : null;
}

function props(markets, games) {
  const out = [];
  for (const type of Object.keys(PROP_LABEL)) {
    const m = markets.find((x) => x.prop_type === type);
    if (!m) continue;
    const line = finite(m.line);
    const vals = games.slice(0, KEEP).map((g) => finite(g[PROP_STAT[type]])).filter((v) => v != null);
    out.push({ label: PROP_LABEL[type], line: String(line), odds: odds(m.over_odds),
      rate: vals.length ? `${vals.filter((v) => v > line).length}/${vals.length}` : null });
    if (out.length >= 4) break;
  }
  return out.length ? out : null;
}

function gameLog(games) {
  const last = games.slice(0, KEEP).reverse();   // oldest first, as the NFL and MLB logs
  if (!last.length) return null;
  const s = {};
  for (const key of ['pts', 'reb', 'ast', 'fg3m', 'pra']) s[key] = last.map((g) => finite(g[key]) ?? 0);
  return { n: last.length, d: last.map((g) => String(g.date || '').slice(0, 10)), o: last.map((g) => g.opponent || ''), s };
}

/** The main over/under line of each market, per player, from BDL's raw prop rows. */
export function mainLines(rows) {
  const by = new Map();
  for (const r of rows || []) {
    if (r?.market?.type !== 'over_under' || !PROP_LABEL[r.prop_type]) continue;
    const over = finite(r.market.over_odds), under = finite(r.market.under_odds), line = (() => { try { return finite(propMarketLine(r)); } catch { return null; } })();
    if (over == null || under == null || line == null) continue;
    const key = `${r.player_id}|${r.prop_type}`;
    const juice = Math.abs(over) + Math.abs(under);
    const cur = by.get(key);
    // The main line is the one priced closest to even on both sides.
    if (!cur || Math.abs(over - under) < Math.abs(cur.over_odds - cur.under_odds) || (Math.abs(over - under) === Math.abs(cur.over_odds - cur.under_odds) && juice < cur.juice)) {
      by.set(key, { player_id: r.player_id, prop_type: r.prop_type, line, over_odds: over, under_odds: under, juice });
    }
  }
  return [...by.values()];
}

async function buildGamePacks({ date, game, bdl, season, injuries, abbrById }) {
  const home = game.home_team, away = game.visitor_team ?? game.away_team;
  if (!home?.id || !away?.id) return [];
  const label = `${away.abbreviation} @ ${home.abbreviation}`;
  const raw = await safeCall(() => bdl.getNbaPlayerProps(game.id), []);
  const lines = mainLines(raw);
  const rotation = [...new Set(lines.filter((m) => ROTATION[m.prop_type] != null && m.line >= ROTATION[m.prop_type]).map((m) => m.player_id))];
  if (!rotation.length) return [];
  const people = await safeCall(() => bdl.getNbaPlayersByIds(rotation), {});
  const packs = [];
  for (const pid of rotation) {
    const who = people?.[pid];
    if (!who?.name) continue;
    const side = [home, away].find((t) => t.full_name === who.team);
    if (!side) continue;
    const opponent = side === home ? away : home;
    const asOf = new Date(game.datetime || `${date}T23:00:00Z`);
    const [cur, prev] = await Promise.all([
      safeCall(() => bdl.getNbaPlayerGameLogs(pid, 100, {}, { season, asOf }), null),
      safeCall(() => bdl.getNbaPlayerGameLogs(pid, 100, {}, { season: season - 1, asOf }), null),
    ]);
    const thisSeason = cur?.games || [];
    const useCurrent = thisSeason.length >= 3;
    const games = (useCurrent ? thisSeason : (prev?.games || [])).map((g) => ({ ...g, opponent: g.opponent || abbrById.get(String(g.opponentId)) || null }));
    if (!games.length) continue;
    const windowLabel = useCurrent ? `${seasonName(season)} season` : `${seasonName(season - 1)} season, last season`;
    const injury = injuries.get(String(pid)) || null;
    packs.push({
      date,
      league: 'NBA',
      player_id: String(pid),
      player_name: who.name,
      team_abbr: side.abbreviation,
      game_id: String(game.id),
      payload: {
        type: 'nba',
        name: who.name,
        team: side.abbreviation,
        position: who.position || null,
        game: label,
        opponent: { name: opponent.full_name, hand: null },
        season: seasonLine(games, windowLabel),
        formRows: formRows(games, useCurrent ? '' : `${seasonName(season - 1)} season`),
        splits: splits(games, injury),
        props: props(lines.filter((m) => m.player_id === pid), games),
        statsSectionTitle: 'THE SHEET',
        ...(() => { const log = gameLog(games); return log ? { log } : {}; })(),
      },
    });
  }
  return packs;
}

/**
 * Build the NBA player insight card packs for a day's slate.
 * @returns {Promise<Array<{date,league,player_id,player_name,team_abbr,game_id,payload}>>}
 */
export async function buildNbaPlayerInsightCards({ date, games, bdl, onGameBuilt } = {}) {
  if (!bdl || !Array.isArray(games) || !games.length) return [];
  const season = nbaSeason(new Date(`${date}T16:00:00Z`));
  const injuryRows = await safeCall(() => bdl.getInjuriesGeneric('basketball_nba', { team_ids: [...new Set(games.flatMap((g) => [g.home_team?.id, (g.visitor_team ?? g.away_team)?.id]).filter((id) => id != null))] }), []);
  const injuries = new Map();
  for (const r of Array.isArray(injuryRows) ? injuryRows : []) {
    const pid = r?.player?.id ?? r?.player_id;
    if (pid != null && !injuries.has(String(pid))) injuries.set(String(pid), { status: String(r?.status || '').trim() || null, detail: String(r?.description || r?.comment || '').trim() || null });
  }
  // The logs carry the opponent's id only: its abbreviation comes from the league's team list.
  const teams = await safeCall(() => bdl.getTeams('basketball_nba'), []);
  const abbrById = new Map((Array.isArray(teams) ? teams : []).map((t) => [String(t.id), t.abbreviation]));
  const packs = [];
  for (const game of games) {
    const gamePacks = await safeCall(() => buildGamePacks({ date, game, bdl, season, injuries, abbrById }), []);
    packs.push(...gamePacks);
    if (gamePacks.length && onGameBuilt) await onGameBuilt(gamePacks, game);
  }
  console.log(`[nbaPlayerCards] NBA ${date}: built ${packs.length} pack(s) across ${games.length} game(s).`);
  return packs;
}

export default { buildNbaPlayerInsightCards };
