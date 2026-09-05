// These are evidence questions, never instructions about which side to pick.
export const DECISION_EVIDENCE_QUESTIONS = 'Which supplied facts carry this decision? What remains an assumption? What unresolved fact could change it?';

export const RESEARCH_EVIDENCE_RULES = `EVIDENCE HANDLING:
- Keep reported facts separate from your interpretation. For each decisive figure, name the desk section or tool token; for a reported event, retain the source URL and publication date when supplied. Never invent a missing source or date.
- Retain the season, date span and sample size with a number. A current-season label alone does not establish freshness; check it against the dated games. Keep prior-season context labeled with its actual season and team.
- Check conflicting figures against their definitions, dates and samples. If the conflict remains unresolved, record both versions and their sources rather than silently choosing one.
- The same report repeated in several sections is one report. Identify a repeated source rather than counting repetition as independent support.\n`;

const value = input => typeof input === 'string' ? input.trim() : Array.isArray(input) ? input.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('; ') : '';

// Prior research gets 740 content characters per factor, the same total as
// the former 260/260/220 carry-forward fields. Full findings remain intact
// for the final briefing; source/context/uncertainty labels survive compaction.
export const COMPACT_RESEARCH_LIMITS = Object.freeze({ finding:220,numbers:220,context:140,sources:100,uncertainty:60 });
const excerpt=(text,limit)=>text.length>limit ? `${text.slice(0,limit-1)}…` : text;

/** Research text is attributed, not automatically certified by its author. */
export function renderEvidenceBriefing(factors,{compact=false}={}) {
  const seen = new Map();
  return factors.map((factor, index) => {
    const name = value(factor.factor || factor.factorName || factor.name || factor.title) || `Factor ${index + 1}`;
    const raw={finding:value(factor.keyFinding || factor.key_finding || factor.finding),numbers:value(factor.numbers || factor.stats),
      context:value(factor.context || factor.sampleContext || factor.sample_context),sources:value(factor.sources),uncertainty:value(factor.uncertainties || factor.conflicts)};
    const {finding,numbers,context,sources,uncertainty}=compact
      ? Object.fromEntries(Object.entries(raw).map(([key,text])=>[key,excerpt(text,COMPACT_RESEARCH_LIMITS[key])])) : raw;
    // Compare complete findings, not clipped excerpts: different facts may
    // share an opening sentence and must not become false duplicates.
    const signature = JSON.stringify(raw);
    const earlier = seen.get(signature);
    if (earlier) return `**${name}**\nRepeats the same research as ${earlier}; see that entry. This is not an independent source.`;
    seen.set(signature, name);
    return [
      `**${name}**`,
      `Researcher's interpretation: ${finding || 'Not supplied'}`,
      `Reported figures (check against cited evidence): ${numbers || 'No figures supplied'}`,
      `Sample / date / context: ${context || 'Not supplied'}`,
      `Source references supplied by researcher: ${sources || 'Not supplied; attribution unverified'}`,
      `Unresolved facts or conflicting reports: ${uncertainty || 'Not reported; this does not establish that none exist'}`,
    ].join('\n');
  }).join('\n\n').trim();
}
