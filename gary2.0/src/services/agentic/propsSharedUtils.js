/**
 * Props Shared Utilities
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
  'MLB': 'MLB_PROPS',
  'MLB HR': 'MLB_PROPS',  // HR picks use same MLB props constitution
  'NCAAB': 'NBA_PROPS',   // College basketball → closest analog is NBA props rules
  'NCAAF': 'NFL_PROPS',   // College football → closest analog is NFL props rules
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

  // HR RULE (user, Jun 18): AT MOST ONE home-run prop per game. HR props are
  // lottery-style, so the dedicated MLB HR lane should surface a single best HR
  // threat per matchup — never stack two on the same game. Skim HR off the top,
  // keep the highest-confidence one per game, then run the normal 2-per-game
  // logic on the rest. (HR props only reach this lane — the regular MLB slate
  // excludes them — so this is effectively the MLB HR lane's per-game cap.)
  const hrConstrained = [];
  const hrDropped = [];
  {
    const hrByGame = {};
    const rest = [];
    for (const pick of picks) {
      const isHr = (pick.prop || '').toLowerCase().includes('home_run')
        || (pick.prop_type || '').toLowerCase().includes('home_run');
      const mu = (pick.matchup || '').toLowerCase();
      if (isHr && mu) { (hrByGame[mu] = hrByGame[mu] || []).push(pick); }
      else { rest.push(pick); }
    }
    for (const mu of Object.keys(hrByGame)) {
      const g = hrByGame[mu].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      hrConstrained.push(g[0]);
      if (g.length > 1) {
        hrDropped.push(...g.slice(1));
        console.log(`[Props Constraint] 🏠 1-HR-per-game: kept ${g[0].player} ${g[0].prop} (${Math.round((g[0].confidence || 0) * 100)}%), dropped ${g.length - 1} other HR pick(s) for ${mu}`);
      }
    }
    picks = rest;  // the 2-per-game logic below now only sees non-HR picks
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

  // Fold the capped HR pick(s) back in — exactly one per game, kept separate
  // from the 2-per-game count so the single HR threat never crowds out a
  // regular prop (and in the HR-only lane this is simply the whole output).
  constrainedPicks.push(...hrConstrained);
  droppedPicks.push(...hrDropped);

  if (droppedPicks.length > 0) {
    console.log(`[Props Constraint] Applied per-game constraint: ${constrainedPicks.length} kept, ${droppedPicks.length} dropped, ${garySpecials.length} Gary Specials`);
  }

  return { constrainedPicks, droppedPicks, garySpecials };
}

/**
 * F-3 (Jul 5 2026 audit): an explicit props pass — finalize_props called with
 * no_play: true and NO picks. Distinct from a malformed empty call (no no_play),
 * which still gets the retry treatment in agentLoop.
 */
export function isExplicitPropsPass(args) {
  if (!args || args.no_play !== true) return false;
  const picks = Array.isArray(args.picks) ? args.picks : [];
  return picks.length === 0;
}

/**
 * F-5 (Jul 5 2026 audit): pipeline-internal flags (underscore-prefixed keys such
 * as _oddsUnverified / _statAuditWarnings) must never ship inside the user-facing
 * pick JSON. Strip them at the storage boundary.
 */
export function stripInternalFields(pick) {
  if (!pick || typeof pick !== 'object') return pick;
  return Object.fromEntries(Object.entries(pick).filter(([k]) => !k.startsWith('_')));
}
