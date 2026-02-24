/**
 * DFS Sport Configuration
 *
 * Single source of truth for sport-specific DFS constants:
 * salary caps, roster slots, position eligibility, stat display.
 *
 * Used by: orchestrator, player investigator, lineup decider, audit.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SALARY CAPS
// ═══════════════════════════════════════════════════════════════════════════════

export function getSalaryCap(platform, sport) {
  const isFD = platform?.toLowerCase() === 'fanduel';
  const s = (sport || 'NBA').toUpperCase();
  if (s === 'NFL') return isFD ? 60000 : 50000;
  if (s === 'NHL') return isFD ? 55000 : 50000;
  return isFD ? 60000 : 50000; // NBA
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROSTER SLOTS
// ═══════════════════════════════════════════════════════════════════════════════

export function getRosterSlots(platform, sport) {
  const isFD = platform?.toLowerCase() === 'fanduel';
  const s = (sport || 'NBA').toUpperCase();

  if (s === 'NFL') {
    if (isFD) return ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'DEF'];
    return ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'DST'];
  }
  if (s === 'NHL') {
    if (isFD) return ['C', 'C', 'W', 'W', 'W', 'W', 'D', 'D', 'UTIL'];
    return ['C', 'C', 'W', 'W', 'W', 'D', 'D', 'UTIL', 'G'];
  }
  // NBA
  if (isFD) return ['PG', 'PG', 'SG', 'SG', 'SF', 'SF', 'PF', 'PF', 'C'];
  return ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'UTIL'];
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLEX POSITIONS (composite slots to skip during investigation dedup)
// ═══════════════════════════════════════════════════════════════════════════════

export function getFlexPositions(sport) {
  const s = (sport || 'NBA').toUpperCase();
  if (s === 'NFL') return new Set(['FLEX']);
  if (s === 'NHL') return new Set(['UTIL']);
  return new Set(['G', 'F', 'UTIL']); // NBA
}

// ═══════════════════════════════════════════════════════════════════════════════
// POSITION CANDIDATE FILTERING
// ═══════════════════════════════════════════════════════════════════════════════

function hasPosition(player, pos) {
  const positions = player.positions || [player.position];
  return positions.some(p => p?.toUpperCase() === pos.toUpperCase());
}

export function getPositionCandidates(players, position, sport) {
  if (!players || players.length === 0) return [];
  const s = (sport || 'NBA').toUpperCase();

  if (s === 'NFL') {
    return players.filter(player => {
      switch (position) {
        case 'QB': return hasPosition(player, 'QB');
        case 'RB': return hasPosition(player, 'RB');
        case 'WR': return hasPosition(player, 'WR');
        case 'TE': return hasPosition(player, 'TE');
        case 'FLEX': return hasPosition(player, 'RB') || hasPosition(player, 'WR') || hasPosition(player, 'TE');
        case 'DST': case 'DEF': return hasPosition(player, 'DST') || hasPosition(player, 'DEF');
        case 'K': return hasPosition(player, 'K');
        default: return hasPosition(player, position);
      }
    });
  }

  if (s === 'NHL') {
    return players.filter(player => {
      switch (position) {
        case 'C': return hasPosition(player, 'C');
        case 'W': return hasPosition(player, 'W') || hasPosition(player, 'LW') || hasPosition(player, 'RW');
        case 'D': return hasPosition(player, 'D');
        case 'UTIL': return !hasPosition(player, 'G'); // Any skater
        case 'G': return hasPosition(player, 'G');
        default: return hasPosition(player, position);
      }
    });
  }

  // NBA
  return players.filter(player => {
    const playerPositions = player.positions || [player.position];
    switch (position) {
      case 'PG': return playerPositions.includes('PG');
      case 'SG': return playerPositions.includes('SG');
      case 'SF': return playerPositions.includes('SF');
      case 'PF': return playerPositions.includes('PF');
      case 'C': return playerPositions.includes('C');
      case 'G': return playerPositions.includes('PG') || playerPositions.includes('SG');
      case 'F': return playerPositions.includes('SF') || playerPositions.includes('PF');
      case 'UTIL': return true;
      default: return playerPositions.includes(position);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORM RATIO FIELDS (for ownership proxy)
// ═══════════════════════════════════════════════════════════════════════════════

export function getFormRatioFields(sport) {
  const s = (sport || 'NBA').toUpperCase();
  // NFL/NHL don't have ppg; use platform FPTS as the form ratio source
  if (s === 'NFL' || s === 'NHL') {
    return { l5Field: 'dkFptsAvg', seasonField: 'dkFpts' };
  }
  return { l5Field: 'ppg', seasonField: 'ppg' }; // NBA
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAT DISPLAY LINES (for investigation prompts)
// ═══════════════════════════════════════════════════════════════════════════════

export function getStatDisplayLines(player, sport) {
  const s = (sport || 'NBA').toUpperCase();
  const ss = player.seasonStats || {};

  if (s === 'NFL') {
    const passYds = ss.passing_yards_per_game ?? ss.pass_yds;
    const rushYds = ss.rushing_yards_per_game ?? ss.rush_yds;
    const recYds = ss.receiving_yards_per_game ?? ss.rec_yds;
    const tds = ss.touchdowns ?? ss.total_tds;
    const rec = ss.receptions_per_game ?? ss.rec;
    let line = `Season: ${passYds?.toFixed(0) || '?'} PassYPG / ${rushYds?.toFixed(0) || '?'} RushYPG / ${recYds?.toFixed(0) || '?'} RecYPG`;
    if (tds != null) line += ` / ${tds.toFixed(1)} TD`;
    if (rec != null) line += ` / ${rec.toFixed(1)} Rec`;
    return line;
  }

  if (s === 'NHL') {
    const goals = ss.goals ?? ss.g;
    const assists = ss.assists ?? ss.a;
    const sog = ss.shots_on_goal ?? ss.sog;
    const ppPts = ss.power_play_points ?? ss.ppp;
    let line = `Season: ${goals?.toFixed(1) || '?'} G / ${assists?.toFixed(1) || '?'} A / ${sog?.toFixed(1) || '?'} SOG`;
    if (ppPts != null) line += ` / ${ppPts.toFixed(1)} PPP`;
    return line;
  }

  // NBA
  const ppg = player.ppg ?? ss.ppg;
  const rpg = player.rpg ?? ss.rpg;
  const apg = player.apg ?? ss.apg;
  const mpg = player.mpg ?? ss.mpg;
  let line = `Season: ${ppg?.toFixed(1) || '?'} PPG / ${rpg?.toFixed(1) || '?'} RPG / ${apg?.toFixed(1) || '?'} APG / ${mpg?.toFixed(1) || '?'} MPG`;
  const spg = player.spg ?? ss.spg;
  const bpg = player.bpg ?? ss.bpg;
  const topg = player.topg ?? ss.topg;
  if (spg != null || bpg != null || topg != null) {
    line += `\n   Stocks/TO: ${spg?.toFixed(1) || '?'} SPG / ${bpg?.toFixed(1) || '?'} BPG / ${topg?.toFixed(1) || '?'} TOPG`;
  }
  return line;
}
