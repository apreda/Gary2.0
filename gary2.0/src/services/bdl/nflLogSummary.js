import { eligibleNflPlayerRows } from '../nflPlayerLogFacts.js';
import { playerGameSide, numericStat, completeAverage } from '../playerGameLogFacts.js';

// Shared BDL nflLogSummary; one module instance owns all associated state.
function summarizeNflPlayerGameLogs(rawStats, numGames = 5, options = {}) {
  const gameStats = eligibleNflPlayerRows(rawStats, options)
    .sort((a, b) => new Date(b.game.date || b.game.datetime) - new Date(a.game.date || a.game.datetime))
    .slice(0, numGames);

  if (gameStats.length === 0) return null;

  const gp = gameStats.length;
  const totals = {
    pass_yds: 0, pass_tds: 0, pass_att: 0, pass_comp: 0, ints: 0,
    rush_yds: 0, rush_att: 0, rush_tds: 0,
    rec_yds: 0, receptions: 0, targets: 0, rec_tds: 0
  };

  const gameByGame = gameStats.map(g => {
    const stats = {
      gameId: g.game?.id,
      date: g.game?.date || g.game?.datetime,
      status: g.game?.status ?? null,
      season: g.game?.season ?? g.season ?? null,
      ...playerGameSide(g),
      pass_yds: numericStat(g.passing_yards),
      pass_tds: numericStat(g.passing_touchdowns),
      pass_att: numericStat(g.passing_attempts),
      pass_comp: numericStat(g.passing_completions),
      ints: numericStat(g.passing_interceptions),
      rush_yds: numericStat(g.rushing_yards),
      rush_att: numericStat(g.rushing_attempts),
      rush_tds: numericStat(g.rushing_touchdowns),
      rec_yds: numericStat(g.receiving_yards),
      receptions: numericStat(g.receptions),
      targets: numericStat(g.receiving_targets),
      rec_tds: numericStat(g.receiving_touchdowns)
    };

    return stats;
  });

  const averages = {};
  Object.keys(totals).forEach(k => {
    const value = completeAverage(gameByGame, k);
    averages[k] = value === null ? null : value.toFixed(1);
  });

  const calcConsistency = (statKey) => {
    const values = gameByGame.map(g => g[statKey]);
    if (values.some(value => value === null)) return null;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return 1.0;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / Math.abs(mean);
    return Math.max(0, Math.min(1, 1 - cv)).toFixed(2);
  };

  const consistency = {
    pass_yds: calcConsistency('pass_yds'),
    rush_yds: calcConsistency('rush_yds'),
    rec_yds: calcConsistency('rec_yds'),
    receptions: calcConsistency('receptions')
  };

  const homeGames = gameByGame.filter(g => g.isHome === true);
  const awayGames = gameByGame.filter(g => g.isHome === false);
  const calcSplitAvg = (games, statKey) => {
    const value = completeAverage(games, statKey);
    return value === null ? 'N/A' : value.toFixed(1);
  };
  const splitFor = (games) => ({
    games: games.length,
    pass_yds: calcSplitAvg(games, 'pass_yds'),
    rush_yds: calcSplitAvg(games, 'rush_yds'),
    rec_yds: calcSplitAvg(games, 'rec_yds'),
    receptions: calcSplitAvg(games, 'receptions')
  });
  const splits = { home: splitFor(homeGames), away: splitFor(awayGames) };

  let targetTrend = null;
  const targetValues = gameByGame.map(g => g.targets);
  if (targetValues.every(t => t !== null) && targetValues.some(t => t > 0)) {
    const l5TargetsAvg = targetValues.reduce((a, b) => a + b, 0) / gp;
    const l2TargetsAvg = gp >= 2
      ? targetValues.slice(0, 2).reduce((a, b) => a + b, 0) / 2
      : l5TargetsAvg;
    const l3TargetsAvg = gp >= 3
      ? targetValues.slice(0, 3).reduce((a, b) => a + b, 0) / 3
      : l5TargetsAvg;
    const targetChange = l5TargetsAvg > 0
      ? ((l2TargetsAvg - l5TargetsAvg) / l5TargetsAvg * 100).toFixed(0)
      : 0;
    const isSpike = parseFloat(targetChange) >= 20;
    const isDeclining = parseFloat(targetChange) <= -20;
    targetTrend = {
      l5Avg: l5TargetsAvg.toFixed(1),
      l3Avg: l3TargetsAvg.toFixed(1),
      l2Avg: l2TargetsAvg.toFixed(1),
      lastGame: targetValues[0],
      change: targetChange,
      trend: isSpike ? 'SPIKE' : isDeclining ? 'DECLINING' : 'STABLE',
      gameByGame: targetValues.slice(0, 5)
    };
  }

  let usageTrend = null;
  const usageValues = gameByGame.map(g =>
    [g.targets, g.rush_att, g.receptions].every(value => value !== null)
      ? g.targets + g.rush_att + g.receptions : null
  );
  if (usageValues.every(u => u !== null) && usageValues.some(u => u > 0)) {
    const l5UsageAvg = usageValues.reduce((a, b) => a + b, 0) / gp;
    const l2UsageAvg = gp >= 2
      ? usageValues.slice(0, 2).reduce((a, b) => a + b, 0) / 2
      : l5UsageAvg;
    const usageChange = l5UsageAvg > 0
      ? ((l2UsageAvg - l5UsageAvg) / l5UsageAvg * 100).toFixed(0)
      : 0;
    let usageLevel = 'LOW';
    if (l5UsageAvg >= 15) usageLevel = 'ELITE';
    else if (l5UsageAvg >= 10) usageLevel = 'HIGH';
    else if (l5UsageAvg >= 5) usageLevel = 'MODERATE';
    usageTrend = {
      l5Avg: l5UsageAvg.toFixed(1),
      l2Avg: l2UsageAvg.toFixed(1),
      lastGame: usageValues[0],
      change: usageChange,
      level: usageLevel,
      trend: parseFloat(usageChange) >= 15
        ? 'INCREASING'
        : parseFloat(usageChange) <= -15 ? 'DECREASING' : 'STABLE',
      gameByGame: usageValues.slice(0, 5)
    };
  }

  return {
    gamesAnalyzed: gp,
    games: gameByGame,
    averages,
    consistency,
    splits,
    targetTrend,
    usageTrend,
    lastGame: gameByGame[0] || null
  };
}

export { summarizeNflPlayerGameLogs };
