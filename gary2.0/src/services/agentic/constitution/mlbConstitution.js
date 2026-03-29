/**
 * MLB/WBC Constitution - World Baseball Classic Context for Gary
 *
 * WBC-specific domain knowledge and guardrails.
 * Phase-aligned delivery:
 * - domainKnowledge: always-on awareness (WBC-specific context)
 * - pass1Context: investigation-stage awareness
 * - guardrails: structural hard rules
 */

export const MLB_CONSTITUTION = {

  domainKnowledge: `
### WBC DOMAIN KNOWLEDGE

The World Baseball Classic is a 20-team international baseball tournament held every four years. National teams are assembled from MLB rosters, international leagues (NPB, KBO, CPBL, etc.), and domestic leagues. Players who normally play on different MLB teams come together for 2-3 weeks.

**What makes WBC unique:**
- Rosters are assembled for 2 weeks — team chemistry and familiarity with each other is limited compared to MLB clubs that play 162 games together
- Pool play is round-robin (top 2 advance). Quarterfinals onward are single elimination — completely different stakes and approach.
- Player quality varies — some countries stack MLB All-Stars at every position, others rely on a few MLB players supplemented by international league talent
- Limited tournament sample size means career stats and recent regular-season form are the primary quality indicators, not 3-game WBC averages

**WBC-Specific Rules (these are public and the run line attempts to factor them in):**
- Pitch count limits by round: Pool play 65 pitches, quarterfinals 80 pitches, semifinals/championship 95 pitches. If the limit is reached mid-at-bat, the pitcher can finish that at-bat.
- Pitcher rest requirements: 50+ pitches thrown = 4 days rest before next appearance. 30+ pitches = 1 day rest. Pitched on consecutive days = 1 day rest.
- Mercy rule: Pool play and quarterfinals — game ends if a team leads by 15+ runs after 5 innings or 10+ runs after 7 innings.
- Extra innings: Ghost runner on 2nd base starting in the 10th inning.

**Betting in the WBC:**
- Moneyline (ML) picks the winner outright. The run line is +/- 1.5 runs (equivalent of a spread). A -1.5 favorite must win by 2+ runs. An underdog at +1.5 covers if they win or lose by exactly 1 run.
- Heavy ML favorites return less value per dollar risked — a -200 favorite needs to win 67% of the time just to break even. When the favorite's ML price is steep, consider the run line on both sides.
- Weather, venue (Tokyo Dome indoor vs Miami outdoor), and park factors affect scoring
- National pride and media narratives drive heavy public action — some lines are inflated by reputation rather than actual roster matchup quality
`,

  pass1Context: `
### WBC AWARENESS

- In the WBC, platoons are commonly used to make up for talent disparities on paper
- Starting pitching moves WBC lines more than other factors due to the limited data available on these national team rosters playing together
- Many WBC players do not have MLB careers — they play in NPB, KBO, CPBL, or domestic leagues. Use grounding tools to research their background and stats
- Breaking news — lineup confirmations, scratches, and bullpen availability often aren't known until hours before first pitch
`,

  pass25DecisionGuards: ``,

  guardrails: `
- Do not assume all WBC players have MLB careers — many play in NPB, KBO, CPBL, or other international leagues
`,

  bilateralCasePrompt: (homeTeam, awayTeam) =>
    `Before outputting INVESTIGATION COMPLETE, include both sections in your Pass 1 synthesis:
Case for ${homeTeam} winning
Case for ${awayTeam} winning
(Each case should be 3 paragraphs explaining why that team wins tonight.)`
};

export default MLB_CONSTITUTION;
