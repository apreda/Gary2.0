/**
 * Props Shared Utilities
 * Extracted from propsAgenticRunner.js during legacy pipeline removal.
 *
 * Used by run-agentic-props-cli.js (orchestrator path) for:
 * - getPropsConstitution(): fetches sectioned props constitution per sport
 * - applyPropsPerGameConstraint(): enforces 2-per-game cap + Gary Specials
 */
import { getConstitution as getConstitutionFromIndex } from './constitution/index.js';

// ── Sport label → constitution key mapping ──────────────────────────────────

const SPORT_CONSTITUTION_KEYS = {
  'NFL': 'NFL_PROPS',
  'NBA': 'NBA_PROPS',
  'NHL': 'NHL_PROPS',
  'NCAAB': 'NBA_PROPS',   // College basketball → closest analog is NBA props rules
  'NCAAF': 'NFL_PROPS',   // College football → closest analog is NFL props rules
  'WBC': 'NBA_PROPS',     // WBC uses NBA props rules (closest analog for HR props)
};

// ── getPropsConstitution ────────────────────────────────────────────────────

/**
 * Get the props constitution for a given sport label.
 * Handles date template replacement in all sections.
 * @param {string} sportLabel - e.g. 'NFL', 'NBA', 'NHL'
 * @returns {Object|string} - Sectioned constitution object or string
 */
export function getPropsConstitution(sportLabel) {
  const constitutionKey = SPORT_CONSTITUTION_KEYS[sportLabel] || 'NFL_PROPS';
  const constitution = getConstitutionFromIndex(constitutionKey);

  // Replace date template if present
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  if (typeof constitution === 'object' && constitution.pass1) {
    // Sectioned props constitution — replace templates in all sections
    for (const key of ['baseRules', 'pass1', 'pass2', 'pass25', 'pass3']) {
      if (constitution[key]) {
        constitution[key] = constitution[key].replace(/\{\{CURRENT_DATE\}\}/g, today);
      }
    }
  } else if (typeof constitution === 'object' && constitution.full) {
    // Game pick constitution (shouldn't be used here but handle gracefully)
    for (const key of ['baseRules', 'domainKnowledge', 'guardrails', 'full']) {
      if (constitution[key]) {
        constitution[key] = constitution[key].replace(/\{\{CURRENT_DATE\}\}/g, today);
      }
    }
  } else if (typeof constitution === 'string') {
    return constitution.replace(/\{\{CURRENT_DATE\}\}/g, today);
  }

  return constitution;
}

// ── checkPropCorrelation ────────────────────────────────────────────────────

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
    ['pts', 'ast'],
    ['points', 'assists'],
    ['pts', 'pra'],
    ['points', 'pra'],
    // NBA: Inside game
    ['pts', 'reb'],
    ['points', 'rebounds'],
    // NFL: Workload
    ['rushyds', 'recyds'],
    ['rushingyards', 'receivingyards'],
    // NFL: Target hog
    ['receptions', 'recyds'],
    ['receptions', 'receivingyards'],
    // NHL: PP1 usage
    ['sog', 'points'],
    ['shots', 'points'],
    ['shotsongoal', 'points'],
    // NHL: Scorer
    ['goals', 'points'],
    ['goals', 'sog'],
    ['goals', 'shots']
  ];

  for (const [a, b] of correlatedPairs) {
    if ((p1.includes(a) && p2.includes(b)) || (p1.includes(b) && p2.includes(a))) {
      return true;
    }
  }

  return false;
}

// ── applyPropsPerGameConstraint ─────────────────────────────────────────────

/**
 * Enforce 2-per-game constraint with Gary Special support.
 * Groups picks by matchup, keeps top 2 from different players,
 * and allows a 3rd if it's correlated with the alpha pick.
 *
 * @param {Array} picks - All validated picks
 * @param {string} gameId - The game identifier (for logging)
 * @returns {Object} - { constrainedPicks, droppedPicks, garySpecials }
 */
export function applyPropsPerGameConstraint(picks, gameId) {
  if (!picks || picks.length === 0) {
    return { constrainedPicks: [], droppedPicks: [], garySpecials: [] };
  }

  // Group picks by GAME (using matchup field) — NOT by team
  const picksByGame = {};

  for (const pick of picks) {
    const matchup = (pick.matchup || '').toLowerCase();
    if (!matchup) continue;
    if (!picksByGame[matchup]) picksByGame[matchup] = [];
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

    // Sort by confidence (descending)
    gamePicks.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    // Group by player
    const picksByPlayer = {};
    for (const pick of gamePicks) {
      const player = (pick.player || '').toLowerCase();
      if (!picksByPlayer[player]) picksByPlayer[player] = [];
      picksByPlayer[player].push(pick);
    }

    const players = Object.keys(picksByPlayer);

    if (players.length >= 2) {
      // Diversify: best pick from top 2 players
      const playersByTopConfidence = players
        .map(p => ({ player: p, topConfidence: Math.max(...picksByPlayer[p].map(pk => pk.confidence || 0)) }))
        .sort((a, b) => b.topConfidence - a.topConfidence);

      const alphaPick = picksByPlayer[playersByTopConfidence[0].player][0];
      const betaPick = picksByPlayer[playersByTopConfidence[1].player][0];
      constrainedPicks.push(alphaPick, betaPick);

      // Gary Special: alpha player's 2nd pick if correlated with 1st
      const alphaPicks = picksByPlayer[playersByTopConfidence[0].player];
      if (alphaPicks.length >= 2) {
        const secondPick = alphaPicks[1];
        const prop1 = (alphaPick.prop || '').toLowerCase();
        const prop2 = (secondPick.prop || '').toLowerCase();
        const isCorrelated = checkPropCorrelation(prop1, prop2);

        if (isCorrelated) {
          console.log(`[Props Constraint] 🌟 Gary Special: Adding 3rd pick for ${secondPick.player} (${prop2} correlated with ${prop1})`);
          constrainedPicks.push({ ...secondPick, isGarySpecial: true });
          garySpecials.push(secondPick);
        } else {
          droppedPicks.push(secondPick);
        }
      }

      // Track dropped
      for (const player of players) {
        for (const pick of picksByPlayer[player]) {
          if (!constrainedPicks.includes(pick) && !garySpecials.includes(pick)) {
            droppedPicks.push(pick);
          }
        }
      }
    } else {
      // Only 1 player — take top 2
      const soloPlayerPicks = gamePicks.slice(0, 2);
      constrainedPicks.push(...soloPlayerPicks);

      // Gary Special on 3rd — if correlated with 1st
      if (gamePicks.length >= 3) {
        const thirdPick = gamePicks[2];
        const prop1 = (soloPlayerPicks[0].prop || '').toLowerCase();
        const prop3 = (thirdPick.prop || '').toLowerCase();
        const isCorrelated = checkPropCorrelation(prop1, prop3);

        if (isCorrelated) {
          console.log(`[Props Constraint] 🌟 Gary Special: Adding 3rd pick for ${thirdPick.player} (correlated props)`);
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
