/**
 * ONE COLLEGE GAME'S BOX SCORE, FROM ESPN (Oct 23 2026 data audit).
 *
 * BDL's college player rows did not add up to the team's own box score in 29 of 39 team-games checked (six teams'
 * seasons: carries, catches or pass attempts one to three off, no overtime, empty rows for players who did not play).
 * ESPN's college box added up in 362 of 372 team-games of weeks 5-8, and its scoring plays reconciled to 185 of the
 * 186 finals. CFBD numbers a game with ESPN's event id and a team with ESPN's team id, so the CFBD row that carries a
 * game's unit lines names its ESPN box.
 *
 * Kept from ESPN's game summary: each team's id, side and final score, every athlete's counted stats by category,
 * and each scoring play's type, text and the score after it. Nothing else is read: the summary's odds,
 * against-the-spread, win-probability, predictor and article fields never leave this file.
 */
import { cachedResearch } from '../../../sharedResearchCache.js';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Gary college desk)', Accept: 'application/json' };
const TIMEOUT_MS = 15_000;
const BOX_TTL_MS = 12 * 60 * 60 * 1000;   // a final's box can be corrected for a day or two after the game
const ROSTER_TTL_MS = 12 * 60 * 60 * 1000;

const num = (value) => {
  if (value === null || value === undefined || value === '' || value === '--') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`ESPN HTTP ${response.status}`);
  return response.json();
}

/** The parts of one ESPN college summary the desk reads; { unavailable, reason } unless the game is final. */
export function gameBoxFromSummary(summary, eventId) {
  const competition = summary?.header?.competitions?.[0];
  const status = competition?.status?.type;
  if (!(status?.completed === true || /FINAL/i.test(String(status?.name || '')))) return { unavailable: true, reason: `ESPN game ${eventId} is not final` };
  // Each side's score by quarter too (Oct 27 2026, the game-by-game system).
  const teams = (competition?.competitors || []).map((c) => ({ id: String(c?.team?.id ?? c?.id ?? ''), homeAway: c?.homeAway, score: num(c?.score),
    quarters: Array.isArray(c?.linescores) ? c.linescores.map((l) => num(l?.displayValue ?? l?.value)) : null }));
  const players = [];
  // Each team's own defensive totals row (round 12: the athletes' sack credits ran one over it, a sack wiped out by a foul).
  const defTotals = {};
  for (const side of summary?.boxscore?.players || []) {
    const teamId = String(side?.team?.id ?? '');
    const byId = new Map();
    for (const group of side?.statistics || []) {
      const keys = (group?.keys || []).flatMap((k) => String(k).split('/'));
      if (group?.name === 'defensive' && Array.isArray(group?.totals)) { const tv = group.totals.flatMap((v) => String(v).split('/')); defTotals[teamId] = Object.fromEntries(keys.map((k, i) => [k, num(tv[i])])); }
      for (const entry of group?.athletes || []) {
        const id = String(entry?.athlete?.id ?? '');
        if (!id || !group?.name) continue;
        const values = (entry?.stats || []).flatMap((v) => String(v).split('/'));
        const player = byId.get(id) || { id, teamId, first: entry.athlete.firstName || '', last: entry.athlete.lastName || '', name: entry.athlete.displayName || '', jersey: entry.athlete.jersey ?? null, stats: {} };
        player.stats[group.name] = Object.fromEntries(keys.map((k, i) => [k, num(values[i])]));
        byId.set(id, player);
      }
    }
    players.push(...byId.values());
  }
  if (!teams.length || !players.length) return { unavailable: true, reason: `ESPN game ${eventId} has no box score` };
  // Each team's game totals as ESPN states them (yards, first downs, third and fourth downs, penalties, possession).
  for (const side of summary?.boxscore?.teams || []) {
    const t = teams.find((x) => x.id === String(side?.team?.id ?? ''));
    if (t) t.totals = Object.fromEntries((side?.statistics || []).map((x) => [x.name, x.displayValue]));
  }
  const scoring = (summary?.scoringPlays || []).map((p) => ({ type: p?.type?.text ?? null, scoringType: p?.scoringType?.name ?? null,
    text: String(p?.text || ''), home: num(p?.homeScore), away: num(p?.awayScore), period: num(p?.period?.number), clock: p?.clock?.displayValue ?? null,
    teamId: String(p?.team?.id ?? '') }));
  // Every field goal try with its distance and result, from the play-by-play (Oct 24 2026: "FG 0-of-2" needs the 32 and
  // the 55 behind it). Only the drives' plays are read.
  const fieldGoals = [];
  // The kickers the box itself lists, to name each try by (round 8).
  const boxKickers = players.filter((p) => p.stats?.kicking).map((p) => ({ last: String(p.last || '').toLowerCase().trim(), label: `${String(p.first || '').charAt(0)}.${p.last}` })).filter((k) => k.last);
  for (const drive of summary?.drives?.previous || []) {
    const teamId = String(drive?.team?.id ?? '');
    for (const play of drive?.plays || []) {
      const type = String(play?.type?.text || '');
      if (!/field goal/i.test(type)) continue;
      const text = String(play?.text || '');
      // A blocked or missed kick's return is told as the return ("Donovan Dunmore 55 Yd Return of Blocked Field Goal"):
      // no kicker in it, and its yards are the return's; the try's distance is then from the line of scrimmage (Oct 29
      // 2026 hunt: Eastern Michigan's blocked try read as a kicker "o.Blocked" from 55).
      const returned = /\breturn(?:s|ed)?\b/i.test(text); // "returns blocked FG 88 yds" too (round 9)
      const fromLine = Number.isFinite(Number(play?.start?.yardsToEndzone)) ? Number(play.start.yardsToEndzone) + 17 : null;
      const yards = returned ? fromLine : num(text.match(/(\d+)\s*(?:yd|yards?)/i)?.[1]);
      // Who kicked it (founder, Oct 24 2026: a miss says nothing about today if someone else kicks today).
      // ESPN's short form too, "Gabe Panikowski 46 yd FG GOOD" (Oct 29 2026 hunt, round 7: read "kicker not named").
      const named = returned ? '' : (text.match(/(?:#\d+\s+)?([A-Z][A-Za-z.'-]*(?:\s[A-Z][A-Za-z'-]+)?)\s+(?:\d+\s*(?:[Yy][Dd][Ss]?|yards?)\s+)?(?:[Ff]ield [Gg]oal|FG\b)/)?.[1] || '').trim();
      // One spelling per kicker: ESPN writes both "D.Kelly" and "Dieter Kelly" in one game. The box's own kicker when the
      // last word of the name matches one (round 8: "Jacobo Echeverria Lozano" read as two kickers, J.Echeverria Lozano and
      // E.Lozano).
      const parts = named.split(/\s+/);
      const boxKicker = named ? boxKickers.find((k) => k.last && named.toLowerCase().endsWith(k.last)) : null;
      const kicker = !named ? null : boxKicker ? boxKicker.label : parts.length > 1 && !named.includes('.') ? `${parts[0][0]}.${parts.slice(1).join(' ')}` : named;
      fieldGoals.push({ teamId, yards, kicker, made: /good/i.test(type) && !/no good|missed|blocked/i.test(type), blocked: /blocked/i.test(type) });
    }
  }
  // How each drive ended and where it began (Oct 24 2026 read check: Indiana's first touchdown against Ohio State came
  // from the Ohio State 7 after an interception, and nothing showed it). Counts only.
  // A drive ESPN gives no result takes its last play's (Oct 29 2026 hunt: Michigan's fifth punt read "1 ,"); one whose
  // only plays were penalties with no snap is not a possession.
  const LAST_PLAY = [[/blocked punt/i, 'BLOCKED PUNT'], [/punt/i, 'PUNT'], [/blocked field goal/i, 'BLOCKED FG'], [/field goal (?:good|made)/i, 'FG'],
    [/field goal|missed/i, 'MISSED FG'], [/interception/i, 'INT'], [/fumble/i, 'FUMBLE'], [/safety/i, 'SAFETY'], [/touchdown/i, 'TD'], [/end of (?:half|period|2nd)/i, 'END OF HALF'], [/end of game/i, 'END OF GAME']];
  // A snap is a play the drive's own team ran from scrimmage: not a timeout, a period's end, a kick, a punt, a foul alone or
  // a try after a TD (round 10: the other team's timeouts, measured from its side, counted as trips inside the 20).
  const NOT_SNAP = /timeout|end (?:of )?(?:period|quarter|half|game|regulation)|kickoff|punt|penalty|extra point|two.?point|2pt|coin toss/i;
  const snapsOf = (d) => (d?.plays || []).filter((p) => !NOT_SNAP.test(String(p?.type?.text || ''))
    && (p?.start?.team?.id == null || String(p.start.team.id) === String(d?.team?.id ?? '')));
  const drives = (summary?.drives?.previous || []).filter((d) => {
    const plays = d?.plays || [];
    // A kick the other team fumbled, or a foul alone, is not a possession of the team ESPN names (round 10: Charleston
    // Southern's kickoff fumble read as a Clemson drive ending in a lost fumble).
    return !plays.length || snapsOf(d).length > 0;
  }).map((d) => {
    const at = String(d?.start?.text || '').match(/^([A-Za-z&]+)\s+(\d+)$/);
    const lastPlay = (d?.plays || []).at(-1), lastType = String(lastPlay?.type?.text || '');
    // A drive that ends on a kneel-down ran out the half or the game; any other drive ESPN leaves blank says so (Oct 29
    // 2026 hunt, round 7: Oregon State's last drive at Colorado State, kneel-downs at 0:43 and 0:40, read "1 ;").
    const kneel = /kneel/i.test(String(lastPlay?.text || '')) ? (Number(lastPlay?.period?.number) >= 4 ? 'END OF GAME' : 'END OF HALF') : null;
    // "END OF QUARTER" is not how a drive ends: its last play says, or the result is not on file (round 8: three Penn State
    // drives at Wisconsin, a punt among them, read "ended a half").
    const given = String(d?.result || d?.displayResult || '').toUpperCase();
    const fromPlay = LAST_PLAY.find(([re]) => re.test(lastType))?.[1];
    // A fumble ESPN hangs on a punt or kickoff row was the other team's (a muff), or on a game's-end row is no result.
    // Judged by the last real play, not a timeout or a period's end after it (round 11: Notre Dame's lost fumble at the
    // BYU 8 just before half read "result not on file").
    const lastReal = String([...(d?.plays || [])].reverse().find((p) => !/timeout|end (?:of )?(?:period|quarter|half|game|regulation)/i.test(String(p?.type?.text || '')))?.type?.text || '');
    const fumbleOnKick = given === 'FUMBLE' && /punt|kickoff/i.test(lastReal);
    const result = (fumbleOnKick ? (/punt/i.test(lastReal) ? 'PUNT' : 'NO RESULT')
      : given && given !== 'END OF QUARTER' ? given : fromPlay || kneel || (given === 'END OF QUARTER' || d?.plays?.length ? 'NO RESULT' : '')).toUpperCase();
    // Where it began from ESPN's yard line, counted from the home team's goal line (round 8: Buffalo is "BUFF" but its
    // field says "BUF 25", and every Buffalo and Air Force drive read "began in the other team's half"). A start at the
    // 0 is not a place a drive begins: not on file (ESPN gave Wisconsin four "PSU 0" starts).
    const yl = Number(d?.start?.yardLine), home = teams.find((t) => t.homeAway === 'home')?.id;
    const own = Number.isFinite(yl) && yl > 0 && yl < 100 ? (String(d?.team?.id ?? '') === home ? yl : 100 - yl) : null;
    // Where its first snap was, when it has one: a kickoff moved by a foul leaves ESPN's drive start at the kicking team's
    // 35 (round 10: Texas State's drive from its own 38 read "began in the other team's half").
    const snaps = snapsOf(d), first = Number(snaps[0]?.start?.yardsToEndzone);
    const oppHalf = Number.isFinite(first) && first > 0 && first < 100 ? first < 50
      : own != null ? own > 50 : Boolean(at && Number(at[2]) > 0 && at[1] !== d?.team?.abbreviation && Number(at[2]) < 50);
    // Inside the other team's 20 on any of its snaps (round 9: the college reads had no red-zone trips; the NFL's do).
    // A foul inside the 20 counts too: the ball was there (round 12: San Diego State's drive to the Fresno 16, pushed back
    // by a false start, was a trip in the official box).
    // Only fouls before the drive's touchdown: a delay of game on the try starts at the 3 (round 13: Ole Miss's 62-yard
    // touchdown drive read as a red-zone trip).
    const tdAt = (d?.plays || []).findIndex((p) => /touchdown/i.test(String(p?.type?.text || '')));
    const fouls = (d?.plays || []).filter((p, k) => (tdAt < 0 || k < tdAt) && /penalty/i.test(String(p?.type?.text || '')) && !/kickoff|extra point|two.?point|2pt/i.test(String(p?.text || ''))
      && String(p?.start?.team?.id ?? d?.team?.id ?? '') === String(d?.team?.id ?? ''));
    const inside20 = [...snaps, ...fouls].some((p) => { const y = Number(p?.start?.yardsToEndzone); return Number.isFinite(y) && y > 0 && y <= 20; });
    // An overtime possession starts at the 25 by rule (round 10: Miami's two overtime TDs read as short fields).
    const ot = Number(d?.start?.period?.number ?? d?.plays?.[0]?.period?.number) > 4;
    return { teamId: String(d?.team?.id ?? ''), result, oppHalf, inside20, ot };
  });
  // Each offense's sacks and the yards they lost, from the play-by-play (Oct 25 2026 read review: college counts sacks as
  // runs, and Auburn's, Texas's and Cincinnati's rushing totals were read with the sack losses inside them).
  // The team is the play's own possession (a drive's team was wrong on some sacks) and the yards are the play's words
  // ("sacked for loss of 14 yards"; its yardage field read 0 on that one). A sack whose yards the text doesn't give
  // leaves the game's sacks not on file.
  let sacks = {};
  for (const drive of summary?.drives?.previous || []) {
    for (const play of drive?.plays || []) {
      // A sack whatever ESPN types the play: strip-sacks are "Fumble Recovery (Own)", some are "Penalty" with the foul
      // declined (round 9: Florida's five sacks of Arch Manning read four). A play wiped out by an accepted foul is none.
      // The final ruling only: a sack that replay overturned is told after "(Original Play:" (round 10: Pitt at Boston
      // College counted one).
      const type = String(play?.type?.text || '').trim(), said = String(play?.text || '').split(/\(Original Play/i)[0];
      const isSack = /^sack$/i.test(type) || (/\bsacked\b/i.test(said) && !/no play/i.test(said) && (!/^penalty$/i.test(type) || /declined/i.test(said)));
      if (!sacks || !isSack) continue;
      const teamId = String(play?.start?.team?.id ?? drive?.team?.id ?? '');
      // The yards from the words, else the play's own yardage (round 13: an intentional grounding typed "Sack" has no
      // yards in its words and blanked the game's sacks); a play with neither leaves only that sack's yards unknown.
      const m = said.match(/loss of (\d+) yards?/i) || said.match(/sacked\s+by [^,]*? for -(\d+) y(?:ar)?ds?/i);
      const yds = m ? Number(m[1]) : Number.isFinite(Number(play?.statYardage)) ? -Number(play.statYardage) : null;
      const s = sacks[teamId] || (sacks[teamId] = { n: 0, yards: 0 });
      s.n += 1; if (yds != null) s.yards -= yds; else s.unknownYards = true;
    }
  }
  // Everyone the play-by-play names ("#99 R.Porter" on a tackle, "#13 C.Durr Jr." on a target), as jersey|name keys
  // (Oct 24 2026 read check: the box score lists only players with a stat, so a starting lineman with no tackle and a
  // receiver with no catch read as absent; Rutgers' Rondo Porter made a tackle for loss the box never credited).
  const named = new Set();
  for (const drive of summary?.drives?.previous || []) {
    for (const play of drive?.plays || []) {
      for (const m of String(play?.text || '').matchAll(/#(\d{1,2})\s+([A-Z])[A-Za-z'-]*\.\s?([A-Z][A-Za-z'-]+)/g)) named.add(`${Number(m[1])}|${playKey(m[2], m[3])}`);
    }
  }
  // Plays of 20 yards or more from scrimmage and who made them (Oct 29 2026, founder: "literally everything that happened
  // in the game"). Null when the game has no play-by-play.
  const BIG = /^(Rush|Rushing Touchdown|Pass Reception|Passing Touchdown)$/;
  const bigPlays = (summary?.drives?.previous || []).length ? (summary.drives.previous || []).flatMap((d) => (d?.plays || [])
    .filter((p) => BIG.test(String(p?.type?.text || '')) && Number(p?.statYardage) >= 20)
    .filter((p, i, a) => !p?.id || a.findIndex((x) => x?.id === p.id) === i)
    .map((p) => { const t = String(p.text || ''); const pass = /Pass/.test(p.type.text);
      return { teamId: String(p?.start?.team?.id ?? d?.team?.id ?? ''), yards: Number(p.statYardage), kind: pass ? 'catch' : 'run', who: bigPlayWho(t, pass) }; })) : null;
  // Players the play-by-play marks hurt, when, and whether a later play names them (round 11: Colorado State's Mel Brown
  // went out in the second quarter against San Diego State and neither read said so). The side from the box's players.
  const allPlays = (summary?.drives?.previous || []).flatMap((d) => d?.plays || []);
  const hurt = [];
  allPlays.forEach((p, i) => {
    // Every "#N X.Name" in the list before "injured" ("#71 R.Fullwood and #55 J.Doe injured"), matched to a side by jersey
    // and name, else the play's own team when he is the ball carrier or passer; else said not on file (round 12).
    const NAME_RE = "#(\\d{1,2})\\s+([A-Z][\\w'-]*\\.\\s?[A-Z][\\w'-]+(?:\\s(?:Jr\\.?|Sr\\.?|II|III|IV))?)";
    for (const seg of String(p?.text || '').matchAll(new RegExp(`((?:${NAME_RE}(?:,\\s*|\\s+and\\s+)?)+)\\s+injured\\b`, 'g'))) {
      for (const m of seg[1].matchAll(new RegExp(NAME_RE, 'g'))) {
        const jersey = m[1], who = m[2].replace(/\.\s?/, '.');
        const later = allPlays.slice(i + 1).some((q) => new RegExp(`#${jersey}\\s+${who.replace('.', '\\.\\s?')}\\b`).test(String(q?.text || '')));
        const [init, last] = who.split('.');
        const byName = (x) => x.first?.[0] === init[0] && String(x.last || '').toLowerCase().startsWith(String(last || '').split(' ')[0].toLowerCase());
        const owner = players.find((x) => String(x.jersey ?? '') === jersey && byName(x)) || players.find(byName);
        const carrier = new RegExp(`^(?:\\(\\d{1,2}:\\d{2}\\)\\s*)?(?:[\\w-]+\\s+)*#${jersey}\\s+${who.replace('.', '\\.\\s?')}\\s+(?:rush|pass|run|scramble)`, 'i').test(String(p?.text || ''));
        hurt.push({ who, jersey, teamId: owner?.teamId || (carrier ? String(p?.start?.team?.id ?? '') || null : null), period: Number(p?.period?.number) || null, clock: p?.clock?.displayValue || null, later });
      }
    }
  });
  return { eventId: String(eventId), teams, players, defTotals, scoring, fieldGoals, drives, bigPlays, hurt, named: [...named], sacks: (summary?.drives?.previous || []).length ? sacks : null };
}

// Who made a 20+ yard play, from ESPN's words in either form (round 9: 798 of 812 read "?"): "#12 A.Philo pass complete
// short right to #1 V.Brown III caught at FAU50, for 49 yards", "#13 J.Baugh rush right for 25 yards gain", the scoring
// form "TK Keyes 76 Yd pass from Goose Crowder (Ethan Head Kick)" and "Jamal Roberts 13 Yd Run (...)".
const NAME = "\\p{Lu}[\\p{L}.'-]*(?:\\s(?:\\p{Lu}[\\p{L}.'-]*|Jr\\.?|Sr\\.?|II|III|IV))*";
export function bigPlayWho(text, pass) {
  // The try after a TD is told in parentheses; its receiver is not the TD's (round 11: Bert Emanuel Jr. read for Jordan
  // Napier's 24-yard catch).
  const t = String(text || '').replace(/^\(\d{1,2}:\d{2}\)\s*/, '').replace(/\s*\([^()]*(?:conversion|kick|pat|two-point|2pt)[^()]*\)\s*$/i, '');
  const tries = pass
    ? [new RegExp(`\\bto (?:#\\d+\\s+)?(${NAME})(?:\\s+caught|\\s+for\\b|,|$)`, 'u'), new RegExp(`^(${NAME}) \\d+ Yd pass from`, 'iu')]
    : [new RegExp(`#\\d+\\s+(${NAME}) (?:rush|run)\\b`, 'iu'), new RegExp(`^(${NAME}) \\d+ Yd Run`, 'iu'), new RegExp(`^(${NAME}) (?:rush|run)\\b`, 'iu')];
  for (const re of tries) { const m = t.match(re); if (m) return m[1].replace(/\s+(?:pass|rush|run|complete).*$/i, '').trim(); }
  return null;
}

/** A player's play-by-play key: first initial and the first word of the last name, letters only ("r|porter"). */
export const playKey = (first, last) => `${String(first || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 1)}|${String(last || '').split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '')}`;

/** Whether a game's play-by-play names this player: by jersey and name when his jersey is known, else by name. */
export function namedInPlays(named, { first, last, jersey } = {}) {
  if (!named?.length || !first || !last) return false;
  const key = playKey(first, last);
  return jersey != null && jersey !== '' ? named.includes(`${Number(jersey)}|${key}`) : named.some((k) => k.endsWith(`|${key}`));
}

/** ESPN's team totals for one side of a game as the unit lines read them (CFBD's keys; "26/36" as "26-36"), or null. */
export function espnUnitTotals(box, teamId) {
  const t = (box?.teams || []).find((x) => x.id === String(teamId))?.totals;
  if (!t?.completionAttempts) return null;
  const m = new Map(Object.entries(t).map(([k, v]) => [k, k === 'completionAttempts' ? String(v).replace('/', '-') : v]));
  // Sacks and tackles for loss from ESPN's defensive credits, which match the school's stat crew (round 11: CFBD's team
  // box had Arizona's six sacks at Washington State as three).
  const tot = box?.defTotals?.[String(teamId)];
  if (tot && Number.isFinite(Number(tot.sacks))) { m.set('sacks', Number(tot.sacks)); if (Number.isFinite(Number(tot.tacklesForLoss))) m.set('tacklesForLoss', Number(tot.tacklesForLoss)); return m; }
  const mine = (box?.players || []).filter((p) => p.teamId === String(teamId) && p.stats?.defensive);
  if (mine.length) {
    const sum = (k) => Math.round(mine.reduce((a, p) => a + (Number(p.stats.defensive[k]) || 0), 0) * 2) / 2;
    m.set('sacks', sum('sacks')); m.set('tacklesForLoss', sum('tacklesForLoss'));
  }
  return m;
}

/** A game's flow from one team's side, from the box: every score in order with the score after it (that team's first),
 * the largest lead each way, lead changes, possession, quarterback hurries and plays of 20+ yards for both (Oct 29 2026,
 * founder: "who got ahead, how, when did the team go up 14 versus being close the whole game"). Null without scoring. */
export function ncaafFlowLines(box, teamId, names = {}) {
  const us = (box?.teams || []).find((t) => t.id === String(teamId)), them = (box?.teams || []).find((t) => t.id !== String(teamId));
  if (!us || !them || !Array.isArray(box?.scoring)) return null;
  const name = (id) => names[id] || (id === us.id ? 'them' : 'opponent');
  const score = (p) => (us.homeAway === 'home' ? `${p.home}-${p.away}` : `${p.away}-${p.home}`);
  const when = (p) => (p.period > 4 ? `${p.period - 4 === 1 ? '' : `${p.period - 4}`}OT` : `Q${p.period}${p.clock ? ` ${p.clock}` : ''}`);
  const lead = { [us.id]: null, [them.id]: null }; let sign = 0, changes = 0;
  for (const p of box.scoring) {
    const mine = us.homeAway === 'home' ? p.home - p.away : p.away - p.home;
    for (const [id, by] of [[us.id, mine], [them.id, -mine]]) if (by > 0 && (!lead[id] || by > lead[id].by)) lead[id] = { by, at: when(p) };
    const sg = Math.sign(mine); if (sg) { if (sign && sg !== sign) changes += 1; sign = sg; }
  }
  const leadText = (id) => (lead[id] ? `${name(id)} by ${lead[id].by} (${lead[id].at})` : `${name(id)} never led`);
  // Possession only when the two times add up to the game's 60 minutes (round 12: ESPN's 29:06 and 33:10 in a regulation game).
  const secs = (t) => { const m = String(t || '').match(/^(\d+):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const pa = secs(us.totals?.possessionTime), pb = secs(them.totals?.possessionTime);
  const ot = (box.scoring || []).some((p) => p.period > 4) || (us.quarters?.length || 0) > 4;
  const possession = pa == null || pb == null ? 'possession not on file' : !ot && Math.abs(pa + pb - 3600) > 30 ? "possession not on file (the source's two times do not add up to 60 minutes)" : `possession ${us.totals.possessionTime} to ${them.totals.possessionTime}`;
  const hurries = (id) => (box.players || []).filter((p) => p.teamId === id).reduce((a, p) => a + (Number(p.stats?.defensive?.hurries) || 0), 0);
  // None credited to either side is a stat crew that does not chart hurries, not zero pressure (round 9: Georgia's and
  // Maryland's home boxes show "-" in every QH column, and ESPN writes 0).
  const hurryText = hurries(us.id) + hurries(them.id) === 0 ? 'quarterback hurries not charted in this game\'s box' : `quarterback hurries made ${hurries(us.id)}, taken ${hurries(them.id)}`;
  const big = (id) => (box.bigPlays === null ? 'not on file' : (box.bigPlays || []).filter((b) => b.teamId === id).map((b) => `${b.who || '?'} ${b.yards} ${b.kind}`).join(', ') || 'none');
  return [
    `scoring: ${box.scoring.length ? box.scoring.map((p) => `${when(p)} ${p.teamId === us.id ? name(us.id) : name(them.id)} ${p.text} (${score(p)})`).join(' · ') : 'none'}`,
    `largest lead: ${leadText(us.id)}, ${leadText(them.id)}; the lead changed hands ${changes} time${changes === 1 ? '' : 's'} · ${possession} · ${hurryText}`,
    `plays of 20+ yards: ${name(us.id)} ${big(us.id)} · ${name(them.id)} ${big(them.id)}`,
    ...(box.hurt?.length ? [`hurt during the game (play-by-play): ${box.hurt.map((h) => `${h.teamId ? `${name(h.teamId)} ` : 'team not on file: '}${h.who} (#${h.jersey}, ${h.period > 4 ? 'OT' : `Q${h.period}`}${h.clock ? ` ${h.clock}` : ''}; ${h.later ? 'on a later play' : 'not on a later play'})`).join(', ')}`] : []),
  ];
}

/** One final game's box (cached); { unavailable, reason } when ESPN does not answer or the game is not final. */
export async function getNcaafGameBox(eventId, { fetchImpl = globalThis.fetch } = {}) {
  if (eventId == null) return { unavailable: true, reason: 'no game id' };
  // v12 (Oct 29 2026 hunt, round 7): the short "46 yd FG GOOD" kicker and kneel-down drive endings; v13-14: plays of 20+; v15 (round 8): drive starts by yard line, quarter ends, box kickers; v16 (round 9): big-play names, strip-sacks, red zone, blocked-kick returns; v17 (round 10): snaps by the drive's team, overtime drives, overturned sacks, kick-fumble drives.
  return cachedResearch(`espn_cfb_box_v21:${eventId}`, async () => {
    // A second try after a failure (Oct 27 2026 loop: on Oct 24, 30 of the 56 college sides read some game's player
    // lines "not on file", and the same boxes come back complete the next day; a failed fetch is never cached).
    try {
      return gameBoxFromSummary(await getJson(`${SITE}/summary?event=${eventId}`, fetchImpl).catch(async () => {
        await new Promise((r) => setTimeout(r, 2000));
        return getJson(`${SITE}/summary?event=${eventId}`, fetchImpl);
      }), eventId);
    } catch (error) {
      console.warn(`[NCAAF box] ESPN box for game ${eventId} not retrieved: ${error.message}`);
      return { unavailable: true, reason: error.message };
    }
  }, { ttlMs: BOX_TTL_MS, enabled: fetchImpl === globalThis.fetch && !process.env.VITEST });
}

/** ESPN's roster positions and jerseys for one team, by athlete id: { positions: { id: 'RB' }, jerseys: { id: '99' } }
 * or { unavailable }. */
export async function getNcaafRosterPositions(teamId, { fetchImpl = globalThis.fetch } = {}) {
  if (teamId == null) return { unavailable: true, reason: 'no team id' };
  return cachedResearch(`espn_cfb_roster_v4:${teamId}`, async () => {
    try {
      // The roster page stops at 100 players unless asked for more (Oct 27 2026 data loop: Miami's 117 read as 100, and
      // Malachi Toney, Daylyn Upshaw and Mohamed Toure, starters, had no position).
      const roster = await getJson(`${SITE}/teams/${teamId}/roster?limit=300`, fetchImpl);
      // `byJersey` (jersey -> [first initial and last name]) places a player the box score never lists (round 13: a hurt
      // lineman read "team not on file").
      const positions = {}, jerseys = {}, byJersey = {};
      for (const group of roster?.athletes || []) {
        for (const a of group?.items || []) {
          if (a?.id && a?.position?.abbreviation) positions[String(a.id)] = a.position.abbreviation;
          if (a?.id && a?.jersey != null) { jerseys[String(a.id)] = String(a.jersey); (byJersey[String(a.jersey)] ||= []).push(`${String(a.firstName || '')[0] || ''}|${String(a.lastName || '').toLowerCase()}`); }
        }
      }
      return Object.keys(positions).length ? { positions, jerseys, byJersey } : { unavailable: true, reason: 'ESPN roster empty' };
    } catch (error) {
      console.warn(`[NCAAF box] ESPN roster for team ${teamId} not retrieved: ${error.message}`);
      return { unavailable: true, reason: error.message };
    }
  }, { ttlMs: ROSTER_TTL_MS, enabled: fetchImpl === globalThis.fetch && !process.env.VITEST });
}

const sumOf = (players, category, key) => players.reduce((total, p) => total + (Number(p.stats?.[category]?.[key]) || 0), 0);

/**
 * Whether one team's player lines add up to its CFBD team line: carries, catches and pass attempts each within one
 * (the check the source audit asked for before any player line is shown). `teamLine` is CFBD's category-to-stat map.
 */
export function boxAddsUp(box, teamId, teamLine) {
  const players = (box?.players || []).filter((p) => p.teamId === String(teamId));
  // Against ESPN's own team totals first (round 8: CFBD's team box was the wrong one in Missouri-Troy, Colorado State-
  // Oregon State and an Arizona game, where the official school boxes agree with ESPN, and ESPN's correct player lines
  // were dropped as not adding up); CFBD's line only when ESPN gives none.
  const espn = (box?.teams || []).find((t) => t.id === String(teamId))?.totals;
  const line = espn?.completionAttempts && espn?.rushingAttempts != null ? new Map([['completionAttempts', String(espn.completionAttempts).replace('/', '-')], ['rushingAttempts', espn.rushingAttempts]]) : teamLine;
  const [completions, attempts] = String(line?.get?.('completionAttempts') ?? '').split('-').map(Number);
  const carries = Number(line?.get?.('rushingAttempts'));
  if (!players.length || ![completions, attempts, carries].every(Number.isFinite)) return false;
  // Within one of each: the two sources score the odd play differently (a shovel pass as a run, a scramble as a pass),
  // and an exact match threw out whole games over one carry (Oct 24 2026 read check: Texas Tech at Oregon State, Clemson
  // and California, San Diego State at Toledo). A wider gap is a different box, and the game reads "not on file".
  const near = (a, b) => Math.abs(a - b) <= 1;
  return near(sumOf(players, 'rushing', 'rushingAttempts'), carries) && near(sumOf(players, 'receiving', 'receptions'), completions)
    && near(sumOf(players, 'passing', 'passingAttempts'), attempts);
}

/**
 * One team's player lines for one game, in the row shape the desk's readers use: name and position, the game id
 * the desk knows the game by, and the counts. Passing `interceptions` are thrown; the interceptions category's are
 * made by the defense.
 */
export function playerGameRows(box, teamId, gameId, positions = {}) {
  return (box?.players || []).filter((p) => p.teamId === String(teamId)).map((p) => {
    const s = (category, key) => p.stats?.[category]?.[key] ?? null;
    return { player: { id: p.id, first_name: p.first, last_name: p.last, position_abbreviation: positions[p.id] || '' }, game: { id: gameId },
      passing_completions: s('passing', 'completions'), passing_attempts: s('passing', 'passingAttempts'), passing_yards: s('passing', 'passingYards'),
      passing_touchdowns: s('passing', 'passingTouchdowns'), passing_interceptions: s('passing', 'interceptions'),
      rushing_attempts: s('rushing', 'rushingAttempts'), rushing_yards: s('rushing', 'rushingYards'), rushing_touchdowns: s('rushing', 'rushingTouchdowns'),
      receptions: s('receiving', 'receptions'), receiving_yards: s('receiving', 'receivingYards'), receiving_touchdowns: s('receiving', 'receivingTouchdowns'),
      fumbles_lost: s('fumbles', 'fumblesLost'),
      total_tackles: s('defensive', 'totalTackles'), sacks: s('defensive', 'sacks'), tackles_for_loss: s('defensive', 'tacklesForLoss'),
      passes_defended: s('defensive', 'passesDefended'), qb_hurries: s('defensive', 'hurries'), fumbles_recovered: s('fumbles', 'fumblesRecovered'),
      interceptions: s('interceptions', 'interceptions'),
      field_goals_made: s('kicking', 'fieldGoalsMade'), field_goal_attempts: s('kicking', 'fieldGoalAttempts'),
      extra_points_made: s('kicking', 'extraPointsMade'), extra_point_attempts: s('kicking', 'extraPointAttempts'),
      punts: s('punting', 'punts'), kick_returns: s('kickReturns', 'kickReturns'), punt_returns: s('puntReturns', 'puntReturns') };
  });
}

// What kind of score a scoring play was, from its text first: ESPN's play type is unreliable on returns ("Kickoff"
// on a missed field goal returned 100 yards, "Kickoff Return (Offense)" on a fumble return, no type at all on a
// fumble recovered in the end zone; weeks 6-8 of 2026). The text comes in two styles ("Jordan Shipp 5 Yd pass from
// Billy Edwards Jr." and "B. Atkinson pass to J. Legree for 50 yds, for a TD") and is read without the try in
// parentheses after it ("1 Yd Run (X pass to Y for Two-Point Conversion)" is a rushing TD). Returns are tested
// before the offense's plays, and a blocked punt before a punt return.
const play = (p) => String(p.text || '').replace(/\s*\(.*$/, '');
const KINDS = [
  [(p) => p.scoringType === 'field-goal' || (/\bfield goal\b/i.test(play(p)) && !/return|blocked/i.test(play(p))), 'field goal', 3],
  [(p) => p.scoringType === 'safety' || /\bsafety\b/i.test(play(p)), 'safety', 2],
  [(p) => p.scoringType === 'defensive-two-point-conversion' || /defensive (?:pat|two-point|2pt)/i.test(`${play(p)} ${p.type || ''}`), 'defensive two-point return', 2],
  // Overtime from the third period on is two-point plays only, each its own scoring play ("Levi Davis Two-Point Rush").
  [(p) => /two-point|2-point|\b2pt\b/i.test(play(p)), 'overtime two-point conversion', 2],
  [(p) => /interception return|\bintercepted\b/i.test(play(p)), 'interception-return TD'],
  [(p) => /blocked punt|punt\b.*\bblocked/i.test(play(p)), 'blocked-punt TD'],
  [(p) => /missed (?:fg|field goal)|blocked (?:fg|field goal|kick)|(?:fg|field goal)\b.*\bblocked/i.test(play(p)), 'field-goal-return TD'],
  [(p) => /punt return|\bpunts?\b.*\breturns?\b/i.test(play(p)), 'punt-return TD'],
  [(p) => /kickoff return|\bkick(?:off|s)?\b.*\breturns?\b/i.test(play(p)), 'kickoff-return TD'],
  [(p) => /fumble return|\bfumbled?\b.*\breturns?\b/i.test(play(p)), 'fumble-return TD'],
  // A fumble recovered in the end zone does not say whose fumble it was; the play type sometimes does.
  [(p) => /fumble/i.test(play(p)) && /\(own\)/i.test(p.type || ''), 'TD on the offense\'s own fumble recovery'],
  [(p) => /fumble/i.test(play(p)) && /\(opponent\)/i.test(p.type || ''), 'fumble-return TD'],
  [(p) => /fumble/i.test(play(p)), 'TD on a fumble recovery (whose fumble not on file)'],
  [(p) => /\bpass from\b|\bpass to\b.*\bfor a td\b/i.test(play(p)), 'passing TD'],
  [(p) => /\bYd (?:Run|Rush)\b|\brun for -?\d+ yds?\b.*\bfor a td\b/i.test(play(p)), 'rushing TD'],
];
const ORDER = ['rushing TD', 'passing TD', 'TD on the offense\'s own fumble recovery', 'interception-return TD', 'fumble-return TD',
  'TD on a fumble recovery (whose fumble not on file)', 'punt-return TD', 'kickoff-return TD', 'blocked-punt TD', 'field-goal-return TD',
  'field goal', 'overtime two-point conversion', 'safety', 'defensive two-point return'];
/** One scoring play's kind ("passing TD", "field goal") and the points it must carry, or null when it cannot be told. */
export function scoreKind(p) {
  const kind = KINDS.find(([test]) => test(p));
  return kind ? { kind: kind[1], value: kind[2] || null } : null;
}
const PLURAL = { 'TD on the offense\'s own fumble recovery': 'TDs on the offense\'s own fumble recoveries',
  'TD on a fumble recovery (whose fumble not on file)': 'TDs on fumble recoveries (whose fumbles not on file)', safety: 'safeties' };

/**
 * Where each team's points came from in one game: { [teamId]: { points, kinds: Map(kind -> count) } }, or null when
 * the scoring plays do not add up to the final (a missing play, a score that went down, a play whose kind cannot be
 * told). The side whose score went up on a play scored it; a touchdown's points include the try after it.
 */
export function pointsByKind(box) {
  const home = box?.teams?.find((t) => t.homeAway === 'home'), away = box?.teams?.find((t) => t.homeAway === 'away');
  if (!home || !away || !Array.isArray(box?.scoring)) return null;
  const out = { [home.id]: { points: 0, kinds: new Map() }, [away.id]: { points: 0, kinds: new Map() } };
  let h = 0, a = 0;
  for (const play of box.scoring) {
    if (!Number.isFinite(play.home) || !Number.isFinite(play.away)) return null;
    const dh = play.home - h, da = play.away - a;
    h = play.home; a = play.away;
    if (dh < 0 || da < 0 || (dh > 0) === (da > 0)) return null;
    const side = out[dh > 0 ? home.id : away.id], value = dh || da;
    const kind = scoreKind(play);
    if (!kind) return null;
    // A touchdown is worth 6 to 8 with its try; a field goal 3, a safety or a defensive return of a try 2.
    if (kind.value ? value !== kind.value : value < 6 || value > 8) return null;
    side.points += value;
    side.kinds.set(kind.kind, (side.kinds.get(kind.kind) || 0) + 1);
  }
  if (out[home.id].points !== home.score || out[away.id].points !== away.score) return null;
  return out;
}

/** "1 passing TD, 1 fumble-return TD, 2 field goals", or "no points". */
export function kindsInWords(kinds) {
  const words = ORDER.filter((k) => kinds.get(k)).map((k) => (kinds.get(k) === 1 ? `1 ${k}` : `${kinds.get(k)} ${PLURAL[k] || `${k}s`}`));
  return words.length ? words.join(', ') : 'no points';
}

// ESPN's drive results in words, for both reads (Oct 29 2026 hunt: "1 sf" and "1 punt td" reached Gary as codes).
export const NCAAF_DRIVE_WORD = { TD: 'TD', FG: 'FG', 'MISSED FG': 'missed FG', 'BLOCKED FG': 'blocked FG', PUNT: 'punt', 'BLOCKED PUNT': 'blocked punt',
  INT: 'interception', FUMBLE: 'fumble', DOWNS: 'on downs', SAFETY: 'safety', SF: 'safety', 'INT TD': 'interception returned for a TD',
  'FUMBLE TD': 'fumble returned for a TD', 'FUMBLE RETURN TD': 'fumble returned for a TD', 'PUNT RETURN TD': 'punt returned for a TD', 'PUNT TD': 'punt returned for a TD',
  'BLOCKED PUNT TD': 'blocked punt returned for a TD', 'BLOCKED FG TD': 'blocked FG returned for a TD', 'MISSED FG TD': 'missed FG returned for a TD',
  'END OF HALF': 'end of half', 'END OF GAME': 'end of game', 'NO RESULT': 'result not on file' };
export const ncaafDriveWord = (result) => NCAAF_DRIVE_WORD[String(result || '').toUpperCase()] || String(result || '').toLowerCase();
/** A team's kickoff and punt returns in one game from the box (round 10: the return game was in neither read): "returns:
 * 3 kickoff returns for 71 (long 38), 2 punt returns for 45 (long 31, 1 TD)". Null when the box has no return groups. */
export function ncaafReturns(box, teamId) {
  const mine = (box?.players || []).filter((p) => p.teamId === String(teamId));
  if (!(box?.players || []).some((p) => p.stats?.kickReturns || p.stats?.puntReturns)) return null;
  const sum = (group, k) => mine.reduce((a, p) => a + (Number(p.stats?.[group]?.[k]) || 0), 0);
  const long = (group, k) => Math.max(...mine.filter((p) => p.stats?.[group]).map((p) => Number(p.stats[group][k]) || 0));
  const one = (group, n, yds, lg, td, word) => { const c = sum(group, n); if (!c) return null; const t = sum(group, td);
    return `${c} ${word} return${c === 1 ? '' : 's'} for ${sum(group, yds)} (long ${long(group, lg)}${t ? `, ${t} TD` : ''})`; };
  const parts = [one('kickReturns', 'kickReturns', 'kickReturnYards', 'longKickReturn', 'kickReturnTouchdowns', 'kickoff'),
    one('puntReturns', 'puntReturns', 'puntReturnYards', 'longPuntReturn', 'puntReturnTouchdowns', 'punt')].filter(Boolean);
  return parts.length ? parts.join(', ') : 'no returns';
}

/** A team's red-zone trips in one game and how many ended in a touchdown (round 9, Oct 29 2026: the college reads had
 * none; the NFL's drive line does). Null when the drives carry no snap positions (an older cached box). */
export function ncaafRedZone(drives) {
  if (!drives?.length || drives.every((d) => d.inside20 === undefined)) return null;
  const trips = drives.filter((d) => d.inside20), td = trips.filter((d) => ncaafDriveWord(d.result) === 'TD').length;
  return trips.length ? `red zone ${trips.length} trip${trips.length === 1 ? '' : 's'}, ${td} TD` : 'no red-zone trips';
}

/** Drive results counted in words: "6 punts, 1 safety, 3 on downs, 1 TD". */
export function ncaafDriveTally(results) {
  const counts = new Map();
  for (const r of results) { const w = ncaafDriveWord(r); counts.set(w, (counts.get(w) || 0) + 1); }
  return [...counts].map(([w, n]) => `${n} ${n === 1 || /on downs|TD$|FG$|^end of|not on file$/.test(w) ? w : w === 'safety' ? 'safeties' : `${w}s`}`).join(', ');
}
