/** Scout-report data: The BETTING CONTEXT section. (split from dataFetchers.js, Oct 13 2026) */
import { menuTruthLines } from '../../../orchestrator/mlbCaseMenu.js';
import { GAME_ML_CAP } from '../../../orchestrator/orchestratorConfig.js';
import { spreadForSide } from '../../../../marketTruth.js';

// ============================================================================
// FORMAT ODDS, MONEYLINE
// ============================================================================

// formatSituationalFactors removed — Layer 3 violation (told Gary what factors mean)

const isFootballSport = (sport) => /football|nfl|ncaaf/i.test(String(sport || ''));

export function formatOdds(game, sport = '') {
  const lines = [];
  const isNHL = sport === 'icehockey_nhl' || sport === 'NHL';

  // Spread - SKIP FOR NHL (NHL is moneyline only, no puck lines)
  let spreadHome = null;
  let spreadAway = null;
  let spreadHomeOdds = null;
  let spreadAwayOdds = null;
  if (isNHL) {
    lines.push('NHL IS MONEYLINE ONLY - No puck lines, no spreads');
  } else if (spreadForSide(game, 'home') !== null || spreadForSide(game, 'away') !== null) {
    spreadHome = spreadForSide(game, 'home');
    spreadAway = spreadForSide(game, 'away');
    // `spread_odds` is a legacy HOME-side field. It may fill a missing home
    // price, but it must never be borrowed for the away ticket.
    spreadHomeOdds = game.spread_home_odds ?? game.spread_odds ?? null;
    spreadAwayOdds = game.spread_away_odds ?? null;
    // Always present away @ home convention for deterministic data presentation
    lines.push(`Spread: ${game.away_team} ${formatSignedSpread(spreadAway)} (${formatAmericanPrice(spreadAwayOdds)}) | ${game.home_team} ${formatSignedSpread(spreadHome)} (${formatAmericanPrice(spreadHomeOdds)})`);
  } else if (game.spreads) {
    lines.push(`Spread: ${game.spreads}`);
  } else {
    lines.push('Spread: Not available');
  }

  // Moneyline. A game object can carry the keys with null values (a board
  // fetched before books post lines) — that used to print "Rams NaN | Chargers
  // NaN" straight into the dossier (seen live Aug 20 on a game a week out).
  let mlHome = null;
  let mlAway = null;
  const capped = (ml) => !isNHL && Number.isFinite(parseFloat(ml)) && parseFloat(ml) < GAME_ML_CAP;
  const hideCapped = /^(?:americanfootball_)?(?:nfl|ncaaf)$/i.test(String(sport || ''));
  if (Number.isFinite(parseFloat(game.moneyline_home)) && Number.isFinite(parseFloat(game.moneyline_away))) {
    mlHome = game.moneyline_home;
    mlAway = game.moneyline_away;
    // A moneyline past the house limit is not a ticket, so it is not shown (founder, Oct 11 2026: Gary reads
    // his options, never the rule). NHL is moneyline-only at any price.
    // Football (founder, Oct 12 2026: "just completely take it off the options"; college the same day): the
    // capped side is not on the line at all, not even as "not offered", so the desk never hints that a
    // ticket is missing.
    const mlParts = [[game.away_team, mlAway], [game.home_team, mlHome]]
      .filter(([, ml]) => !(hideCapped && capped(ml)))
      .map(([team, ml]) => `${team} ${capped(ml) ? 'not offered' : formatMoneyline(ml)}`);
    lines.push(`Moneyline: ${mlParts.join(' | ')}`);
  } else if (game.h2h) {
    lines.push(`Moneyline: ${game.h2h}`);
  } else {
    lines.push('Moneyline: Not available');
  }

  // MENU TRUTH for the house limit (founder GO, Sep 1 2026 — the MLB desk's
  // rule, applied to football): a moneyline heavier than the cap is not a
  // ticket and the desk says so before the read. One definition of the menu
  // (mlbCaseMenu.js) serves every desk. Away @ home order, like the lines above.
  if (!isNHL) {
    lines.push(...menuTruthLines(
      { moneyline_home: mlHome, moneyline_away: mlAway, spread_home: spreadHome, spread_away: spreadAway, spread_home_odds: spreadHomeOdds, spread_away_odds: spreadAwayOdds },
      game.home_team, game.away_team, { order: 'away-first' }));
    if (game._lineHistory) lines.push(game._lineHistory);
  }

  // Total - parse for database storage but do NOT display to Gary
  let totalValue = null;
  if (game.total !== undefined && game.total !== null) {
    totalValue = parseFloat(game.total);
  }

  // Add raw values for Gary to include in JSON output
  lines.push('');
  if (isNHL) {
    lines.push('RAW ODDS VALUES (NHL - MONEYLINE ONLY):');
    lines.push('  spread: null  ← NHL does not use puck lines');
    lines.push('  spreadOdds: null');
  } else {
    lines.push('RAW ODDS VALUES (copy these to your JSON output):');
    lines.push(`  spreadHome: ${spreadHome !== null ? spreadHome : 'null'}`);
    lines.push(`  spreadHomeOdds: ${spreadHomeOdds ?? 'null'}`);
    lines.push(`  spreadAway: ${spreadAway !== null ? spreadAway : 'null'}`);
    lines.push(`  spreadAwayOdds: ${spreadAwayOdds ?? 'null'}`);
  }
  // Football's raw block lists only the tickets that exist; a capped side has no line here either.
  if (!(hideCapped && capped(mlHome))) lines.push(`  moneylineHome: ${mlHome !== null && !capped(mlHome) ? mlHome : 'null'}`);
  if (!(hideCapped && capped(mlAway))) lines.push(`  moneylineAway: ${mlAway !== null && !capped(mlAway) ? mlAway : 'null'}`);

  return lines.join('\n') || 'Odds not available';
}

function formatSignedSpread(value) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

function formatAmericanPrice(value) {
  if (value === null || value === undefined || value === '') return 'price unavailable';
  const num = Number(value);
  if (!Number.isFinite(num)) return 'price unavailable';
  return num > 0 ? `+${num}` : String(num);
}

function formatMoneyline(ml) {
  const num = parseFloat(ml);
  return num > 0 ? `+${num}` : num.toString();
}
