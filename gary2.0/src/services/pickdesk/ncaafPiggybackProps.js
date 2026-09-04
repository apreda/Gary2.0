/**
 * THE NCAAF PIGGYBACK — college props ride the game pick (founder, Aug 25 2026).
 *
 * College football gets no second props system. Right after Gary's game pick
 * for an FBS game, this lane hands him THAT game's live prop menu — popular
 * books only, prices inside the piggyback band — and asks for at most two
 * props he would bet to ride with his pick. His published pick and rationale
 * are the context; nothing regenerates.
 *
 * Every stored row is provider-priced by construction: a selection is only
 * accepted when it is identity-matched to a menu row (player + prop_type +
 * line + bet), and every menu row came from The Odds API board narrowed to
 * roster/stat-validated BDL players with an exact player_id. Rows publish in
 * the production prop shape, so grading, records, and the Picks page game
 * cards all ride the existing NCAAF rails.
 *
 * NFL keeps its full props desk. This module is NCAAF-only by contract.
 */
import { createHash } from 'crypto';
import { ncaafPropOddsService, NcaafPropMarketError } from '../ncaafPropOddsService.js';
import { buildNcaafPropsAgenticContext } from '../agentic/ncaafPropsAgenticContext.js';
import { NCAAF_PROPS_EVIDENCE_SHA } from '../agentic/ncaafPropsEvidenceSha.js';
import { buildGaryPropsSystemPrompt, runPropsDeskBrain, todayLong } from './propsBrain.js';
import { isFootballFunLane } from './footballPropsDesk.js';
import { propOddsService } from '../propOddsService.js';

// Founder, Aug 25 2026: "stick to the most popular ones with the standard
// odds and lines." The Odds API bookmaker keys for the mainstream US books
// (williamhill_us is Caesars' key there; both spellings ride for safety).
export const NCAAF_PIGGYBACK_BOOKS = Object.freeze([
  'fanduel',
  'draftkings',
  'betmgm',
  'williamhill_us',
  'caesars',
  'betrivers',
  'fanatics',
  'espnbet',
]);

// The piggyback price band (founder: "a cap on odds — we don't need to be
// showing Gary stuff that's +400, +500"). American odds inside [min, max];
// heavy chalk below min and longshots above max never reach the menu. The
// production bet window (propOddsService.isOddsTakeable) still applies on
// top, so this band can only ever narrow it.
export function piggybackOddsBand(env = process.env) {
  const min = Number(env.GARY_NCAAF_PIGGYBACK_MIN_ODDS);
  const max = Number(env.GARY_NCAAF_PIGGYBACK_MAX_ODDS);
  return {
    min: Number.isFinite(min) ? min : -250,
    max: Number.isFinite(max) ? max : 250,
  };
}

export const THE_PIGGYBACK_ASK = `You just published your pick for this game — it is above, with your reasoning. Take at most TWO props from this menu to ride with it — props you would bet at these exact prices. An empty list means no prop clears your bar for this game, and that is a fine answer.

The menu is the entire universe: pick only rows printed on it, copying player, prop_type, line, bet, and odds exactly as printed. Never invent or adjust a line.

Output:

\`\`\`json
{ "picks": [ { "player": "[full name]", "team": "[team]", "prop_type": "[key from the menu]", "line": 1.5, "bet": "over", "odds": "[exact odds]", "confidence_score": 0.XX, "rationale": "Gary's Take\\n\\n[the prose]" } ] }
\`\`\`

bet is "over" or "under" — "over" for one-priced lines like anytime_td.
confidence_score (0.50–1.00): your conviction in this bet at its price — the bet, not the outcome.`;

// NCAAF's era includes the dated-game evidence surface as well as its prompt.
export const NCAAF_PIGGYBACK_PROMPT_SHA = createHash('sha256')
  .update(buildGaryPropsSystemPrompt('{date}') + THE_PIGGYBACK_ASK + NCAAF_PROPS_EVIDENCE_SHA)
  .digest('hex')
  .slice(0, 12);

const norm = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
const fmtOdds = (value) => (value > 0 ? `+${value}` : `${value}`);

const inBand = (odds, band) =>
  Number.isFinite(odds) && odds >= band.min && odds <= band.max;

const takeable = (odds, propType) =>
  propOddsService.isOddsTakeable(odds, String(propType || '').toLowerCase());

/**
 * Flatten validated market rows into the per-side option list Gary chooses
 * from. Each option is one bettable side with its own provider price; a side
 * outside the band or the production bet window never appears at all.
 */
export function buildPiggybackMenu(marketRows, band) {
  const options = [];
  for (const row of Array.isArray(marketRows) ? marketRows : []) {
    if (!row?.player || !row?.prop_type || row.line == null) continue;
    const base = {
      player: row.player,
      player_id: row.player_id ?? null,
      team: row.team ?? null,
      prop_type: row.prop_type,
      line: Number(row.line),
      market_type: row.market_type || 'over_under',
    };
    if (row.over_odds != null && inBand(Number(row.over_odds), band) && takeable(Number(row.over_odds), row.prop_type)) {
      options.push({ ...base, bet: 'over', odds: Number(row.over_odds) });
    }
    if (row.market_type !== 'yes_no'
      && row.under_odds != null && inBand(Number(row.under_odds), band) && takeable(Number(row.under_odds), row.prop_type)) {
      options.push({ ...base, bet: 'under', odds: Number(row.under_odds) });
    }
  }
  return options;
}

export function renderPiggybackMenu(options) {
  return options
    .map((o) => {
      const side = o.market_type === 'yes_no' ? 'YES (bet: over)' : o.bet.toUpperCase();
      const line = o.market_type === 'yes_no' ? '' : ` ${o.line}`;
      return `- ${o.player}${o.team ? ` (${o.team})` : ''} — ${o.prop_type} ${side}${line} @ ${fmtOdds(o.odds)}`;
    })
    .join('\n');
}

/**
 * Identity rail: a returned pick survives only when it matches a menu option
 * exactly (player + prop_type + line + bet). Everything else — an invented
 * line, a nudged price, a player not on the menu — is dropped loudly. At most
 * two survive, highest conviction first.
 */
export function matchSelectionsToMenu(parsedPicks, options) {
  const index = new Map(options.map((o) => [
    `${norm(o.player)}|${norm(o.prop_type)}|${o.line}|${norm(o.bet)}`,
    o,
  ]));
  const seen = new Set();
  const matched = [];
  for (const pick of Array.isArray(parsedPicks) ? parsedPicks : []) {
    const key = `${norm(pick?.player)}|${norm(pick?.prop_type)}|${Number(pick?.line)}|${norm(pick?.bet)}`;
    const option = index.get(key);
    if (!option) {
      console.warn(`[NCAAF Piggyback] 🛑 Menu-identity gate: dropped ${pick?.player} ${pick?.bet} ${pick?.prop_type} ${pick?.line} — not a menu row`);
      continue;
    }
    const dedupeKey = `${norm(option.player)}|${norm(option.prop_type)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    matched.push({ option, confidence: pick.confidence_score ?? null, rationale: pick.rationale || '' });
  }
  return matched
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 2);
}

/**
 * The lane. Returns { picks, explicitPass, menuSize, reason } — picks in the
 * production prop-row shape (the caller stamps the TD category and stores).
 * A game with no live board or no menu row inside the band is an honest empty
 * result, never an error; provider/roster failures throw to the fail-soft
 * caller.
 */
export async function runNcaafPiggyback({ game, pickText, rationale, env = process.env }) {
  const homeTeam = typeof game?.home_team === 'string' ? game.home_team : game?.home_team?.full_name;
  const awayTeam = typeof game?.away_team === 'string' ? game.away_team : game?.away_team?.full_name;
  const gameId = game?.bdl_game_id ?? game?.id ?? null;
  if (!homeTeam || !awayTeam || !game?.commence_time || gameId == null) {
    throw new Error('NCAAF piggyback requires home/away teams, kickoff, and the BDL game id');
  }
  if (!pickText) throw new Error('NCAAF piggyback runs only after a published game pick');

  let marketRows;
  try {
    marketRows = await ncaafPropOddsService.getPlayerPropMarkets({
      homeTeam,
      awayTeam,
      commenceTime: game.commence_time,
      bdlGameId: gameId,
      env,
      allowedBookmakers: NCAAF_PIGGYBACK_BOOKS,
    });
  } catch (error) {
    if (error instanceof NcaafPropMarketError && error.code === 'NO_LIVE_PROP_MARKETS') {
      return { picks: [], explicitPass: false, menuSize: 0, reason: 'no live board' };
    }
    throw error;
  }

  // Roster/stat validation with exact BDL player_id — the same gate the full
  // desk used. context.playerProps is the validated subset of the board.
  const context = await buildNcaafPropsAgenticContext(game, marketRows, {});
  const band = piggybackOddsBand(env);
  const options = buildPiggybackMenu(context.playerProps, band);
  if (!options.length) {
    return { picks: [], explicitPass: false, menuSize: 0, reason: 'no menu row inside the piggyback band' };
  }

  const matchup = `${awayTeam} @ ${homeTeam}`;
  const userMessage = `## THE PIGGYBACK — ${matchup}

═══ YOUR PUBLISHED PICK FOR THIS GAME ═══
${pickText}

${rationale || ''}

═══ THE PROP MENU — live prices, mainstream books ═══
${renderPiggybackMenu(options)}

═══ DATED PLAYER EVIDENCE ═══
${context.playerStats || 'No dated player evidence available.'}

${THE_PIGGYBACK_ASK}`;

  const winnersEvidence = { deskText: `${pickText}\n${rationale || ''}\n${renderPiggybackMenu(options)}\n${context.playerStats || ''}`, observedAt: new Date().toISOString(), homeTeam, awayTeam };

  const { parsed, explicitPass, respondingModel } = await runPropsDeskBrain({
    systemPrompt: buildGaryPropsSystemPrompt(todayLong()),
    userMessage,
    corpus: [{ content: winnersEvidence.deskText }],
    recentScores: null,
  });

  const selections = matchSelectionsToMenu(parsed.picks, options);
  const picks = selections.map(({ option, confidence, rationale: take }) => ({
    player: option.player,
    player_id: option.player_id,
    team: option.team,
    prop: option.prop_type,
    prop_type: option.prop_type,
    line: String(option.line),
    bet: option.bet,
    odds: String(option.odds),
    confidence,
    rationale: take,
    prompt_sha: NCAAF_PIGGYBACK_PROMPT_SHA,
    model: respondingModel,
    lane: isFootballFunLane(option.prop_type) ? 'TD' : 'CORE',
    sport: 'NCAAF',
    matchup,
    commence_time: game.commence_time,
    game_id: String(gameId),
  }));

  return { picks, explicitPass, menuSize: options.length, reason: null, winnersEvidence };
}
