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

  // Extract bracket pick (strip markdown bold ** if present)
  const pickMatch = responseText.match(/BRACKET PICK:\s*(.+?)(?:\n|$)/i);
  if (pickMatch) {
    result.picked_to_advance = pickMatch[1].trim().replace(/^\*+\s*/, '').replace(/\s*\*+$/, '');
  }

  // Confidence removed — Gary just picks, no self-evaluation

  // Extract is_upset
  const upsetMatch = responseText.match(/IS UPSET:\s*(YES|NO)/i);
  if (upsetMatch) {
    result.is_upset = upsetMatch[1].toUpperCase() === 'YES';
  }

  // Extract rationale — capture everything until the next PROS/CONS section or end
  const ratMatch = responseText.match(/BRACKET RATIONALE:\s*(.+?)(?=\n\s*\S+\s+PROS:)/is);
  if (ratMatch) {
    result.bracket_rationale = ratMatch[1].trim();
  } else {
    // Fallback: grab everything after BRACKET RATIONALE until end of text
    const fallbackMatch = responseText.match(/BRACKET RATIONALE:\s*(.+)/is);
    if (fallbackMatch) {
      result.bracket_rationale = fallbackMatch[1].trim();
    }
  }

  // Extract pros/cons — find all PROS/CONS sections and match to teams by proximity
  const prosSections = [...responseText.matchAll(/(.+?)\s+PROS:\s*\n((?:- .+\n?)+)/gi)];
  const consSections = [...responseText.matchAll(/(.+?)\s+CONS:\s*\n((?:- .+\n?)+)/gi)];

  const matchesTeam = (header, team) => {
    const headerLower = header.toLowerCase();
    const words = team.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
    return words.some(w => headerLower.includes(w));
  };

  for (const match of prosSections) {
    const header = match[1].trim();
    const bullets = extractBullets(match[2]);
    if (matchesTeam(header, homeTeam)) result.team1_pros = bullets;
    else if (matchesTeam(header, awayTeam)) result.team2_pros = bullets;
  }

  for (const match of consSections) {
    const header = match[1].trim();
    const bullets = extractBullets(match[2]);
    if (matchesTeam(header, homeTeam)) result.team1_cons = bullets;
    else if (matchesTeam(header, awayTeam)) result.team2_cons = bullets;
  }

  return result;
}

function extractBullets(text) {
  return text
    .split('\n')
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}
