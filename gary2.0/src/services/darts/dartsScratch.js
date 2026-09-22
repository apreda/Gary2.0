// Scratches: a dart that cannot happen is marked scratched, never replaced or
// removed. Any dart on a postponed or cancelled game; MLB: the player's club
// posted its lineup without him; NFL: the injury report has him out.
import { ballDontLieService as bdl } from '../ballDontLieService.js';
import { getMlbSchedule, getConfirmedLineups } from '../mlbStatsApiService.js';
import { normName, clubShort } from './dartsCommon.js';

const LOOKAHEAD_MS = 6 * 60 * 60 * 1000;
const NFL_OUT = /^(out|ir|injured reserve|pup|suspended|nfi|inactive)/i;
const sameStart = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) < 30 * 60 * 1000;

async function mark(supabase, id, reason) {
  const { error } = await supabase.from('darts').update({ scratched_at: new Date().toISOString(), scratch_reason: reason }).eq('id', id).is('scratched_at', null);
  if (error) throw new Error(`scratch ${id}: ${error.message}`);
}

export async function scratchDarts({ supabase, date, now = Date.now(), log = console.log }) {
  const { data: rows, error } = await supabase
    .from('darts').select('id, league, kind, player, player_id, team, matchup, commence_time')
    .eq('game_date', date).is('scratched_at', null);
  if (error) throw new Error(`darts read: ${error.message}`);
  const open = (rows || []).filter((d) => {
    const t = Date.parse(d.commence_time);
    return Number.isFinite(t) && t > now - 30 * 60 * 1000 && t < now + LOOKAHEAD_MS;
  });
  if (!open.length) return 0;
  let scratched = 0;

  const mlb = open.filter((d) => d.league === 'MLB');
  if (mlb.length) {
    const schedule = await getMlbSchedule(date).catch(() => []);
    const lineups = new Map();
    for (const d of mlb) {
      const game = schedule.find((g) => sameStart(g.gameDate, d.commence_time)
        && (d.team ? [g.teams?.home?.team?.name, g.teams?.away?.team?.name].includes(d.team)
          : String(d.matchup || '') === `${clubShort(g.teams?.away?.team?.name)} @ ${clubShort(g.teams?.home?.team?.name)}`));
      if (!game) continue;
      if (/postpon|cancel|suspend/i.test(String(game.status?.detailedState || ''))) {
        await mark(supabase, d.id, 'game postponed');
        scratched++;
        log(`  ✂️  MLB ${d.player} (${d.kind}) scratched: game postponed`);
        continue;
      }
      if (d.kind === 'first_inning') continue;
      if (!lineups.has(game.gamePk)) lineups.set(game.gamePk, await getConfirmedLineups(game.gamePk));
      const posted = lineups.get(game.gamePk);
      const side = game.teams.home.team.name === d.team ? 'home' : 'away';
      const names = (posted?.[side] || []).map((p) => normName(p.name));
      if (names.length < 9) continue; // not posted yet
      if (!names.includes(normName(d.player))) {
        await mark(supabase, d.id, 'not in the lineup');
        scratched++;
        log(`  ✂️  MLB ${d.player} (${d.kind}) scratched: not in the ${d.team} lineup`);
      }
    }
  }

  const nfl = open.filter((d) => d.league === 'NFL');
  if (nfl.length) {
    const injuries = await bdl.getNflPlayerInjuries().catch(() => []);
    const out = new Map(injuries.filter((i) => NFL_OUT.test(String(i.status || ''))).map((i) => [String(i.player?.id), i.status]));
    for (const d of nfl) {
      if (!d.player_id) continue;
      const status = out.get(String(d.player_id));
      if (!status) continue;
      await mark(supabase, d.id, String(status).toLowerCase());
      scratched++;
      log(`  ✂️  NFL ${d.player} (${d.kind}) scratched: ${status}`);
    }
  }
  return scratched;
}
