// Dated MLB facts for the Fantasy decision writer. This module selects evidence,
// never an add/drop/start verdict. Player IDs are BDL; Savant/MLBAM IDs stay
// explicitly namespaced. No ownership, rotation, bullpen-role or injury inference.
import { getBatterXStats, getPitcherXStats } from '../baseballSavantService.js';
import { getMlbSchedule } from '../mlbStatsApiService.js';
import { etDateStr, shiftDateStr } from './shared.js';

const DAY_MS = 86_400_000;
const MAX_CANDIDATES = 30;
const MAX_SLATE_GAMES = 20;
const HISTORY_DAYS = 45;
const CONCURRENCY = 3;
const BATTING = ['at_bats', 'plate_appearances', 'runs', 'hits', 'hr', 'rbi', 'bb', 'k', 'stolen_bases', 'total_bases'];
const PITCHING = ['pitching_outs', 'pitch_count', 'p_hits', 'er', 'p_bb', 'p_k', 'p_hr', 'batters_faced', 'games_started', 'wins', 'saves', 'holds'];
const BAT_SEASON = ['batting_gp', 'batting_pa', 'batting_ab', 'batting_r', 'batting_h', 'batting_hr', 'batting_rbi', 'batting_bb', 'batting_so', 'batting_sb', 'batting_avg', 'batting_obp', 'batting_slg', 'batting_ops'];
const ARM_SEASON = ['pitching_gp', 'pitching_gs', 'pitching_qs', 'pitching_w', 'pitching_sv', 'pitching_hld', 'pitching_ip', 'pitching_h', 'pitching_er', 'pitching_bb', 'pitching_k', 'pitching_k_per_9', 'pitching_era', 'pitching_whip'];

const id = (value) => value != null && /^\d+$/.test(String(value)) && Number(value) > 0 ? String(value) : null;
const num = (value) => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const nameKey = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.'’]/g, '').replace(/[-\s]+/g, ' ').trim();
const playerId = (value) => id(value?.playerId ?? value?.player_id ?? value?.player?.id);
const playerName = (value) => value?.name || value?.full_name || value?.player?.full_name || [value?.player?.first_name, value?.player?.last_name].filter(Boolean).join(' ');
const fields = (row, keys) => Object.fromEntries(keys.map(key => [key, num(row?.[key])]).filter(([, value]) => value != null && value >= 0));
const hand = (value) => /^(?:L|Left)$/i.test(String(value || '')) ? 'L' : /^(?:R|Right)$/i.test(String(value || '')) ? 'R' : /^(?:S|Switch|Both)$/i.test(String(value || '')) ? 'S' : null;
const hands = (value) => { const [bats, throws] = String(value || '').split('/'); return { bats: hand(bats), throws: hand(throws) }; };
const state = (game) => String(game?.status?.abstractGameState || game?.status?.detailedState || game?.status || '').replace(/^STATUS_/i, '').toLowerCase();
const final = (game) => /^(final|completed|game over)$/.test(state(game));
const pregame = (game) => !/postpon|suspend|cancel|delay/i.test(`${game?.status?.detailedState || ''} ${game?.status?.reason || ''}`) && /^(scheduled|preview|pre|pregame|warmup|pre-game|not started)$/.test(state(game));
const regular = (game) => !game?.postseason && !/spring|postseason|playoff/i.test(String(game?.seasonType || game?.season_type || '')) && (!game?.gameType || game.gameType === 'R');
const stamp = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const dateValid = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && stamp(`${value}T12:00:00Z`)?.slice(0, 10) === value;
const dayAge = (date, prior) => Math.max(0, Math.floor((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${prior}T12:00:00Z`)) / DAY_MS));

async function mapLimit(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) { const index = next++; out[index] = await fn(items[index], index); }
  }));
  return out;
}

function teamName(team) { return team?.full_name || team?.display_name || team?.name || ''; }
function sides(game) {
  const home = game?.home_team, away = game?.visitor_team || game?.away_team;
  return [{ team: home, opponent: away, home: true }, { team: away, opponent: home, home: false }].filter(s => id(s.team?.id) && id(s.opponent?.id));
}

/** A posted BDL sheet is a batting order, while its pitcher is only probable.
 * Conflicting or malformed slots must never become a confirmed nine. */
export function normalizeMlbFantasyLineup(side) {
  const raw = Array.isArray(side?.batters) ? side.batters : [];
  const entries = raw.map(b => ({
    player_id: playerId(b), name: playerName(b), order: num(b?.battingOrder ?? b?.batting_order ?? b?.order),
    position: b?.position || b?.pos || null, ...hands(b?.batsThrows || b?.bats_throws),
  })).filter(b => b.player_id && b.name && Number.isInteger(b.order) && b.order >= 1 && b.order <= 9);
  const unique = [...new Map(entries.map(b => [`${b.player_id}:${b.order}`, b])).values()];
  const batters = unique.filter(b => unique.filter(x => x.player_id === b.player_id || x.order === b.order).length === 1).sort((a, b) => a.order - b.order);
  const complete = batters.length === 9 && entries.length === raw.length;
  const sp = side?._pitcherConflict ? null : side?.pitcher;
  const pitcher = playerId(sp) && playerName(sp) ? { player_id: playerId(sp), name: playerName(sp), status: 'probable', ...hands(sp?.batsThrows || sp?.bats_throws) } : null;
  return { status: complete ? 'confirmed' : raw.length ? 'partial' : 'not_posted', batters, pitcher };
}

/** Preserve dated reports already shown in the app. This is not an injury
 * classifier: status/injury text is retained verbatim, and absence is unknown. */
export function normalizeMlbFantasyStatusSnapshots(input, { date } = {}) {
  const raw = Array.isArray(input) ? input : [];
  const unique = new Map();
  for (const row of raw) {
    const pid = id(row?.player_id);
    if (!pid || typeof row?.status !== 'string' || !row.status.trim()
        || typeof row?.source !== 'string' || !row.source.trim()
        || !dateValid(row?.date) || (dateValid(date) && (row.date > date
          || [row.updated_at, row.created_at].some(value => stamp(value) && etDateStr(value) > date)))) continue;
    const facts = { player_id: pid, status: row.status, source: row.source, date: row.date };
    for (const key of ['player_name', 'injury', 'updated_at', 'created_at']) {
      if (row[key] === null || typeof row[key] === 'string') facts[key] = row[key];
    }
    unique.set(JSON.stringify(facts), facts);
  }
  return { rows: [...unique.values()], excluded_rows: raw.length - unique.size };
}

function teamLineup(lineups, team) {
  const target = String(team?.abbreviation || '').toUpperCase();
  const entry = Object.entries(lineups || {}).find(([abbr]) => abbr.toUpperCase() === target)?.[1];
  return normalizeMlbFantasyLineup(entry);
}

function ipOuts(value) {
  if (value == null || !/^\d+(?:\.[012])?$/.test(String(value))) return null;
  const [whole, partial = '0'] = String(value).split('.');
  return Number(whole) * 3 + Number(partial);
}

/** Exact player/game joins, stable chronology, unknown measurements remain
 * unknown. One conflicting duplicate excludes that game from the sample. */
export function buildMlbFantasyRecent({ rows = [], gameIndex, player_id, date, role, limit } = {}) {
  const games = new Map(), conflicts = new Set();
  const readGame = key => gameIndex?.get?.(String(key)) ?? gameIndex?.get?.(Number(key));
  for (const row of rows) {
    if (id(row?.player?.id ?? row?.player_id) !== id(player_id)) continue;
    const gid = id(row?.game_id), game = readGame(gid), at = stamp(game?.date), day = at && etDateStr(at);
    if (!gid || !game || !at || !day || day >= date || day < shiftDateStr(date, -HISTORY_DAYS) || !final(game) || !regular(game)) continue;
    const sideId = id(row?.team?.id ?? row?.team_id);
    if (sideId && ![id(game.homeId), id(game.awayId)].includes(sideId)) continue;
    const rawOuts = num(row?.pitching_outs) ?? ipOuts(row?.ip);
    const outs = Number.isInteger(rawOuts) && rawOuts >= 0 ? rawOuts : null;
    const appeared = role === 'hitter' ? num(row?.plate_appearances) > 0 || num(row?.at_bats) > 0 : outs > 0 || num(row?.pitch_count) > 0 || num(row?.batters_faced) > 0 || num(row?.games_started) === 1;
    if (!appeared) continue;
    const stats = fields(row, role === 'hitter' ? BATTING : PITCHING);
    if (role === 'pitcher' && outs != null) stats.pitching_outs = outs;
    const normalized = { game_id: gid, date: day, start_at: at, team_id: sideId, ...stats };
    if (games.has(gid) && JSON.stringify(games.get(gid)) !== JSON.stringify(normalized)) conflicts.add(gid);
    else games.set(gid, normalized);
  }
  const selected = [...games.values()].filter(g => !conflicts.has(g.game_id)).sort((a, b) => b.start_at.localeCompare(a.start_at) || b.game_id.localeCompare(a.game_id)).slice(0, limit ?? (role === 'hitter' ? 10 : 5));
  const totals = {}, measured = {};
  for (const key of (role === 'hitter' ? BATTING : PITCHING)) {
    const present = selected.filter(row => num(row[key]) != null);
    measured[key] = present.length;
    if (selected.length && present.length === selected.length) totals[key] = present.reduce((sum, row) => sum + row[key], 0);
  }
  // Baseball innings are outs, not decimal fractions. Publish the ordinary
  // display and rates from the complete sample so the writer need not invent
  // arithmetic or confuse 23.2 IP with 23.2 decimal innings.
  if (role === 'pitcher' && Number.isInteger(totals.pitching_outs)) {
    const outs = totals.pitching_outs;
    totals.innings_pitched = `${Math.floor(outs / 3)}.${outs % 3}`;
    if (outs > 0) {
      if (totals.er != null) totals.era = Number((totals.er * 27 / outs).toFixed(2));
      if (totals.p_hits != null && totals.p_bb != null) totals.whip = Number(((totals.p_hits + totals.p_bb) * 3 / outs).toFixed(2));
      if (totals.p_k != null) totals.k_per_9 = Number((totals.p_k * 27 / outs).toFixed(2));
    }
  }
  return {
    window_start: shiftDateStr(date, -HISTORY_DAYS), cutoff_exclusive: date,
    sample_games: selected.length, requested_games: limit ?? (role === 'hitter' ? 10 : 5),
    latest_game_at: selected[0]?.start_at || null, days_since_latest_game: selected[0] ? dayAge(date, selected[0].date) : null,
    rows: selected, totals, measured_games_by_stat: measured, excluded_conflicting_games: conflicts.size,
  };
}

function selectCandidates(pool, cap) {
  // A changed posted order is an investigation reason, not evidence of value.
  // Alternate roles and take one per team each pass so a large lineup does not
  // consume the model's entire pool. No OPS/xERA/ownership score is involved.
  const sort = (a, b) => Number(b.context.lineup_changed) - Number(a.context.lineup_changed) || a.game_start.localeCompare(b.game_start) || a.id.localeCompare(b.id);
  const groups = ['hitter', 'pitcher'].map(role => pool.filter(c => c.context.roles.includes(role) && (role === 'pitcher' || !c.context.roles.includes('pitcher'))).sort(sort));
  const selected = [], used = new Set();
  while (selected.length < cap && groups.some(group => group.length)) {
    const seen = groups.map(() => new Set());
    let took = false;
    do {
      took = false;
      for (let i = 0; i < groups.length && selected.length < cap; i++) {
        const index = groups[i].findIndex(c => !seen[i].has(c.team_id));
        if (index < 0) continue;
        const [candidate] = groups[i].splice(index, 1);
        seen[i].add(candidate.team_id);
        if (!used.has(candidate.id)) { selected.push(candidate); used.add(candidate.id); }
        took = true;
      }
    } while (took && selected.length < cap);
  }
  return selected;
}

function sameClub(team, official) {
  const keys = [teamName(team), team?.display_name, team?.full_name].map(nameKey).filter(Boolean);
  // BDL retains Oakland/OAK while MLB's relocated franchise is Athletics.
  // This is one explicit provider identity mapping, never nickname fuzziness.
  if (String(team?.abbreviation).toUpperCase() === 'OAK' && keys.includes('oakland athletics') && id(official?.id) === '133' && nameKey(official?.name) === 'athletics') return true;
  return keys.includes(nameKey(official?.name));
}

function opposingOrders(candidate, lineups, previous, teams, date) {
  if (!candidate.context.roles.includes('pitcher')) return [];
  return candidate.context.opportunities.map(opportunity => {
    const team = teams.get(opportunity.opponent_team_id);
    const current = teamLineup(lineups.get(opportunity.game_id), team);
    const priorGame = previous.get(opportunity.opponent_team_id);
    const prior = teamLineup(priorGame && lineups.get(priorGame.id), team);
    const usePrior = current.status === 'not_posted' && prior.status === 'confirmed';
    const selected = usePrior ? prior : current;
    return {
      game_id: opportunity.game_id, game_date: date, opponent_team_id: opportunity.opponent_team_id,
      opponent: opportunity.opponent, lineup_status_today: current.status,
      lineup_source: usePrior ? 'prior_completed_game' : 'today',
      lineup_date: usePrior ? priorGame.day : current.batters.length ? date : null,
      lineup_game_id: usePrior ? priorGame.id : current.batters.length ? opportunity.game_id : null,
      confirmed_for_today: current.status === 'confirmed', complete_source_order: selected.status === 'confirmed',
      batters: selected.batters.slice(0, 9).map(b => ({ player_id: b.player_id, name: b.name, batting_order: b.order, bats: b.bats })),
    };
  });
}

function opponentOrderFacts(order, seasonRows, season, headers) {
  const rows = order.batters.map(batter => {
    const header = headers?.[batter.player_id];
    const currentTeam = id(header?.teamId);
    const identityConflict = header?.name && nameKey(header.name) !== nameKey(batter.name);
    const membership = currentTeam == null ? 'unknown' : currentTeam === order.opponent_team_id ? 'same_team' : 'team_changed_or_conflicting';
    const stat = !identityConflict && membership !== 'team_changed_or_conflicting' ? seasonFacts(seasonRows, batter, season) : null;
    return {
      ...batter, current_team_status: identityConflict ? 'identity_conflict' : membership,
      season_games: stat?.batting_gp ?? null, plate_appearances: stat?.batting_pa ?? null,
      at_bats: stat?.batting_ab ?? null, strikeouts: stat?.batting_so ?? null,
      walks: stat?.batting_bb ?? null, home_runs: stat?.batting_hr ?? null, ops: stat?.batting_ops ?? null,
    };
  });
  const complete = order.complete_source_order && rows.length === 9 && rows.every(row => !['identity_conflict', 'team_changed_or_conflicting'].includes(row.current_team_status));
  const totals = {}, measured = {};
  for (const key of ['plate_appearances', 'at_bats', 'strikeouts']) {
    measured[key] = rows.filter(row => row[key] != null).length;
    totals[key] = complete && measured[key] === 9 ? rows.reduce((sum, row) => sum + row[key], 0) : null;
  }
  const context = { ...order };
  delete context.batters;
  return { ...context, season, rows, totals, measured_players_by_stat: measured,
    scope: 'Season batting samples for the named order. Totals are not a forecast of this pitcher\'s result.',
    plate_appearances_derived_from_at_bats: false };
}

function exactXStats(rows, candidate, role) {
  const matches = rows.filter(row => nameKey(row?.name || (row?.first_name && row?.last_name ? `${row.first_name} ${row.last_name}` : '')) === nameKey(candidate.name));
  if (matches.length !== 1) return null;
  const row = matches[0], pid = id(row.player_id);
  if (!pid || !(num(row.pa) > 0)) return null;
  return { mlbam_player_id: pid, match_method: 'unique_exact_full_name', sample_pa: num(row.pa), ...fields(row, role === 'pitcher' ? ['era', 'ba', 'est_ba', 'woba', 'est_woba'] : ['ba', 'est_ba', 'slg', 'est_slg', 'woba', 'est_woba']) };
}

function seasonFacts(rows, candidate, season) {
  const matches = rows.filter(row => id(row?.player?.id ?? row?.player_id) === candidate.player_id && Number(row?.season) === season && regular(row));
  // Do not choose the first row when total/team-split duplicate semantics are
  // unknown. A duplicate identical fact set is harmless; conflicting sets skip.
  const unique = [...new Map(matches.map(row => {
    const value = fields(row, [...BAT_SEASON, ...ARM_SEASON]);
    return [JSON.stringify(value), value];
  })).values()];
  return unique.length === 1 && Object.keys(unique[0]).length ? { season, season_type: 'regular', ...unique[0] } : null;
}

function evidenceSummary(key, facts) {
  const display = (value, field) => {
    if (/(?:avg|obp|slg|ops|woba|est_ba|^ba)$/.test(field)) return Number(value).toFixed(3);
    if (/(?:era|whip|k_per_9)$/.test(field)) return Number(value).toFixed(2);
    return Number.isInteger(value) ? String(value) : String(Number(Number(value).toFixed(3)));
  };
  const measured = (keys) => keys.filter(([field]) => facts[field] != null).map(([field, label]) => `${display(facts[field], field)} ${label}`).join(', ');
  if (key === 'today') return facts.opportunities.map(o => `${o.date} ${o.home ? 'vs' : 'at'} ${o.opponent}: ${o.lineup_status === 'confirmed' ? 'posted lineup' : o.lineup_status === 'partial' ? 'partial lineup' : 'lineup not posted'}${o.batting_order != null ? `, batting ${o.batting_order}` : ''}${o.starting_pitcher_status ? ', probable starter' : ''}${o.opponent_pitcher ? `; opposing probable ${o.opponent_pitcher.name}${o.opponent_pitcher.throws ? ` (${o.opponent_pitcher.throws})` : ''}` : ''}${o.prior_lineup ? `; ${o.prior_lineup.date} order ${o.prior_lineup.batting_order ?? 'not listed'}` : ''}.`).join(' ');
  if (key === 'season') return `${facts.season}: ${measured([['batting_gp', 'batting games'], ['batting_ab', 'AB'], ['batting_r', 'R'], ['batting_hr', 'HR'], ['batting_rbi', 'RBI'], ['batting_sb', 'SB'], ['batting_ops', 'OPS'], ['pitching_gp', 'outings'], ['pitching_gs', 'starts'], ['pitching_ip', 'IP'], ['pitching_k', 'K'], ['pitching_era', 'ERA'], ['pitching_whip', 'WHIP'], ['pitching_sv', 'saves']])}.`;
  if (key.startsWith('recent_')) {
    if (!facts.sample_games) return `No completed appearances returned from ${facts.window_start} through the day before ${facts.cutoff_exclusive}.`;
    const totals = Object.entries(facts.totals).filter(([field]) => ['plate_appearances', 'at_bats', 'runs', 'hits', 'hr', 'rbi', 'stolen_bases', 'innings_pitched', 'pitch_count', 'er', 'p_k', 'p_bb', 'saves', 'holds', 'era', 'whip', 'k_per_9'].includes(field)).map(([field, value]) => {
      const label = ({ plate_appearances: 'PA', at_bats: 'AB', hr: 'HR', rbi: 'RBI', stolen_bases: 'SB', innings_pitched: 'IP', pitch_count: 'pitches', er: 'ER', p_k: 'K', p_bb: 'BB', era: 'ERA', whip: 'WHIP', k_per_9: 'K/9' })[field] || field;
      const singular = value === 1 ? ({ runs: 'run', hits: 'hit', outs: 'out', pitches: 'pitch', saves: 'save', holds: 'hold' })[label] || label : label;
      return `${value} ${singular}`;
    }).join(', ');
    return `${facts.sample_games} observed appearance${facts.sample_games === 1 ? '' : 's'}, ${facts.rows.at(-1).date} to ${facts.rows[0].date}${totals ? `: ${totals}` : ''}. Latest appearance ${facts.days_since_latest_game} day${facts.days_since_latest_game === 1 ? '' : 's'} before this slate.`;
  }
  if (key.startsWith('expected_')) return `${facts.season}, ${facts.sample_pa} PA: ${measured([['era', 'ERA'], ['ba', 'AVG'], ['est_ba', 'xBA'], ['slg', 'SLG'], ['est_slg', 'xSLG'], ['woba', 'wOBA'], ['est_woba', 'xwOBA']])}. Season measurements.`;
  if (key.startsWith('hand_splits_')) return facts.rows.map(row => `${row.split}: ${Object.entries(row).filter(([field]) => field !== 'split').map(([field, value]) => `${display(value, field)} ${({ at_bats: 'AB', plate_appearances: 'PA', hits: 'H', home_runs: 'HR', walks: 'BB', strikeouts: 'K', avg: 'AVG', obp: 'OBP', slg: 'SLG', ops: 'OPS', innings_pitched: 'IP', pitching_outs: 'outs', pitching_era: 'ERA', pitching_whip: 'WHIP' })[field] || field}`).join(', ')}`).join('; ');
  if (key === 'opponent_pitchers') return facts.pitchers.map(p => `${p.name}${p.throws ? ` (${p.throws})` : ''}, probable: ${p.season_stats ? Object.entries(p.season_stats).filter(([field]) => ['pitching_gs', 'pitching_ip', 'pitching_k_per_9', 'pitching_bb', 'pitching_era', 'pitching_whip'].includes(field)).map(([field, value]) => `${display(value, field)} ${({ pitching_gs: value === 1 ? 'start' : 'starts', pitching_ip: 'IP', pitching_k_per_9: 'K/9', pitching_bb: 'BB', pitching_era: 'ERA', pitching_whip: 'WHIP' })[field]}`).join(', ') : 'season pitching stats unavailable'}`).join('; ') + '. Planned innings and opener/bulk roles are unconfirmed.';
  if (key.startsWith('opponent_order_')) {
    const label = facts.confirmed_for_today ? `Posted ${facts.lineup_date} order` : facts.lineup_source === 'prior_completed_game' ? `${facts.lineup_date} prior order; today's lineup unconfirmed` : `Today's ${facts.lineup_status_today === 'partial' ? 'partial order' : 'order not posted'}`;
    const totals = Object.entries(facts.totals).filter(([, value]) => value != null).map(([field, value]) => `${value} ${({ plate_appearances: 'PA', at_bats: 'AB', strikeouts: 'K' })[field]}`).join(', ');
    const matchup = facts.rows.map(row => `${row.batting_order}. ${row.name}${row.bats ? ` (${row.bats})` : ''}`).join('; ');
    return `${facts.opponent}: ${label}.${matchup ? ` ${matchup}.` : ''}${totals ? ` ${facts.season} samples for those nine: ${totals}.` : ' Complete nine-player season totals unavailable.'}${facts.totals.plate_appearances == null ? ' PA unavailable; no lineup strikeout rate inferred.' : ''}`;
  }
  if (key === 'upcoming_schedule') return facts.games.map(g => `${g.date} ${g.home ? 'vs' : 'at'} ${g.opponent}${g.player_listed_probable ? ' (listed probable start)' : ''}`).join('; ') + '. No rotation projection.';
  return '';
}

/**
 * @param {{date:string,season?:number,games:Array,bdl:object,as_of?:string}} ctx
 * @param {{maxCandidates?:number,asOf?:string,now?:Date,sources?:object}} options
 * @returns {Promise<{date:string,league:string,as_of:string,candidates:Array,coverage:object}>}
 */
export async function buildMlbFantasyEvidence(ctx = {}, options = {}) {
  const date = ctx.date;
  if (!dateValid(date)) throw new Error('MLB fantasy evidence requires a valid YYYY-MM-DD date');
  const asOf = stamp(ctx.as_of || options.asOf || options.now || new Date().toISOString());
  if (!asOf) throw new Error('MLB fantasy evidence requires a valid as-of timestamp');
  const season = Number(ctx.season) || Number(date.slice(0, 4));
  const bdl = ctx.bdl;
  if (!bdl) throw new Error('MLB fantasy evidence requires BDL providers');
  const sources = { getMlbSchedule, getBatterXStats, getPitcherXStats, ...options.sources };
  const max = Math.max(1, Math.min(MAX_CANDIDATES, Number.isInteger(options.maxCandidates) ? options.maxCandidates : MAX_CANDIDATES));
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const end = shiftDateStr(date, (7 - dow) % 7);
  const statuses = normalizeMlbFantasyStatusSnapshots(ctx.statusSnapshots, { date });
  const coverage = { complete: true, candidate_limit: max, slate_games: 0, excluded_games: 0, lineup_sides_confirmed: 0, lineup_sides_partial: 0, lineup_sides_not_posted: 0, candidates_available: 0, candidates_selected: 0, requests_attempted: 0, requests_succeeded: 0, mandatory_requests_failed: 0, sources_failed: [], provider_updated_at: null, selection: 'lineup_changes_then_roles_and_teams', status_snapshots_provided: Array.isArray(ctx.statusSnapshots), status_rows_usable: statuses.rows.length, status_rows_excluded: statuses.excluded_rows, status_rows_attached: 0, status_coverage: 'Dated app return-watch reports only; not comprehensive. Missing reports do not establish clearance.' };
  const result = { date, league: 'mlb', as_of: asOf, window_start: date, window_end: end, candidates: [], coverage };
  const read = async (label, fn, fallback, mandatory = false) => {
    coverage.requests_attempted++;
    try {
      const value = await fn();
      if (Array.isArray(fallback) && !Array.isArray(value)) throw new Error('Invalid collection');
      if (fallback instanceof Map && !(value instanceof Map)) throw new Error('Invalid index');
      if (value === undefined) throw new Error('Missing response');
      coverage.requests_succeeded++;
      return value;
    } catch {
      coverage.sources_failed.push(label);
      if (mandatory) { coverage.complete = false; coverage.mandatory_requests_failed++; }
      return fallback;
    }
  };
  const allGames = Array.isArray(ctx.games) ? ctx.games : [];
  const seenGames = new Set();
  const games = allGames.filter(game => {
    const gid = id(game?.id), starts = stamp(game?.date || game?.game_date || game?.start_time);
    if (!gid || seenGames.has(gid) || !starts || etDateStr(starts) !== date || !pregame(game) || !regular(game) || Date.parse(starts) <= Date.parse(asOf) || sides(game).length !== 2) return false;
    seenGames.add(gid); return true;
  }).sort((a, b) => stamp(a.date || a.game_date || a.start_time).localeCompare(stamp(b.date || b.game_date || b.start_time))).slice(0, MAX_SLATE_GAMES);
  coverage.slate_games = games.length;
  coverage.excluded_games = allGames.length - games.length;
  if (!games.length) return result;

  const gameIndexRaw = await read('BDL season game index', () => bdl.getMlbSeasonGameIndex(season, 60, { throwOnError: true }), new Map(), true);
  const gameIndex = new Map([...(gameIndexRaw instanceof Map ? gameIndexRaw : new Map())].map(([key, value]) => [String(key), value]));
  const teams = new Map(games.flatMap(g => sides(g).map(s => [String(s.team.id), s.team])));
  const previous = new Map();
  for (const [gid, game] of gameIndex) {
    const day = game?.date && etDateStr(game.date);
    if (!day || day >= date || day < shiftDateStr(date, -3) || !final(game) || !regular(game)) continue;
    for (const tid of [id(game.homeId), id(game.awayId)]) if (teams.has(tid) && (!previous.has(tid) || previous.get(tid).date < game.date)) previous.set(tid, { id: gid, date: game.date, day });
  }
  const lineupIds = [...new Set([...games.map(g => String(g.id)), ...[...previous.values()].map(g => g.id)])];
  const lineupValues = await mapLimit(lineupIds, gid => read(`BDL lineup ${gid}`, () => bdl.getMlbLineups(gid, { throwOnError: true }), null, true));
  const lineups = new Map(lineupIds.map((gid, i) => [gid, lineupValues[i]]));
  const pool = new Map();
  for (const game of games) {
    for (const side of sides(game)) {
      const { team, opponent, home } = side;
      const current = teamLineup(lineups.get(String(game.id)), team);
      const opponentLineup = teamLineup(lineups.get(String(game.id)), opponent);
      coverage[`lineup_sides_${current.status}`]++;
      const prev = previous.get(String(team.id));
      const prior = teamLineup(prev && lineups.get(prev.id), team);
      const priorEntries = new Map(prior.batters.map(b => [b.player_id, b]));
      const subjects = current.batters.map(b => ({ ...b, role: 'hitter', current: true }));
      if (current.status === 'not_posted' && prior.status === 'confirmed') subjects.push(...prior.batters.map(b => ({ ...b, role: 'hitter', current: false })));
      if (current.pitcher) subjects.push({ ...current.pitcher, role: 'pitcher', current: true, position: 'SP' });
      for (const subject of subjects) {
        const cid = `bdl:${subject.player_id}`;
        let candidate = pool.get(cid);
        if (candidate && (candidate.team_id !== String(team.id) || nameKey(candidate.name) !== nameKey(subject.name))) continue;
        const order = subject.role === 'hitter' && subject.current ? subject.order : null;
        const previousOrder = priorEntries.get(subject.player_id)?.order ?? null;
        const changed = subject.current && subject.role === 'hitter' && prior.status === 'confirmed' && previousOrder !== order;
        if (!candidate) {
          candidate = { id: cid, player_id: subject.player_id, name: subject.name, player_name: subject.name, team_id: String(team.id), team: team.abbreviation || teamName(team), position: subject.position || null, role: subject.role, game_id: String(game.id), game_start: stamp(game.date || game.game_date || game.start_time), evidence: [], context: { roles: [], opportunities: [], lineup_changed: false, rostered_percent: null, league_available: null }, limitations: ['League roster availability and scoring settings are not supplied.', 'Times show when Gary checked the data; the stat and lineup feeds do not provide their last update time.'] };
          pool.set(cid, candidate);
        }
        if (!candidate.context.roles.includes(subject.role)) candidate.context.roles.push(subject.role);
        candidate.role = candidate.context.roles.length > 1 ? 'two_way' : subject.role;
        candidate.context.lineup_changed ||= changed;
        let opportunity = candidate.context.opportunities.find(o => o.game_id === String(game.id));
        if (!opportunity) {
          opportunity = { game_id: String(game.id), date, start_at: stamp(game.date || game.game_date || game.start_time), home, opponent: opponent.abbreviation || teamName(opponent), opponent_team_id: String(opponent.id), venue: typeof game.venue === 'string' ? game.venue : game.venue?.name || null, lineup_status: current.status, batting_order: null, bats: subject.bats, throws: subject.throws, starting_pitcher_status: null, opponent_pitcher: opponentLineup.pitcher };
          candidate.context.opportunities.push(opportunity);
        }
        if (subject.role === 'hitter') { opportunity.batting_order = order; opportunity.prior_lineup = prev && prior.status === 'confirmed' ? { date: prev.day, game_id: prev.id, batting_order: previousOrder, was_listed: previousOrder != null } : null; }
        else { opportunity.starting_pitcher_status = 'probable'; opportunity.planned_innings = null; opportunity.opener_or_bulk_role = 'unconfirmed'; }
        if (!subject.current) candidate.limitations.push('Today\'s batting lineup is not posted. Prior lineup membership does not confirm today\'s start or batting order.');
        if (current.status === 'partial') candidate.limitations.push('The provider batting lineup is incomplete or conflicting.');
      }
    }
  }
  coverage.candidates_available = pool.size;
  const candidates = selectCandidates([...pool.values()], max);
  if (!candidates.length) return result;
  const selectedIds = candidates.map(c => c.player_id);
  const opponentIds = candidates.flatMap(c => c.context.opportunities.map(o => o.opponent_pitcher?.player_id)).filter(Boolean);
  const opponentOrders = new Map(candidates.map(c => [c.id, opposingOrders(c, lineups, previous, teams, date)]));
  const opponentBatterIds = [...opponentOrders.values()].flatMap(orders => orders.flatMap(order => order.batters.map(b => b.player_id)));
  const seasonPlayerIds = [...new Set([...selectedIds, ...opponentIds, ...opponentBatterIds])];
  const recentGameIds = [...gameIndex].filter(([, game]) => {
    const day = game?.date && etDateStr(game.date);
    return day && day < date && day >= shiftDateStr(date, -HISTORY_DAYS) && final(game) && regular(game);
  }).map(([gid]) => gid);
  const chunks = [];
  for (let i = 0; i < recentGameIds.length; i += 35) chunks.push(recentGameIds.slice(i, i + 35));
  const rawStats = (await mapLimit(chunks, gameIds => read('BDL recent game stats', () => bdl.getMlbGameStats({ gameIds, playerIds: selectedIds, seasons: [season], throwOnError: true }), [], true))).flat();
  const [seasonRows, batterX, pitcherX] = await mapLimit([
    ['BDL season stats', () => bdl.getMlbPlayerSeasonStats({ season, playerIds: seasonPlayerIds, throwOnError: true }), [], true],
    ['Baseball Savant batter expected stats', () => sources.getBatterXStats(season), []],
    ['Baseball Savant pitcher expected stats', () => sources.getPitcherXStats(season), []],
  ], ([label, fn, fallback, mandatory]) => read(label, fn, fallback, mandatory));
  const days = [];
  for (let day = date; day <= end; day = shiftDateStr(day, 1)) days.push(day);
  const schedule = (await mapLimit(days, day => read(`MLB schedule ${day}`, () => sources.getMlbSchedule(day, { throwOnError: true }), [], true))).flat();
  // Current player headers also validate morning fallback subjects still belong
  // to the expected team. A missing header is uncertainty, not a roster claim.
  const headers = await read('BDL player identities', () => bdl.getMlbPlayersByIds([...new Set([...selectedIds, ...opponentBatterIds])], { throwOnError: true }), {}, true);
  const splits = await mapLimit(candidates, c => read(`BDL splits ${c.player_id}`, () => bdl.getMlbPlayerSplits({ playerId: c.player_id, season }), null));

  for (const [index, c] of candidates.entries()) {
    const header = headers?.[c.player_id];
    if (header?.teamId != null && String(header.teamId) !== c.team_id) { coverage.sources_failed.push(`Current team conflicts for ${c.id}`); continue; }
    if (header?.name && nameKey(header.name) !== nameKey(c.name)) { coverage.sources_failed.push(`Current identity conflicts for ${c.id}`); continue; }
    if (!header) c.limitations.push('Current player identity header was not returned.');
    const add = (key, label, source, facts) => c.evidence.push({ id: key, label, source, observed_at: asOf, summary: evidenceSummary(key, facts), facts });
    add('today', `Schedule and lineup for ${date}`, 'BALLDONTLIE pregame lineups', { date, opportunities: c.context.opportunities });
    const reportedStatuses = statuses.rows.filter(row => row.player_id === c.player_id);
    for (const [statusIndex, facts] of reportedStatuses.entries()) {
      const updated = stamp(facts.updated_at), observed = updated || stamp(facts.created_at);
      c.evidence.push({
        id: `published_status_${statusIndex + 1}`, label: `Published player status for ${facts.date}`,
        source: facts.source, observed_at: observed,
        summary: `${facts.date}: ${facts.status}${facts.injury ? `; reported issue: ${facts.injury}` : ''}.${observed ? ` Report ${updated ? 'updated' : 'created'} ${observed}.` : ' Report update time unavailable.'} Current availability is unconfirmed.`,
        facts,
      });
      coverage.status_rows_attached++;
    }
    if (reportedStatuses.length) {
      c.limitations.push(c.context.opportunities.some(o => o.starting_pitcher_status === 'probable')
        ? 'Published status and current probable listing may disagree; availability is unconfirmed.'
        : 'Published status and current lineup listing may disagree; availability is unconfirmed.');
    }
    const seasonFact = seasonFacts(Array.isArray(seasonRows) ? seasonRows : [], c, season);
    if (seasonFact) add('season', `${season} regular season`, 'BALLDONTLIE season stats', seasonFact);
    else c.limitations.push('Season stats were missing or conflicting.');
    for (const order of opponentOrders.get(c.id) || []) {
      const facts = opponentOrderFacts(order, Array.isArray(seasonRows) ? seasonRows : [], season, headers);
      add(`opponent_order_${order.game_id}`, `Opposing batting order: ${order.opponent}`, 'BALLDONTLIE dated lineups and season batting stats', facts);
    }
    if (c.context.roles.includes('hitter')) {
      const opposing = [...new Map(c.context.opportunities.filter(o => o.opponent_pitcher).map(o => [o.opponent_pitcher.player_id, o.opponent_pitcher])).values()];
      if (opposing.length) add('opponent_pitchers', `Opposing probable pitchers for ${date}`, 'BALLDONTLIE lineups and season stats', {
        season, pitchers: opposing.map(p => {
          const opponentSeason = seasonFacts(Array.isArray(seasonRows) ? seasonRows : [], p, season);
          const pitching = opponentSeason && fields(opponentSeason, ARM_SEASON);
          return { ...p, season_stats: pitching && Object.keys(pitching).length ? pitching : null, planned_innings: null, opener_or_bulk_role: 'unconfirmed' };
        }),
      });
    }
    for (const role of c.context.roles) {
      const recent = buildMlbFantasyRecent({ rows: rawStats, gameIndex, player_id: c.player_id, date, role });
      add(`recent_${role}`, `Last ${recent.sample_games} observed ${role === 'hitter' ? 'batting games' : 'pitching outings'} before ${date}`, 'BALLDONTLIE final game stats', recent);
      if (!recent.sample_games) c.limitations.push(`No completed ${role} appearances returned in the prior ${HISTORY_DAYS} days.`);
      if (recent.excluded_conflicting_games) c.limitations.push(`${recent.excluded_conflicting_games} conflicting ${role} game rows excluded.`);
      const xstats = exactXStats(Array.isArray(role === 'hitter' ? batterX : pitcherX) ? (role === 'hitter' ? batterX : pitcherX) : [], c, role);
      if (xstats) add(`expected_${role}`, `${season} contact-based expected stats`, 'Baseball Savant', { season, ...xstats, scope: 'Season contact outcomes; not a forecast for today.' });
      const splitRows = (Array.isArray(splits[index]?.byBreakdown) ? splits[index].byBreakdown : []).filter(r => id(r?.player?.id ?? r?.player_id) === c.player_id && Number(r?.season) === season && r?.category === (role === 'hitter' ? 'batting' : 'pitching') && /^(vs\.? (Left|Right)|vs\.? [LR]H[BP])$/i.test(String(r?.split_name || '')));
      if (splitRows.length) add(`hand_splits_${role}`, `${season} platoon samples`, 'BALLDONTLIE player splits', { season, rows: splitRows.map(r => ({ split: r.split_name, ...fields(r, ['at_bats', 'plate_appearances', 'hits', 'home_runs', 'walks', 'strikeouts', 'avg', 'obp', 'slg', 'ops', 'innings_pitched', 'pitching_outs', 'pitching_era', 'pitching_whip']) })) });
    }
    const team = teams.get(c.team_id), upcoming = [];
    for (const game of schedule) {
      const at = stamp(game?.gameDate), day = game?.officialDate;
      if (!at || !dateValid(day) || day < date || day > end || Date.parse(at) <= Date.parse(asOf) || !pregame(game) || !regular(game)) continue;
      for (const [me, them, home] of [[game?.teams?.home, game?.teams?.away, true], [game?.teams?.away, game?.teams?.home, false]]) {
        if (!sameClub(team, me?.team)) continue;
        const probable = me?.probablePitcher;
        upcoming.push({ mlbam_game_id: id(game.gamePk), date: day, start_at: at, opponent: them?.team?.name || null, home, player_listed_probable: !!(probable?.id && nameKey(probable?.fullName) === nameKey(c.name)), probable_pitcher: probable?.id ? { mlbam_player_id: id(probable.id), name: probable.fullName, status: 'probable' } : null });
      }
    }
    if (upcoming.length) add('upcoming_schedule', `Remaining scheduled games through ${end}`, 'MLB Stats API schedule', { window_start: date, window_end: end, games: [...new Map(upcoming.map(g => [g.mlbam_game_id, g])).values()], future_starts_are_probable: true, rotation_projection_used: false });
    else c.limitations.push('Upcoming official schedule was not matched to this team.');
    c.limitations = [...new Set(c.limitations)];
    result.candidates.push(c);
  }
  coverage.candidates_selected = result.candidates.length;
  coverage.recent_game_ids_requested = recentGameIds.length;
  coverage.recent_stat_rows_returned = rawStats.length;
  coverage.sources_failed = [...new Set(coverage.sources_failed)];
  return result;
}
