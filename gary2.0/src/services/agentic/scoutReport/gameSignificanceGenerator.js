/**
 * Game Significance Generator
 * Creates meaningful labels for games based on standings, rivalries, and context
 * Uses BDL standings data + hardcoded division/rivalry mappings
 */

// NBA Division mappings
const NBA_DIVISIONS = {
  atlantic: ['celtics', 'nets', 'knicks', '76ers', 'raptors'],
  central: ['bulls', 'cavaliers', 'pistons', 'pacers', 'bucks'],
  southeast: ['hawks', 'hornets', 'heat', 'magic', 'wizards'],
  northwest: ['nuggets', 'timberwolves', 'thunder', 'trail blazers', 'jazz'],
  pacific: ['warriors', 'clippers', 'lakers', 'suns', 'kings'],
  southwest: ['mavericks', 'rockets', 'grizzlies', 'pelicans', 'spurs']
};

// NFL Division mappings
const NFL_DIVISIONS = {
  afc_east: ['bills', 'dolphins', 'patriots', 'jets'],
  afc_north: ['ravens', 'bengals', 'browns', 'steelers'],
  afc_south: ['texans', 'colts', 'jaguars', 'titans'],
  afc_west: ['broncos', 'chiefs', 'raiders', 'chargers'],
  nfc_east: ['cowboys', 'giants', 'eagles', 'commanders'],
  nfc_north: ['bears', 'lions', 'packers', 'vikings'],
  nfc_south: ['falcons', 'panthers', 'saints', 'buccaneers'],
  nfc_west: ['cardinals', 'rams', '49ers', 'seahawks']
};

// NHL Division mappings
const NHL_DIVISIONS = {
  atlantic: ['bruins', 'sabres', 'red wings', 'panthers', 'canadiens', 'senators', 'lightning', 'maple leafs'],
  metropolitan: ['hurricanes', 'blue jackets', 'devils', 'islanders', 'rangers', 'flyers', 'penguins', 'capitals'],
  central: ['coyotes', 'blackhawks', 'avalanche', 'stars', 'wild', 'predators', 'blues', 'jets'],
  pacific: ['ducks', 'flames', 'oilers', 'kings', 'sharks', 'kraken', 'canucks', 'golden knights']
};

// NCAAB Conference mappings (using team nicknames)
const NCAAB_CONFERENCES = {
  big_ten: ['wolverines', 'buckeyes', 'spartans', 'hoosiers', 'boilermakers', 'hawkeyes', 'badgers', 'gophers', 'wildcats', 'illini', 'cornhuskers', 'terrapins', 'nittany lions', 'scarlet knights', 'bruins', 'trojans', 'ducks', 'huskies'],
  sec: ['crimson tide', 'tigers', 'bulldogs', 'gators', 'volunteers', 'wildcats', 'rebels', 'razorbacks', 'gamecocks', 'commodores', 'aggies', 'longhorns', 'sooners', 'mizzou'],
  acc: ['blue devils', 'tar heels', 'wolfpack', 'demon deacons', 'cavaliers', 'hokies', 'seminoles', 'hurricanes', 'cardinals', 'panthers', 'yellow jackets', 'orange', 'fighting irish', 'eagles'],
  big_12: ['jayhawks', 'wildcats', 'bears', 'red raiders', 'horned frogs', 'cyclones', 'mountaineers', 'cowboys', 'bearcats', 'cougars', 'knights', 'sun devils', 'utes', 'buffaloes', 'arizona'],
  big_east: ['bluejays', 'bulldogs', 'hoyas', 'wildcats', 'golden eagles', 'friars', 'johnnies', 'pirates', 'huskies', 'musketeers', 'hall'],
  pac_12: ['beavers', 'cougars']
};

// NCAAF Conference mappings (same schools, football nicknames)
const NCAAF_CONFERENCES = {
  big_ten: ['wolverines', 'buckeyes', 'spartans', 'hoosiers', 'boilermakers', 'hawkeyes', 'badgers', 'gophers', 'wildcats', 'illini', 'cornhuskers', 'terrapins', 'nittany lions', 'scarlet knights', 'bruins', 'trojans', 'ducks', 'huskies'],
  sec: ['crimson tide', 'tigers', 'bulldogs', 'gators', 'volunteers', 'wildcats', 'rebels', 'razorbacks', 'gamecocks', 'commodores', 'aggies', 'longhorns', 'sooners', 'mizzou'],
  acc: ['blue devils', 'tar heels', 'wolfpack', 'demon deacons', 'cavaliers', 'hokies', 'seminoles', 'hurricanes', 'cardinals', 'panthers', 'yellow jackets', 'orange', 'fighting irish', 'eagles'],
  big_12: ['jayhawks', 'wildcats', 'bears', 'red raiders', 'horned frogs', 'cyclones', 'mountaineers', 'cowboys', 'bearcats', 'cougars', 'knights', 'sun devils', 'utes', 'buffaloes', 'arizona'],
  pac_12: ['beavers', 'cougars']
};

// Famous rivalries
const RIVALRIES = {
  NBA: [
    { teams: ['lakers', 'clippers'], name: 'Battle of LA' },
    { teams: ['lakers', 'celtics'], name: 'Historic Rivalry' },
    { teams: ['knicks', 'nets'], name: 'Battle of New York' },
    { teams: ['heat', 'celtics'], name: 'Eastern Rivalry' },
    { teams: ['warriors', 'cavaliers'], name: 'Finals Rematch' },
    { teams: ['bulls', 'pistons'], name: 'Central Clash' },
    { teams: ['suns', 'mavericks'], name: 'Southwest Showdown' },
    { teams: ['nuggets', 'lakers'], name: 'Western Clash' },
    { teams: ['76ers', 'celtics'], name: 'Atlantic Battle' },
    { teams: ['bucks', 'celtics'], name: 'Eastern Powers' }
  ],
  NFL: [
    { teams: ['cowboys', 'eagles'], name: 'NFC East Rivalry' },
    { teams: ['packers', 'bears'], name: 'Classic Rivalry' },
    { teams: ['steelers', 'ravens'], name: 'AFC North Battle' },
    { teams: ['49ers', 'seahawks'], name: 'NFC West Clash' },
    { teams: ['chiefs', 'raiders'], name: 'AFC West Battle' },
    { teams: ['cowboys', 'giants'], name: 'NFC East Clash' },
    { teams: ['patriots', 'jets'], name: 'AFC East Rivalry' },
    { teams: ['rams', '49ers'], name: 'California Clash' },
    { teams: ['lions', 'packers'], name: 'NFC North Battle' },
    { teams: ['bengals', 'ravens'], name: 'AFC North Clash' }
  ],
  NHL: [
    { teams: ['bruins', 'canadiens'], name: 'Original Six Rivalry' },
    { teams: ['penguins', 'flyers'], name: 'Pennsylvania Battle' },
    { teams: ['maple leafs', 'canadiens'], name: 'Canadian Clash' },
    { teams: ['rangers', 'islanders'], name: 'New York Rivalry' },
    { teams: ['blackhawks', 'red wings'], name: 'Original Six Classic' },
    { teams: ['avalanche', 'red wings'], name: 'Historic Rivalry' },
    { teams: ['oilers', 'flames'], name: 'Battle of Alberta' },
    { teams: ['kings', 'sharks'], name: 'California Rivalry' },
    { teams: ['capitals', 'penguins'], name: 'Metro Battle' },
    { teams: ['lightning', 'panthers'], name: 'Florida Rivalry' }
  ],
  NCAAB: [
    { teams: ['wolverines', 'buckeyes'], name: 'Big Ten Rivalry' },
    { teams: ['michigan', 'ohio state'], name: 'Big Ten Rivalry' },
    { teams: ['blue devils', 'tar heels'], name: 'Tobacco Road' },
    { teams: ['duke', 'north carolina'], name: 'Tobacco Road' },
    { teams: ['wildcats', 'cardinals'], name: 'Battle of the Bluegrass' },
    { teams: ['kentucky', 'louisville'], name: 'Battle of the Bluegrass' },
    { teams: ['hoosiers', 'boilermakers'], name: 'Indiana Rivalry' },
    { teams: ['indiana', 'purdue'], name: 'Indiana Rivalry' },
    { teams: ['jayhawks', 'wildcats'], name: 'Sunflower Showdown' },
    { teams: ['kansas', 'kansas state'], name: 'Sunflower Showdown' },
    { teams: ['tar heels', 'wolfpack'], name: 'Carolina Clash' },
    { teams: ['spartans', 'wolverines'], name: 'Michigan Rivalry' },
    { teams: ['michigan state', 'michigan'], name: 'Michigan Rivalry' },
    { teams: ['orange', 'hoyas'], name: 'Big East Classic' },
    { teams: ['syracuse', 'georgetown'], name: 'Big East Classic' },
    { teams: ['wildcats', 'volunteers'], name: 'SEC Showdown' },
    { teams: ['kentucky', 'tennessee'], name: 'SEC Showdown' },
    { teams: ['crimson tide', 'tigers'], name: 'Iron Bowl' },
    { teams: ['alabama', 'auburn'], name: 'Iron Bowl' }
  ],
  NCAAF: [
    { teams: ['wolverines', 'buckeyes'], name: 'The Game' },
    { teams: ['michigan', 'ohio state'], name: 'The Game' },
    { teams: ['crimson tide', 'tigers'], name: 'Iron Bowl' },
    { teams: ['alabama', 'auburn'], name: 'Iron Bowl' },
    { teams: ['longhorns', 'sooners'], name: 'Red River Rivalry' },
    { teams: ['texas', 'oklahoma'], name: 'Red River Rivalry' },
    { teams: ['bulldogs', 'gators'], name: "World's Largest Cocktail Party" },
    { teams: ['georgia', 'florida'], name: "World's Largest Cocktail Party" },
    { teams: ['trojans', 'fighting irish'], name: 'Classic Rivalry' },
    { teams: ['usc', 'notre dame'], name: 'Classic Rivalry' },
    { teams: ['seminoles', 'gators'], name: 'Florida Rivalry' },
    { teams: ['florida state', 'florida'], name: 'Florida Rivalry' },
    { teams: ['black knights', 'midshipmen'], name: 'Army-Navy Game' },
    { teams: ['army', 'navy'], name: 'Army-Navy Game' },
    { teams: ['tigers', 'gamecocks'], name: 'Palmetto Bowl' },
    { teams: ['clemson', 'south carolina'], name: 'Palmetto Bowl' },
    { teams: ['bruins', 'trojans'], name: 'LA Crosstown' },
    { teams: ['ucla', 'usc'], name: 'LA Crosstown' },
    { teams: ['ducks', 'huskies'], name: 'Border War' },
    { teams: ['oregon', 'washington'], name: 'Border War' },
    { teams: ['nittany lions', 'buckeyes'], name: 'Big Ten Clash' },
    { teams: ['penn state', 'ohio state'], name: 'Big Ten Clash' },
    { teams: ['volunteers', 'crimson tide'], name: 'Third Saturday in October' },
    { teams: ['tennessee', 'alabama'], name: 'Third Saturday in October' }
  ]
};

// International venues
const INTERNATIONAL_VENUES = ['london', 'paris', 'mexico city', 'abu dhabi', 'tokyo', 'munich', 'berlin', 'sao paulo'];

/**
 * Check for international game (always takes priority)
 */
function checkInternationalGame(venue) {
  if (!venue) return null;
  const venueLower = venue.toLowerCase();
  for (const city of INTERNATIONAL_VENUES) {
    if (venueLower.includes(city)) {
      if (city === 'mexico city') return 'Mexico City Game';
      if (city === 'sao paulo') return 'Sao Paulo Game';
      if (city === 'abu dhabi') return 'Abu Dhabi Game';
      return `${city.charAt(0).toUpperCase() + city.slice(1)} Game`;
    }
  }
  return null;
}

/**
 * Find which division/conference a team belongs to
 */
function findDivision(teamName, sport) {
  let divisions;
  switch (sport) {
    case 'NBA': divisions = NBA_DIVISIONS; break;
    case 'NFL': divisions = NFL_DIVISIONS; break;
    case 'NHL': divisions = NHL_DIVISIONS; break;
    case 'NCAAB': divisions = NCAAB_CONFERENCES; break;
    case 'NCAAF': divisions = NCAAF_CONFERENCES; break;
    default: return null;
  }

  const teamLower = teamName.toLowerCase();

  for (const [divName, teams] of Object.entries(divisions)) {
    if (teams.some(t => teamLower.includes(t))) {
      return divName;
    }
  }
  return null;
}

/**
 * Check if teams are in the same division/conference
 * Returns the label to use (e.g., "Big Ten Rivals", "Division Rivals")
 */
function areDivisionalRivals(homeTeam, awayTeam, sport) {
  const homeDivision = findDivision(homeTeam, sport);
  const awayDivision = findDivision(awayTeam, sport);

  if (homeDivision && awayDivision && homeDivision === awayDivision) {
    // For college sports, return conference-specific label
    if (sport === 'NCAAB' || sport === 'NCAAF') {
      const confLabels = {
        big_ten: 'Big Ten Rivals',
        sec: 'SEC Rivals',
        acc: 'ACC Rivals',
        big_12: 'Big 12 Rivals',
        big_east: 'Big East Rivals',
        pac_12: 'Pac-12 Rivals'
      };
      return confLabels[homeDivision] || 'Conference Rivals';
    }
    return 'Division Rivals';
  }
  return null;
}

/**
 * Check for famous rivalry
 */
function checkRivalry(homeTeam, awayTeam, sport) {
  const sportRivalries = RIVALRIES[sport] || [];
  const homeLower = homeTeam.toLowerCase();
  const awayLower = awayTeam.toLowerCase();

  for (const rivalry of sportRivalries) {
    const [team1, team2] = rivalry.teams;
    if ((homeLower.includes(team1) || homeLower.includes(team2)) &&
        (awayLower.includes(team1) || awayLower.includes(team2))) {
      return rivalry.name;
    }
  }
  return null;
}

/**
 * Generate significance based on standings (using BDL data)
 */
function generateFromStandings(homeStanding, awayStanding) {
  if (!homeStanding || !awayStanding) return null;

  const homeRank = homeStanding.conference_rank || 99;
  const awayRank = awayStanding.conference_rank || 99;
  const homeConf = homeStanding.team?.conference || homeStanding.conference || homeStanding.conference_name || '';
  const awayConf = awayStanding.team?.conference || awayStanding.conference || awayStanding.conference_name || '';

  // Conference name formatting
  const formatConf = (conf) => {
    if (!conf) return '';
    const c = conf.toLowerCase();
    if (c === 'east' || c === 'eastern') return 'Eastern';
    if (c === 'west' || c === 'western') return 'Western';
    return conf;
  };

  const homeConfName = formatConf(homeConf);
  const awayConfName = formatConf(awayConf);

  // #1 vs #2 in same conference (highest priority standings-based)
  if ((homeRank === 1 && awayRank === 2) || (homeRank === 2 && awayRank === 1)) {
    if (homeConf === awayConf && homeConfName) {
      return `#1 vs #2 in ${homeConfName}`;
    }
  }

  // Both in Top 3
  if (homeRank <= 3 && awayRank <= 3) {
    if (homeConf === awayConf && homeConfName) {
      return `Top 3 ${homeConfName} Showdown`;
    }
    return 'Elite Matchup';
  }

  // Both in Top 5
  if (homeRank <= 5 && awayRank <= 5) {
    if (homeConf === awayConf && homeConfName) {
      return `Top 5 ${homeConfName} Battle`;
    }
    return 'Top 5 Clash';
  }

  // Playoff race (teams ranked 6-10 fighting for spots)
  if ((homeRank >= 6 && homeRank <= 10) && (awayRank >= 6 && awayRank <= 10)) {
    return 'Playoff Race';
  }

  // Both in playoff position (top 8)
  if (homeRank <= 8 && awayRank <= 8) {
    return 'Playoff Preview';
  }

  return null;
}

/**
 * Main function to generate game significance
 * @param {Object} game - Game object with home_team, away_team, venue
 * @param {string} sport - Sport key (NBA, NFL, NHL, NCAAB, NCAAF)
 * @param {Array} standings - Full standings array from BDL
 * @param {number} week - NFL week number (optional)
 * @returns {string|null} - Game significance label or null
 */
export function generateGameSignificance(game, sport, standings = [], week = null) {
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const venue = game.venue;

  // Priority 1: International game (always wins)
  const intlGame = checkInternationalGame(venue);
  if (intlGame) {
    console.log(`[GameSignificance] International: ${intlGame}`);
    return intlGame;
  }

  // Priority 2: Famous rivalry
  const rivalry = checkRivalry(homeTeam, awayTeam, sport);
  if (rivalry) {
    console.log(`[GameSignificance] Rivalry: ${rivalry}`);
    return rivalry;
  }

  // Find teams in standings (using BDL data)
  const findTeam = (teamName) => {
    const nameLower = teamName.toLowerCase();
    return standings.find(s => {
      const bdlName = (s.team?.name || s.team?.full_name || '').toLowerCase();
      const bdlFullName = (s.team?.full_name || '').toLowerCase();
      // Match by last word (team nickname)
      const lastWord = nameLower.split(' ').pop();
      return bdlName.includes(lastWord) || bdlFullName.includes(lastWord) || lastWord.includes(bdlName.split(' ').pop());
    });
  };

  const homeStanding = findTeam(homeTeam);
  const awayStanding = findTeam(awayTeam);

  // Priority 3: Divisional/Conference rivals (same division or conference)
  const divRivalry = areDivisionalRivals(homeTeam, awayTeam, sport);
  if (divRivalry) {
    console.log(`[GameSignificance] ${divRivalry}`);
    return divRivalry;
  }

  // Priority 4: Standings-based significance (using live BDL data)
  const standingsSig = generateFromStandings(homeStanding, awayStanding);
  if (standingsSig) {
    console.log(`[GameSignificance] Standings: ${standingsSig}`);
    return standingsSig;
  }

  // Priority 5: Check if either team is ranked (Top 25 for college, Top 10 for pros)
  const homeRank = homeStanding?.conference_rank || homeStanding?.rank || 99;
  const awayRank = awayStanding?.conference_rank || awayStanding?.rank || 99;

  if (sport === 'NCAAB' || sport === 'NCAAF') {
    // College: Top 25 is meaningful
    if (homeRank <= 25 && awayRank <= 25) {
      console.log(`[GameSignificance] Ranked Matchup`);
      return 'Ranked Matchup';
    }
    if (homeRank <= 25 || awayRank <= 25) {
      console.log(`[GameSignificance] Top 25 Test`);
      return 'Top 25 Test';
    }
  } else {
    // Pro sports: check if one team is top 5
    if (homeRank <= 5 || awayRank <= 5) {
      console.log(`[GameSignificance] Contender Matchup`);
      return 'Contender Matchup';
    }
  }

  // Priority 6: Sport-specific default fallback (always return something)
  const defaultLabels = {
    NBA: 'Regular Season',
    NFL: 'Regular Season',
    NHL: 'Regular Season',
    NCAAB: 'Conference Play',
    NCAAF: 'Conference Play'
  };

  const fallback = defaultLabels[sport] || 'Regular Season';
  console.log(`[GameSignificance] Default: ${fallback}`);
  return fallback;
}

export default { generateGameSignificance };
