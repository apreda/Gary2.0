// A quarterback's recent games for THE QUARTERBACKS section (Nov 9 2026). MLB's
// pitchers reach that section with their last outing, last three starts, starts
// against tonight's opponent and rest; a quarterback had one season line, so the
// write-up had nothing to say about him on his own and set the two lines against
// each other. This gives him the same shape. Only games he threw in count.

const ET_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

function etDay(value) {
  const t = Date.parse(value || '');
  return Number.isFinite(t) ? ET_DAY.format(new Date(t)) : null;
}

function count(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Array<{date, opp, oppId, home, comp, att, yds, td, ints, rushAtt, rushYds, rushTd}>} games
 *   this season's finished games before kickoff, any order
 * @param {{ kickoff?: string, opponentId?: number|string }} options
 */
export function quarterbackRecent(games, { kickoff, opponentId } = {}) {
  const played = (games || [])
    .filter((g) => g && count(g.att) > 0 && etDay(g.date))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  if (!played.length) return null;
  const line = (g) => ({
    date: etDay(g.date), opp: g.opp || null, home: typeof g.home === 'boolean' ? g.home : null,
    comp: count(g.comp), att: count(g.att), yds: count(g.yds), td: count(g.td), ints: count(g.ints),
    rush_att: count(g.rushAtt), rush_yds: count(g.rushYds), rush_td: count(g.rushTd),
  });
  const window = played.slice(0, 3).map(line);
  const last3 = window.length >= 2
    ? window.reduce((t, g) => {
      for (const k of ['comp', 'att', 'yds', 'td', 'ints', 'rush_att', 'rush_yds', 'rush_td']) t[k] += g[k];
      return t;
    }, { games: window.length, comp: 0, att: 0, yds: 0, td: 0, ints: 0, rush_att: 0, rush_yds: 0, rush_td: 0 })
    : null;
  const vsOpp = opponentId == null ? [] : played.filter((g) => g.oppId != null && String(g.oppId) === String(opponentId)).map(line);
  const lastDay = etDay(played[0].date);
  const gameDay = etDay(kickoff);
  const days = lastDay && gameDay ? Math.round((Date.parse(gameDay) - Date.parse(lastDay)) / 86_400_000) : null;
  return { last: line(played[0]), last3, vs_opp: vsOpp.length ? vsOpp : null, days_since_last: days };
}

export default { quarterbackRecent };
