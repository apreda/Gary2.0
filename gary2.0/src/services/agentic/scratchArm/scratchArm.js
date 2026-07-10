/**
 * SCRATCH ARM "gary-vnext" — pure building blocks (Jul 10 2026, founder-approved).
 *
 * The thesis being tested: a strong model (GPT-5.6 Sol) + full data + hard
 * rails + almost NO instruction beats the steered incumbent stack. Everything
 * here was born from the founder's July 9-10 rebuild conversation:
 *   - identity is 3 sentences, the ask is one question;
 *   - injuries arrive as raw facts with dates (no FRESH/PRICED-IN semantics —
 *     the arm derives staleness or doesn't; production's locked system is untouched);
 *   - the board is COMPLETE: full 3-way MLs (no -200 strip), run lines, totals
 *     ("it should naturally know that -600 isn't a best bet" — we measure that);
 *   - anti-fabrication and the output contract are the only rails.
 * Old failure modes (favorite-confirmation, anchoring, blind spots) are
 * telemetry to watch, never instructions to recite.
 */

export const SCRATCH_MODEL_DEFAULT = 'gpt-5.6-sol';

/** The founder-approved system prompt, verbatim. Do not decorate. */
export function buildScratchSystemPrompt(dateStr) {
  return [
    `You are Gary, a professional sports bettor. Today is ${dateStr}.`,
    `You have a bankroll, and one job: make the bet on tonight's board that wins money.`,
    `You will get a scout report and the full sportsbook board for one game, and you have live stat tools if you want more.`,
    `Never cite a number that isn't in the report or a tool result; any news you use must carry a date.`,
    `When you've decided, return JSON: {"final_pick": "...", "rationale": "Gary's Take\\n\\n<announcer-style intro, the pick, and your real reasons>", "confidence_score": 0.0-1.0}.`,
  ].join(' ');
}

export function buildScratchUserMessage({ awayTeam, homeTeam, scout, board }) {
  return [
    `## SCOUT REPORT — ${awayTeam} @ ${homeTeam}`,
    scout,
    '',
    '## TONIGHT\'S BOARD',
    board,
    '',
    `${awayTeam} @ ${homeTeam}. What's your best bet on this board?`,
  ].join('\n');
}

/**
 * Strip interpretive labels from a scout report so only raw facts reach the
 * arm: injury names/positions/dates stay, FRESH / PRICED IN tags and their
 * legend lines go, and the WC -200-strip explanation (an old rule's voice)
 * goes with them. Line-based: a line that ONLY explains semantics is dropped;
 * a line carrying facts is kept with the tag excised.
 */
export function stripInterpretiveLabels(scoutText) {
  if (typeof scoutText !== 'string' || !scoutText) return scoutText || '';
  const legendLine = /^(\s*)(FRESH|PRICED IN)\s*=/;
  const stripLegendBodies = (line) =>
    line
      // Inline tags: "— FRESH (0-3 days)" / "— PRICED IN (>3 days)" / bare tags
      .replace(/\s*[—-]\s*(FRESH|PRICED IN)\s*(\([^)]*\))?/g, '')
      .replace(/\b(FRESH|PRICED IN)\b\s*(\([^)]*\))?/g, '')
      .replace(/\(\s*\)/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+$/, '');

  const out = [];
  for (const rawLine of scoutText.split('\n')) {
    // Legend lines exist only to teach semantics — drop whole line.
    if (legendLine.test(rawLine)) continue;
    if (/market may still be settling|line has eaten it|book set tonight'?s line knowing/i.test(rawLine)) continue;
    // The WC heavy-favorite strip note — the old rule explaining itself.
    if (/priced heavier than -200|not offered — priced|structural constraint on the available prices/i.test(rawLine)) continue;
    out.push(stripLegendBodies(rawLine));
  }
  return out.join('\n');
}

const fmtOdds = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '—');
  return n > 0 ? `+${n}` : `${n}`;
};

/**
 * Render the COMPLETE market board — every price, no strips, no steering.
 * WC: full 3-way ML (heavy favorites included), Asian handicap, total.
 * MLB: per-book moneyline / run line / total rows.
 */
export function renderFullBoard(game = {}, sportKey, { homeTeam, awayTeam, sportsbookOdds = [] } = {}) {
  const lines = [];
  const isSoccer = sportKey === 'soccer_world_cup' || sportKey === 'WC';

  if (isSoccer) {
    const ml = game.soccer_three_way_ml || {};
    if (ml.home != null || ml.draw != null || ml.away != null) {
      lines.push(`3-way moneyline: ${homeTeam} ${fmtOdds(ml.home)} / Draw ${fmtOdds(ml.draw)} / ${awayTeam} ${fmtOdds(ml.away)}`);
    }
    const sp = game.soccer_spread;
    if (sp && sp.homeValue != null) {
      lines.push(`Asian handicap: ${homeTeam} ${fmtOdds(sp.homeValue)} @ ${fmtOdds(sp.homeOdds)} / ${awayTeam} ${fmtOdds(sp.awayValue)} @ ${fmtOdds(sp.awayOdds)}`);
    }
    const tot = game.soccer_total;
    if (tot && tot.line != null) {
      lines.push(`Total goals ${tot.line}: Over ${fmtOdds(tot.over)} / Under ${fmtOdds(tot.under)}`);
    }
    return lines.join('\n') || 'No odds posted yet.';
  }

  // MLB (and any US sport with per-book rows)
  for (const b of sportsbookOdds) {
    const bits = [];
    if (b.ml_away != null || b.ml_home != null) bits.push(`ML: ${awayTeam} ${fmtOdds(b.ml_away)} / ${homeTeam} ${fmtOdds(b.ml_home)}`);
    if (b.spread_away != null || b.spread_home != null) {
      bits.push(`Run line: ${awayTeam} ${fmtOdds(b.spread_away)} / ${homeTeam} ${fmtOdds(b.spread_home)}${b.spread_odds ? ` @ ${fmtOdds(b.spread_odds)}` : ''}`);
    }
    if (b.total != null && b.total !== '') {
      bits.push(`Total ${b.total}: O ${fmtOdds(b.total_over_odds)} / U ${fmtOdds(b.total_under_odds)}`);
    }
    if (bits.length) lines.push(`${b.book}: ${bits.join(' | ')}`);
  }
  return lines.join('\n') || 'No sportsbook rows available.';
}

/** Tolerant finalize-JSON extraction: fenced block first, then bare object. */
export function parseScratchFinal(text) {
  if (typeof text !== 'string' || !text) return null;
  const candidates = [];
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1]);
  const bare = text.match(/\{[\s\S]*\}/);
  if (bare) candidates.push(bare[0]);
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      if (obj && typeof obj.final_pick === 'string' && obj.final_pick.trim()) {
        return {
          final_pick: obj.final_pick.trim(),
          rationale: typeof obj.rationale === 'string' ? obj.rationale : '',
          confidence_score: Number.isFinite(Number(obj.confidence_score)) ? Number(obj.confidence_score) : null,
        };
      }
    } catch { /* try next candidate */ }
  }
  return null;
}
