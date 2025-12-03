export const EST_TIME_OPTIONS = {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
};

export function normalizeTeamName(name = '') {
  return name
    .toLowerCase()
    .replace(/\blos angeles\b/g, 'la')
    .replace(/\bnew york\b/g, 'ny')
    .replace(/\bsan antonio\b/g, 'sa')
    .replace(/\bnew orleans\b/g, 'no')
    .replace(/\boklahoma city\b/g, 'okc')
    .replace(/\bgolden state\b/g, 'gs')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mascotToken(name = '') {
  const parts = name.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1].toLowerCase() : '';
}

export function resolveTeamByName(teamName = '', teams = []) {
  if (!teamName || !Array.isArray(teams)) return null;
  const targetCanonical = normalizeTeamName(teamName);
  const targetMascot = mascotToken(teamName);

  return (
    teams.find((team) => {
      const fullCanonical = normalizeTeamName(team.full_name || '');
      if (!fullCanonical) return false;
      if (fullCanonical === targetCanonical) return true;
      if (fullCanonical.includes(targetCanonical) || targetCanonical.includes(fullCanonical)) return true;
      const teamMascot = mascotToken(team.full_name);
      if (teamMascot && targetMascot && teamMascot === targetMascot) return true;
      return false;
    }) || null
  );
}

export function formatGameTimeEST(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return `${new Intl.DateTimeFormat('en-US', EST_TIME_OPTIONS).format(date)} EST`;
}

export function parseGameDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildMarketSnapshot(bookmakers = [], homeTeamName = 'Home', awayTeamName = 'Away') {
  const homeKey = normalizeTeamName(homeTeamName);
  const awayKey = normalizeTeamName(awayTeamName);
  const determineSide = (name = '') => {
    const norm = normalizeTeamName(name);
    if (norm && (norm === homeKey || norm.includes(homeKey) || homeKey.includes(norm))) {
      return 'home';
    }
    if (norm && (norm === awayKey || norm.includes(awayKey) || awayKey.includes(norm))) {
      return 'away';
    }
    return null;
  };

  const spreads = [];
  const moneylines = [];
  (bookmakers || []).forEach((bookmaker) => {
    const markets = Array.isArray(bookmaker?.markets) ? bookmaker.markets : [];
    markets.forEach((market) => {
      if (!market || !market.key || !Array.isArray(market.outcomes)) return;
      if (market.key === 'spreads') {
        market.outcomes.forEach((outcome) => {
          if (!outcome || typeof outcome.price !== 'number' || typeof outcome.point !== 'number') return;
          const side = determineSide(outcome.name);
          spreads.push({
            team: side || outcome.name,
            point: outcome.point,
            price: outcome.price,
            bookmaker: bookmaker.title || bookmaker.key
          });
        });
      }
      if (market.key === 'h2h') {
        market.outcomes.forEach((outcome) => {
          if (!outcome || typeof outcome.price !== 'number') return;
          const side = determineSide(outcome.name);
          moneylines.push({
            team: side || outcome.name,
            price: outcome.price,
            bookmaker: bookmaker.title || bookmaker.key
          });
        });
      }
    });
  });

  const pickBest = (list, predicate) => {
    const filtered = list.filter(predicate);
    if (!filtered.length) return null;
    return filtered.reduce((best, item) => {
      if (!best) return item;
      if (item.price > best.price) return item;
      return best;
    }, null);
  };

  const homeSpread = pickBest(spreads, (row) => row.team === 'home');
  const awaySpread = pickBest(spreads, (row) => row.team === 'away');
  const homeMl = pickBest(moneylines, (row) => row.team === 'home');
  const awayMl = pickBest(moneylines, (row) => row.team === 'away');

  return {
    spread: {
      home: homeSpread ? { ...homeSpread, teamName: homeTeamName } : null,
      away: awaySpread ? { ...awaySpread, teamName: awayTeamName } : null
    },
    moneyline: {
      home: homeMl ? { ...homeMl, teamName: homeTeamName } : null,
      away: awayMl ? { ...awayMl, teamName: awayTeamName } : null
    }
  };
}

export function calcRestInfo(games, teamId, targetDate) {
  if (!Array.isArray(games) || games.length === 0) {
    return { days_since_last_game: null, games_in_last_7: 0, back_to_back: false };
  }
  const sorted = [...games].sort((a, b) => new Date(b.date) - new Date(a.date));
  const lastPlayed = sorted.find((g) => {
    const date = parseGameDate(g?.date);
    return date && date < targetDate;
  }) || sorted[0];
  const lastDate = parseGameDate(lastPlayed?.date);
  const msInDay = 24 * 60 * 60 * 1000;
  const days = lastDate ? Math.round((targetDate - lastDate) / msInDay) : null;
  const gamesInLast7 = sorted.filter((game) => {
    const date = parseGameDate(game?.date);
    if (!date) return false;
    return (targetDate - date) <= 7 * msInDay;
  }).length;
  const isB2B = typeof days === 'number' ? days <= 1 : false;
  const opponent = (lastPlayed?.home_team?.id === teamId ? lastPlayed?.visitor_team : lastPlayed?.home_team)?.full_name || null;
  return {
    days_since_last_game: days,
    games_in_last_7: gamesInLast7,
    back_to_back: isB2B,
    last_game_date: lastDate ? lastDate.toISOString().slice(0, 10) : null,
    last_opponent: opponent
  };
}

export function calcRecentForm(games, teamId, limit = 5) {
  if (!Array.isArray(games) || games.length === 0) return { record: '0-0', avg_margin: 0 };
  const sorted = [...games].sort((a, b) => new Date(b.date) - new Date(a.date));
  const slice = sorted.slice(0, limit);
  let wins = 0;
  let losses = 0;
  let totalMargin = 0;
  slice.forEach((game) => {
    const homeId = game?.home_team?.id;
    const awayId = game?.visitor_team?.id;
    const homeScore = game?.home_team_score || 0;
    const awayScore = game?.visitor_team_score || 0;
    const isHome = homeId === teamId;
    const teamScore = isHome ? homeScore : awayScore;
    const oppScore = isHome ? awayScore : homeScore;
    if (teamScore > oppScore) wins += 1;
    else losses += 1;
    totalMargin += teamScore - oppScore;
  });
  return {
    record: `${wins}-${losses}`,
    avg_margin: slice.length ? totalMargin / slice.length : 0,
    sample_size: slice.length
  };
}

