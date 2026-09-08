/**
 * Exact NFL settlement evidence, independent of fetches and result writes.
 * BDL's nullable box categories are not measured zeros. A complete scoring
 * ledger can establish those zeros; reconciled completions can establish a
 * passer's longest gain. Unknown play shapes deliberately produce no value.
 */
export const NFL_PLAY_SETTLEMENT_MARKETS = new Set([
  'anytime_touchdown', 'passing_touchdowns', 'rushing_touchdowns',
  'receiving_touchdowns', 'longest_completion', 'interceptions',
]);

const SCORER_FIELDS = [
  'rushing_touchdowns', 'receiving_touchdowns', 'fumbles_touchdowns',
  'interception_touchdowns', 'kick_return_touchdowns', 'punt_return_touchdowns',
];
const TD_FIELDS = ['passing_touchdowns', ...SCORER_FIELDS];
const COMPLETIONS = new Set(['pass-reception', 'passing-touchdown']);
const INCOMPLETE_ATTEMPTS = new Set(['pass-incompletion', 'pass-interception-return']);
const integer = value => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
};
const count = value => { const number = integer(value); return number != null && number >= 0 ? number : null; };
const id = value => { const number = integer(value); return number != null && number > 0 ? String(number) : null; };
const name = value => String(value ?? '').normalize('NFKC').replace(/[’‘]/g, "'").toLowerCase().trim().replace(/\s+/g, ' ');
const fullName = row => name(`${row?.player?.first_name ?? ''} ${row?.player?.last_name ?? ''}`);
const descriptions = play => `${play?.text ?? ''} ${play?.short_text ?? ''}`.replace(/\s+/g, ' ');
const uncertainText = play => /\b(?:lateral\w*|reversed|no[ -]play|overturned|nullified)\b/i.test(descriptions(play));
const fumbleText = play => /\bfumbl\w*\b/i.test(descriptions(play));

function gameSignature(game) {
  const home = id(game?.home_team?.id);
  const away = id(game?.visitor_team?.id);
  const homeScore = count(game?.home_team_score);
  const awayScore = count(game?.visitor_team_score);
  const state = String(game?.status_state ?? '').toLowerCase();
  const status = String(game?.status ?? '').toLowerCase();
  if (!id(game?.id) || !home || !away || home === away || homeScore == null || awayScore == null
    || (state ? state !== 'final' : !/^final(?:\b|\/)/.test(status))
    || (status && !/^final(?:\b|\/)/.test(status))) return null;
  return `${id(game.id)}|${home}|${away}|${homeScore}|${awayScore}`;
}

function roleId(play, role) {
  if (!Array.isArray(play?.participants)) return null;
  const matches = play.participants.filter(participant => participant?.type === role);
  return matches.length === 1 ? id(matches[0].player_id) : null;
}

function clockSeconds(play) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(play?.clock_display ?? '');
  if (!match || Number(match[1]) > 15 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Observed BDL catch/fumble shape has no passer participant and stat_yardage is
 * the recovery's gain (zero in the receipt). Its final short_text separately
 * names the full passer and credits the completion gain. Resolve that exact
 * prefix against this game's box, then corroborate the named receiver with
 * the structured fumbler ID and the opposing recoverer. No initials guessing.
 */
function caughtFumble(play, players) {
  if (play.type_slug !== 'fumble-recovery-opponent' || play.scoring_play
    || uncertainText(play) || !fumbleText(play)) return null;
  const fumblerId = roleId(play, 'fumbler');
  const recovererId = roleId(play, 'recoverer');
  const receiver = players.get(fumblerId);
  const recoverer = players.get(recovererId);
  if (!receiver || !recoverer || id(receiver.team?.id) === id(recoverer.team?.id)
    || id(play.team?.id) !== id(recoverer.team?.id)) return null;
  const short = name(play.short_text);
  const matches = [];
  for (const [playerId, player] of players) {
    const playerName = fullName(player);
    if (!playerName || !short.startsWith(`${playerName} pass complete for `)) continue;
    const tail = short.slice(`${playerName} pass complete for `.length);
    const match = /^(-?\d+) yds? to (.+)$/.exec(tail);
    const receiverName = fullName(receiver);
    if (!match || !receiverName || !match[2].startsWith(`${receiverName} ${receiverName} fumble `)
      || id(player.team?.id) !== id(receiver.team?.id)) continue;
    const yards = integer(match[1]);
    if (yards != null) matches.push({ playerId, receiverId: fumblerId, yards });
  }
  return matches.length === 1 ? matches[0] : null;
}

export function buildNflPlaySettlement({
  gameId, plays, playerStats, playsComplete = false, boxComplete = false, teamStats,
} = {}) {
  const result = {
    gameId: id(gameId), anytimeTouchdowns: {}, longestCompletions: {}, interceptions: {},
    touchdownComponents: {}, issues: [],
  };
  const issue = reason => { if (!result.issues.includes(reason)) result.issues.push(reason); };
  if (!result.gameId || !playsComplete || !boxComplete || !Array.isArray(plays) || !plays.length
    || !Array.isArray(playerStats) || !playerStats.length) {
    issue('incomplete_game_evidence'); return result;
  }
  const game = plays[0]?.game;
  const signature = gameSignature(game);
  if (!signature || id(game.id) !== result.gameId) { issue('invalid_final_game'); return result; }
  const sides = new Set([id(game.home_team.id), id(game.visitor_team.id)]);
  const players = new Map();
  for (const row of playerStats) {
    const playerId = id(row?.player?.id);
    if (!playerId || players.has(playerId) || gameSignature(row?.game) !== signature
      || !sides.has(id(row?.team?.id))) { issue('invalid_player_box'); return result; }
    players.set(playerId, row);
  }
  if (new Set(playerStats.map(row => id(row.team.id))).size !== 2) {
    issue('incomplete_team_box'); return result;
  }
  const playIds = new Set();
  const finalPlays = [];
  let lastPeriod = 0;
  for (const play of plays) {
    const period = count(play?.period);
    if (!play?.id || playIds.has(String(play.id)) || gameSignature(play.game) !== signature
      || typeof play.scoring_play !== 'boolean' || typeof play.type_slug !== 'string'
      || !period || clockSeconds(play) == null || count(play.home_score) == null || count(play.away_score) == null
      || play.home_score > game.home_team_score || play.away_score > game.visitor_team_score) {
      issue('invalid_or_duplicate_play'); return result;
    }
    playIds.add(String(play.id));
    lastPeriod = Math.max(lastPeriod, period);
    if (play.type_slug === 'end-of-game') finalPlays.push(play);
  }
  const finalPlay = finalPlays[0];
  if (finalPlays.length !== 1 || finalPlay.period < 4 || finalPlay.period !== lastPeriod
    || clockSeconds(finalPlay) !== 0 || count(finalPlay.home_score) !== count(game.home_team_score)
    || count(finalPlay.away_score) !== count(game.visitor_team_score)) {
    issue('missing_or_inconsistent_final_play'); return result;
  }

  // End-period and corrected plays may be appended after their real place in
  // the response. Football period/clock, with stable ties, determines order.
  const ordered = [...plays].sort((a, b) => a.period - b.period || clockSeconds(b) - clockSeconds(a));
  const components = Object.fromEntries([...players.keys()].map(playerId => [playerId,
    Object.fromEntries(TD_FIELDS.map(field => [field, 0]))]));
  let scoringValid = true;
  let lastHome = 0;
  let lastAway = 0;
  const addTd = (play, role, field) => {
    const playerId = roleId(play, role);
    if (!playerId || !players.has(playerId) || id(players.get(playerId).team?.id) !== id(play.team?.id)) return false;
    components[playerId][field] += 1;
    return true;
  };
  for (const play of ordered) {
    const home = count(play.home_score);
    const away = count(play.away_score);
    const homeDelta = home - lastHome;
    const awayDelta = away - lastAway;
    const team = id(play.team?.id);
    const delta = team === id(game.home_team.id) ? homeDelta : team === id(game.visitor_team.id) ? awayDelta : null;
    if (homeDelta < 0 || awayDelta < 0 || (homeDelta > 0 && awayDelta > 0)
      || (play.scoring_play !== (homeDelta + awayDelta > 0))) scoringValid = false;
    if (play.scoring_play) {
      if (delta == null || delta !== homeDelta + awayDelta || uncertainText(play) || fumbleText(play)) scoringValid = false;
      if (play.type_slug === 'passing-touchdown' && [6, 7, 8].includes(delta)) {
        if (!addTd(play, 'receiver', 'receiving_touchdowns') || !addTd(play, 'passer', 'passing_touchdowns')) scoringValid = false;
      } else if (play.type_slug === 'rushing-touchdown' && [6, 7, 8].includes(delta)) {
        if (!addTd(play, 'rusher', 'rushing_touchdowns')) scoringValid = false;
      } else if (!(play.type_slug === 'field-goal-good' && delta === 3)
        && !(play.type_slug === 'extra-point-good' && delta === 1)) {
        // Return TDs, safeties and conversion/review shapes need their own
        // verified scorer contract. They cannot silently become zero TDs.
        scoringValid = false;
      }
    }
    lastHome = home;
    lastAway = away;
  }
  if (lastHome !== count(game.home_team_score) || lastAway !== count(game.visitor_team_score)) scoringValid = false;
  for (const [playerId, row] of players) {
    for (const field of TD_FIELDS) {
      if (row[field] != null && (count(row[field]) == null || count(row[field]) !== components[playerId][field])) scoringValid = false;
    }
  }
  if (scoringValid) {
    result.touchdownComponents = components;
    for (const [playerId, values] of Object.entries(components)) {
      result.anytimeTouchdowns[playerId] = SCORER_FIELDS.reduce((total, field) => total + values[field], 0);
    }
  } else issue('unreconciled_scoring_ledger');

  const passing = new Map([...players.keys()].map(playerId => [playerId, { yards: [], attempts: 0, interceptions: 0, invalid: false }]));
  for (const play of plays) {
    let passerId = roleId(play, 'passer');
    let completion = null;
    if (COMPLETIONS.has(play.type_slug)) {
      const receiverId = roleId(play, 'receiver');
      const yards = integer(play.stat_yardage);
      const passer = players.get(passerId);
      const receiver = players.get(receiverId);
      if (passer && receiver && id(passer.team?.id) === id(receiver.team?.id)
        && id(play.team?.id) === id(passer.team?.id) && yards != null
        && !uncertainText(play) && !fumbleText(play)) completion = { playerId: passerId, yards };
      else if (passing.has(passerId)) passing.get(passerId).invalid = true;
    } else if (play.type_slug === 'fumble-recovery-opponent') {
      completion = caughtFumble(play, players);
      if (completion) passerId = completion.playerId;
    }
    if (completion) {
      passing.get(completion.playerId).yards.push(completion.yards);
      passing.get(completion.playerId).attempts += 1;
    } else if (INCOMPLETE_ATTEMPTS.has(play.type_slug) && passing.has(passerId)) {
      const observed = passing.get(passerId);
      const passerTeam = id(players.get(passerId).team?.id);
      if (play.type_slug === 'pass-interception-return') {
        const returner = players.get(roleId(play, 'interception_returner'));
        // Interception plays identify the returner's team, unlike ordinary
        // incompletions. Never count old overturned INT words in full text.
        if (!returner || id(returner.team?.id) === passerTeam || id(returner.team?.id) !== id(play.team?.id)
          || uncertainText(play) || play.scoring_play) observed.invalid = true;
        else observed.interceptions += 1;
      } else {
        const receiverId = roleId(play, 'receiver');
        const receiver = players.get(receiverId);
        const receiverRoles = play.participants.filter(participant => participant?.type === 'receiver');
        // The saved overturned interception has a null play.team after becoming
        // an incompletion. Final exact offensive roles establish the attempt.
        if (play.scoring_play || (play.team != null && id(play.team?.id) !== passerTeam)
          || /\bno[ -]play\b/i.test(descriptions(play)) || receiverRoles.length > 1
          || (receiverRoles.length && (!receiver || id(receiver.team?.id) !== passerTeam))) observed.invalid = true;
      }
      observed.attempts += 1;
    }
  }
  for (const [playerId, row] of players) {
    const measuredCompletions = count(row.passing_completions);
    const measuredYards = integer(row.passing_yards);
    if (measuredCompletions == null || measuredYards == null) continue;
    const observed = passing.get(playerId);
    if (observed.invalid || observed.yards.length !== measuredCompletions
      || observed.yards.reduce((total, yards) => total + yards, 0) !== measuredYards
      || (row.passing_attempts != null && count(row.passing_attempts) !== observed.attempts)
      || (row.passing_interceptions != null && count(row.passing_interceptions) !== observed.interceptions)) {
      issue(`unreconciled_passer:${playerId}`); continue;
    }
    // Zero completions do not establish a sportsbook's no-completion market
    // settlement rule. Leave that case to an explicit rule/direct measurement.
    if (observed.yards.length) result.longestCompletions[playerId] = Math.max(...observed.yards);
    if (count(row.passing_attempts) > 0) result.interceptions[playerId] = observed.interceptions;
  }

  if (teamStats !== undefined) {
    const seenTeams = new Set();
    let valid = Array.isArray(teamStats) && teamStats.length === 2;
    for (const row of valid ? teamStats : []) {
      const teamId = id(row?.team?.id);
      const rows = playerStats.filter(player => id(player.team.id) === teamId);
      const measured = rows.filter(player => count(player.passing_completions) != null && integer(player.passing_yards) != null);
      if (!sides.has(teamId) || seenTeams.has(teamId) || gameSignature(row.game) !== signature
        || count(row.passing_completions) !== measured.reduce((total, player) => total + count(player.passing_completions), 0)
        || count(row.passing_attempts) !== measured.reduce((total, player) => total + (count(player.passing_attempts) ?? NaN), 0)
        || integer(row.net_passing_yards) == null || count(row.sack_yards_lost) == null
        || integer(row.net_passing_yards) + count(row.sack_yards_lost) !== measured.reduce((total, player) => total + integer(player.passing_yards), 0)) valid = false;
      seenTeams.add(teamId);
    }
    if (!valid) { result.longestCompletions = {}; result.interceptions = {}; issue('unreconciled_team_passing'); }
  }
  return result;
}

export function nflPlayActualForProp(evidence, { playerId, propType } = {}) {
  const playerKey = id(playerId);
  if (!playerKey || !NFL_PLAY_SETTLEMENT_MARKETS.has(propType)) return null;
  const value = propType === 'anytime_touchdown' ? evidence?.anytimeTouchdowns?.[playerKey]
    : propType === 'longest_completion' ? evidence?.longestCompletions?.[playerKey]
      : propType === 'interceptions' ? evidence?.interceptions?.[playerKey]
      : evidence?.touchdownComponents?.[playerKey]?.[propType];
  return integer(value);
}
