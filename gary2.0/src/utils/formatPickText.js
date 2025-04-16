// Pick text formatter utility - fixes formatting for all sports with proper caching
import { getTeamAbbreviation } from './teamAbbreviations';

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
  // Use our comprehensive team abbreviation utility
  const abbreviateTeamName = (name) => {
    if (!name) return '';
    return getTeamAbbreviation(name);
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
      // For MLB, format as 'Cubs +104' (no 'ML')
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
