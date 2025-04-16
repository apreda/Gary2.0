// Pick text formatter utility - fixes formatting for all sports with proper caching

/**
 * Formats pick text consistently for all sports
 * This function overrides any previously set shortPick values
 * @param {Object} pick - The pick object to format
 * @returns {String} Formatted text for display on cards
 */
export function formatPickText(pick) {
  // CRITICAL DEBUG: Log the raw pick for troubleshooting
  console.log('RAW PICK RECEIVED:', pick);
  
  // Handle null/undefined picks explicitly
  if (!pick) {
    console.error('formatPickText received null/undefined pick');
    return 'PICK DATA MISSING';
  }
  // Use direct access to avoid circular import
  const abbreviateTeamName = (name) => {
    if (!name) return '';
    
    // Simple abbreviation rules to avoid circular dependencies
    const teamMap = {
      // MLB Teams
      'Arizona Diamondbacks': 'ARI',
      'Atlanta Braves': 'ATL',
      'Baltimore Orioles': 'BAL',
      'Boston Red Sox': 'BOS',
      'Chicago Cubs': 'CHC',
      'Chicago White Sox': 'CHW',
      'Cincinnati Reds': 'CIN',
      'Cleveland Guardians': 'CLE',
      'Colorado Rockies': 'COL',
      'Detroit Tigers': 'DET',
      'Houston Astros': 'HOU',
      'Kansas City Royals': 'KC',
      'Los Angeles Angels': 'LAA',
      'Los Angeles Dodgers': 'LAD',
      'Miami Marlins': 'MIA',
      'Milwaukee Brewers': 'MIL',
      'Minnesota Twins': 'MIN',
      'New York Mets': 'NYM',
      'New York Yankees': 'NYY',
      'Oakland Athletics': 'OAK',
      'Philadelphia Phillies': 'PHI',
      'Pittsburgh Pirates': 'PIT',
      'San Diego Padres': 'SD',
      'San Francisco Giants': 'SF',
      'Seattle Mariners': 'SEA',
      'St. Louis Cardinals': 'STL',
      'Tampa Bay Rays': 'TB',
      'Texas Rangers': 'TEX',
      'Toronto Blue Jays': 'TOR',
      'Washington Nationals': 'WAS',
      
      // NBA Teams
      'Atlanta Hawks': 'ATL',
      'Boston Celtics': 'BOS',
      'Brooklyn Nets': 'BKN',
      'Charlotte Hornets': 'CHA',
      'Chicago Bulls': 'CHI',
      'Cleveland Cavaliers': 'CLE',
      'Dallas Mavericks': 'DAL',
      'Denver Nuggets': 'DEN',
      'Detroit Pistons': 'DET',
      'Golden State Warriors': 'GSW',
      'Houston Rockets': 'HOU',
      'Indiana Pacers': 'IND',
      'LA Clippers': 'LAC',
      'Los Angeles Clippers': 'LAC',
      'Los Angeles Lakers': 'LAL',
      'Memphis Grizzlies': 'MEM',
      'Miami Heat': 'MIA',
      'Milwaukee Bucks': 'MIL',
      'Minnesota Timberwolves': 'MIN',
      'New Orleans Pelicans': 'NOP',
      'New York Knicks': 'NYK',
      'Oklahoma City Thunder': 'OKC',
      'Orlando Magic': 'ORL',
      'Philadelphia 76ers': 'PHI',
      'Phoenix Suns': 'PHX',
      'Portland Trail Blazers': 'POR',
      'Sacramento Kings': 'SAC',
      'San Antonio Spurs': 'SAS',
      'Toronto Raptors': 'TOR',
      'Utah Jazz': 'UTA',
      'Washington Wizards': 'WAS',
      
      // NHL Teams
      'Anaheim Ducks': 'ANA',
      'Arizona Coyotes': 'ARI',
      'Boston Bruins': 'BOS',
      'Buffalo Sabres': 'BUF',
      'Calgary Flames': 'CGY',
      'Carolina Hurricanes': 'CAR',
      'Chicago Blackhawks': 'CHI',
      'Colorado Avalanche': 'COL',
      'Columbus Blue Jackets': 'CBJ',
      'Dallas Stars': 'DAL',
      'Detroit Red Wings': 'DET',
      'Edmonton Oilers': 'EDM',
      'Florida Panthers': 'FLA',
      'Los Angeles Kings': 'LAK',
      'Minnesota Wild': 'MIN',
      'Montreal Canadiens': 'MTL',
      'Nashville Predators': 'NSH',
      'New Jersey Devils': 'NJD',
      'New York Islanders': 'NYI',
      'New York Rangers': 'NYR',
      'Ottawa Senators': 'OTT',
      'Philadelphia Flyers': 'PHI',
      'Pittsburgh Penguins': 'PIT',
      'San Jose Sharks': 'SJS',
      'Seattle Kraken': 'SEA',
      'St. Louis Blues': 'STL',
      'Tampa Bay Lightning': 'TBL',
      'Toronto Maple Leafs': 'TOR',
      'Vancouver Canucks': 'VAN',
      'Vegas Golden Knights': 'VGK',
      'Washington Capitals': 'WSH',
      'Winnipeg Jets': 'WPG'
    };
    
    // Check if we have a direct match
    if (teamMap[name]) {
      return teamMap[name];
    }
    
    // Try to find partial match
    for (const [fullName, abbr] of Object.entries(teamMap)) {
      if (name.includes(fullName)) {
        return abbr;
      }
    }
    
    // Basic abbreviation if no match found (first 3 chars)
    return name.slice(0, 3).toUpperCase();
  };
  
  if (!pick) return 'NO PICK';
  
  // Don't log unless needed for debugging - reduces console clutter
  // console.log(`Formatting pick for display: ${pick.league} - ${pick.betType}`);
  
  // Format odds consistently
  const formatOdds = (odds) => {
    if (!odds) return '';
    if (typeof odds === 'number') {
      return odds > 0 ? `+${odds}` : `${odds}`;
    }
    // If already a string with + or -, return as is
    if (typeof odds === 'string' && (odds.startsWith('+') || odds.startsWith('-'))) {
      return odds;
    }
    // Default format if string without sign
    return `${odds}`;
  };

  try {
    // SPREADS: Team Number (e.g. "DAL +4.5")
    if (pick.betType && pick.betType.includes('Spread') && pick.spread) {
      const parts = pick.spread.split(' ');
      const teamName = parts.slice(0, parts.length - 1).join(' ');
      const number = parts[parts.length - 1];
      return `${abbreviateTeamName(teamName)} ${number}`;
    } 
    
    // MONEYLINES: Team ML Odds (e.g. "KC ML -115")
    else if (pick.betType && pick.betType.includes('Moneyline') && pick.moneyline) {
      // For MLB, format as 'CIN +104' (no 'ML')
      if (pick.league === 'MLB') {
        // Extract team name and odds from moneyline
        // First, try to extract odds from the last part of the pick.moneyline
        let teamName, oddsPart;
        
        // The moneyline value should be in format "Cincinnati Reds +104"
        const mlParts = pick.moneyline.split(' ');
        if (mlParts.length > 1) {
          // Get the last part as potential odds
          const lastPart = mlParts[mlParts.length - 1];
          
          // Check if it looks like odds (+/- format)
          if (lastPart.startsWith('+') || lastPart.startsWith('-')) {
            oddsPart = lastPart;
            teamName = mlParts.slice(0, mlParts.length - 1).join(' ');
          } else {
            // If can't detect odds in the moneyline, try to get odds from other fields
            teamName = pick.moneyline;
            oddsPart = pick.odds || pick.moneylineOdds || '+100';
            if (typeof oddsPart === 'number') {
              oddsPart = oddsPart > 0 ? `+${oddsPart}` : `${oddsPart}`;
            }
          }
        } else {
          // If moneyline doesn't have spaces, use it as the team name and find odds elsewhere
          teamName = pick.moneyline;
          oddsPart = pick.odds || pick.moneylineOdds || '+100';
          if (typeof oddsPart === 'number') {
            oddsPart = oddsPart > 0 ? `+${oddsPart}` : `${oddsPart}`;
          }
        }
        
        return `${abbreviateTeamName(teamName)} ${oddsPart}`.trim();
      }
      
      // For other leagues, keep the 'ML' format
      const odds = pick.odds || pick.moneylineOdds || '';
      return `${abbreviateTeamName(pick.moneyline)} ML ${formatOdds(odds)}`.trim();
    } 
    
    // TOTALS: OVER/UNDER Total (e.g. "OVER 6.5") 
    else if (pick.betType && pick.betType.includes('Total') && pick.overUnder) {
      const parts = pick.overUnder.split(' ');
      let overUnderType = '';
      let total = '';
      
      if (parts[0].toLowerCase() === 'over' || parts[0].toLowerCase() === 'under') {
        overUnderType = parts[0].toUpperCase();
        total = parts[parts.length - 1];
      }
      
      return `${overUnderType} ${total}`;
    }
    
    // PARLAYS: "PARLAY OF THE DAY" or with odds if available
    else if (pick.league === 'PARLAY') {
      const odds = pick.odds || pick.parlayOdds;
      return odds ? `PARLAY ${formatOdds(odds)}` : 'PARLAY OF THE DAY';
    }
    
    // Check if shortPick already exists and is properly formatted
    else if (pick.shortPick && typeof pick.shortPick === 'string' && pick.shortPick.length > 0) {
      return pick.shortPick;
    }
    
    // Default - use original pick text if available
    else if (pick.pick) {
      return pick.pick;
    }
    
    return 'NO PICK';
  } catch (error) {
    console.error('Error formatting pick:', error);
    return pick.pick || 'NO PICK';
  }
}
