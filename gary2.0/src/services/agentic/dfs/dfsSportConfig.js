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
  if (s === 'MLB') return isFD ? 60000 : 50000;
  return isFD ? 60000 : 50000; // NBA
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROSTER SLOTS
// ═══════════════════════════════════════════════════════════════════════════════

export function getRosterSlots(platform, sport) {
  const isFD = platform?.toLowerCase() === 'fanduel';
  const s = (sport || 'NBA').toUpperCase();

  if (s === 'NFL') {
    if (isFD) return ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DST'];
    return ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'DST'];
  }
  if (s === 'MLB') {
    if (isFD) return ['P', 'C/1B', '2B', '3B', 'SS', 'OF', 'OF', 'OF', 'UTIL'];
    return ['P', 'P', 'C', '1B', '2B', '3B', 'SS', 'OF', 'OF', 'OF'];
  }
  // NBA
  if (isFD) return ['PG', 'PG', 'SG', 'SG', 'SF', 'SF', 'PF', 'PF', 'C'];
  return ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'UTIL'];
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLEX POSITIONS (composite slots to skip during investigation dedup)
// ═══════════════════════════════════════════════════════════════════════════════

export function getFlexPositions(sport, platform) {
  const s = (sport || 'NBA').toUpperCase();
  const isFD = platform?.toLowerCase() === 'fanduel';
  if (s === 'NFL') return new Set(['FLEX']);
  if (s === 'MLB') return isFD ? new Set(['C/1B', 'UTIL']) : new Set(['UTIL']);
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

  if (s === 'MLB') {
    return players.filter(player => {
      switch (position) {
        case 'P': return hasPosition(player, 'P') || hasPosition(player, 'SP') || hasPosition(player, 'RP');
        case 'C': return hasPosition(player, 'C');
        case '1B': return hasPosition(player, '1B');
        case '2B': return hasPosition(player, '2B');
        case '3B': return hasPosition(player, '3B');
        case 'SS': return hasPosition(player, 'SS');
        case 'OF': return hasPosition(player, 'OF') || hasPosition(player, 'LF') || hasPosition(player, 'CF') || hasPosition(player, 'RF');
        case 'C/1B': return hasPosition(player, 'C') || hasPosition(player, '1B');
        case 'UTIL': return !hasPosition(player, 'P') && !hasPosition(player, 'SP') && !hasPosition(player, 'RP');
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

  if (s === 'MLB') {
    const isPitcher = hasPosition(player, 'P') || hasPosition(player, 'SP') || hasPosition(player, 'RP');
    if (isPitcher) {
      const era = ss.era ?? player.era;
      const whip = ss.whip ?? player.whip;
      const k9 = ss.k_per_9 ?? ss.k9 ?? player.k9;
      const wins = ss.wins ?? ss.w ?? player.wins;
      const losses = ss.losses ?? ss.l ?? player.losses;
      const ip = ss.innings_pitched ?? ss.ip ?? player.ip;
      let line = `Season: ${era?.toFixed(2) || '?'} ERA / ${whip?.toFixed(2) || '?'} WHIP / ${k9?.toFixed(1) || '?'} K/9`;
      if (wins != null || losses != null) line += ` / ${wins ?? '?'}-${losses ?? '?'} W-L`;
      if (ip != null) line += ` / ${typeof ip === 'number' ? ip.toFixed(1) : ip} IP`;
      return line;
    }
    // Hitter
    const avg = ss.batting_avg ?? ss.avg ?? player.avg;
    const hr = ss.home_runs ?? ss.hr ?? player.hr;
    const rbi = ss.rbi ?? player.rbi;
    const ops = ss.ops ?? player.ops;
    const sb = ss.stolen_bases ?? ss.sb ?? player.sb;
    const abg = ss.ab_per_game ?? ss.ab_g ?? player.ab_g;
    let line = `Season: ${avg != null ? (typeof avg === 'number' ? avg.toFixed(3) : avg) : '?'} AVG / ${hr ?? '?'} HR / ${rbi ?? '?'} RBI / ${ops != null ? (typeof ops === 'number' ? ops.toFixed(3) : ops) : '?'} OPS`;
    if (sb != null) line += ` / ${sb} SB`;
    if (abg != null) line += ` / ${typeof abg === 'number' ? abg.toFixed(1) : abg} AB/G`;
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
