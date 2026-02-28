/**
 * Props utility functions extracted from the legacy propsAgenticRunner.
 * Contains getPropsConstitution and applyPropsPerGameConstraint.
 */
import { getConstitution as getConstitutionWithBaseRules } from './constitution/index.js';

// Map of sport labels to constitution keys
const SPORT_CONSTITUTION_KEYS = {
  'NFL': 'NFL_PROPS',
  'NBA': 'NBA_PROPS',
  'NHL': 'NHL_PROPS',
};

/**
 * Get the appropriate constitution for a sport (WITH BASE_RULES included)
 * Ensures props get the same core identity, data source rules, and
 * external betting influence prohibition as game picks.
 */
function getPropsConstitution(sportLabel) {
  const constitutionKey = SPORT_CONSTITUTION_KEYS[sportLabel] || 'NFL_PROPS';
  let constitution = getConstitutionWithBaseRules(constitutionKey);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  if (typeof constitution === 'object' && constitution.full) {
    for (const key of ['baseRules', 'domainKnowledge', 'guardrails', 'full']) {
      if (constitution[key]) {
        constitution[key] = constitution[key].replace(/\{\{CURRENT_DATE\}\}/g, today);
      }
    }
  } else {
    constitution = constitution.replace(/\{\{CURRENT_DATE\}\}/g, today);
  }

  return constitution;
}

/**
 * Check if two prop types are positively correlated
 * (both benefit from the same game script / player usage pattern)
 */
function checkPropCorrelation(prop1, prop2) {
  const normalize = (p) => p.replace(/[_\s]/g, '').toLowerCase();
  const p1 = normalize(prop1);
  const p2 = normalize(prop2);

  const correlatedPairs = [
    // NBA: High usage game
    ['pts', 'ast'], ['points', 'assists'], ['pts', 'pra'], ['points', 'pra'],
    // NBA: Inside game
    ['pts', 'reb'], ['points', 'rebounds'],
    // NFL: Workload
    ['rushyds', 'recyds'], ['rushingyards', 'receivingyards'],
    // NFL: Target hog
    ['receptions', 'recyds'], ['receptions', 'receivingyards'],
    // NHL: PP1 usage
    ['sog', 'points'], ['shots', 'points'], ['shotsongoal', 'points'],
    // NHL: Scorer
    ['goals', 'points'], ['goals', 'sog'], ['goals', 'shots']
  ];

  for (const [a, b] of correlatedPairs) {
    if ((p1.includes(a) && p2.includes(b)) || (p1.includes(b) && p2.includes(a))) {
      return true;
    }
  }

  return false;
}

/**
 * Apply 2-per-game constraint on props picks.
 * Groups by matchup, keeps top 2 by confidence (diversified across players).
 * Allows a 3rd "Gary Special" if correlated and elite confidence.
 */
function applyPropsPerGameConstraint(picks, gameId) {
  if (!picks || picks.length === 0) {
    return { constrainedPicks: [], droppedPicks: [], garySpecials: [] };
  }

  const picksByGame = {};

  for (const pick of picks) {
    const matchup = (pick.matchup || '').toLowerCase();
    if (!matchup) continue;

    if (!picksByGame[matchup]) {
      picksByGame[matchup] = [];
    }
    picksByGame[matchup].push(pick);
  }

  const constrainedPicks = [];
  const droppedPicks = [];
  const garySpecials = [];

  for (const matchup of Object.keys(picksByGame)) {
    const gamePicks = picksByGame[matchup];

    if (gamePicks.length <= 2) {
      constrainedPicks.push(...gamePicks);
      continue;
    }

    gamePicks.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    const picksByPlayer = {};
    for (const pick of gamePicks) {
      const player = (pick.player || '').toLowerCase();
      if (!picksByPlayer[player]) {
        picksByPlayer[player] = [];
      }
      picksByPlayer[player].push(pick);
    }

    const players = Object.keys(picksByPlayer);

    if (players.length >= 2) {
      const playersByTopConfidence = players
        .map(p => ({ player: p, topConfidence: Math.max(...picksByPlayer[p].map(pk => pk.confidence || 0)) }))
        .sort((a, b) => b.topConfidence - a.topConfidence);

      const alphaPick = picksByPlayer[playersByTopConfidence[0].player][0];
      const betaPick = picksByPlayer[playersByTopConfidence[1].player][0];

      constrainedPicks.push(alphaPick, betaPick);

      // Check for Gary Special: alpha player's 2nd elite + correlated pick
      const alphaPicks = picksByPlayer[playersByTopConfidence[0].player];
      if (alphaPicks.length >= 2) {
        const secondPick = alphaPicks[1];
        const isElite = (secondPick.confidence || 0) >= 0.70;
        const prop1 = (alphaPick.prop || '').toLowerCase();
        const prop2 = (secondPick.prop || '').toLowerCase();
        const isCorrelated = checkPropCorrelation(prop1, prop2);

        if (isElite && isCorrelated) {
          console.log(`[Props Constraint] Gary Special: Adding 3rd pick for ${secondPick.player} (${prop2} correlated with ${prop1})`);
          constrainedPicks.push({ ...secondPick, isGarySpecial: true });
          garySpecials.push(secondPick);
        } else {
          droppedPicks.push(secondPick);
        }
      }

      for (const player of players) {
        for (const pick of picksByPlayer[player]) {
          if (!constrainedPicks.includes(pick) && !garySpecials.includes(pick)) {
            droppedPicks.push(pick);
          }
        }
      }
    } else {
      const soloPlayerPicks = gamePicks.slice(0, 2);
      constrainedPicks.push(...soloPlayerPicks);

      if (gamePicks.length >= 3) {
        const thirdPick = gamePicks[2];
        const isElite = (thirdPick.confidence || 0) >= 0.70;
        const prop1 = (soloPlayerPicks[0].prop || '').toLowerCase();
        const prop3 = (thirdPick.prop || '').toLowerCase();
        const isCorrelated = checkPropCorrelation(prop1, prop3);

        if (isElite && isCorrelated) {
          console.log(`[Props Constraint] Gary Special: Adding 3rd pick for ${thirdPick.player} (correlated props)`);
          constrainedPicks.push({ ...thirdPick, isGarySpecial: true });
          garySpecials.push(thirdPick);
        } else {
          droppedPicks.push(thirdPick);
        }
      }

      for (let i = 3; i < gamePicks.length; i++) {
        if (!garySpecials.includes(gamePicks[i])) {
          droppedPicks.push(gamePicks[i]);
        }
      }
    }
  }

  if (droppedPicks.length > 0) {
    console.log(`[Props Constraint] Applied 2-per-game constraint: ${constrainedPicks.length} kept, ${droppedPicks.length} dropped, ${garySpecials.length} Gary Specials`);
  }

  return { constrainedPicks, droppedPicks, garySpecials };
}

export { getPropsConstitution, applyPropsPerGameConstraint };
