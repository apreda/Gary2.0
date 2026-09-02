/**
 * Props Shared Utilities
 *
 * Used by the props desk chassis (run-agentic-props-cli.js) for:
 * - applyPropsPerGameConstraint(): enforces 2-per-game cap + Gary Specials
 * - isExplicitPropsPass / normalizePropBetDirection / stripInternalFields
 */
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

  // FUN-LANE RULE: AT MOST ONE fun-lane prop per game, kept OUTSIDE the
  // 2-per-game core cap. HR (user, Jun 18): lottery-style — surface a single
  // best HR threat per matchup, never stack two. Anytime TD (founder GO,
  // Aug 20 2026 — football on the same system as MLB): the exact analog, one
  // best scorer per game, never competing with core props for the 2 slots.
  // Skim the fun lane off the top, keep the highest-confidence one per game,
  // then run the normal 2-per-game logic on the rest.
  const hrConstrained = [];
  const hrDropped = [];
  {
    const funByGame = {};
    const rest = [];
    for (const pick of picks) {
      const token = `${(pick.prop || '')} ${(pick.prop_type || '')}`.toLowerCase();
      const isFunLane = token.includes('home_run') || /anytime_?(?:td|touchdown)/.test(token);
      const mu = (pick.matchup || '').toLowerCase();
      if (isFunLane && mu) { (funByGame[mu] = funByGame[mu] || []).push(pick); }
      else { rest.push(pick); }
    }
    for (const mu of Object.keys(funByGame)) {
      const g = funByGame[mu].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      hrConstrained.push(g[0]);
      if (g.length > 1) {
        hrDropped.push(...g.slice(1));
        console.log(`[Props Constraint] 🏠 1-fun-lane-per-game: kept ${g[0].player} ${g[0].prop} (${Math.round((g[0].confidence || 0) * 100)}%), dropped ${g.length - 1} other fun-lane pick(s) for ${mu}`);
      }
    }
    picks = rest;  // the 2-per-game logic below now only sees core picks
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
 * Accept only the three directions the prop contracts permit. "yes" is the
 * one-priced-market spelling of over; malformed or missing output stays null
 * so no downstream code can silently turn it into a bet side.
 */
export function normalizePropBetDirection(value) {
  const direction = String(value || '').trim().toLowerCase();
  if (direction === 'yes') return 'over';
  if (direction === 'over' || direction === 'under') return direction;
  return null;
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
