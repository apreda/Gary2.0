/**
 * run-mlb-field-lineups.js
 *
 * Builds the per-game MLB "field lineup" payload that the iOS field view renders:
 * each team's 9 fielders (name, defensive position, batting order, bats, season OPS, +
 * hot/cold + HR-edge + platoon flags cross-referenced from today's insight_connections),
 * plus the opposing probable pitcher (name + throwing hand) the batters face.
 *
 * Splits / BvP / xStats are NOT duplicated here — they already live in
 * player_insight_cards (one row per player per day); iOS pulls the full card on tap by
 * player_id. This script only needs lineup + positions + season OPS + flags.
 *
 * Idempotent per (date): DELETE the day's rows, then INSERT. Service-role REST, mirrors
 * run-insight-connections.js. Usage: node run-mlb-field-lineups.js [YYYY-MM-DD]
 */
import './src/loadEnv.js';
import axios from 'axios';
import { getESTDate } from './src/utils/dateUtils.js';

const { ballDontLieService: bdl } = await import('./src/services/ballDontLieService.js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const TABLE = 'mlb_field_lineups';
const REST = `${SUPABASE_URL}/rest/v1/${TABLE}`;
const IC_REST = `${SUPABASE_URL}/rest/v1/insight_connections`;
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

const dateStr = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || getESTDate();
const season = Number(dateStr.slice(0, 4));

function handOf(batsThrows) { return (batsThrows || '').split('/')[1]?.trim() || (batsThrows || '').slice(-1) || ''; }
function batsOf(batsThrows) { return (batsThrows || '').split('/')[0]?.trim() || ''; }

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) { console.error('❌ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  console.log(`[field-lineups] building ${dateStr} (season ${season})`);

  const games = (await bdl.getMlbGamesForDate(dateStr)) || [];
  console.log(`[field-lineups] ${games.length} MLB games`);

  // today's MLB insight_connections → hot/cold / HR / platoon flags by player
  let insights = [];
  try {
    const r = await axios.get(IC_REST, { headers: H, params: { date: `eq.${dateStr}`, league: 'eq.MLB', select: 'category,headline,player_id', limit: 2000 } });
    insights = r.data || [];
  } catch (e) { console.warn('[field-lineups] insight_connections fetch failed (flags will be steady):', e.message); }

  function flagsFor(playerId, name) {
    const n = (name || '').toLowerCase();
    const mine = insights.filter((r) =>
      (r.player_id && String(r.player_id) === String(playerId)) || (n && (r.headline || '').toLowerCase().includes(n)));
    const has = (...cats) => mine.some((r) => cats.includes(r.category));
    return {
      heat: has('heat_check') ? 'hot' : has('cooling_off') ? 'cold' : 'steady',
      hrEdge: has('ballpark_shift', 'hr_threat'),
      plat: has('platoon_edge'),
    };
  }

  // Projected-lineup fallback: each team's most recent CONFIRMED lineup, reused (with
  // today's hot/cold/HR/platoon flags refreshed) when today's sheet isn't posted yet — so
  // EVERY game shows a projected lineup that upgrades to confirmed once BDL posts the sheet.
  const recentByTeam = {};
  try {
    const rr = await axios.get(REST, { headers: H, params: {
      date: `lt.${dateStr}`, status: 'eq.confirmed', select: 'home_team,away_team,payload',
      order: 'date.desc', limit: 300 } });
    for (const row of (rr.data || [])) {
      for (const side of ['home', 'away']) {
        const abbr = side === 'home' ? row.home_team : row.away_team;
        const t = row.payload?.[side];
        if (abbr && !recentByTeam[abbr] && t?.fielders?.length) recentByTeam[abbr] = { team: t.team, pitcher: t.pitcher, fielders: t.fielders };
      }
    }
    console.log(`[field-lineups] projected fallback ready for ${Object.keys(recentByTeam).length} teams`);
  } catch (e) { console.warn('[field-lineups] recent-lineup fetch failed (no projected fallback):', e.message); }

  const rows = [];
  for (const game of games) {
    try {
      const homeAbbr = game.home_team?.abbreviation;
      const awayAbbr = game.away_team?.abbreviation;
      if (!homeAbbr || !awayAbbr) continue;

      // PROJECT a team from its most recent confirmed regulars (today's flags refreshed) —
      // used when there's no usable confirmed sheet (null OR empty batters).
      const projTeam = (abbr) => {
        const rec = recentByTeam[abbr];
        if (!rec?.fielders?.length) return null;
        const fielders = rec.fielders.map((b) => {
          const f = flagsFor(b.playerId, b.name);
          return { ...b, heat: f.heat, hrEdge: f.hrEdge, plat: f.plat };
        });
        return { team: rec.team || abbr, pitcher: rec.pitcher || null, facingPitcher: null, fielders };
      };

      const lineups = await bdl.getMlbLineups(game.id);
      const home = lineups?.[homeAbbr], away = lineups?.[awayAbbr];

      const allIds = [];
      [home, away].forEach((t) => t?.batters?.forEach((b) => b.playerId != null && allIds.push(b.playerId)));
      let statById = {};
      if (allIds.length) {
        const stats = await bdl.getMlbPlayerSeasonStats({ season, playerIds: allIds });
        for (const s of stats) { const id = s.player?.id; if (id != null) statById[id] = { ops: s.batting_ops, avg: s.batting_avg, hr: s.batting_hr, gp: s.batting_gp ?? 0 }; }
      }

      const pitcherObj = (t) => t?.pitcher ? { name: t.pitcher.name, hand: handOf(t.pitcher.batsThrows), playerId: String(t.pitcher.playerId ?? '') } : null;

      const buildTeam = (t, ownPitcher, facingPitcher) => {
        if (!t?.batters?.length) return null;
        // "Who might sit / might play" (the Contested signal for MLB): flag a starter who's
        // appeared in FAR fewer games than the team's everyday regulars — i.e. a fill-in, so
        // the usual starter is resting/out. Conservative (only clear backups, ≥30 team games)
        // so a platoon regular is never mislabelled. iOS rings these on the field.
        const teamGames = Math.max(0, ...t.batters.map((b) => statById[b.playerId]?.gp ?? 0));
        const fielders = t.batters.map((b) => {
          const f = flagsFor(b.playerId, b.name);
          const st = statById[b.playerId] || {};
          const gp = st.gp ?? 0;
          const fillIn = teamGames >= 30 && gp > 0 && gp < 0.45 * teamGames;
          return {
            playerId: String(b.playerId ?? ''), name: b.name, pos: b.position,
            order: b.battingOrder, bats: batsOf(b.batsThrows),
            ops: st.ops != null ? Number(st.ops).toFixed(3) : null, seasonHr: st.hr ?? null,
            heat: f.heat, hrEdge: f.hrEdge, plat: f.plat, fillIn,
          };
        });
        return { team: t.teamName, pitcher: ownPitcher, facingPitcher, fielders };
      };

      // own pitcher = the arm on the mound; facing pitcher = the opposing arm the batters face
      let status = 'confirmed';
      let payload = {
        home: buildTeam(home, pitcherObj(home), pitcherObj(away)),
        away: buildTeam(away, pitcherObj(away), pitcherObj(home)),
      };
      if (!payload.home && !payload.away) {
        // No usable confirmed sheet (null or empty batters) → project from recent regulars.
        status = 'projected';
        payload = { home: projTeam(homeAbbr), away: projTeam(awayAbbr) };
      }
      if (!payload.home && !payload.away) { console.log(`  ${awayAbbr} @ ${homeAbbr}: no lineup + no recent fallback`); continue; }

      rows.push({
        date: dateStr, game_id: String(game.id), game: `${awayAbbr} @ ${homeAbbr}`,
        home_team: homeAbbr, away_team: awayAbbr, status,
        payload, generated_by: status === 'projected' ? 'field-lineup-cli-projected' : 'field-lineup-cli',
      });
      console.log(`  ${awayAbbr} @ ${homeAbbr}: ${status.toUpperCase()} (home ${payload.home?.fielders?.length || 0} / away ${payload.away?.fielders?.length || 0})`);
    } catch (e) { console.error(`  game ${game.id} error:`, e.message); }
  }

  // Upsert on (date, game_id) — do NOT delete the day first. A later run with fewer games
  // (the slate shrinks as games finish) must not wipe earlier-built lineups for games no
  // longer live; each game's row updates in place (projected -> confirmed) or is added.
  if (rows.length) {
    await axios.post(REST, JSON.parse(JSON.stringify(rows)), {
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      params: { on_conflict: 'date,game_id' },
    });
  }
  console.log(`[field-lineups] ✅ wrote ${rows.length} field-lineup row(s) for ${dateStr}`);
}

main().catch((e) => { console.error('[field-lineups] fatal:', e); process.exit(1); });
