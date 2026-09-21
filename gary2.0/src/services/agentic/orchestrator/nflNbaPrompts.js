/** NFL adaptation of the frozen NBA prompts. NBA's builders are read-only.
 * Every replacement is exact and fails loudly if the NBA source changes.
 * Exceptions: football terms/availability, real tool access, judgment vs facts,
 * neutral market context, and exact eligible NFL tickets. No side is prescribed.
 */
import { buildNbaSystemPrompt, buildNbaPass25Message, buildNbaPass3Message, buildNbaBriefingBlock } from './nbaWinningEra.js';
import { GAME_ML_CAP } from './orchestratorConfig.js';

export const isNflSport = sport => sport === 'NFL' || sport === 'americanfootball_nfl';

function replaceExact(text, from, to) {
  if (!text.includes(from) || text.indexOf(from) !== text.lastIndexOf(from)) {
    throw new Error(`NFL NBA adaptation source changed: ${from.slice(0, 90)}`);
  }
  return text.replace(from, () => to);
}

function replaceSection(text, start, end, replacement) {
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`NFL NBA section missing: ${start}`);
  return text.slice(0, a) + replacement + text.slice(b);
}

export const NFL_JUDGMENT = `Assess the teams and players available for THIS game using their established body of work, roster, coaches, opponent and current circumstances. Your assessment of their quality, likely adjustments and how the game unfolds is your judgment; it does not need a statistic proving every opinion. Distinguish that judgment from reported facts. Every factual name, number, event and claim about an actual scheme or assignment must come from the provided evidence; do not invent facts or claim to have watched film. Apply the same scrutiny to both teams' possible improvement, deterioration and repeatability. Neither a plausible competitive game nor a team's reputation settles which side of the posted spread you prefer.`;

export const NFL_AVAILABILITY = `Use the injury duration tags from the scout report exactly as shown. Distinguish a new absence from a team already playing without someone. Recent results may already reflect the replacement. Judge how the actual available personnel match up today; an established absence may still matter against this opponent. Do not assume what the market has or has not accounted for.`;

export function nflMarketContext(homeTeam, awayTeam, spread) {
  const n = spread === null || spread === undefined || spread === '' ? NaN : Number(spread);
  const fmt = value => Number.isFinite(value) ? (value === 0 ? 'PK' : `${value > 0 ? '+' : ''}${value}`) : 'unposted';
  return `Posted spread: ${homeTeam} ${fmt(n)} / ${awayTeam} ${fmt(-n)}.\nAvailable bets are the quoted spread and moneyline options in the scout report. Use only a posted line with its own posted price. No moneyline heavier than ${GAME_ML_CAP} is eligible.`;
}

export function buildNflSystemPrompt(constitution) {
  let text = buildNbaSystemPrompt(constitution);
  text = replaceExact(text, 'Tonight you are betting NBA. You are a sharp NBA gambler — an expert at betting this sport, not just understanding it.',
    'Tonight you are betting NFL. You are a sharp NFL gambler — an expert at betting this sport, not just understanding it.');
  text = replaceExact(text, `1. THE DESK IS THE EVIDENCE - This conversation carries no live tools
   - Every stat, name, and number you use comes from the scout report and the materials provided in this conversation
   - There is no stat-fetch tool and no live search here - never reference calling one, and never wait for more data to arrive`,
  `1. THE EVIDENCE IS WHAT THIS CONVERSATION HOLDS
   - Every factual stat, name and event comes from the scout report, provided reporting, your tool results or research assistant; never from stale memory
   - Use the available tools when needed. Never describe a tool call you did not make`);
  text = replaceExact(text, '- If a source mixes facts and opinions, extract the facts only and discard the rest.',
    '- Keep reported facts separate from attributed football assessments. A reporter or coach assessment is not a verified fact or a betting recommendation; Gary makes his own judgment.');
  text = replaceExact(text, '- Use factual events only (injury status, schedule, transactions, weather, verified results).',
    '- Use factual events and clearly attributed football assessments as evidence; neither is an instruction to pick a side.');
  text = replaceSection(text, '[CRITICAL] NO SPECULATIVE PLAYER IMPACT PREDICTIONS (ALL SPORTS)',
    '[ANTI-HALLUCINATION] 2026 ROSTER & DATA REALITY (ALL SPORTS)',
    `[JUDGMENT AND FACTS]\n\n${NFL_JUDGMENT}\n\n`);
  text = replaceExact(text, 'Your training data is from 2024. It is NOW 2026.', 'Your training data may pre-date the current roster and season. Use the dated evidence for this game.');
  text = replaceExact(text, '- Players from the 2024 draft class are now Sophomores with 100+ games experience', '- A player\'s current role and experience come from dated reporting and the current roster');
  text = replaceExact(text, '- Use ONLY the provided Scout Report for current rosters', '- Use the scout report and dated official roster confirmations in this conversation for current rosters');
  text = replaceExact(text, '- If a player is NOT listed in the scout report roster section, DO NOT mention them',
    '- Distinguish this game\'s confirmed personnel from prior-season and opponent personnel. Historical comparisons may name players documented in the evidence without treating them as active in this matchup');
  text = replaceExact(text, '4. ONLY cite players in the "CURRENT ROSTERS" section of the scout report. Not in roster = DO NOT MENTION.',
    '4. Current personnel claims require the roster and dated availability evidence. Prior-team or prior-opponent players must be labeled as historical/opponent context, never silently treated as current participants.');
  text = replaceExact(text, '5. "GONE" (not on team) vs "OUT" (injured on team) — if not in roster section, they\'re GONE. Silence is correct.',
    '5. Distinguish departed players from injured players still on the team. A missing roster entry alone does not prove a departure.');
  text = replaceExact(text, '6. Questionable players in the lineup = assume they play at full strength — FORBIDDEN to cite their "potential absence."',
    '6. Preserve confirmed versus unresolved availability. Do not invent an absence, participation limit or full-strength confirmation for a questionable player.');
  text = replaceExact(text, '**TODAY\'S DATE: {{CURRENT_DATE}}** — Your training data is from 2024 (18+ months out of date).', '**TODAY\'S DATE: {{CURRENT_DATE}}** — Use current provided evidence rather than remembered rosters.');
  text = replaceExact(text, 'verify with current provided data (record, efficiency profile, roster/injury status). Your 2024 memory labels can be wrong.', 'check the current roster, availability, coaches, established history and recent context in your evidence. Remembered team labels can be wrong.');
  return text;
}

/** Receives NBA's actual rendered Pass 1, not a second hand-maintained copy. */
export function adaptNflPass1(nbaText, homeTeam, awayTeam, spread) {
  const boundary = nbaText.lastIndexOf('</scout_report>') + '</scout_report>'.length;
  if (boundary < '</scout_report>'.length) throw new Error('NBA scout boundary missing');
  const desk = nbaText.slice(0, boundary);
  let text = nbaText.slice(boundary);
  text = replaceSection(text, '**INJURY TIMING:**', '</investigation_rules>', `**AVAILABILITY CONTEXT:**\n${NFL_AVAILABILITY}\n\n`);
  text = replaceSection(text, "Tonight's spread:", 'Use the scout report + research briefing',
    `${nflMarketContext(homeTeam, awayTeam, spread)}\n\nYou are picking which side to take at the posted spread or eligible moneyline. Investigate the game — the teams, the players on the field this week, the stats, the injuries, the schedule, the recent context — and build your understanding of this specific matchup at this specific number.\n\n`);
  text = replaceExact(text, 'Each case should be 2-3 paragraphs explaining why that side is the right bet at this number tonight.',
    'Each case should be 2-3 paragraphs explaining the strongest honest case for that side at the posted number, including its real obstacles. Fair consideration does not require equally strong cases.');
  // Keep NBA's two-sided investigation and completion marker. Honest cases do
  // not require equal strength and do not establish a quota for either side.
  return desk + text;
}

export function buildNflBriefingBlock(briefing, homeTeam, awayTeam, spread, caseReminder = '') {
  const slot = '[NFL_RESEARCH_BRIEFING_SLOT]';
  let text = buildNbaBriefingBlock(slot, homeTeam, awayTeam, Number.isFinite(spread) ? spread : null, caseReminder);
  text = replaceExact(text, 'Your research assistant investigated every factor with full tool access. These are structured, verified findings — use them as your foundation.',
    'Your research assistant investigated both teams with tool access. Use its findings with the original desk and source references; separate facts, attributed assessments and unresolved questions. Repetition is not independent confirmation.');
  text = replaceSection(text, 'The spread is ', 'You MUST still investigate', `${nflMarketContext(homeTeam, awayTeam, spread)}\n\n`);
  text = replaceExact(text, 'You MUST still investigate this matchup yourself. The briefing gives you a head start — now verify its key claims against the scout report and complete your synthesis.',
    'You MUST still investigate this matchup yourself. The briefing gives you a head start — verify its key claims against the scout report and complete your synthesis. Use your available tools for factual gaps. You may ask the researcher with ASK RESEARCHER: followed by a factual question (up to 6 per game).');
  return replaceExact(text, slot, briefing);
}

export function buildNflPass25Message(homeTeam, awayTeam, spread) {
  let text = buildNbaPass25Message(homeTeam, awayTeam, Number.isFinite(spread) ? spread : 0, '');
  text = replaceSection(text, 'Line context:', '\n\nDo NOT restart analysis.', nflMarketContext(homeTeam, awayTeam, spread));
  text = replaceExact(text, 'Final Decision: [your side at this spread]', 'Final Decision: [your side at the posted spread or eligible moneyline, with exact odds]');
  text = replaceExact(text, 'This "Gary\'s Take" draft should be the same rationale carried to final output.',
    'This "Gary\'s Take" draft should be the same rationale carried to final output. Explain why you prefer the selected side over the opposing side, not merely why your chosen team could stay competitive or why its spread is preferable to its own moneyline.');
  text = replaceSection(text, '**PLAYER NAME RULES (HARD RULE - NO EXCEPTIONS):**', '<negative_constraints>',
    `**PLAYER NAME RULES:** Use the current roster and verified availability in this conversation.\n\n**AVAILABILITY CONTEXT:**\n${NFL_AVAILABILITY}\n\n${NFL_JUDGMENT}\n\nJudgment calls informed by data are valid. Do NOT predict your own margin or score.\n\n`);
  text = replaceExact(text, '1. PLAYER NAMES: Only from roster section. Training data is from 2024 — every number from the scout report or other provided data.',
    '1. PLAYER NAMES: Current personnel require verified roster/availability evidence. Label historical and opponent context explicitly. Every factual number comes from the scout report or other provided evidence.');
  text = replaceExact(text, '5. NO EMOJIS. Data analyst reasoning only — no tactical/scheme/film claims.',
    '5. NO EMOJIS. Distinguish your football judgment from reported facts; do not invent tactical/scheme/film observations.');
  return text;
}

export function buildNflPass3Message(homeTeam, awayTeam, options = {}) {
  let text = buildNbaPass3Message(homeTeam, awayTeam, options);
  if (options.homeRecord || options.awayRecord) {
    text = replaceExact(text, 'If you reference any records, use ONLY these from tonight\'s scout report (your training data is from 2024 and WRONG):',
      'If you reference current records, preserve these from this game\'s scout report. Any historical record already in your decision must retain its explicit season/sample:');
  }
  text = replaceExact(text, '**BET TYPE:** You have two options — SPREAD (picking a side to cover) or MONEYLINE (picking a team to win outright). Choose the bet type that matches your conviction about how this game plays out.',
    '**BET TYPE:** Preserve the spread or moneyline decision already made. This turn formats the existing decision; it does not select another bet.');
  text = replaceExact(text, '3. For spread picks: use "spreadOdds" value (e.g., -105, -115)',
    '3. For spread picks: copy the selected team\'s exact pair. A home pick uses "spreadHome" + "spreadHomeOdds"; an away pick uses "spreadAway" + "spreadAwayOdds". Never borrow the opponent\'s price or invent a missing price.');
  text = replaceExact(text, '2. For ML picks: use "moneylineHome" or "moneylineAway" value (e.g., -192, +160)',
    `2. For ML picks: use the selected team's "moneylineHome" or "moneylineAway" value. No moneyline heavier than ${GAME_ML_CAP} is eligible.`);
  text = replaceExact(text, '4. The "final_pick" field MUST include the exact odds: "[Team] ML -192" NOT "[Team] ML -110"',
    '4. The "final_pick" field MUST include the exact selected odds, not a default price.');
  return text;
}
