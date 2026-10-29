/**
 * The season play ledger — every NFL snap, aggregated once (Aug 25 2026).
 *
 * WHY THIS EXISTS. Every football number Gary held was a season average with
 * the situation stripped out. "Points per game" cannot answer whether a team
 * converts on the goal line, whether it survives third-and-long, or whether
 * its quarterback is under siege — and those are the questions a bettor
 * actually asks. Two lanes (GOAL_LINE, EARLY_DOWN_SUCCESS) were declining
 * outright, and the two EPA lanes were named EPA while returning yards.
 *
 * WHAT CHANGED. nflverse publishes a complete season of play-by-play as one
 * file: 372 columns, ~48,700 plays, and it downloads in about three seconds.
 * It carries real EPA, real per-play success, win probability, goal_to_go,
 * seconds remaining in the half, qb_hit, and pass rate over expected. Every
 * split below comes out of it. Nothing here is charted by a vendor and
 * nothing here costs money.
 *
 * THE COST DISCIPLINE. The raw file is ~93MB and must never be touched at
 * pick time. It is streamed once, reduced to a compact per-team aggregate of
 * a few hundred kilobytes, and written to disk. Tokens read the aggregate.
 * A refresh is a weekly job, not a per-game call, and the raw plays are never
 * held in memory beyond the chunk being parsed.
 *
 * SAMPLE HONESTY. Every split reports the play count it was built from. A
 * rate over eleven snaps is not a tendency, and the consumer is given the
 * denominator to say so. Weeks 1-3 of a season genuinely cannot support most
 * of these splits; see nflSeasonPhase.js for how that is handled rather than
 * hidden.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

const RELEASE_BASE = 'https://github.com/nflverse/nflverse-data/releases/download';
const DISK_CACHE_DIR = join(process.env.TMPDIR || '/tmp', 'gary-play-ledger-cache');
// Plays only change when games are played. A week is the natural grain; the
// in-season refresh job re-runs after the slate completes.
const DISK_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
// Bumped when the ledger's shape gains fields, so a cached file built before
// the change is rebuilt rather than read with the new fields missing.
// 2 (Oct 4 2026): per-game run and pass lines, sacks and turnovers.
// 3 (Oct 12 2026): per-game luck-versus-real detail (founder GO: "Fix all those gaps"): how the turnovers
// happened, kicking, returns and points the offense did not score, penalties, and the game script.
// 4 (Oct 12 2026, same night): drives, and each game's roof, temperature, wind and stadium.
// 5 (Oct 13 2026): who started at quarterback, not only who threw the most (founder: Darnold started Week 1
// and got hurt; the line named Lock alone).
// 6 (Oct 13 2026, audit): drives that start with a kickoff the kicking team recovers, and drives that start at a
// bare "50", are counted; temperature and wind fall back to the weather text when their columns are empty.
// 7 (Oct 23 2026 data audit): each game's score by quarter, kneel-downs by who took them, and drives that ran out the
// half, ended in a safety or began in the opponent's territory (and their points).
// 8 (Oct 27 2026 data loop): a kickoff the receiving team fumbled away is its drive, ending in a turnover; a blocked
// punt returned for a touchdown ends the drive as a punt, and a fourth-down kneel-down as the half running out; a
// drive that reached the 20 and ran out the half is a red-zone trip.
// 9-10 (Oct 29 2026, founder GO: "everything that happened in the game"): each team's third and fourth downs with the
// distance (and the field position and score of each fourth-down try), each game's scoring in order with the score
// after it, the largest lead each way and when, lead changes, and time of possession.
const LEDGER_SCHEMA = 10;
const DOWNLOAD_TIMEOUT_MS = 120_000;

/** Only these columns are kept. The other ~340 are discarded while streaming. */
const WANTED = [
  'game_id', 'week', 'season_type', 'posteam', 'defteam', 'play_type',
  'down', 'ydstogo', 'yardline_100', 'goal_to_go', 'half_seconds_remaining',
  'qtr', 'score_differential', 'epa', 'wpa', 'success', 'wp',
  'qb_dropback', 'qb_hit', 'sack', 'pass_oe', 'penalty',
  'passer_player_name', 'rusher_player_name', 'receiver_player_name',
  'yards_gained', 'touchdown', 'interception', 'fumble_lost',
  'third_down_converted', 'fourth_down_converted', 'shotgun', 'no_huddle',
  // Oct 12 2026: the per-game detail that tells a fluke from a trend.
  'fumble', 'fumbled_1_team', 'fumble_recovery_1_team', 'td_team', 'safety',
  'field_goal_result', 'kick_distance', 'extra_point_result', 'punt_blocked', 'own_kickoff_recovery',
  'return_team', 'return_yards', 'penalty_team', 'penalty_yards',
  // Oct 12 2026 (blind spots): the drive each play belongs to, and the game's site and weather.
  'fixed_drive', 'fixed_drive_result', 'drive_first_downs', 'drive_inside20', 'drive_start_yard_line',
  'posteam_score', 'posteam_score_post', 'roof', 'temp', 'wind', 'stadium', 'weather',
  // Oct 23 2026 data audit: the score by quarter, and who took each kneel-down.
  'home_team', 'away_team', 'total_home_score', 'total_away_score', 'rusher_player_id',
  // Oct 29 2026: the game clock, who scored and who kicked, and each drive's time of possession.
  'time', 'td_player_name', 'kicker_player_name', 'drive_time_of_possession'
];

const num = (v) => {
  if (v === '' || v === 'NA' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const flag = (v) => v === '1' || v === 'TRUE' || v === 'true';

/** Split one CSV line, honouring quoted fields. */
function splitLine(line) {
  const out = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

/** True when a line ends mid-quote, meaning the record continues on the next. */
function unbalanced(line) {
  let n = 0;
  for (let i = 0; i < line.length; i += 1) if (line[i] === '"') n += 1;
  return n % 2 === 1;
}

/**
 * THE SITUATIONAL SPLITS.
 *
 * Defined as data so a split is added by naming it, and so the contract test
 * can assert every one of them is actually produced. Each predicate reads a
 * normalised play, never a raw CSV row.
 */
export const SPLITS = [
  { key: 'goal_to_go', label: 'Goal-to-go', test: (p) => p.goalToGo },
  { key: 'short_yardage', label: 'Short yardage (2 or fewer to go)', test: (p) => p.ydstogo != null && p.ydstogo <= 2 },
  { key: 'inside_ten', label: 'Inside the opponent 10', test: (p) => p.yardline100 != null && p.yardline100 <= 10 },
  { key: 'red_zone', label: 'Red zone (inside the 20)', test: (p) => p.yardline100 != null && p.yardline100 <= 20 },
  { key: 'two_minute', label: 'Two-minute (last 2:00 of a half)', test: (p) => p.halfSecs != null && p.halfSecs <= 120 },
  { key: 'early_down', label: 'Early down (first and second)', test: (p) => p.down === 1 || p.down === 2 },
  { key: 'third_and_long', label: 'Third and long (7 or more)', test: (p) => p.down === 3 && p.ydstogo != null && p.ydstogo >= 7 },
  { key: 'third_and_short', label: 'Third and short (3 or fewer)', test: (p) => p.down === 3 && p.ydstogo != null && p.ydstogo <= 3 },
  { key: 'trailing', label: 'Trailing by more than a score', test: (p) => p.scoreDiff != null && p.scoreDiff < -8 },
  { key: 'leading', label: 'Leading by more than a score', test: (p) => p.scoreDiff != null && p.scoreDiff > 8 },
  // Win probability rather than a score rule: a 17-point lead in the first
  // quarter and the same lead with two minutes left are not the same game.
  { key: 'competitive', label: 'While the game was still a contest', test: (p) => p.wp != null && p.wp > 0.05 && p.wp < 0.95 }
];

function emptyAccumulator() {
  const bucket = () => ({ plays: 0, epa: 0, epaPlays: 0, success: 0, successPlays: 0, yards: 0, explosive: 0 });
  const splits = {};
  for (const s of SPLITS) splits[s.key] = bucket();
  return {
    all: bucket(),
    splits,
    dropbacks: 0, qbHits: 0, sacks: 0,
    passOe: 0, passOePlays: 0,
    shotgun: 0, noHuddle: 0, scrimmage: 0,
    turnovers: 0, penalties: 0
  };
}

function addPlay(acc, p) {
  const bump = (b) => {
    b.plays += 1;
    if (p.epa != null) { b.epa += p.epa; b.epaPlays += 1; }
    if (p.success != null) { b.success += p.success; b.successPlays += 1; }
    if (p.yards != null) {
      b.yards += p.yards;
      // The standard explosive-play definition, and a rate rather than the
      // single longest play the old EXPLOSIVE_PLAYS token reported.
      if (p.playType === 'pass' ? p.yards >= 20 : p.yards >= 10) b.explosive += 1;
    }
  };
  bump(acc.all);
  for (const s of SPLITS) if (s.test(p)) bump(acc.splits[s.key]);

  acc.scrimmage += 1;
  if (p.dropback) {
    acc.dropbacks += 1;
    if (p.qbHit) acc.qbHits += 1;
    if (p.sack) acc.sacks += 1;
  }
  if (p.passOe != null) { acc.passOe += p.passOe; acc.passOePlays += 1; }
  if (p.shotgun) acc.shotgun += 1;
  if (p.noHuddle) acc.noHuddle += 1;
  if (p.interception || p.fumbleLost) acc.turnovers += 1;
  if (p.penalty) acc.penalties += 1;
}

const rate = (n, d) => (d > 0 ? Number((n / d).toFixed(4)) : null);
const per = (n, d, dp = 3) => (d > 0 ? Number((n / d).toFixed(dp)) : null);

function finishBucket(b) {
  if (b.plays === 0) return null;
  return {
    plays: b.plays,
    epa_per_play: per(b.epa, b.epaPlays),
    success_rate: rate(b.success, b.successPlays),
    yards_per_play: per(b.yards, b.plays, 2),
    explosive_rate: rate(b.explosive, b.plays)
  };
}

function finishSide(acc) {
  const splits = {};
  for (const s of SPLITS) {
    const done = finishBucket(acc.splits[s.key]);
    // A split with no plays is reported as null with its label, never omitted
    // — an absent key reads as "no tendency" instead of "no snaps".
    splits[s.key] = done ? { label: s.label, ...done } : { label: s.label, plays: 0, note: 'No snaps in this situation' };
  }
  return {
    overall: finishBucket(acc.all),
    splits,
    dropbacks: acc.dropbacks,
    qb_hit_rate: rate(acc.qbHits, acc.dropbacks),
    sack_rate: rate(acc.sacks, acc.dropbacks),
    qb_hits: acc.qbHits,
    sacks: acc.sacks,
    pass_rate_over_expected: acc.passOePlays > 0 ? Number((acc.passOe / acc.passOePlays).toFixed(2)) : null,
    shotgun_rate: rate(acc.shotgun, acc.scrimmage),
    no_huddle_rate: rate(acc.noHuddle, acc.scrimmage),
    turnovers: acc.turnovers,
    penalties: acc.penalties
  };
}

/**
 * THE PER-GAME DETAIL THAT TELLS A FLUKE FROM A TREND (founder GO, Oct 12 2026: "Fix all those gaps").
 * Per team per game, from every play type: how the turnovers happened (interceptions, fumbles and who fell on
 * them, which ones came back for a touchdown), kicking (field goals with the distance of each miss, extra
 * points, blocks), returns of 40 yards or more, special-teams fumbles, onside recoveries, touchdowns and
 * safeties the offense did not score, accepted penalties, and the offense's snaps while the game was still a
 * contest. Facts only. Verified against the 2026 file: on a kickoff the receiving team is posteam; a fumble
 * is lost when someone other than the fumbling team recovers it (out of bounds is kept); a penalty row with
 * penalty = 1 is the enforced one (a declined flag leaves it 0).
 */
function extraUnit() {
  return {
    ints: 0, fumbles: 0, fumblesLost: 0, returnedForTd: 0, defTds: 0, stTds: 0, safeties: 0,
    fgMade: 0, fgAtt: 0, fgMissed: [], fgBlocked: [], xpMade: 0, xpAtt: 0, xpBlocked: 0,
    puntsBlocked: 0, longReturns: [], stFumbles: 0, stFumblesLost: 0, onside: 0,
    penalties: 0, penaltyYards: 0,
    contestPlays: 0, contestEpa: 0, contestEpaN: 0, contestSucc: 0, contestSuccN: 0,
    thirdDowns: [], fourthDowns: []
  };
}

const SCRIMMAGE = new Set(['run', 'pass']);
const KICKS = new Set(['kickoff', 'punt']);

function addGameDetail(perGame, playType, posteam, defteam, g) {
  const E = (code) => (code ? perGame.get(code)?.extra : null);
  if (flag(g('fumble'))) {
    const who = g('fumbled_1_team');
    const rec = g('fumble_recovery_1_team');
    const lost = Boolean(rec) && rec !== who;
    const e = E(who);
    if (e && KICKS.has(playType)) { e.stFumbles += 1; if (lost) e.stFumblesLost += 1; }
    else if (e && SCRIMMAGE.has(playType) && who === posteam) { e.fumbles += 1; if (lost) e.fumblesLost += 1; }
  }
  if (playType === 'pass' && flag(g('interception')) && E(posteam)) E(posteam).ints += 1;
  if (flag(g('touchdown'))) {
    const td = g('td_team');
    if (SCRIMMAGE.has(playType) && td && td === defteam) {
      if (E(defteam)) E(defteam).defTds += 1;
      if (E(posteam)) E(posteam).returnedForTd += 1;
    } else if (td && (KICKS.has(playType) || playType === 'field_goal' || playType === 'extra_point') && E(td)) {
      E(td).stTds += 1;
    }
  }
  if (flag(g('safety')) && E(defteam)) E(defteam).safeties += 1;
  if (playType === 'field_goal' && E(posteam)) {
    const k = E(posteam);
    const result = g('field_goal_result');
    const distance = num(g('kick_distance'));
    k.fgAtt += 1;
    if (result === 'made') k.fgMade += 1;
    else if (result === 'blocked') k.fgBlocked.push(distance);
    else k.fgMissed.push(distance);
  }
  if (playType === 'extra_point' && E(posteam)) {
    const k = E(posteam);
    const result = g('extra_point_result');
    k.xpAtt += 1;
    if (result === 'good') k.xpMade += 1;
    else if (result === 'blocked') k.xpBlocked += 1;
  }
  if (playType === 'punt' && flag(g('punt_blocked')) && E(posteam)) E(posteam).puntsBlocked += 1;
  if (KICKS.has(playType)) {
    const returner = g('return_team');
    const yards = num(g('return_yards'));
    if (returner && yards != null && yards >= 40 && E(returner)) E(returner).longReturns.push({ kind: playType, yards });
  }
  // On a kickoff the receiving team is posteam, so the kicking team that recovers its own kick is defteam.
  if (playType === 'kickoff' && flag(g('own_kickoff_recovery')) && E(defteam)) E(defteam).onside += 1;
  if (flag(g('penalty'))) {
    const e = E(g('penalty_team'));
    if (e) { e.penalties += 1; e.penaltyYards += num(g('penalty_yards')) ?? 0; }
  }
  // Each third and fourth down run from scrimmage, with the distance; a fourth-down try with where and the score
  // (Oct 29 2026, founder: "how the team did on third downs and fourth downs, coupled with down and distance").
  if (SCRIMMAGE.has(playType) && E(posteam)) {
    const down = num(g('down')), togo = num(g('ydstogo'));
    if (down === 3 && togo != null) E(posteam).thirdDowns.push({ togo, made: flag(g('third_down_converted')) || flag(g('touchdown')) && g('td_team') === posteam });
    if (down === 4 && togo != null) E(posteam).fourthDowns.push({ togo, made: flag(g('fourth_down_converted')) || flag(g('touchdown')) && g('td_team') === posteam,
      yardline: num(g('yardline_100')), q: num(g('qtr')), clock: String(g('time') || '').replace(/^0(\d)/, '$1') || null, diff: num(g('score_differential')) });
  }
  if (SCRIMMAGE.has(playType) && E(posteam)) {
    const wp = num(g('wp'));
    if (wp != null && wp > 0.05 && wp < 0.95) {
      const e = E(posteam);
      e.contestPlays += 1;
      const epa = num(g('epa'));
      if (epa != null) { e.contestEpa += epa; e.contestEpaN += 1; }
      const success = num(g('success'));
      if (success != null) { e.contestSucc += success; e.contestSuccN += 1; }
    }
  }
}

/**
 * DRIVES (founder GO, Oct 12 2026, the NFL blind spots): the per-play numbers cannot say why 427 yards became 21
 * points. A drive belongs to the team with the ball (on a kickoff that is the receiving team); its points are that
 * team's score change across the drive, extra points included. Drives that ended a half are left out: a kneel or a
 * last-second heave is not a possession anyone was trying to score on in the usual way, and kickoff-only drives
 * with no snap have no start. Verified against Rams at Eagles, Oct 4 2026: 24 and 20 points, every drive accounted.
 */
function drivePlace(field, team) {
  // nflverse writes a midfield start as a bare "50".
  const m = String(field || '').trim().match(/^(?:([A-Z]+)\s+)?(\d+)$/);
  if (!m) return null;
  const n = Number(m[2]);
  if (!m[1] || m[1] === 'MID') return 50;
  return m[1] === team ? n : 100 - n;
}

function addDriveRow(drives, gameId, posteam, g, playType = '') {
  const id = g('fixed_drive');
  if (!posteam || !id || id === 'NA') return;
  const key = `${gameId}|${id}`;
  const scoreStart = num(g('posteam_score'));
  const scoreEnd = num(g('posteam_score_post'));
  const fresh = () => ({ gameId, team: posteam, result: g('fixed_drive_result') || '', firstDowns: num(g('drive_first_downs')),
    inside20: flag(g('drive_inside20')), start: drivePlace(g('drive_start_yard_line'), posteam),
    scoreStart, scoreEnd, fromKickoff: playType === 'kickoff', lostOnKick: playType === 'kickoff' && flag(g('fumble_lost')),
    top: g('drive_time_of_possession') || null });
  let d = drives.get(key);
  if (!d) {
    drives.set(key, fresh());
    return;
  }
  // A drive that opens with a kickoff belongs to whoever runs the next play: on an onside or muffed kick the
  // kicking team keeps the ball, and the kickoff row named the receiving team (audit, Oct 13 2026: five scoring
  // drives were credited to the wrong team and dropped).
  // A kickoff the receiving team fumbled away is still its possession, ended by a turnover (Oct 27 2026 data loop: 9
  // team games read a turnover fewer in the drives than in the box, as ESPN's drive log has them).
  if (d.fromKickoff && posteam !== d.team && playType !== 'kickoff') {
    // The kickoff row has no drive start; the receiving team lost the ball where the other side's drive begins.
    if (d.lostOnKick) drives.set(`${key}|kick`, { ...d, result: 'Turnover', scoreEnd: d.scoreStart, fromKickoff: false, start: d.start ?? drivePlace(g('drive_start_yard_line'), d.team) });
    drives.set(key, fresh());
    return;
  }
  if (playType !== 'kickoff') d.fromKickoff = false;
  if (posteam !== d.team) return;
  if (!d.top && g('drive_time_of_possession')) d.top = g('drive_time_of_possession');
  if (playType && playType !== 'no_play' && playType !== 'kickoff') d.lastType = playType;
  if (d.scoreStart == null) d.scoreStart = scoreStart;
  if (scoreEnd != null && (d.scoreEnd == null || scoreEnd > d.scoreEnd)) d.scoreEnd = scoreEnd;
  if (d.start == null) d.start = drivePlace(g('drive_start_yard_line'), posteam);
}

/** One game's drives for one team, as counts. Drives that ran out the half are counted apart (`drive_end_of_half`),
 * outside `drives`; drives that began past midfield, in the opponent's territory, are counted with their points
 * (Oct 23 2026 data audit: Denver began 5 of its 12 drives in Chargers territory and scored 20 of its 23 points
 * from them, and the story read the game as "yards about even"). */
function driveTotals(list) {
  const t = { drives: 0, drive_points: 0, drive_tds: 0, drive_fgs: 0, drive_punts: 0, drive_turnovers: 0, drive_downs: 0,
    drive_missed_fgs: 0, drive_safeties: 0, drive_end_of_half: 0, three_and_outs: 0, red_zone_trips: 0, red_zone_tds: 0,
    opp_territory_drives: 0, opp_territory_points: 0, start_sum: 0, start_n: 0, top_seconds: 0 };
  // Time of possession: every drive's clock, the ones that ran out a half included.
  for (const d of list) { const m = String(d.top || '').match(/^(\d+):(\d{2})$/); if (m) t.top_seconds += Number(m[1]) * 60 + Number(m[2]); }
  // The feed's drive result, except where the drive's own last play says otherwise (Oct 27 2026 data loop, against
  // ESPN's drive log): a punt blocked and run back for a touchdown read "Opp touchdown" and counted as the offense's
  // turnover, and a kneel-down on fourth down as a turnover on downs.
  const resultOf = (d) => (d.lastType === 'punt' && /^(Opp touchdown|Turnover|Turnover on downs)$/.test(d.result) ? 'Punt'
    : d.lastType === 'qb_kneel' && /^(Turnover|Turnover on downs)$/.test(d.result) ? 'End of half' : d.result);
  for (const raw of list) {
    const d = { ...raw, result: resultOf(raw) };
    if (d.start == null) continue;
    const pts = d.scoreStart != null && d.scoreEnd != null ? Math.max(0, d.scoreEnd - d.scoreStart) : 0;
    if (d.start > 50) { t.opp_territory_drives += 1; t.opp_territory_points += pts; }
    // A drive that reached the 20 and ran out the half is a red-zone trip that came up empty (Oct 27 2026 data loop: 14
    // team games read a trip short of ESPN's count, the Bears' drive to the 4 before halftime among them); a kneel-down
    // to end it is not.
    if (d.result === 'End of half') { t.drive_end_of_half += 1; if (d.inside20 && d.lastType !== 'qb_kneel') t.red_zone_trips += 1; continue; }
    t.drives += 1;
    t.drive_points += pts;
    if (d.result === 'Touchdown') t.drive_tds += 1;
    else if (d.result === 'Field goal') t.drive_fgs += 1;
    else if (d.result === 'Punt') t.drive_punts += 1;
    else if (d.result === 'Turnover' || d.result === 'Opp touchdown') t.drive_turnovers += 1;
    else if (d.result === 'Turnover on downs') t.drive_downs += 1;
    else if (d.result === 'Missed field goal') t.drive_missed_fgs += 1;
    else if (d.result === 'Safety') t.drive_safeties += 1;
    if (d.result === 'Punt' && d.firstDowns === 0) t.three_and_outs += 1;
    if (d.inside20) { t.red_zone_trips += 1; if (d.result === 'Touchdown') t.red_zone_tds += 1; }
    t.start_sum += d.start; t.start_n += 1;
  }
  const { start_sum, start_n, ...out } = t;
  return { ...out, avg_drive_start: start_n ? Number((start_sum / start_n).toFixed(1)) : null };
}

function finishGameDetail(e) {
  if (!e) return {};
  return {
    interceptions_thrown: e.ints,
    fumbles: e.fumbles,
    fumbles_lost: e.fumblesLost,
    giveaways_returned_for_td: e.returnedForTd,
    defensive_tds: e.defTds,
    special_teams_tds: e.stTds,
    safeties_scored: e.safeties,
    fg_made: e.fgMade, fg_att: e.fgAtt, fg_missed_distances: e.fgMissed, fg_blocked_distances: e.fgBlocked,
    xp_made: e.xpMade, xp_att: e.xpAtt, xp_blocked: e.xpBlocked,
    punts_blocked: e.puntsBlocked,
    long_returns: e.longReturns,
    special_teams_fumbles: e.stFumbles, special_teams_fumbles_lost: e.stFumblesLost,
    onside_recoveries: e.onside,
    penalties: e.penalties, penalty_yards: e.penaltyYards,
    third_downs: e.thirdDowns, fourth_downs: e.fourthDowns,
    contest_plays: e.contestPlays,
    contest_epa_per_play: e.contestEpaN ? Number((e.contestEpa / e.contestEpaN).toFixed(3)) : null,
    contest_success_rate: e.contestSuccN ? Number((e.contestSucc / e.contestSuccN).toFixed(4)) : null
  };
}

/**
 * Stream the season file and reduce it. The raw text never lands in one
 * string and the plays are never collected into an array.
 */
async function streamAndAggregate(season, { fetchImpl = globalThis.fetch } = {}) {
  const url = `${RELEASE_BASE}/pbp/play_by_play_${season}.csv`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  let response;
  try {
    response = await fetchImpl(url, { signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    // A failed fetch is NOT an empty season.
    return { unavailable: true, reason: `Could not reach nflverse for play_by_play_${season}.csv: ${error.message}` };
  }
  if (response.status === 404) {
    clearTimeout(timer);
    return {
      unavailable: true,
      reason: `nflverse has not published play_by_play_${season}.csv yet — that file appears once the ${season} season's first games are played.`
    };
  }
  if (!response.ok) {
    clearTimeout(timer);
    return { unavailable: true, reason: `nflverse returned HTTP ${response.status} for play_by_play_${season}.csv.` };
  }

  const teams = new Map();
  const games = new Map();
  const drives = new Map();
  const gameTeamLines = new Map();
  // Each game's running score at the end of each quarter (5 is overtime), from every row, the quarter-end rows
  // included (Oct 23 2026 data audit: checked against the finals of all 94 games through Week 7 and ESPN's quarter
  // scores of 27).
  const periods = new Map();
  let header = null;
  let idx = null;
  let malformed = 0;
  let rows = 0;

  const sideFor = (code) => {
    if (!teams.has(code)) teams.set(code, { offense: emptyAccumulator(), defense: emptyAccumulator() });
    return teams.get(code);
  };

  const handleRow = (cells) => {
    if (cells.length !== header.length) { malformed += 1; return; }
    rows += 1;
    const g = (name) => cells[idx[name]];

    const qtr = num(g('qtr')), homeNow = num(g('total_home_score')), awayNow = num(g('total_away_score'));
    if (qtr != null && homeNow != null && awayNow != null && g('home_team') && g('away_team')) {
      if (!periods.has(g('game_id'))) periods.set(g('game_id'), { home: g('home_team'), away: g('away_team'), at: new Map() });
      const at = periods.get(g('game_id')).at; const cur = at.get(qtr) || [0, 0];
      at.set(qtr, [Math.max(cur[0], homeNow), Math.max(cur[1], awayNow)]);
    }

    const playType = g('play_type');
    const posteam = g('posteam');
    const defteam = g('defteam');
    if (!posteam || !defteam) return;

    const gameId = g('game_id');
    if (!games.has(gameId)) {
      games.set(gameId, {
        game_id: gameId,
        week: num(g('week')),
        season_type: g('season_type'),
        qbs: new Map(),
        qbOrder: new Map(),
        // The site and the weather nflverse records for the game (founder GO, Oct 12 2026: a bad passing day in
        // a 25 mph wind read as a bad offense).
        // The temp and wind columns are sometimes empty while the weather text carries both (audit, Oct 13 2026:
        // every Week 5 game).
        roof: g('roof') || null,
        temp: num(g('temp')) ?? num((String(g('weather') || '').match(/Temp:\s*(-?\d+)/) || [])[1]),
        wind: num(g('wind')) ?? num((String(g('weather') || '').match(/Wind:\s*[A-Z]*\s*(\d+)\s*mph/i) || [])[1]),
        stadium: g('stadium') || null,
        // "Rain Temp: 62° F, Humidity: 87%, Wind: NE 9 mph" -> "Rain": the conditions, when nflverse wrote them.
        conditions: (String(g('weather') || '').split(/\s*Temp:/)[0].trim() || null)
      });
    }
    const game = games.get(gameId);
    // THE GAME'S FLOW (Oct 29 2026, founder: "who got ahead, how, when did the team go up 14 versus being close the
    // whole game"): each score in order with the score after it (an extra point or two-point try joins its
    // touchdown), the largest lead each way and when, and how often the lead changed hands.
    if (homeNow != null && awayNow != null && g('home_team') && g('away_team')) {
      const f = game.flow || (game.flow = { home: g('home_team'), away: g('away_team'), last: [0, 0], events: [], tryOpen: false, sign: 0, changes: 0, lead: { home: null, away: null } });
      const dh = homeNow - f.last[0], da = awayNow - f.last[1];
      if (dh > 0 || da > 0) {
        const scorer = dh > 0 ? f.home : f.away, pts = dh > 0 ? dh : da;
        const ev = f.events.at(-1);
        if (f.tryOpen && ev && ev.team === scorer && pts <= 2) { ev.home = homeNow; ev.away = awayNow; ev.try = pts; }
        else {
          const yards = num(g('yards_gained'));
          const td = g('td_player_name');
          const how = pts >= 6 ? (playType === 'pass' && scorer === posteam ? `${td || g('receiver_player_name') || '?'} ${yards ?? '?'}-yd pass from ${g('passer_player_name') || '?'}`
            : playType === 'run' && scorer === posteam ? `${td || g('rusher_player_name') || '?'} ${yards ?? '?'}-yd run`
              : KICKS.has(playType) ? `${td || '?'} ${playType} return` : `${td || '?'} ${flag(g('interception')) ? 'interception' : flag(g('fumble')) ? 'fumble' : ''} return`.replace('  ', ' ') + ' TD')
            : pts === 3 ? `${g('kicker_player_name') || '?'} ${num(g('kick_distance')) ?? '?'}-yd FG`
              : pts === 2 && flag(g('safety')) ? 'safety' : pts === 2 && f.tryOpen ? 'two points on the other team\'s try (returned)' : `${pts} points`;
          f.events.push({ q: qtr, clock: String(g('time') || '').replace(/^0(\d)/, '$1') || null, team: scorer, pts, how: pts >= 6 && !/ TD$/.test(how) ? `TD, ${how}` : how, home: homeNow, away: awayNow });
          f.tryOpen = pts >= 6;
        }
      }
      if (playType === 'kickoff') f.tryOpen = false;
      f.last = [homeNow, awayNow];
      const diff = homeNow - awayNow;
      for (const [side, by] of [['home', diff], ['away', -diff]]) {
        if (by > 0 && (!f.lead[side] || by > f.lead[side].by)) f.lead[side] = { by, q: qtr, clock: String(g('time') || '').replace(/^0(\d)/, '$1') || null, home: homeNow, away: awayNow };
      }
      const sign = Math.sign(diff);
      if (sign !== 0) { if (f.sign !== 0 && sign !== f.sign) f.changes += 1; f.sign = sign; }
    }
    const passer = g('passer_player_name');
    if (passer) {
      const key = `${posteam}|${passer}`;
      game.qbs.set(key, (game.qbs.get(key) || 0) + 1);
      if (!game.qbOrder.has(posteam)) game.qbOrder.set(posteam, []);
      if (!game.qbOrder.get(posteam).includes(passer)) game.qbOrder.get(posteam).push(passer);
    }

    // PER-GAME lines, not only the season aggregate. An NFL season is
    // seventeen games; a five-game average is nearly a third of it and hides
    // exactly the week-to-week movement a bettor is reading. The founder's
    // point Aug 25: for football you look at the last game, the one before
    // it, and the one before that AS GAMES, with the trend beside them —
    // never instead of them.
    if (!gameTeamLines.has(gameId)) gameTeamLines.set(gameId, new Map());
    const perGame = gameTeamLines.get(gameId);
    for (const [code, role] of [[posteam, 'offense'], [defteam, 'defense']]) {
      const unit = () => ({ epa: 0, n: 0, succ: 0, sn: 0, runs: 0, runYards: 0, passes: 0, passYards: 0, sacks: 0, turnovers: 0 });
      if (!perGame.has(code)) perGame.set(code, { offense: unit(), defense: unit(), extra: extraUnit(), kneels: {} });
      const slot = perGame.get(code)[role];
      const e = num(g('epa'));
      const sc = num(g('success'));
      if ((g('play_type') === 'run' || g('play_type') === 'pass')) {
        if (e !== null) { slot.epa += e; slot.n += 1; }
        if (sc !== null) { slot.succ += sc; slot.sn += 1; }
        // The run and pass game of each game on its own (founder, Oct 4
        // 2026: season totals "only tell a small amount of the story"). A
        // pass play here is a dropback: sacks and their lost yards included.
        const yards = num(g('yards_gained')) ?? 0;
        if (g('play_type') === 'run') { slot.runs += 1; slot.runYards += yards; }
        else { slot.passes += 1; slot.passYards += yards; if (flag(g('sack'))) slot.sacks += 1; }
        if (flag(g('interception')) || flag(g('fumble_lost'))) slot.turnovers += 1;
      }
    }

    // Kneel-downs by who took them (GSIS id): the weekly stats count them as carries (Oct 23 2026 data audit: Mahomes's
    // 7 carries in Week 1 were 3 kneel-downs and 4 runs).
    if (playType === 'qb_kneel' && g('rusher_player_id') && g('rusher_player_id') !== 'NA') {
      const k = perGame.get(posteam).kneels; const who = g('rusher_player_id');
      k[who] = (k[who] || 0) + 1;
    }
    addGameDetail(perGame, playType, posteam, defteam, g);
    addDriveRow(drives, gameId, posteam, g, playType);

    // Only snaps from scrimmage carry situational meaning. Kicks, punts and
    // clock stoppages are excluded by inclusion here rather than by an
    // exclusion list, because play_type is a small closed vocabulary.
    if (playType !== 'run' && playType !== 'pass') return;

    const play = {
      playType,
      down: num(g('down')),
      ydstogo: num(g('ydstogo')),
      yardline100: num(g('yardline_100')),
      goalToGo: flag(g('goal_to_go')),
      halfSecs: num(g('half_seconds_remaining')),
      scoreDiff: num(g('score_differential')),
      epa: num(g('epa')),
      success: num(g('success')),
      wp: num(g('wp')),
      yards: num(g('yards_gained')),
      dropback: flag(g('qb_dropback')),
      qbHit: flag(g('qb_hit')),
      sack: flag(g('sack')),
      passOe: num(g('pass_oe')),
      shotgun: flag(g('shotgun')),
      noHuddle: flag(g('no_huddle')),
      interception: flag(g('interception')),
      fumbleLost: flag(g('fumble_lost')),
      penalty: flag(g('penalty'))
    };

    addPlay(sideFor(posteam).offense, play);
    addPlay(sideFor(defteam).defense, play);
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let pending = null;

  const consumeLine = (line) => {
    if (pending !== null) { line = `${pending}\n${line}`; pending = null; }
    if (unbalanced(line)) { pending = line; return; }
    const cells = splitLine(line);
    if (!header) {
      header = cells;
      idx = {};
      for (const w of WANTED) {
        const at = header.indexOf(w);
        if (at === -1) throw new Error(`nflverse play file is missing the column "${w}"`);
        idx[w] = at;
      }
      return;
    }
    handleRow(cells);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (line.length) consumeLine(line);
      }
    }
    if (buf.trim().length) consumeLine(buf.replace(/\r$/, ''));
  } catch (error) {
    return { unavailable: true, reason: `Failed while reading play_by_play_${season}.csv: ${error.message}` };
  } finally {
    clearTimeout(timer);
  }

  if (rows === 0) {
    return { unavailable: true, reason: `play_by_play_${season}.csv parsed to zero rows.` };
  }

  // Which quarterback actually started each game, so a season average can say
  // whether it blends more than one.
  const gameList = [...games.values()].map((g) => {
    const byTeam = new Map();
    for (const [key, n] of g.qbs) {
      const [team, name] = key.split('|');
      const cur = byTeam.get(team);
      if (!cur || n > cur.plays) byTeam.set(team, { name, plays: n });
    }
    const total = new Map();
    for (const [key, n] of g.qbs) {
      const team = key.split('|')[0];
      total.set(team, (total.get(team) || 0) + n);
    }
    const starters = {};
    for (const [team, top] of byTeam) {
      // The starter: the first passer of the game with at least three pass plays (a trick-play pass by a
      // receiver is not a quarterback start).
      const first = (g.qbOrder.get(team) || []).find((name) => (g.qbs.get(`${team}|${name}`) || 0) >= 3) || top.name;
      starters[team] = { name: top.name, share: Number((top.plays / (total.get(team) || 1)).toFixed(3)),
        ...(first !== top.name ? { started: first, startedShare: Number(((g.qbs.get(`${team}|${first}`) || 0) / (total.get(team) || 1)).toFixed(3)) } : {}) };
    }
    const lines = {};
    const gameDrives = [...drives.values()].filter((d) => d.gameId === g.game_id);
    const perGame = gameTeamLines.get(g.game_id);
    if (perGame) {
      for (const [code, slot] of perGame) {
        lines[code] = {
          offense_epa_per_play: slot.offense.n ? Number((slot.offense.epa / slot.offense.n).toFixed(3)) : null,
          offense_success_rate: slot.offense.sn ? Number((slot.offense.succ / slot.offense.sn).toFixed(4)) : null,
          offense_plays: slot.offense.n,
          defense_epa_per_play_allowed: slot.defense.n ? Number((slot.defense.epa / slot.defense.n).toFixed(3)) : null,
          defense_success_rate_allowed: slot.defense.sn ? Number((slot.defense.succ / slot.defense.sn).toFixed(4)) : null,
          defense_plays: slot.defense.n,
          offense_runs: slot.offense.runs, offense_run_yards: slot.offense.runYards,
          offense_pass_plays: slot.offense.passes, offense_pass_yards: slot.offense.passYards,
          offense_sacks_taken: slot.offense.sacks, offense_giveaways: slot.offense.turnovers,
          defense_runs: slot.defense.runs, defense_run_yards_allowed: slot.defense.runYards,
          defense_pass_plays: slot.defense.passes, defense_pass_yards_allowed: slot.defense.passYards,
          defense_sacks: slot.defense.sacks, defense_takeaways: slot.defense.turnovers,
          kneels: slot.kneels,
          ...finishGameDetail(slot.extra),
          ...driveTotals(gameDrives.filter((d) => d.team === code))
        };
      }
    }
    // Points each team scored in each quarter (a fifth is overtime), by team code.
    // A quarter with no rows leaves the quarters off rather than folding its points into the next.
    const p = periods.get(g.game_id); let quarters = null;
    if (p && [...p.at.keys()].sort((a, b) => a - b).every((q, i) => q === i + 1)) {
      const qs = [...p.at.keys()].sort((a, b) => a - b); quarters = { [p.home]: [], [p.away]: [] }; let prev = [0, 0];
      for (const q of qs) { const [h, a] = p.at.get(q); quarters[p.home].push(h - prev[0]); quarters[p.away].push(a - prev[1]); prev = [h, a]; }
    }
    const flow = g.flow ? { home: g.flow.home, away: g.flow.away, events: g.flow.events.map(({ q, clock, team, pts, how, home, away }) => ({ q, clock, team, pts, how, home, away })),
      lead: g.flow.lead, lead_changes: g.flow.changes } : null;
    return { game_id: g.game_id, week: g.week, season_type: g.season_type, roof: g.roof, temp: g.temp, wind: g.wind, stadium: g.stadium, conditions: g.conditions, starters, lines, quarters, flow };
  }).sort((a, b) => (a.week || 0) - (b.week || 0));

  const out = { schema: LEDGER_SCHEMA, season, generated_at: new Date().toISOString(), plays_parsed: rows, malformed_rows: malformed, teams: {}, games: gameList };
  for (const [code, side] of teams) {
    out.teams[code] = { offense: finishSide(side.offense), defense: finishSide(side.defense) };
  }
  return out;
}

function cacheFile(season) {
  return join(DISK_CACHE_DIR, `pbp_ledger_${season}.json`);
}

/**
 * The season ledger, from disk when fresh and from nflverse otherwise.
 *
 * @param {number} season
 * @param {{force?:boolean, fetchImpl?:Function}} opts
 * @returns {Promise<Object>} the aggregate, or { unavailable, reason }
 */
export async function getPlayLedger(season, opts = {}) {
  const file = cacheFile(season);
  if (!opts.force) {
    try {
      if (existsSync(file) && Date.now() - statSync(file).mtimeMs < DISK_CACHE_TTL_MS) {
        const cached = JSON.parse(readFileSync(file, 'utf8'));
        if (cached.schema === LEDGER_SCHEMA) return cached;
      }
    } catch { /* a corrupt cache is a reason to refetch, not to fail */ }
  }

  const built = await streamAndAggregate(season, opts);
  if (built.unavailable) {
    // Serve a stale ledger rather than nothing: last week's splits are far
    // better evidence than a blank, and the staleness is stated.
    try {
      if (existsSync(file)) {
        const stale = JSON.parse(readFileSync(file, 'utf8'));
        const ageHours = Math.round((Date.now() - statSync(file).mtimeMs) / 3_600_000);
        return { ...stale, stale: true, stale_reason: `${built.reason} Serving the ledger built ${ageHours}h ago.` };
      }
    } catch { /* fall through to the honest failure */ }
    return built;
  }

  try {
    if (!existsSync(DISK_CACHE_DIR)) mkdirSync(DISK_CACHE_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(built));
  } catch { /* an unwritable cache must not fail the read */ }
  return built;
}

/** One team's ledger entry, or null. Never throws on a missing team. */
export function teamLedger(ledger, code) {
  if (!ledger || ledger.unavailable || !code) return null;
  return ledger.teams?.[code] || null;
}

/** Which quarterbacks started for a team, in week order. */
export function starterTimeline(ledger, code) {
  if (!ledger || ledger.unavailable || !code) return null;
  const rows = (ledger.games || [])
    .filter((g) => g.starters?.[code])
    .map((g) => ({ week: g.week, season_type: g.season_type, qb: g.starters[code].name, share: g.starters[code].share }));
  return rows.length ? rows : null;
}

export const _internals = { splitLine, unbalanced, streamAndAggregate, emptyAccumulator, addPlay, finishSide, drivePlace, driveTotals };
