/**
 * Edge-outcome ledger — ANALYST TOOLING, NOT A GARY SURFACE (Aug 26 2026,
 * founder GO after the 6-8 autopsy: "do pen-edge picks actually cash?").
 *
 * Tags each stored rationale with the edge families its own language cites,
 * so pick outcomes can be tallied per cited edge. Deterministic keyword
 * tagging — transparent, testable, cheap — and honestly crude: this is a
 * CITED-LANGUAGE tally, not a truth machine. A rationale usually cites
 * several families; all are tagged, and the families appearing in the final
 * paragraph (where the ticket is argued) are additionally marked decisive.
 *
 * NOTHING here feeds prompts, scout reports, or any surface Gary reads.
 */

export const EDGE_FAMILIES = [
  {
    key: 'pen_recency',
    label: 'Bullpen recent form',
    patterns: [
      /bullpens?[^.]{0,120}?last (?:seven|three|five|ten|7|3|5|10|few) (?:games|days)/i,
      /(?:bullpen|relievers?)[^.]{0,80}?(?:allowed|surrendered|gave up)[^.]{0,60}?(?:in|across|over)[^.]{0,40}?(?:innings|games)/i,
    ],
    // The pen word and the recency window often sit in NEIGHBORING sentences
    // ("...the bullpens... Over the last seven games, the comparison is...").
    // A paragraph containing BOTH is a pen-recency citation.
    paragraphAll: [
      /\b(?:bullpens?|pens?|relievers?|relief)\b/i,
      /(?:over|across) (?:its|their|the) last (?:seven|three|five|ten|7|3|5|10) games/i,
    ],
  },
  {
    key: 'pen_season',
    label: 'Bullpen season quality',
    patterns: [
      /(?:current )?bullpen (?:arms |carr(?:y|ies)|owns?|has|with)[^.]{0,60}?(?:ERA|WHIP)/i,
    ],
    paragraphAll: [
      /\b(?:bullpens?|pens?|relievers?|relief)\b/i,
      /\d\.\d+ ERA and \d\.\d+ WHIP/i,
    ],
  },
  {
    key: 'starter_recent_form',
    label: 'Starter recent form',
    patterns: [
      /(?:across|over|in) (?:his|her|their) last (?:three|two|four|3|2|4) starts/i,
      /enters? with a [\d.]+ ERA[^.]{0,80}?(?:last|across)/i,
      /ERA (?:over|across) (?:his|their) last/i,
    ],
  },
  {
    key: 'starter_profile',
    label: 'Starter season profile / splits',
    patterns: [
      /(?:home|road) ERA/i,
      /\d\.\d+ ERA and \d\.\d+ WHIP/i,
      /first-inning ERA/i,
      /(?:knuckle curve|whiff rate|xwOBA)[^.]{0,60}?(?:pitch|rate)/i,
    ],
  },
  {
    key: 'platoon_handedness',
    label: 'Platoon / handedness',
    patterns: [
      /(?:right|left)-handed (?:hitters|batters|opponents|pitching)/i,
      /(?:righties|lefties) (?:have|a)[^.]{0,60}?(?:average|OPS)/i,
      /starts? (?:five|six|seven|four|\d) (?:right|left)ies/i,
      /switch-hitter/i,
    ],
  },
  {
    key: 'offense_recency',
    label: 'Offense recent scoring',
    patterns: [
      /(?:scored|averag(?:ed|ing)|averages?) [\d.]+ runs (?:per game |a game )?over (?:its|their|the) last/i,
      /runs per game over (?:its|their) last/i,
    ],
  },
  {
    key: 'contact_quality',
    label: 'Contact quality (Statcast)',
    patterns: [/xwOBA/i, /hard-hit/i, /barrel rate/i],
  },
  {
    key: 'defense_cleanliness',
    label: 'Defense / errors',
    patterns: [
      /(?:committed|made) (?:no|one|two|three|four|five|six|seven|eight|\d+) errors?/i,
      /fielding percentage/i,
      /unearned runs?/i,
    ],
  },
  {
    key: 'streaks_momentum',
    label: 'Streaks / momentum',
    patterns: [
      /(?:won|lost) (?:two|three|four|five|six|seven|eight|\d+) (?:straight|in a row)/i,
      /winning streak|losing streak/i,
      /is \d+-\d+ (?:over|in) (?:its|their) last/i,
    ],
  },
  {
    key: 'one_run_structure',
    label: 'One-run / close-game record',
    patterns: [/one-run games/i, /extra innings? to produce/i],
  },
  {
    key: 'h2h_history',
    label: 'Head-to-head history',
    patterns: [
      /(?:in|last) (?:July|June|May|August|September|April)[^.]{0,80}?(?:against|vs|scoreless)/i,
      /went \d+-for-\d+ against/i,
      /(?:no|has no) (?:major-league )?history against/i,
    ],
  },
  {
    key: 'park_environment',
    label: 'Park / environment',
    patterns: [/park (?:carries|factor)/i, /wind blowing/i, /hitter-friendly park/i],
  },
  {
    key: 'debut_uncertainty',
    label: 'Debut / no-MLB-history starter',
    patterns: [/(?:MLB|major-league) debut/i, /Triple-A/i, /first major-league start/i],
  },
];

/** Split a rationale into paragraphs (blank-line separated). */
function paragraphsOf(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function familiesIn(text) {
  const found = [];
  const paragraphs = paragraphsOf(text);
  for (const family of EDGE_FAMILIES) {
    const flat = family.patterns.some((re) => re.test(text));
    const scoped = family.paragraphAll
      ? paragraphs.some((paragraph) => family.paragraphAll.every((re) => re.test(paragraph)))
      : false;
    if (flat || scoped) found.push(family.key);
  }
  return found;
}

/**
 * Tag one rationale.
 * @param {string} text
 * @returns {{ families: string[], decisive: string[] }} families = every edge
 *   family the language cites; decisive = the subset also present in the
 *   FINAL paragraph, where the ticket is argued.
 */
export function tagRationale(text) {
  const whole = String(text || '');
  if (!whole.trim()) return { families: [], decisive: [] };
  const families = familiesIn(whole);
  const paragraphs = paragraphsOf(whole);
  const last = paragraphs.length ? paragraphs[paragraphs.length - 1] : '';
  const decisiveSet = new Set(familiesIn(last));
  return { families, decisive: families.filter((k) => decisiveSet.has(k)) };
}

/**
 * Tally outcomes per family over tagged picks.
 * @param {Array<{ families: string[], decisive: string[], result: 'won'|'lost'|string }>} rows
 * @returns {Map<string, { cited: number, wins: number, losses: number, decisiveWins: number, decisiveLosses: number }>}
 */
export function tallyByFamily(rows) {
  const tally = new Map();
  for (const family of EDGE_FAMILIES) {
    tally.set(family.key, { cited: 0, wins: 0, losses: 0, decisiveWins: 0, decisiveLosses: 0 });
  }
  for (const row of rows || []) {
    const won = row.result === 'won';
    const lost = row.result === 'lost';
    if (!won && !lost) continue; // pushes/ungraded stay out of every record
    for (const key of row.families || []) {
      const t = tally.get(key);
      if (!t) continue;
      t.cited += 1;
      if (won) t.wins += 1; else t.losses += 1;
      if ((row.decisive || []).includes(key)) {
        if (won) t.decisiveWins += 1; else t.decisiveLosses += 1;
      }
    }
  }
  return tally;
}
