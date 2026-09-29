/**
 * MLB POSTSEASON, AS FACTS (founder GO, Sep 29 2026 — the playoffs start and
 * Gary's desk never said so). Tonight's round, the game number, the series
 * length and the series score, from the MLB Stats API: the baseball port of
 * the NBA desk's playoff context. Facts only; nothing here says what any of
 * it means for the bet. Fail-soft: a regular-season game or a missing feed
 * prints nothing.
 */
import { clubMatches } from './mlbSeriesState.js';

const STATSAPI = 'https://statsapi.mlb.com/api/v1';
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

/** Every postseason game of the season (Wild Card, Division, LCS, World Series). */
async function postseasonGames(season) {
  const hit = cache.get(season);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.games;
  const res = await fetch(`${STATSAPI}/schedule?sportId=1&season=${season}&gameType=F,D,L,W&hydrate=team`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`statsapi postseason ${res.status}`);
  const json = await res.json();
  const byPk = new Map();
  for (const d of json?.dates || []) for (const g of d?.games || []) byPk.set(g.gamePk, g);
  const games = [...byPk.values()];
  cache.set(season, { at: Date.now(), games });
  return games;
}

/** An MLBAM id match, or the whole club name (callers may hold a BDL id). */
function isClub(team, id, name) {
  if (id != null && team?.id != null && String(team.id) === String(id)) return true;
  return clubMatches(team?.name, name);
}

function isPair(g, home, away) {
  const h = g?.teams?.home?.team;
  const a = g?.teams?.away?.team;
  return (isClub(h, home.id, home.name) && isClub(a, away.id, away.name))
    || (isClub(h, away.id, away.name) && isClub(a, home.id, home.name));
}

/**
 * The desk's postseason line for tonight's game, or null outside the
 * postseason. `home`/`away` are { id: MLBAM team id, name: the desk's label }.
 */
export async function mlbPostseasonLine({ home, away, dateEt }) {
  try {
    if (!dateEt || !home?.name || !away?.name) return null;
    const games = await postseasonGames(Number(dateEt.slice(0, 4)));
    const tonight = games.find((g) => g.officialDate === dateEt && isPair(g, home, away));
    if (!tonight) return null;
    const round = tonight.seriesDescription || 'Postseason';
    const total = Number(tonight.gamesInSeries) || null;
    const need = total ? Math.ceil(total / 2) : null;
    const played = games.filter((g) => g.seriesDescription === tonight.seriesDescription
      && isPair(g, home, away) && g.officialDate < dateEt && g.status?.abstractGameState === 'Final');
    let homeWins = 0;
    let awayWins = 0;
    for (const g of played) {
      const hs = Number(g.teams?.home?.score);
      const as = Number(g.teams?.away?.score);
      if (!Number.isFinite(hs) || !Number.isFinite(as) || hs === as) continue;
      const winner = hs > as ? g.teams.home.team : g.teams.away.team;
      if (isClub(winner, home.id, home.name)) homeWins++; else awayWins++;
    }
    const gameNumber = Number(tonight.seriesGameNumber) || played.length + 1;
    const head = `Postseason: ${round}, Game ${gameNumber}${total ? ` of ${total}` : ''}${need ? ` (first to ${need} wins)` : ''}.`;
    const score = homeWins === awayWins
      ? `Series tied ${homeWins}-${awayWins}.`
      : homeWins > awayWins
        ? `${home.name} lead the series ${homeWins}-${awayWins}.`
        : `${away.name} lead the series ${awayWins}-${homeWins}.`;
    const out = [head, score];
    if (need) {
      const onBrink = [];
      if (need - awayWins === 1 && awayWins > 0) onBrink.push(home.name);
      if (need - homeWins === 1 && homeWins > 0) onBrink.push(away.name);
      for (const club of onBrink) out.push(`${club} are eliminated with a loss.`);
    }
    return out.join(' ');
  } catch {
    return null;
  }
}
