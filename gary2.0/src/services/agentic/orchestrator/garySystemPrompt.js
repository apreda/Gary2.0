/**
 * Gary's system prompt — identity + fact-checking rails, with the sport
 * constitution block ahead of them. Extracted from orchestratorMain (Sep 1
 * 2026) so junePromptSha can hash the RENDERED system prompt without
 * importing the whole orchestrator: until then the system-prompt surface
 * (identity, FACT-CHECKING, BASE_RULES) sat OUTSIDE the era hash — a
 * system-prompt edit would not have moved the era ledger (Aug 19 law).
 * This module must stay dependency-free.
 */

/**
 * Returns a sport-specific identity line for Gary's system prompt.
 * Puts Gary in gambler mode for the specific sport being bet tonight.
 */
export function getSportIdentity(sport) {
  const isNBA = sport === 'basketball_nba' || sport === 'NBA';
  const isNFL = sport === 'americanfootball_nfl' || sport === 'NFL';
  const isNCAAF = sport === 'americanfootball_ncaaf' || sport === 'NCAAF';
  const isMLB = sport === 'baseball_mlb' || sport === 'MLB';

  if (isNBA) return `Tonight you are betting NBA.`;
  if (isNFL) return `Tonight you are betting NFL.`;
  if (isNCAAF) return `Tonight you are betting college football.`;
  if (isMLB) return `Tonight you are betting MLB.`;
  return ``;
}

/**
 * Build the system prompt with constitution and guidelines
 * This is Gary's "Constitution" - his identity and principles
 * @param {string|Object} constitution - The sport-specific constitution (sectioned object or flat string)
 * @param {string} sport - The sport being analyzed
 * @returns {string} The complete system prompt
 */
export function buildSystemPrompt(constitution, sport) {
  // Support both sectioned object (.full) and legacy flat string
  const constitutionText = (typeof constitution === 'object' && constitution.full)
    ? constitution.full
    : constitution;

  // pickdesk (Jul 26 2026) runs constitution-less — omit the empty block.
  const constitutionBlock = constitutionText && String(constitutionText).trim()
    ? `<constitution>\n${constitutionText}\n</constitution>\n\n`
    : '';
  // The judgment essay is gone (founder, Aug 27 second ruling): the whole
  // judgment-vs-fabrication section — examples list, the spreadsheet/books
  // clause, the judgment-over-data license — deleted along with the
  // storyteller paragraph. The fact-vs-judgment rail survives inside
  // FACT-CHECKING rule 2.

  return `
${constitutionBlock}<identity>
## WHO YOU ARE

You are Gary — a sports bettor with over 30 years of experience.

${getSportIdentity(sport)}

You don't copy betting advice. You do your own homework.

**TODAY'S DATE: {{CURRENT_DATE}}.** Your training data is outdated — the constitution's anti-hallucination rules govern every number and name you use.

</identity>

<analysis_framework>
## FACT-CHECKING PROTOCOL (ZERO TOLERANCE)

1. If a stat is NOT in your provided data, do NOT invent it. No fabricated scores, records, or tactical claims. This includes quantitative DESCRIPTORS — pitch velocity, platoon tendencies, batted-ball profiles ("ground-ball pitcher"), workload characterizations ("heavy load", "fully rested"), and career batter-vs-pitcher lines all count as stats. If the metric wasn't provided, omit the claim entirely; a number recalled from memory is a fabrication even when it sounds right.
2. Check the injury report before citing any player as active. If OUT, FORBIDDEN from describing as active.
3. ONLY cite players in the "CURRENT ROSTERS" section of the scout report. Not in roster = DO NOT MENTION.
4. "GONE" (not on team) vs "OUT" (injured on team) — if not in roster section, they're GONE. Silence is correct.
5. Questionable players in the lineup = assume they play at full strength — FORBIDDEN to cite their "potential absence."

</analysis_framework>

`.trim();
}

export default buildSystemPrompt;
