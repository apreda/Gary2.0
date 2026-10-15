/**
 * NEW THIS WEEK AND ALREADY OUT (founder GO, Oct 14 2026 night: "Split the injury report into 'new this week' and
 * 'already out,' with how many games the team has played without each player"). The injury report listed every
 * absence the same way, so a player out since September read like this week's news: Gary counted the 49ers' Bosa
 * and Thompson, out two games the 49ers won, as the reason to fade them. Each team's injuries now come in two
 * groups: the players who were in the team's last game (new this week), and the ones it has already played without,
 * with how many games and its record in them. The reserve-list players who have not played this season share one
 * line with that record. Facts only; the injury report's own lines are kept word for word.
 */
const key = (v) => String(v || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
const nick = (team) => String(team).split(' ').pop();
const recordOf = (games) => {
  const w = games.filter((g) => g.scored > g.allowed).length, l = games.filter((g) => g.scored < g.allowed).length;
  const t = games.length - w - l;
  return `${w}-${l}${t ? `-${t}` : ''}`;
};

/**
 * @param {string} section the INJURY REPORT section body as the desk has it
 * @param {{homeTeam:string, awayTeam:string, codeOf:(team:string)=>string, games:Array, snaps:Array}} ctx
 *   games: this season's played regular-season schedule rows before this game; snaps: snap-count rows of those games
 */
export function nflInjuryFreshnessText(section, { homeTeam, awayTeam, codeOf, games, snaps }) {
  const lines = String(section || '').split('\n');
  const head = [];
  const teams = new Map([[awayTeam, { side: 'AWAY', bullets: [], reserve: [] }], [homeTeam, { side: 'HOME', bullets: [], reserve: [] }]]);
  let current = null;
  for (const line of lines) {
    const block = line.match(/^\[(HOME|AWAY)\] (.+?):\s*$/);
    if (block) { current = teams.get(block[2].trim()) || null; if (current) current.side = block[1]; continue; }
    const reserve = line.match(/^(.+?) — also on reserve lists: (.+)$/);
    if (reserve && teams.has(reserve[1].trim())) { teams.get(reserve[1].trim()).reserve.push(...reserve[2].split(/, (?![^()]*\))/).map((s) => s.trim()).filter(Boolean)); continue; }
    const bullet = line.match(/^\s*• (.+?) \(/);
    if (bullet && current) { current.bullets.push({ line: line.replace(/^\s*/, '  '), name: bullet[1].trim() }); continue; }
    if (!current && line.trim()) head.push(line);
  }
  if (![...teams.values()].some((t) => t.bullets.length || t.reserve.length)) return null;

  const out = [...head, ''];
  for (const [team, t] of teams) {
    const code = codeOf(team);
    const teamGames = games.filter((r) => r.home_team === code || r.away_team === code)
      .map((r) => ({ week: Number(r.week), game_id: r.game_id, scored: Number(r.home_team === code ? r.home_score : r.away_score), allowed: Number(r.home_team === code ? r.away_score : r.home_score) }))
      .sort((a, b) => a.week - b.week);
    const lastWeek = teamGames.at(-1)?.week ?? null;
    const weeksFor = (name) => [...new Set(snaps.filter((r) => r.team === code && key(r.player) === key(name)).map((r) => Number(r.week)))];
    // Played in the team's last game, or the weeks he has missed since he last played (none: not in a game this season).
    const standing = (name, tagText = '') => {
      const weeks = weeksFor(name);
      if (lastWeek != null && weeks.includes(lastWeek)) return { fresh: true };
      if (/played in the last game/i.test(tagText) && !/did not play/i.test(tagText)) return { fresh: true };
      const tagged = tagText.match(/last played Wk (\d+)/i);
      const last = weeks.length ? Math.max(...weeks) : tagged ? Number(tagged[1]) : null;
      const without = teamGames.filter((g) => g.week > (last ?? 0));
      if (!without.length) return { fresh: true };
      return { fresh: false, last, without };
    };
    const fresh = [], already = [], allSeason = [];
    for (const b of t.bullets) {
      const s = standing(b.name, b.line);
      if (s.fresh) fresh.push(b.line);
      else already.push(`${b.line} — ${s.last ? `out the last ${s.without.length} game${s.without.length === 1 ? '' : 's'}` : 'not in a game this season'}; the ${nick(team)} are ${recordOf(s.without)} without him`);
    }
    for (const r of t.reserve) {
      const name = r.replace(/\s*\([^)]*\)\s*$/, '');
      const s = standing(name);
      if (s.fresh) fresh.push(`  • ${r} - on a reserve list after playing in the last game`);
      else if (s.last) already.push(`  • ${r} — out the last ${s.without.length} game${s.without.length === 1 ? '' : 's'}; the ${nick(team)} are ${recordOf(s.without)} without him`);
      else allSeason.push(r);
    }
    out.push(`[${t.side}] ${team}:`);
    out.push(`  New this week (in the ${nick(team)}' last game):`, ...(fresh.length ? fresh : ['  none']));
    out.push(`  Already out (the ${nick(team)} have played without them):`, ...(already.length ? already : ['  none']));
    if (allSeason.length) out.push(`  Not in a game this season, also on reserve lists: ${allSeason.join(', ')}`, `    The ${nick(team)} are ${recordOf(teamGames)} without them.`);
    out.push('');
  }
  return out.join('\n').trimEnd();
}

export const _injuryKey = key;

/**
 * THE SHORT LIST (founder, Oct 15 2026: "We basically need to tell Gary who's injured, how long they've been injured,
 * and all that"; the team's record without a player is left off: "'1-0 without them' leads Gary to use that stat").
 * The split report as one line per status for each team: name, position and how long, with no write-ups. Test only
 * for now (Version S).
 */
const POSITION = {
  quarterback: 'QB', 'running back': 'RB', 'wide receiver': 'WR', 'tight end': 'TE', 'offensive tackle': 'OT', tackle: 'OT',
  guard: 'G', 'offensive guard': 'G', center: 'C', 'offensive lineman': 'OL', 'defensive end': 'DE', 'defensive tackle': 'DT',
  'nose tackle': 'NT', 'defensive lineman': 'DL', linebacker: 'LB', 'outside linebacker': 'OLB', 'inside linebacker': 'ILB',
  cornerback: 'CB', safety: 'S', 'defensive back': 'DB', fullback: 'FB', kicker: 'K', punter: 'P', 'long snapper': 'LS', edge: 'EDGE',
};
const STATUS_OUT = /^(out|ir|ir-r|ir-nfi|pup|pup-r|pup-p|nfi|nfi-r|suspended|susp|reserve)/i;
export function nflInjuryListText(section) {
  const out = [];
  let team = null, group = null, lists = null;
  const flush = () => {
    if (!team) return;
    out.push(team);
    for (const [label, names] of lists) if (names.length) out.push(`  ${label}: ${names.join(', ')}`);
    if (![...lists.values()].some((n) => n.length)) out.push('  nobody');
  };
  for (const line of String(section || '').split('\n')) {
    const head = line.match(/^\[(?:HOME|AWAY)\] (.+?):\s*$/);
    if (head) { flush(); team = head[1].trim(); group = null; lists = new Map([['Out', []], ['Doubtful', []], ['Questionable', []], ['Out all season so far, on reserve lists', []]]); continue; }
    if (!team) continue;
    if (/^\s+New this week \(/.test(line)) { group = 'new'; continue; }
    if (/^\s+Already out \(/.test(line)) { group = 'old'; continue; }
    const reserve = line.match(/^\s+Not in a game this season, also on reserve lists: (.+)$/);
    if (reserve) { lists.get('Out all season so far, on reserve lists').push(...reserve[1].split(/, (?![^()]*\))/).map((r) => r.replace(/\s*\([^)]*\)\s*$/, '').trim())); continue; }
    const b = line.match(/^\s*• (.+?) \(([^)]+)\)(?: \(([^)]+)\))?/);
    if (!b || !group) continue;
    const [, name, first, second] = b;
    const position = second ? (POSITION[first.trim().toLowerCase()] || first.trim()) : null;
    const status = (second || first).trim();
    const gone = line.match(/out the last (\d+) games?/);
    const when = group === 'new' ? 'new this week' : gone ? `out the last ${gone[1]} game${gone[1] === '1' ? '' : 's'}` : /not in a game this season/.test(line) ? 'not in a game this season' : 'already out';
    const label = /^doubtful/i.test(status) ? 'Doubtful' : /^questionable/i.test(status) ? 'Questionable' : STATUS_OUT.test(status) ? 'Out' : null;
    if (label) lists.get(label).push(`${name.trim()} (${[position, when].filter(Boolean).join(', ')})`);
  }
  flush();
  return out.join('\n');
}
