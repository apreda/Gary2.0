/**
 * Industry standard team abbreviations for all major sports leagues
 */

const industryTeamAbbreviations = {
  // NBA teams - official 3-letter codes
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
  'Los Angeles Clippers': 'LAC',
  'LA Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL',
  'LA Lakers': 'LAL',
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
  
  // MLB teams - official 2-3 letter codes
  'Arizona Diamondbacks': 'ARI',
  'Atlanta Braves': 'ATL',
  'Baltimore Orioles': 'BAL',
  'Boston Red Sox': 'BOS',
  'Chicago Cubs': 'CHC',
  'Chicago White Sox': 'CWS',
  'Cincinnati Reds': 'CIN',
  'Cleveland Guardians': 'CLE',
  'Colorado Rockies': 'COL',
  'Detroit Tigers': 'DET',
  'Houston Astros': 'HOU',
  'Kansas City Royals': 'KC',
  'Los Angeles Angels': 'LAA',
  'LA Angels': 'LAA',
  'Los Angeles Dodgers': 'LAD',
  'LA Dodgers': 'LAD',
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
  'Washington Nationals': 'WSH',
  
  // NHL teams - official 3-letter codes
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
  'LA Kings': 'LAK',
  'Minnesota Wild': 'MIN',
  'Montréal Canadiens': 'MTL',
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
  'Winnipeg Jets': 'WPG',
  
  // Soccer/Euro teams - common abbreviations
  'Manchester United': 'MUN',
  'Manchester City': 'MCI',
  'Liverpool FC': 'LIV',
  'Liverpool': 'LIV',
  'Chelsea FC': 'CHE',
  'Chelsea': 'CHE',
  'Arsenal FC': 'ARS',
  'Arsenal': 'ARS',
  'Tottenham Hotspur': 'TOT',
  'Tottenham': 'TOT',
  'Leicester City': 'LEI',
  'West Ham United': 'WHU',
  'Everton FC': 'EVE',
  'Everton': 'EVE',
  'Aston Villa': 'AVL',
  'Newcastle United': 'NEW',
  'Leeds United': 'LEE',
  'Wolverhampton': 'WOL',
  'Wolves': 'WOL',
  'Crystal Palace': 'CRY',
  'Southampton FC': 'SOU',
  'Southampton': 'SOU',
  'Brighton': 'BHA',
  'Burnley FC': 'BUR',
  'Burnley': 'BUR',
  'Real Madrid': 'RMA',
  'Barcelona': 'FCB',
  'Atletico Madrid': 'ATM',
  'Sevilla FC': 'SEV',
  'Sevilla': 'SEV',
  'Valencia CF': 'VAL',
  'Valencia': 'VAL',
  'Bayern Munich': 'BAY',
  'Borussia Dortmund': 'BVB',
  'RB Leipzig': 'RBL',
  'Juventus': 'JUV',
  'AC Milan': 'MIL',
  'Inter Milan': 'INT',
  'AS Roma': 'ROM',
  'Roma': 'ROM',
  'Napoli': 'NAP',
  'Paris Saint-Germain': 'PSG',
  'PSG': 'PSG',
  'Olympique Lyonnais': 'LYO',
  'Lyon': 'LYO',
  'Marseille': 'MAR',
  'Ajax Amsterdam': 'AJX',
  'Ajax': 'AJX'
};

/**
 * Get the industry standard team abbreviation
 * @param {string} teamName - Full team name
 * @returns {string} - Industry standard abbreviation for the team
 */
export const getIndustryAbbreviation = (teamName) => {
  // Direct lookup
  if (industryTeamAbbreviations[teamName]) {
    return industryTeamAbbreviations[teamName];
  }
  
  // Find partial matches (for teams within longer strings)
  for (const fullTeamName in industryTeamAbbreviations) {
    if (teamName.includes(fullTeamName) && fullTeamName.length > 3) {
      return industryTeamAbbreviations[fullTeamName];
    }
  }
  
  // Default to returning the original name
  return teamName;
};

export default industryTeamAbbreviations;
