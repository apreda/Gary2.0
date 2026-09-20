// Dated observations for the bullpen. No workload threshold establishes availability.
export const BULLPEN_VERSION = 'bullpen-game-evidence-v3';
export const dayOf = value => new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
export const shiftDay = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const dayGap = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
export const number = value => value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export const outsOf = value => {
  const match = String(value ?? '').match(/^(\d+)(?:\.([012]))?$/);
  return match ? Number(match[1]) * 3 + Number(match[2] || 0) : null;
};
export const ipOf = outs => outs == null ? '?' : `${Math.floor(outs / 3)}.${outs % 3}`;
const sum = (rows, key) => rows.some(r => r[key] == null) ? null : rows.reduce((n, r) => n + r[key], 0);
const rate = (n, d, scale = 1) => n == null || !(d > 0) ? null : +(n / d * scale).toFixed(2);
const mean = values => values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : null;
export const isPitcher = p => ['1', 'Y'].includes(String(p?.code)) || ['P', 'TWP'].includes(p?.abbreviation) || p?.type === 'Pitcher';

// Workload follows the baseball playing date, not midnight in Eastern time.
// StatsAPI returns either the original schedule entry (resumeDate) or its
// continuation (resumedFrom + gameDate). Only an actual resumption splits work
// across dates. Without a pitch time, return the latest scheduled playing date.
export function gameWorkDate(game, pitchTime) {
  const original = game.officialDate || dayOf(game.resumedFrom || game.gameDate);
  const resumeAt = game.resumeDate || (game.resumedFrom ? game.gameDate : null);
  if (resumeAt && (pitchTime == null || Date.parse(pitchTime) >= Date.parse(resumeAt))) {
    return game.resumeGameDate || dayOf(resumeAt);
  }
  return original;
}

export function appearance(stat, meta = {}) {
  return { ...meta, outs: outsOf(stat?.inningsPitched), pitches: number(stat?.numberOfPitches),
    role: number(stat?.gamesStarted) === 1 ? 'starter' : number(stat?.gamesStarted) === 0 ? 'relief' : 'unknown',
    er: number(stat?.earnedRuns), runs: number(stat?.runs), hits: number(stat?.hits), bb: number(stat?.baseOnBalls),
    k: number(stat?.strikeOuts), hr: number(stat?.homeRuns), bf: number(stat?.battersFaced),
    saves: number(stat?.saves), holds: number(stat?.holds), blownSaves: number(stat?.blownSaves), finished: number(stat?.gamesFinished),
    inherited: number(stat?.inheritedRunners), inheritedScored: number(stat?.inheritedRunnersScored),
    wildPitches: number(stat?.wildPitches), steals: number(stat?.stolenBases), caughtStealing: number(stat?.caughtStealing),
  };
}

export function summarize(rows) {
  if (!rows.length) return { games: 0, outs: 0, pitches: 0 };
  const result = { games: rows.length };
  for (const key of ['outs', 'pitches', 'er', 'runs', 'hits', 'bb', 'k', 'hr', 'bf', 'saves', 'holds', 'blownSaves', 'finished', 'inherited', 'inheritedScored', 'wildPitches', 'steals', 'caughtStealing']) result[key] = sum(rows, key);
  return { ...result, era: rate(result.er, result.outs, 27), whip: rate(result.hits == null || result.bb == null ? null : result.hits + result.bb, result.outs, 3),
    kPct: rate(result.k, result.bf, 100), bbPct: rate(result.bb, result.bf, 100),
    kMinusBbPct: rate(result.k == null || result.bb == null ? null : result.k - result.bb, result.bf, 100) };
}

// Use each game's pitcher order, including openers and zero-out appearances.
// Position players remain visible separately, never counted as bullpen depth.
export function boxAppearances(box, game, teamId) {
  const sideKey = String(box?.teams?.home?.team?.id) === String(teamId) ? 'home'
    : String(box?.teams?.away?.team?.id) === String(teamId) ? 'away' : null;
  if (!sideKey) throw new Error(`box ${game.gamePk} does not contain team ${teamId}`);
  const side = box.teams[sideKey];
  if (!Array.isArray(side.pitchers)) throw new Error(`box ${game.gamePk} has no pitching order`);
  return side.pitchers.map((id, index) => {
    const p = side.players?.[`ID${id}`];
    if (!p?.person?.fullName || !p.stats?.pitching) throw new Error(`box ${game.gamePk} missing pitcher ${id}`);
    const row = appearance({ ...p.stats.pitching, gamesStarted: index === 0 ? 1 : 0 }, {
      id, name: p.person.fullName, gamePk: game.gamePk, date: game.officialDate || dayOf(game.gameDate),
      gameTime: game.gameDate, gameType: game.gameType, teamId, isHome: sideKey === 'home',
      opponent: game.teams?.[sideKey === 'home' ? 'away' : 'home']?.team?.name || '?',
      positionPlayer: p.position ? !isPitcher(p.position) : null,
    });
    return row;
  });
}

const pitchesOf = play => (play.playEvents || []).filter(e => e.isPitch);
// The first event's base/score state is entry context; later traffic is separate.
export function pitchingDetails(plays, teamIsHome) {
  const map = new Map();
  let away = 0, home = 0, outs = 0, bases = new Map(), halfKey = '';
  for (const play of plays || []) {
    const half = play.about?.halfInning;
    const key = `${half}:${play.about?.inning}`;
    if (key !== halfKey) { bases = new Map(); outs = 0; halfKey = key; }
    const id = play.matchup?.pitcher?.id;
    const defending = teamIsHome ? half === 'top' : half === 'bottom';
    // Runners can be placed automatically in extras or inherited mid-PA.
    for (const runner of play.runners || []) if (runner.movement?.start && runner.details?.runner?.id != null) bases.set(runner.movement.start, runner.details.runner.id);
    // The matchup names the finishing pitcher. A mid-PA change can otherwise
    // assign the outgoing pitcher's pitches to his replacement. Keep the box
    // workload, but leave that PA and the affected entry context unassigned.
    const changes = (play.playEvents || []).filter((e,i,events) => e.details?.eventType === 'pitching_substitution' && events.slice(0,i).some(p=>p.isPitch));
    if (defending && changes.length) {
      for (const affected of new Set([id, ...changes.map(e => e.player?.id)].filter(x => x != null))) {
        if (!map.has(affected)) map.set(affected, { id: affected, entry: null, pitches: [], batters: [], innings: new Set() });
      }
    }
    if (id != null && defending && !changes.length) {
      const detail = map.get(id) || { id, entry: { inning: play.about?.inning, half, outs,
        teamScore: teamIsHome ? home : away, opponentScore: teamIsHome ? away : home,
        runners: [...new Set(bases.values())] }, pitches: [], batters: [], innings: new Set() };
      detail.innings.add(play.about?.inning);
      detail.batters.push({ id: play.matchup?.batter?.id, name: play.matchup?.batter?.fullName,
        hand: play.matchup?.batSide?.code, event: play.result?.eventType, date: play.about?.endTime });
      for (const e of pitchesOf(play)) {
        const c = e.details?.call?.code;
        const b = e.pitchData?.breaks || {};
        detail.pitches.push({ time: e.endTime || e.startTime || play.about?.endTime,
          type: e.details?.type?.code || '?', mph: number(e.pitchData?.startSpeed),
          spin: number(b.spinRate), pfxX: number(e.pitchData?.coordinates?.pfxX), pfxZ: number(e.pitchData?.coordinates?.pfxZ),
          releaseX: number(e.pitchData?.coordinates?.x0), releaseZ: number(e.pitchData?.coordinates?.z0),
          strike: typeof e.details?.isStrike === 'boolean' ? Number(e.details.isStrike) : null,
          swing: ['S', 'W', 'T', 'F', 'L', 'M', 'Q', 'X', 'D', 'E', 'J'].includes(c),
          whiff: ['S', 'W', 'T', 'M', 'Q'].includes(c), exitVelocity: number(e.hitData?.launchSpeed),
          trajectory: e.hitData?.trajectory || null, batterId: play.matchup?.batter?.id,
          batterName: play.matchup?.batter?.fullName, hand: play.matchup?.batSide?.code });
      }
      map.set(id, detail);
    }
    away = number(play.result?.awayScore) ?? away; home = number(play.result?.homeScore) ?? home;
    outs = number(play.count?.outs) ?? outs;
    bases = new Map(['First', 'Second', 'Third'].flatMap(base => play.matchup?.[`postOn${base}`]
      ? [[base, play.matchup[`postOn${base}`].id]] : []));
  }
  return map;
}

export function pitchProfile(pitches) {
  const typed = new Map();
  for (const p of pitches) { if (!typed.has(p.type)) typed.set(p.type, []); typed.get(p.type).push(p); }
  const avg = (rows, key) => mean(rows.map(p => p[key]).filter(n => n != null));
  return [...typed].map(([type, rows]) => ({ type, n: rows.length, usagePct: rate(rows.length, pitches.length, 100),
    mph: avg(rows, 'mph'), spin: avg(rows, 'spin'), pfxX: avg(rows, 'pfxX'), pfxZ: avg(rows, 'pfxZ'),
    releaseX: avg(rows, 'releaseX'), releaseZ: avg(rows, 'releaseZ'),
    swings: rows.filter(p => p.swing).length, whiffs: rows.filter(p => p.whiff).length,
    whiffPct: rate(rows.filter(p => p.whiff).length, rows.filter(p => p.swing).length, 100),
    trackedContact: rows.filter(p => p.exitVelocity != null).length,
    hardHitPct: rate(rows.filter(p => p.exitVelocity >= 95).length, rows.filter(p => p.exitVelocity != null).length, 100),
    strikes: rows.some(p => p.strike == null) ? null : rows.reduce((n,p) => n + p.strike, 0),
  })).sort((a,b) => b.n - a.n);
}

export function workload(rows, date, cutoff) {
  const byDay = new Map();
  for (const r of rows) {
    const days = r.pitchDays?.length ? r.pitchDays : [{ date: r.date, pitches: r.pitches }];
    for (const d of days) {
      const prior = byDay.get(d.date);
      byDay.set(d.date, prior === undefined ? d.pitches : prior == null || d.pitches == null ? null : prior + d.pitches);
    }
  }
  const dates = [...byDay.keys()].sort();
  const last = dates.at(-1);
  const onLastDay = rows.filter(r => (r.pitchDays?.length ? r.pitchDays.some(d => d.date === last) : r.date === last));
  // An untracked later outing or resumed game must not inherit an older time.
  const lastPitch = onLastDay.length && onLastDay.every(r => r.lastPitchAt)
    ? onLastDay.map(r => r.lastPitchAt).sort().at(-1) : null;
  const lastGap = last ? dayGap(last, date) : null;
  let streak = 0;
  for (let d = byDay.has(date) ? date : shiftDay(date,-1); byDay.has(d); d = shiftDay(d,-1)) streak++;
  return { byDay: Object.fromEntries([...byDay].sort()), lastDate: last || null,
    fullDaysOff: lastGap == null ? null : Math.max(0, lastGap - 1), daysSinceAppearance: lastGap,
    hoursSinceLastPitch: lastPitch ? +((Date.parse(cutoff) - Date.parse(lastPitch)) / 3600000).toFixed(1) : null,
    consecutiveDays: streak, pitchedToday: byDay.has(date),
    daysInLast4: dates.filter(d => dayGap(d,date) >= 1 && dayGap(d,date) <= 4).length,
    windows: Object.fromEntries([1,2,3,7,14,30].map(n => {
      const days = [...byDay].filter(([d]) => dayGap(d,date) >= 1 && dayGap(d,date) <= n);
      return [n, { days: days.length, pitches: days.some(([,p]) => p == null) ? null : days.reduce((s,[,p]) => s+p,0),
        games: rows.filter(r => (r.pitchDays?.length ? r.pitchDays : [{date:r.date}]).some(d => dayGap(d.date,date)>=1 && dayGap(d.date,date)<=n)).length }];
    })) };
}

export function roleHistory(rows) {
  const relief = rows.filter(r => r.role === 'relief');
  const recent = relief.slice(-10);
  const known = recent.filter(r => r.entry);
  return { appearances: relief.length, recentSample: recent.length, entriesObserved: known.length,
    ninthOrLater: known.filter(r => r.entry.inning >= 9).length,
    leading: known.filter(r => r.entry.teamScore > r.entry.opponentScore).length,
    tied: known.filter(r => r.entry.teamScore === r.entry.opponentScore).length,
    trailing: known.filter(r => r.entry.teamScore < r.entry.opponentScore).length,
    inheritedEntries: relief.filter(r => r.inherited > 0).length,
    multiInning: relief.filter(r => r.outs > 3).length,
    returnedNextCalendarDay: relief.filter((r,i) => i > 0 && dayGap(relief[i-1].date,r.date) === 1).length,
    maxOuts: Math.max(0,...relief.map(r => r.outs || 0)),
    maxPitches: relief.some(r => r.pitches != null) ? Math.max(...relief.map(r => r.pitches || 0)) : null,
  };
}

const show = n => n == null ? '?' : n;
export function statLine(s) {
  return `${s.games} G, ${ipOf(s.outs)} IP, ${show(s.pitches)} pitches, ${show(s.er)} ER, ${show(s.hits)} H, ${show(s.bb)} BB, ${show(s.k)} K, ${show(s.hr)} HR; ERA ${show(s.era)}, WHIP ${show(s.whip)}, K-BB% ${show(s.kMinusBbPct)}`;
}

export const BULLPEN_INTERPRETATION = `Bullpen evidence rules: dates and workloads are observations, not medical clearance. "Available", "limited", "emergency only", or "unavailable" require a dated, attributed report; otherwise availability is UNKNOWN and any usage forecast must be labeled an estimate. A day without an appearance does not prove no warm-ups, no soreness, full recovery, or fitness after an IL activation. Two games separated by an off-day are not consecutive calendar days. Preserve exact dates, full days off and same-day doubleheaders. Do not convert a pitch-count threshold into "fresh" or "tired". Observed maximum outs and manager usage are history, not today's capacity or announced role. Recent velocity, command, contact and matchup samples can be small; do not infer injury or batter-specific weakness from pitcher-only data. Keep unknowns visible, distinguish reporting from inference, and use no evidence published after this snapshot. A pregame snapshot is not a live bullpen monitor.`;
