/**
 * Parses Gary's bracket advancement response (Pass 2.75)
 * Extracts: picked team, confidence, rationale, is_upset, pros/cons for each team
 */

export function parseBracketResponse(responseText, homeTeam, awayTeam) {
  if (!responseText) return null;

  const result = {
    picked_to_advance: null,
    bracket_confidence: null,
    bracket_rationale: null,
    is_upset: false,
    team1_pros: [],
    team1_cons: [],
    team2_pros: [],
    team2_cons: [],
  };

  // Extract bracket pick
  const pickMatch = responseText.match(/BRACKET PICK:\s*(.+?)(?:\n|$)/i);
  if (pickMatch) {
    result.picked_to_advance = pickMatch[1].trim();
  }

  // Extract confidence
  const confMatch = responseText.match(/BRACKET CONFIDENCE:\s*([\d.]+)/i);
  if (confMatch) {
    result.bracket_confidence = parseFloat(confMatch[1]);
  }

  // Extract is_upset
  const upsetMatch = responseText.match(/IS UPSET:\s*(YES|NO)/i);
  if (upsetMatch) {
    result.is_upset = upsetMatch[1].toUpperCase() === 'YES';
  }

  // Extract rationale
  const ratMatch = responseText.match(/BRACKET RATIONALE:\s*(.+?)(?=\n\n|\n[A-Z])/is);
  if (ratMatch) {
    result.bracket_rationale = ratMatch[1].trim();
  }

  // Extract pros/cons for each team
  // homeTeam PROS:
  const homeProMatch = responseText.match(new RegExp(escapeRegex(homeTeam) + '\\s+PROS:\\s*\\n((?:- .+\\n?)+)', 'i'));
  if (homeProMatch) {
    result.team1_pros = extractBullets(homeProMatch[1]);
  }

  const homeConMatch = responseText.match(new RegExp(escapeRegex(homeTeam) + '\\s+CONS:\\s*\\n((?:- .+\\n?)+)', 'i'));
  if (homeConMatch) {
    result.team1_cons = extractBullets(homeConMatch[1]);
  }

  const awayProMatch = responseText.match(new RegExp(escapeRegex(awayTeam) + '\\s+PROS:\\s*\\n((?:- .+\\n?)+)', 'i'));
  if (awayProMatch) {
    result.team2_pros = extractBullets(awayProMatch[1]);
  }

  const awayConMatch = responseText.match(new RegExp(escapeRegex(awayTeam) + '\\s+CONS:\\s*\\n((?:- .+\\n?)+)', 'i'));
  if (awayConMatch) {
    result.team2_cons = extractBullets(awayConMatch[1]);
  }

  return result;
}

function extractBullets(text) {
  return text
    .split('\n')
    .map(line => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
