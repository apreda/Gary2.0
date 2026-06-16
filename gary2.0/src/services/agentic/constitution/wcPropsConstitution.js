/**
 * World Cup (Soccer) Props Constitution — Phase-Aligned Sectioned Object.
 *
 * Built on the unified Props Sharp Framework (sectioned), mirroring the NHL/NBA/MLB
 * props constitutions. Soccer-specific awareness only — Layer 1 (what exists) and
 * Layer 2 (what to investigate). NEVER Layer 3 (factor → pick conclusion).
 */

import { getPropsSharpFramework } from './propsSharpFramework.js';

const FRAMEWORK = getPropsSharpFramework();

// ── Soccer / World Cup awareness (Pass 1 — investigation context) ────
const WC_SPORT_AWARENESS = `
## [WC] WORLD CUP / SOCCER PROPS AWARENESS

### THE SPORT (Props Context)
- Minutes drive every counting prop — a player subbed at 60' has a hard cap on shots, tackles, and goal chances. Confirmed lineups and a manager's substitution patterns matter.
- Role defines the prop, not name recognition — a striker and an attacking winger generate shots; a holding midfielder generates tackles; full-backs sit in between.
- Penalty duty is a large hidden driver of anytime-goal and shots — the designated penalty taker carries extra goal equity.
- Shots-on-target is gated by shot volume AND finishing quality; SoT is a fraction (~35-45%) of total shots for most attackers.
- Set-piece duty (corners, free-kicks) lifts shots and SoT for the taker.
- Goalkeeper saves scale with the OPPONENT's shot volume and attacking quality — a keeper facing a high-xG side sees more work; a keeper whose team dominates the ball sees little.
- Match state matters: a team chasing a goal pushes more shots/corners late; a team protecting a lead sits deep and concedes possession.
- World Cup group-stage motivation varies — a team already through may rotate; a team needing a result presses.

### THE PROP LINE
- Prop lines are set primarily from a player's recent club + international form, role, and the matchup.
- International prop markets are thinner than club markets — lines can be less precise, which is where edges live, but also where stale/laggy lines hide.
- The implied probability from the price is the market's player-level read — treat it as the baseline to BEAT with evidence, not as the pick itself.
- Multiple props on one player are correlated — shots, shots-on-target, and anytime-goal are NOT independent outcomes; do not stack correlated overs as if they were.

### [WC] SOCCER STAT AWARENESS DETAILS

**Shots / Shots on Target Props:**
- Volume comes from role + minutes + set-piece/penalty duty, not reputation.
- Opponent defensive shape (deep block vs high line) changes the volume of shots a team and its attackers generate.
- SoT conversion off total shots is the second gate — a high-volume but wild shooter clears shots lines but misses SoT lines.

**Anytime Goal / First Goal Props:**
- Driven by role (central attacker vs wide), penalty duty, team's implied goals, and the opponent's defensive/keeper quality.
- Finishing % is noisy over short windows — recent goal droughts/heaters are weak signal; xG share and chance volume are sturdier.

**Assists / Goal-or-Assist Props:**
- Creative role (playmaker, set-piece taker) and the quality of the finishers around them.

**Tackles Props:**
- Defensive-mid and full-back roles; a team expected to defend more (underdog, deep block) generates more tackle volume.

**Goalkeeper Saves Props:**
- Opponent shot volume + own team's expected possession share are the primary drivers.
`;

// ── Soccer evaluation (Pass 2.5 — evaluation context) ────────────────
const WC_EVALUATION = `
### [WC] SOCCER PROP EVALUATION

- VOLUME FLOOR: before any over, confirm the player's role and expected minutes support the line (an attacker averaging ~2 shots can't be trusted on a 2.5 shots over without a volume reason — set-piece duty, opponent shape, must-win press).
- IMPLIED PROBABILITY ANCHOR: state the price's implied %, then your evidence-based read. Only pick where your read meaningfully diverges from the price with a concrete reason.
- ROLE BEFORE NAME: a famous player in a deep role is a worse shots bet than an unheralded high-volume winger.
- CORRELATION DISCIPLINE: do not pick a player's shots over AND shots-on-target over AND anytime-goal as if independent — choose the single cleanest edge.
- AVAILABILITY: if the player's start/minutes are unconfirmed (rotation risk, injury, suspension), say so and lower conviction or abstain.
- ABSTAIN over manufacturing: if the grounding (role, form, minutes) is missing, do not invent a number to justify a pick.
`;

// ── Soccer output format (Pass 3 — output context) ───────────────────
const WC_OUTPUT_FORMAT = `
### [OUTPUT] WORLD CUP PROP OUTPUT FORMAT

For each pick, provide:
1. **THE PICK:** Player Name OVER/UNDER Stat Line (Odds)
2. **ROLE & MINUTES:** Position/role + expected minutes (starter vs rotation risk)
3. **THE KEY FACTOR:** The match-specific evidence (role, set-piece/penalty duty, opponent shape, form) supporting it
4. **VOLUME / IMPLIED CHECK:** Player's recent volume vs the line, and your read vs the market's implied %
5. **THE RISK:** The concrete scenario where this loses (early sub, deep-block opponent, blowout rotation)
`;

// ── Sectioned export ─────────────────────────────────────────────────
export const WC_PROPS_CONSTITUTION = {
  pass1: FRAMEWORK.pass1 + '\n\n' + WC_SPORT_AWARENESS.trim(),
  pass2: FRAMEWORK.pass2,
  pass25: FRAMEWORK.pass25 + '\n\n' + WC_EVALUATION.trim(),
  pass3: FRAMEWORK.pass3 + '\n\n' + WC_OUTPUT_FORMAT.trim(),
};

export default WC_PROPS_CONSTITUTION;
