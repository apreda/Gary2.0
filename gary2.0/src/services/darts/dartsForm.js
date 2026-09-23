// A dart's form: the facts the Darts page draws beside the price, stored on
// the dart once so the page never computes them. Filled after the throw for
// every dart still missing it.
//
//   MLB player darts  { of, ok: [bool] }   his last 10 finals (not spring),
//                     oldest first: homered (hr), or had 2+ hits (multihit).
//   MLB first inning  { away, home, of }   games each club scored in the 1st,
//                     of its last 10 (the morning board's run profile).
//   NFL player darts  { now: { g, ok, v }, last: { g, total }, unit }   this
//                     season game by game beside last season's total (a one
//                     or two game rate is a count, never who a player is).
import { ballDontLieService as bdl } from '../ballDontLieService.js';
import { RELEASE_BASE, TEAM_NAMES, fetchCsv } from '../nflStreaksService.js';
import { normName, clubShort } from './dartsCommon.js';

const n = (v) => Number(v || 0);

async function mlbPlayerForm(dart, season) {
  const [rows, index] = await Promise.all([
    bdl.getMlbGameStats({ playerIds: [Number(dart.player_id)], seasons: [season] }),
    bdl.getMlbSeasonGameIndex(season),
  ]);
  const games = rows
    .map((r) => ({ r, g: index.get(r.game_id) }))
    .filter((x) => x.g && !/spring|exhibition/i.test(String(x.g.seasonType)) && /FINAL/.test(String(x.g.status)))
    .sort((a, b) => Date.parse(a.g.date) - Date.parse(b.g.date))
    .slice(-10);
  if (!games.length) return null;
  const ok = dart.kind === 'hr'
    ? games.map(({ r }) => n(r.hr) >= 1)
    : games.map(({ r }) => n(r.hits) >= 2);
  return { of: games.length, ok };
}

function firstInningForm(dart, profiles) {
  const [away, home] = String(dart.matchup || dart.player || '').split(' @ ');
  const find = (club) => (profiles || []).find((p) => p.league === 'MLB' && (p.team === club || clubShort(p.team) === club));
  const a = find(away);
  const h = find(home);
  if (a?.first_inning_scored_l10 == null || h?.first_inning_scored_l10 == null) return null;
  return { away: a.first_inning_scored_l10, home: h.first_inning_scored_l10, of: 10 };
}

/**
 * One regular season's per-game lines, in week order: by name and team (this
 * season's club) and by name alone (every club he played for that season, so
 * a traded player's season is whole). A failed fetch throws: the dart keeps
 * no form and the next run tries again.
 */
async function nflSeason(season) {
  const rows = await fetchCsv(`${RELEASE_BASE}/stats_player/stats_player_week_${season}.csv`);
  const byKey = new Map();
  const byId = new Map();
  const nameOfId = new Map();
  for (const r of rows.filter((x) => x.season_type === 'REG').sort((a, b) => n(a.week) - n(b.week))) {
    const game = {
      td: n(r.rushing_tds) + n(r.receiving_tds), rushTd: n(r.rushing_tds), recYds: n(r.receiving_yards),
      passTd: n(r.passing_tds), int: n(r.passing_interceptions),
    };
    const key = `${normName(r.player_display_name)}|${r.team}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(game);
    const id = r.player_id || key;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(game);
    nameOfId.set(id, normName(r.player_display_name));
  }
  const byName = new Map();
  for (const [id, games] of byId) {
    const nk = nameOfId.get(id);
    if (!byName.has(nk) || byName.get(nk).length < games.length) byName.set(nk, games);
  }
  return { byKey, byName };
}

/** The NFL season a date belongs to: January and February games close the previous one. */
function nflSeasonOf(date) {
  const year = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) <= 2 ? year - 1 : year;
}

const NFL_STAT = {
  td: { pick: (g) => g.td, unit: 'TD' },
  tetd: { pick: (g) => g.td, unit: 'TD' },
  ftd: { pick: (g) => g.td, unit: 'TD' },
  qbtd: { pick: (g) => g.rushTd, unit: 'rush TD' },
  recyds: { pick: (g) => g.recYds, unit: 'rec yds' },
  passtd: { pick: (g) => g.passTd, unit: 'pass TD' },
  int: { pick: (g) => g.int, unit: 'INT' },
};

function nflPlayerForm(dart, now, last) {
  const stat = NFL_STAT[dart.kind];
  if (!stat) return null;
  const nk = normName(dart.player);
  const abbr = Object.entries(TEAM_NAMES).find(([, name]) => name === dart.team)?.[0];
  const cur = (abbr && now.byKey.get(`${nk}|${abbr}`)) || now.byName.get(nk) || [];
  const prev = last.byName.get(nk) || [];
  const line = Number(String(dart.prop || '').split(' ').pop());
  const clears = (v) => (dart.kind === 'recyds' || dart.kind === 'passtd' ? v > line : v >= 1);
  const v = cur.map(stat.pick);
  return {
    unit: stat.unit,
    // A first touchdown is not in the weekly lines, so a FIRST TD dart has no dots.
    now: dart.kind === 'ftd' ? { g: v.length, v } : { g: v.length, v, ok: v.map(clears) },
    last: prev.length ? { g: prev.length, total: prev.map(stat.pick).reduce((a, b) => a + b, 0) } : null,
  };
}

/** Fill `form` on the day's darts that are missing it. Returns how many were filled. */
export async function fillDartForms({ supabase, date, log = console.log }) {
  const { data: rows, error } = await supabase
    .from('darts').select('id, league, kind, player, player_id, team, matchup, prop')
    .eq('game_date', date).is('form', null);
  if (error) throw new Error(`darts read: ${error.message}`);
  if (!rows?.length) return 0;
  const season = Number(date.slice(0, 4));
  let profiles = null;
  let nfl = null;
  let filled = 0;
  for (const dart of rows) {
    let form = null;
    try {
      if (dart.league === 'MLB' && dart.kind === 'first_inning') {
        if (!profiles) {
          const { data } = await supabase.from('tomorrow_board').select('run_profile').eq('date', date).maybeSingle();
          profiles = data?.run_profile || [];
        }
        form = firstInningForm(dart, profiles);
      } else if (dart.league === 'MLB' && dart.player_id) {
        form = await mlbPlayerForm(dart, season);
      } else if (dart.league === 'NFL') {
        // One read of the season files a run; a failed read skips the rest of the NFL darts this run.
        if (!nfl) {
          const s = nflSeasonOf(date);
          nfl = await Promise.all([nflSeason(s), nflSeason(s - 1)])
            .then(([now, last]) => ({ now, last }))
            .catch((e) => ({ error: e.message }));
          if (nfl.error) log(`  NFL season lines unavailable: ${nfl.error}`);
        }
        if (!nfl.error) form = nflPlayerForm(dart, nfl.now, nfl.last);
      }
    } catch (e) {
      log(`  form ${dart.player} (${dart.kind}): ${e.message}`);
    }
    if (!form) continue;
    const { error: upErr } = await supabase.from('darts').update({ form }).eq('id', dart.id);
    if (upErr) throw new Error(`form ${dart.id}: ${upErr.message}`);
    filled++;
  }
  return filled;
}
