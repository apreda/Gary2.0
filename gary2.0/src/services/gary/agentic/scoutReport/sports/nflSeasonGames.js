/**
 * HOW THEY HAVE PLAYED THIS SEASON (founder, Oct 15 2026: "if we're going to show a quarterback's QBR, then it's
 * important just to know who they played in those games, what the score was, and maybe what their stat lines were";
 * "all of that stuff has to go into the kettle"). A season total says little without the games behind it: Kirk
 * Cousins's 11 touchdowns read differently next to the 0-4 Dolphins and Chargers they came against. Each team's
 * season comes as its league ranks on both sides of the ball, then one line per game with the opponent, that
 * opponent's record, the score and how the offense and the defense played. Each quarterback's line comes game by game
 * the same way. Only games played before this one count, from nflverse's weekly team and player box scores.
 */
const nick = (team) => String(team).split(' ').pop();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sign = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
const ordinal = (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`;
const shortDate = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// One team's offense in one game, from its nflverse team-week row.
function offenseOf(row) {
  const plays = num(row.attempts) + num(row.sacks_suffered) + num(row.carries);
  const yards = num(row.passing_yards) - num(row.sack_yards_lost) + num(row.rushing_yards);
  return {
    plays, yards,
    epa: num(row.passing_epa) + num(row.rushing_epa),
    giveaways: num(row.passing_interceptions) + num(row.fumbles_lost_total),
    sacked: num(row.sacks_suffered),
  };
}

const recordText = (r) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`;

/**
 * @param {{teamWeek:Array, playerWeek:Array, schedule:Array, codeOf:(team:string)=>string, nameOf:(code:string)=>string,
 *   homeTeam:string, awayTeam:string, asOf:string, season:string|number, quarterbacks:Object}} ctx
 *   schedule: nflverse schedule rows; asOf: the game's date (YYYY-MM-DD), only games on earlier days count;
 *   quarterbacks: { [teamName]: this week's starter }
 * @returns {{ teams: string, quarterbacks: string }}
 */
export function nflSeasonGamesText({ teamWeek, playerWeek, schedule, codeOf, nameOf, homeTeam, awayTeam, asOf, season, quarterbacks = {}, withGames = true, opponentRecords = true }) {
  const played = schedule.filter((g) => String(g.season) === String(season) && g.game_type === 'REG'
    && g.gameday < asOf && g.home_score !== '' && g.home_score != null && g.home_score !== 'NA' && g.away_score !== '' && g.away_score != null && g.away_score !== 'NA');
  const ids = new Set(played.map((g) => g.game_id));
  const rows = teamWeek.filter((r) => ids.has(r.game_id));
  const rowOf = new Map(rows.map((r) => [`${r.game_id}|${r.team}`, r]));

  // Every team's games and record before this one, for ranks and for each opponent's record.
  const teams = new Map();
  const teamOf = (code) => { if (!teams.has(code)) teams.set(code, { games: [], w: 0, l: 0, t: 0 }); return teams.get(code); };
  for (const g of played) {
    for (const [code, opp, home] of [[g.home_team, g.away_team, true], [g.away_team, g.home_team, false]]) {
      const mine = rowOf.get(`${g.game_id}|${code}`), theirs = rowOf.get(`${g.game_id}|${opp}`);
      const scored = num(home ? g.home_score : g.away_score), allowed = num(home ? g.away_score : g.home_score);
      const t = teamOf(code);
      t.games.push({ g, opp, home, scored, allowed, off: mine ? offenseOf(mine) : null, def: theirs ? offenseOf(theirs) : null });
      if (scored > allowed) t.w++; else if (scored < allowed) t.l++; else t.t++;
    }
  }

  // Season measures; every one is ranked so 1st is best.
  const measures = [
    ['ypp', (s) => s.off.yards / s.off.plays, 'desc'],
    ['epa', (s) => s.off.epa / s.off.plays, 'desc'],
    ['ppg', (s) => s.scored / s.n, 'desc'],
    ['give', (s) => s.off.giveaways, 'asc'],
    ['dypp', (s) => s.def.yards / s.def.plays, 'asc'],
    ['depa', (s) => s.def.epa / s.def.plays, 'asc'],
    ['dppg', (s) => s.allowed / s.n, 'asc'],
    ['take', (s) => s.def.giveaways, 'desc'],
  ];
  const sum = (games, side) => games.reduce((a, x) => (x[side] ? { plays: a.plays + x[side].plays, yards: a.yards + x[side].yards, epa: a.epa + x[side].epa, giveaways: a.giveaways + x[side].giveaways, sacked: a.sacked + x[side].sacked } : a), { plays: 0, yards: 0, epa: 0, giveaways: 0, sacked: 0 });
  const seasons = new Map([...teams].map(([code, t]) => [code, {
    n: t.games.length, off: sum(t.games, 'off'), def: sum(t.games, 'def'),
    scored: t.games.reduce((a, x) => a + x.scored, 0), allowed: t.games.reduce((a, x) => a + x.allowed, 0),
  }]));
  const rankOf = (code, [, f, dir]) => {
    const mine = f(seasons.get(code));
    const better = [...seasons.values()].filter((s) => (dir === 'desc' ? f(s) > mine + 1e-9 : f(s) < mine - 1e-9)).length;
    const tied = [...seasons.values()].filter((s) => Math.abs(f(s) - mine) <= 1e-9).length > 1;
    return `${ordinal(better + 1)}${tied ? ', tied' : ''}`;
  };
  const rank = (code, key) => rankOf(code, measures.find((m) => m[0] === key));

  const vs = (x) => `${x.home ? 'vs' : '@'} ${nick(nameOf(x.opp))}${opponentRecords ? ` (${recordText(teamOf(x.opp))})` : ''}`;
  const result = (x) => `${x.scored > x.allowed ? 'W' : x.scored < x.allowed ? 'L' : 'T'} ${x.scored}-${x.allowed}`;
  const when = (x) => `Wk ${x.g.week} (${shortDate(x.g.gameday)})`;

  const boxOf = (x) => {
    const o = x.off ? `offense ${(x.off.yards / x.off.plays).toFixed(1)} yds/play, EPA ${sign(x.off.epa / x.off.plays)}/play, ${x.off.giveaways} giveaway${x.off.giveaways === 1 ? '' : 's'}, ${x.off.sacked} sack${x.off.sacked === 1 ? '' : 's'} taken` : 'no box score';
    const d = x.def ? `defense ${(x.def.yards / x.def.plays).toFixed(1)} yds/play allowed, EPA ${sign(x.def.epa / x.def.plays)}/play allowed, ${x.def.giveaways} takeaway${x.def.giveaways === 1 ? '' : 's'}, ${x.def.sacked} sack${x.def.sacked === 1 ? '' : 's'}` : '';
    return `${o}${d ? ` · ${d}` : ''}`;
  };
  const teamText = (team) => {
    const code = codeOf(team), t = teams.get(code), s = seasons.get(code);
    if (!t || !s) return `${team}: no games yet this season.`;
    const lines = [
      `${team} (${recordText(t)})`,
      `  Offense: ${(s.off.yards / s.off.plays).toFixed(1)} yards per play (${rank(code, 'ypp')}), EPA per play ${sign(s.off.epa / s.off.plays)} (${rank(code, 'epa')}), ${(s.scored / s.n).toFixed(1)} points a game (${rank(code, 'ppg')}), ${s.off.giveaways} giveaways (${rank(code, 'give')}), ${s.off.sacked} sacks taken`,
      `  Defense: ${(s.def.yards / s.def.plays).toFixed(1)} yards per play allowed (${rank(code, 'dypp')}), EPA per play allowed ${sign(s.def.epa / s.def.plays)} (${rank(code, 'depa')}), ${(s.allowed / s.n).toFixed(1)} points allowed a game (${rank(code, 'dppg')}), ${s.def.giveaways} takeaways (${rank(code, 'take')}), ${s.def.sacked} sacks`,
    ];
    if (withGames) {
      lines.push('  game by game, newest first:');
      for (const x of [...t.games].sort((a, b) => (a.g.gameday < b.g.gameday ? 1 : -1))) lines.push(`    ${when(x)} ${vs(x)}, ${result(x)}: ${boxOf(x)}`);
    }
    return lines.join('\n');
  };

  // Every quarterback who threw for the team in each game, with whom and how.
  const qbText = (team) => {
    const code = codeOf(team), t = teams.get(code);
    const starter = quarterbacks[team];
    const head = `${team}${starter ? `, starting ${starter} this week` : ''}:`;
    if (!t) return `${head}\n  no games yet this season.`;
    const lines = [head];
    for (const x of [...t.games].sort((a, b) => (a.g.gameday < b.g.gameday ? 1 : -1))) {
      const qbs = playerWeek.filter((p) => p.game_id === x.g.game_id && p.team === code && p.position === 'QB' && num(p.attempts) > 0)
        .sort((a, b) => num(b.attempts) - num(a.attempts));
      const each = qbs.map((p) => {
        const drop = num(p.attempts) + num(p.sacks_suffered);
        const rush = num(p.carries) ? `; ${num(p.carries)} rush${num(p.carries) === 1 ? '' : 'es'} for ${num(p.rushing_yards)} yds${num(p.rushing_tds) ? `, ${num(p.rushing_tds)} TD` : ''}` : '';
        return `${p.player_display_name} ${num(p.completions)}/${num(p.attempts)}, ${num(p.passing_yards)} yds, ${num(p.passing_tds)} TD, ${num(p.passing_interceptions)} INT, ${num(p.sacks_suffered)} sack${num(p.sacks_suffered) === 1 ? '' : 's'}, EPA ${sign(drop ? num(p.passing_epa) / drop : 0)}/dropback${rush}`;
      });
      lines.push(`  ${when(x)} ${vs(x)}, ${result(x)}: ${each.length ? each.join(' | ') : 'no passing line'}`);
    }
    return lines.join('\n');
  };

  // Each game's box line by team and date, for the season list (Version S2).
  const boxes = new Map();
  for (const [code, t] of teams) for (const x of t.games) boxes.set(`${code}|${x.g.gameday}`, boxOf(x));
  return {
    boxOf: (team, gameday) => boxes.get(`${codeOf(team)}|${gameday}`) || null,
    teams: [
      `Ranks are among all 32 teams through the games before this one, 1st = best. EPA per play is the expected points each play added (higher is better for an offense, lower for a defense).${withGames && opponentRecords ? ' Records in parentheses are each opponent\'s record before this game.' : ''}`,
      '',
      teamText(awayTeam),
      '',
      teamText(homeTeam),
    ].join('\n'),
    quarterbacks: [qbText(awayTeam), '', qbText(homeTeam)].join('\n'),
  };
}

export const NFL_SEASON_GAMES_TITLE = 'HOW THEY HAVE PLAYED THIS SEASON';
export const NFL_QB_GAMES_TITLE = 'THE QUARTERBACKS, GAME BY GAME';

// ─── Version S2 (founder GO, Oct 15 2026: "give him the full picture") ─────────────────────────────────────────────
const key = (v) => String(v || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
const LINEUP_ROW = /^  (\S.*?): (.+)$/;

/** Who's playing as names by position; the only tag kept is a starter's questionable or doubtful status. */
export function nflLineupNamesOnly(section) {
  return String(section || '').split('\n').map((l) => {
    const m = l.match(LINEUP_ROW);
    if (!m) return l;
    const names = m[2].split('; ').map((p) => {
      const status = (p.match(/\((questionable|doubtful)[^,)]*/i) || [])[1];
      return `${p.replace(/\s*\(.*\)\s*$/, '').trim()}${status ? ` (${status.toLowerCase()})` : ''}`;
    });
    return `  ${m[1]}: ${names.join('; ')}`;
  }).join('\n');
}

/**
 * Each starter's season so far, by position group, from nflverse's weekly player box scores for this team's games
 * before this one: catches and yards for receivers, carries and yards for backs, sacks and pressure for the front,
 * interceptions and passes defended for the secondary. Linemen and quarterbacks have no line here.
 */
export function nflStarterSeasonText(section, { playerWeek, gameIds, codeOfNick }) {
  const ids = new Set(gameIds);
  const sum = (rows, k) => rows.reduce((a, r) => a + num(r[k]), 0);
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const many = (n, one, more) => `${fmt(n)} ${n === 1 ? one : more}`;
  const lineFor = (group, rows) => {
    const bits = [];
    if (group === 'RB') {
      if (sum(rows, 'carries')) bits.push(`${many(sum(rows, 'carries'), 'carry', 'carries')}, ${sum(rows, 'rushing_yards')} yds, ${sum(rows, 'rushing_tds')} TD`);
      if (sum(rows, 'receptions')) bits.push(`${many(sum(rows, 'receptions'), 'catch', 'catches')}, ${sum(rows, 'receiving_yards')} yds`);
    } else if (group === 'WR' || group === 'TE') {
      if (sum(rows, 'targets')) bits.push(`${many(sum(rows, 'receptions'), 'catch', 'catches')} on ${many(sum(rows, 'targets'), 'target', 'targets')}, ${sum(rows, 'receiving_yards')} yds, ${sum(rows, 'receiving_tds')} TD`);
    } else if (group === 'DL' || group === 'LB') {
      const sacks = sum(rows, 'def_sacks'), hits = sum(rows, 'def_qb_hits'), tfl = sum(rows, 'def_tackles_for_loss'), ints = sum(rows, 'def_interceptions');
      if (sacks || hits || tfl) bits.push(`${many(sacks, 'sack', 'sacks')}, ${many(hits, 'QB hit', 'QB hits')}, ${many(tfl, 'tackle for loss', 'tackles for loss')}`);
      if (ints) bits.push(`${ints} INT`);
    } else if (group === 'CB' || group === 'S') {
      const ints = sum(rows, 'def_interceptions'), pd = sum(rows, 'def_pass_defended');
      if (ints || pd) bits.push(`${ints} INT, ${many(pd, 'pass defended', 'passes defended')}`);
    }
    return bits.join('; ');
  };
  const out = [];
  let group = null;
  for (const l of String(section || '').split('\n')) {
    if (/^[A-Z]{1,3}$/.test(l.trim()) && !l.startsWith(' ')) { group = l.trim(); continue; }
    const m = l.match(LINEUP_ROW);
    if (!m || !group || ['QB', 'OL', 'K', 'P', 'LS'].includes(group)) continue;
    const code = codeOfNick(m[1]);
    const each = m[2].split('; ').map((p) => p.replace(/\s*\(.*\)\s*$/, '').trim()).map((name) => {
      const rows = playerWeek.filter((r) => ids.has(r.game_id) && r.team === code && key(r.player_display_name) === key(name));
      const line = rows.length ? lineFor(group, rows) : '';
      return line ? `${name} ${line}` : null;
    }).filter(Boolean);
    if (each.length) out.push(`${group} ${m[1]}: ${each.join(' · ')}`);
  }
  return out.join('\n');
}

/**
 * THE SITUATION with one line per game (Version S2): each game keeps its date, score, halftime and headline, gains how
 * both sides played that day, and drops the opponent's record (founder, Oct 15 2026: a record "doesn't say what
 * happened in those games").
 */
export function nflSituationWithGames(section, { boxOf, year }) {
  const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  const lines = String(section || '').split('\n');
  const out = [];
  let team = null, pending = null;
  const flush = () => { if (pending) { out.push(`      how they played: ${pending}`); pending = null; } };
  for (const l of lines) {
    const head = l.match(/^(\S.+?) \((?:home|road)\): /);
    if (head) { flush(); team = head[1]; out.push(l); continue; }
    const game = l.match(/^    \w{3}, (\w{3}) (\d{1,2}): /);
    if (game && team) {
      flush();
      const month = MONTHS[game[1]];
      const day = `${Number(month) <= 2 ? year + 1 : year}-${month}-${game[2].padStart(2, '0')}`;
      pending = boxOf(team, day);
      out.push(l.replace(/ \(\d+-\d+(?:-\d+)?\)(?= —|$)/, ''));
      continue;
    }
    if (/^      "/.test(l)) { out.push(l); flush(); continue; }
    flush();
    out.push(l);
  }
  flush();
  return out.join('\n');
}

export const NFL_STARTER_SEASON_TITLE = 'THE STARTERS THIS SEASON';
