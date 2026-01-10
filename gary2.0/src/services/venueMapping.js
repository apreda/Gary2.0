/**
 * Team to Venue/Arena mappings for automatic venue assignment
 * Venue should always be based on the HOME team
 */

// NBA Team -> Arena mapping (30 teams)
export const NBA_ARENAS = {
  'Atlanta Hawks': 'State Farm Arena',
  'Boston Celtics': 'TD Garden',
  'Brooklyn Nets': 'Barclays Center',
  'Charlotte Hornets': 'Spectrum Center',
  'Chicago Bulls': 'United Center',
  'Cleveland Cavaliers': 'Rocket Mortgage FieldHouse',
  'Dallas Mavericks': 'American Airlines Center',
  'Denver Nuggets': 'Ball Arena',
  'Detroit Pistons': 'Little Caesars Arena',
  'Golden State Warriors': 'Chase Center',
  'Houston Rockets': 'Toyota Center',
  'Indiana Pacers': 'Gainbridge Fieldhouse',
  'Los Angeles Clippers': 'Intuit Dome',
  'Los Angeles Lakers': 'Crypto.com Arena',
  'Memphis Grizzlies': 'FedExForum',
  'Miami Heat': 'Kaseya Center',
  'Milwaukee Bucks': 'Fiserv Forum',
  'Minnesota Timberwolves': 'Target Center',
  'New Orleans Pelicans': 'Smoothie King Center',
  'New York Knicks': 'Madison Square Garden',
  'Oklahoma City Thunder': 'Paycom Center',
  'Orlando Magic': 'Kia Center',
  'Philadelphia 76ers': 'Wells Fargo Center',
  'Phoenix Suns': 'Footprint Center',
  'Portland Trail Blazers': 'Moda Center',
  'Sacramento Kings': 'Golden 1 Center',
  'San Antonio Spurs': 'Frost Bank Center',
  'Toronto Raptors': 'Scotiabank Arena',
  'Utah Jazz': 'Delta Center',
  'Washington Wizards': 'Capital One Arena'
};

// NFL Team -> Stadium mapping (32 teams)
export const NFL_STADIUMS = {
  'Arizona Cardinals': 'State Farm Stadium',
  'Atlanta Falcons': 'Mercedes-Benz Stadium',
  'Baltimore Ravens': 'M&T Bank Stadium',
  'Buffalo Bills': 'Highmark Stadium',
  'Carolina Panthers': 'Bank of America Stadium',
  'Chicago Bears': 'Soldier Field',
  'Cincinnati Bengals': 'Paycor Stadium',
  'Cleveland Browns': 'Cleveland Browns Stadium',
  'Dallas Cowboys': 'AT&T Stadium',
  'Denver Broncos': 'Empower Field at Mile High',
  'Detroit Lions': 'Ford Field',
  'Green Bay Packers': 'Lambeau Field',
  'Houston Texans': 'NRG Stadium',
  'Indianapolis Colts': 'Lucas Oil Stadium',
  'Jacksonville Jaguars': 'EverBank Stadium',
  'Kansas City Chiefs': 'GEHA Field at Arrowhead',
  'Las Vegas Raiders': 'Allegiant Stadium',
  'Los Angeles Chargers': 'SoFi Stadium',
  'Los Angeles Rams': 'SoFi Stadium',
  'Miami Dolphins': 'Hard Rock Stadium',
  'Minnesota Vikings': 'U.S. Bank Stadium',
  'New England Patriots': 'Gillette Stadium',
  'New Orleans Saints': 'Caesars Superdome',
  'New York Giants': 'MetLife Stadium',
  'New York Jets': 'MetLife Stadium',
  'Philadelphia Eagles': 'Lincoln Financial Field',
  'Pittsburgh Steelers': 'Acrisure Stadium',
  'San Francisco 49ers': "Levi's Stadium",
  'Seattle Seahawks': 'Lumen Field',
  'Tampa Bay Buccaneers': 'Raymond James Stadium',
  'Tennessee Titans': 'Nissan Stadium',
  'Washington Commanders': 'Northwest Stadium'
};

// NHL Team -> Arena mapping (32 teams)
export const NHL_ARENAS = {
  'Anaheim Ducks': 'Honda Center',
  'Arizona Coyotes': 'Mullett Arena', // Temporary
  'Boston Bruins': 'TD Garden',
  'Buffalo Sabres': 'KeyBank Center',
  'Calgary Flames': 'Scotiabank Saddledome',
  'Carolina Hurricanes': 'PNC Arena',
  'Chicago Blackhawks': 'United Center',
  'Colorado Avalanche': 'Ball Arena',
  'Columbus Blue Jackets': 'Nationwide Arena',
  'Dallas Stars': 'American Airlines Center',
  'Detroit Red Wings': 'Little Caesars Arena',
  'Edmonton Oilers': 'Rogers Place',
  'Florida Panthers': 'Amerant Bank Arena',
  'Los Angeles Kings': 'Crypto.com Arena',
  'Minnesota Wild': 'Xcel Energy Center',
  'Montreal Canadiens': 'Bell Centre',
  'Nashville Predators': 'Bridgestone Arena',
  'New Jersey Devils': 'Prudential Center',
  'New York Islanders': 'UBS Arena',
  'New York Rangers': 'Madison Square Garden',
  'Ottawa Senators': 'Canadian Tire Centre',
  'Philadelphia Flyers': 'Wells Fargo Center',
  'Pittsburgh Penguins': 'PPG Paints Arena',
  'San Jose Sharks': 'SAP Center',
  'Seattle Kraken': 'Climate Pledge Arena',
  'St. Louis Blues': 'Enterprise Center',
  'Tampa Bay Lightning': 'Amalie Arena',
  'Toronto Maple Leafs': 'Scotiabank Arena',
  'Utah Hockey Club': 'Delta Center',
  'Vancouver Canucks': 'Rogers Arena',
  'Vegas Golden Knights': 'T-Mobile Arena',
  'Washington Capitals': 'Capital One Arena',
  'Winnipeg Jets': 'Canada Life Centre'
};

/**
 * Get venue for a game based on home team and league
 * @param {string} homeTeam - The home team name
 * @param {string} league - The league (NBA, NFL, NHL)
 * @returns {string|null} - The venue name or null if not found
 */
export function getVenueForHomeTeam(homeTeam, league) {
  if (!homeTeam || !league) return null;
  
  const upperLeague = league.toUpperCase();
  
  switch (upperLeague) {
    case 'NBA':
      return NBA_ARENAS[homeTeam] || null;
    case 'NFL':
      return NFL_STADIUMS[homeTeam] || null;
    case 'NHL':
      return NHL_ARENAS[homeTeam] || null;
    default:
      return null;
  }
}

/**
 * Find team by partial name match (useful when API returns different formats)
 * @param {string} teamName - Partial or full team name
 * @param {string} league - The league
 * @returns {string|null} - The full team name or null
 */
export function findTeamByName(teamName, league) {
  if (!teamName || !league) return null;
  
  const upperLeague = league.toUpperCase();
  let mapping;
  
  switch (upperLeague) {
    case 'NBA':
      mapping = NBA_ARENAS;
      break;
    case 'NFL':
      mapping = NFL_STADIUMS;
      break;
    case 'NHL':
      mapping = NHL_ARENAS;
      break;
    default:
      return null;
  }
  
  // First try exact match
  if (mapping[teamName]) return teamName;
  
  // Try to find by partial match (city or mascot)
  const lowerName = teamName.toLowerCase();
  for (const fullName of Object.keys(mapping)) {
    if (fullName.toLowerCase().includes(lowerName)) {
      return fullName;
    }
    // Also check if the mascot matches
    const mascot = fullName.split(' ').pop().toLowerCase();
    if (mascot === lowerName || lowerName.includes(mascot)) {
      return fullName;
    }
  }
  
  return null;
}
