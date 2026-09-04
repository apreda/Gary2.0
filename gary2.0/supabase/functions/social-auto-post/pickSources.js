const teamKey = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const away = (pick) => pick.awayTeam ?? pick.away_team;
const home = (pick) => pick.homeTeam ?? pick.home_team;
const gameId = (pick) => pick.bdl_game_id ?? pick.game_id;
const etDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

export const sameStart = (a, b) => Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b);

/** Different provider game IDs never merge; fallback requires an exact start. */
export function sameSourceGame(a, b) {
  if (!a.league || !b.league || a.league.toUpperCase() !== b.league.toUpperCase()) return false;
  const aId = gameId(a), bId = gameId(b);
  if (aId != null && bId != null && String(aId) && String(bId)) return String(aId) === String(bId);
  return Boolean(teamKey(away(a)) && teamKey(home(a))) && teamKey(away(a)) === teamKey(away(b))
    && teamKey(home(a)) === teamKey(home(b)) && sameStart(a.commence_time, b.commence_time);
}

/** Latest active website week, today's ET games only; canonical daily picks win. */
export function mergeSocialPickSources(daily, weekly, today) {
  const picks = daily.filter((pick) => (pick.type ?? 'game') !== 'prop');
  const weekAge = (Date.parse(today) - Date.parse(weekly?.week_start)) / 86400000;
  if (!(weekAge >= 0 && weekAge < 7)) return picks;
  for (const candidate of weekly?.picks ?? []) {
    const pick = { ...candidate, league: candidate.league ?? 'NFL' };
    const start = Date.parse(pick.commence_time);
    if (pick.league.toUpperCase() !== 'NFL' || (pick.type ?? 'game') === 'prop' || !Number.isFinite(start)) continue;
    if (etDay.format(new Date(start)) === today && !picks.some((existing) => sameSourceGame(existing, pick))) picks.push(pick);
  }
  return picks;
}

/** An identical ticket in a different doubleheader game is still unposted. */
export function hasPostedSourcePick(pick, logs) {
  return logs.some((log) => (log.pick_text ?? log.pick) === pick.pick && sameStart(log.commence_time, pick.commence_time));
}

/** Matches the production UNIQUE(post_date,pick_text) constraint; no repost on drift. */
export function hasLoggedTicket(pick, logs) {
  return logs.some((log) => (log.pick_text ?? log.pick) === pick.pick);
}
