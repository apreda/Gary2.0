/**
 * This file contains improved team name abbreviations for all sports leagues
 * to create more concise and consistent team abbreviations on pick cards.
 */

const teamAbbreviations = {
  // NBA teams
  'Atlanta Hawks': 'Hawks',
  'Boston Celtics': 'Celtics',
  'Brooklyn Nets': 'Nets',
  'Charlotte Hornets': 'Hornets',
  'Chicago Bulls': 'Bulls',
  'Cleveland Cavaliers': 'Cavs',
  'Dallas Mavericks': 'Mavs',
  'Denver Nuggets': 'Nuggets',
  'Detroit Pistons': 'Pistons',
  'Golden State Warriors': 'Warriors',
  'Houston Rockets': 'Rockets',
  'Indiana Pacers': 'Pacers',
  'Los Angeles Clippers': 'Clippers',
  'LA Clippers': 'Clippers',
  'Los Angeles Lakers': 'Lakers',
  'LA Lakers': 'Lakers',
  'Memphis Grizzlies': 'Grizzlies',
  'Miami Heat': 'Heat',
  'Milwaukee Bucks': 'Bucks',
  'Minnesota Timberwolves': 'Wolves',
  'New Orleans Pelicans': 'Pelicans',
  'New York Knicks': 'Knicks',
  'Oklahoma City Thunder': 'Thunder',
  'Orlando Magic': 'Magic',
  'Philadelphia 76ers': '76ers',
  'Phoenix Suns': 'Suns',
  'Portland Trail Blazers': 'Blazers',
  'Sacramento Kings': 'Kings',
  'San Antonio Spurs': 'Spurs',
  'Toronto Raptors': 'Raptors',
  'Utah Jazz': 'Jazz',
  'Washington Wizards': 'Wizards',
  
  // MLB teams
  'Arizona Diamondbacks': 'D-backs',
  'Atlanta Braves': 'Braves',
  'Baltimore Orioles': 'O\'s',
  'Boston Red Sox': 'Red Sox',
  'Chicago Cubs': 'Cubs',
  'Chicago White Sox': 'White Sox',
  'Cincinnati Reds': 'Reds',
  'Cleveland Guardians': 'Guardians',
  'Colorado Rockies': 'Rockies',
  'Detroit Tigers': 'Tigers',
  'Houston Astros': 'Astros',
  'Kansas City Royals': 'Royals',
  'Los Angeles Angels': 'Angels',
  'LA Angels': 'Angels',
  'Los Angeles Dodgers': 'Dodgers',
  'LA Dodgers': 'Dodgers',
  'Miami Marlins': 'Marlins',
  'Milwaukee Brewers': 'Brewers',
  'Minnesota Twins': 'Twins',
  'New York Mets': 'Mets',
  'New York Yankees': 'Yankees',
  'Oakland Athletics': 'A\'s',
  'Philadelphia Phillies': 'Phillies',
  'Pittsburgh Pirates': 'Pirates',
  'San Diego Padres': 'Padres',
  'San Francisco Giants': 'Giants',
  'Seattle Mariners': 'Mariners',
  'St. Louis Cardinals': 'Cardinals',
  'Tampa Bay Rays': 'Rays',
  'Texas Rangers': 'Rangers',
  'Toronto Blue Jays': 'Blue Jays',
  'Washington Nationals': 'Nationals',
  
  // NHL teams
  'Anaheim Ducks': 'Ducks',
  'Arizona Coyotes': 'Coyotes',
  'Boston Bruins': 'Bruins',
  'Buffalo Sabres': 'Sabres',
  'Calgary Flames': 'Flames',
  'Carolina Hurricanes': 'Canes',
  'Chicago Blackhawks': 'Hawks',
  'Colorado Avalanche': 'Avs',
  'Columbus Blue Jackets': 'CBJ',
  'Dallas Stars': 'Stars',
  'Detroit Red Wings': 'Wings',
  'Edmonton Oilers': 'Oilers',
  'Florida Panthers': 'Panthers',
  'Los Angeles Kings': 'Kings',
  'LA Kings': 'Kings',
  'Minnesota Wild': 'Wild',
  'Montréal Canadiens': 'Habs',
  'Montreal Canadiens': 'Habs',
  'Nashville Predators': 'Preds',
  'New Jersey Devils': 'Devils',
  'New York Islanders': 'Isles',
  'New York Rangers': 'Rangers',
  'Ottawa Senators': 'Sens',
  'Philadelphia Flyers': 'Flyers',
  'Pittsburgh Penguins': 'Pens',
  'San Jose Sharks': 'Sharks',
  'Seattle Kraken': 'Kraken',
  'St. Louis Blues': 'Blues',
  'Tampa Bay Lightning': 'Bolts',
  'Toronto Maple Leafs': 'Leafs',
  'Vancouver Canucks': 'Canucks',
  'Vegas Golden Knights': 'Knights',
  'Washington Capitals': 'Caps',
  'Winnipeg Jets': 'Jets',
  
  // Soccer/Euro teams
  'Manchester United': 'Man Utd',
  'Manchester City': 'Man City',
  'Liverpool FC': 'Liverpool',
  'Liverpool': 'Liverpool',
  'Chelsea FC': 'Chelsea',
  'Chelsea': 'Chelsea',
  'Arsenal FC': 'Arsenal',
  'Arsenal': 'Arsenal',
  'Tottenham Hotspur': 'Spurs',
  'Tottenham': 'Spurs',
  'Leicester City': 'Leicester',
  'West Ham United': 'West Ham',
  'Everton FC': 'Everton',
  'Everton': 'Everton',
  'Aston Villa': 'Villa',
  'Newcastle United': 'Newcastle',
  'Leeds United': 'Leeds',
  'Wolverhampton': 'Wolves',
  'Wolves': 'Wolves',
  'Crystal Palace': 'Palace',
  'Southampton FC': 'Saints',
  'Southampton': 'Saints',
  'Brighton': 'Brighton',
  'Burnley FC': 'Burnley',
  'Burnley': 'Burnley',
  'Real Madrid': 'Madrid',
  'Barcelona': 'Barça',
  'Atletico Madrid': 'Atlético',
  'Sevilla FC': 'Sevilla',
  'Sevilla': 'Sevilla',
  'Valencia CF': 'Valencia',
  'Valencia': 'Valencia',
  'Bayern Munich': 'Bayern',
  'Borussia Dortmund': 'BVB',
  'RB Leipzig': 'Leipzig',
  'Juventus': 'Juve',
  'AC Milan': 'Milan',
  'Inter Milan': 'Inter',
  'AS Roma': 'Roma',
  'Roma': 'Roma',
  'Napoli': 'Napoli',
  'Paris Saint-Germain': 'PSG',
  'PSG': 'PSG',
  'Olympique Lyonnais': 'Lyon',
  'Lyon': 'Lyon',
  'Marseille': 'OM',
  'Ajax Amsterdam': 'Ajax',
  'Ajax': 'Ajax'
};

/**
 * Get the abbreviated team name
 * @param {string} teamName - Full team name
 * @returns {string} - Abbreviated team name
 */
export const getTeamAbbreviation = (teamName) => {
  // Direct lookup
  if (teamAbbreviations[teamName]) {
    return teamAbbreviations[teamName];
  }
  
  // Find partial matches (for teams within longer strings)
  for (const fullTeamName in teamAbbreviations) {
    if (teamName.includes(fullTeamName) && fullTeamName.length > 3) {
      return teamAbbreviations[fullTeamName];
    }
  }
  
  // Default to returning the original name
  return teamName;
};

export default teamAbbreviations;
