// Prompt-framing regression tests — July 5 2026 audit fixes (F-1, F-2, F-10, F-11, F-12).
//
// Gary must reason per-game, not walk a scripted recipe. These tests pin the
// prompt properties that keep that true:
//   F-1  soccer sides are price-framed (not "who wins?") and the Draw is a full case
//   F-2  the two WC plays must describe ONE read of the match
//   F-10 no enumerated factor checklists / quotable thesis lines in MLB or soccer
//   F-11 the spot/psychology lens is licensed (awareness-only)
//   F-12 confidence measures the read against the price, not the price itself
// Plus source lint for steering lines that never render through an export.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { buildPass1Message, buildPass25Message, buildPass3Props } from '../../../src/services/agentic/orchestrator/passBuilders.js';
import { getMlbSpreadFactors, getMlbSeasonAwareness } from '../../../src/services/agentic/orchestrator/spreadEvaluationFactors.js';
import { SOCCER_CONSTITUTION } from '../../../src/services/agentic/constitution/soccerConstitution.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '../../../src/services/agentic');
const src = (rel) => readFileSync(path.join(srcRoot, rel), 'utf8');

const soccerPass1 = buildPass1Message('SCOUT REPORT BODY', 'Brazil', 'Norway', '2026-07-06', 'WC', -1.5);
const soccerPass25 = buildPass25Message('Brazil', 'Norway', 'WC', -1.5, '');
const mlbPass1 = buildPass1Message('SCOUT REPORT BODY', 'Braves', 'Mets', '2026-07-06', 'MLB', 1.5);
const mlbPass25 = buildPass25Message('Braves', 'Mets', 'MLB', 1.5, '');
const propsPass3 = buildPass3Props('Braves', 'Mets', {});

describe('F-1 evolved (Jul 7 best-bet grammar): the read is priceless, the Draw stays first-class', () => {
  // Founder: the shift away from "who is better/who wins" to best-bet framing
  // was right — but the price now enters ONCE, at the decision stage. Pass 1
  // is the neutral read (December grammar); cases stay backing-framed (never
  // winner-framed) but carry no prices.
  it('soccer Pass 1 carries no price essay — the price enters at the decision stage', () => {
    expect(soccerPass1).not.toContain('THE MONEYLINE IS A PRICE');
    expect(soccerPass1).not.toContain('DESCRIPTIVE vs CAUSAL');
  });

  it('soccer Pass 1 asks for backing cases, including the Draw, without price clauses', () => {
    expect(soccerPass1).toContain('Case for backing Brazil');
    expect(soccerPass1).toContain('Case for backing the Draw');
    expect(soccerPass1).toContain('Case for backing Norway');
    expect(soccerPass1).not.toContain('at its price');
  });

  it('soccer Pass 1 no longer winner-frames the cases', () => {
    expect(soccerPass1).not.toMatch(/Case for \S+ winning/);
  });

  it('soccer constitution case prompt is backing-framed and includes the Draw', () => {
    const casePrompt = SOCCER_CONSTITUTION.bilateralCasePrompt('Brazil', 'Norway');
    expect(casePrompt).toContain('Case for backing Brazil');
    expect(casePrompt).toContain('Case for backing the Draw');
    expect(casePrompt).toContain('Case for backing Norway');
    expect(casePrompt).not.toMatch(/Case for \S+ winning/);
    expect(casePrompt).not.toContain('at the price the odds show');
  });
});

describe('best-bet grammar (Jul 7 eve — R1-R4, founder-approved)', () => {
  it('R2/R3: the price enters exactly once — never in Pass 1', () => {
    expect(mlbPass1).not.toContain('THE MONEYLINE IS A PRICE');
    expect(mlbPass1).not.toContain('MLB BET TYPES');
    expect(soccerPass1).not.toContain('bet_type_menu');
  });

  it('R1: the decision stage is April-silent — no script-commit, no integrity essay, no xStats habit', () => {
    expect(mlbPass25).not.toContain('Commit to a game script');
    expect(mlbPass25).not.toContain('LOSES more vividly');
    expect(mlbPass25).not.toContain('luck-adjusted metrics');
    expect(soccerPass25).not.toContain('Commit to a game script');
  });

  it('the decision ask is the founder\'s best-bet articulation', () => {
    expect(mlbPass25).toContain('who is better or who wins on paper');
    expect(mlbPass25).toContain('BEST BET');
    expect(mlbPass25).toContain('a real sports betting decision');
    expect(soccerPass25).toContain('BEST BET');
  });

  it('the MLB options menu (ML/RL mechanics) lives at the decision stage', () => {
    expect(mlbPass25).toContain('RUN LINE');
    expect(mlbPass25).toContain('a one-run win pays the moneyline and LOSES -1.5');
  });

  it('confidence guidance is trimmed to the F-12 line', () => {
    expect(mlbPass25).toContain('not the shortness of the price');
    expect(mlbPass25).not.toContain('Price and confidence are independent');
  });

  it('R4: the identity carries the December storyteller sentence', () => {
    expect(src('orchestrator/orchestratorMain.js')).toContain('paint the picture of how tonight');
  });
});

describe('F-2: one match, one read', () => {
  it('soccer Pass 2.5 no longer declares the two plays independent', () => {
    expect(soccerPass25).not.toContain('The two plays are independent');
  });

  it('soccer Pass 2.5 requires both rationales to share the same read of the match', () => {
    expect(soccerPass25).toContain('same read of the match');
  });
});

describe('F-10: no scripted recipe (MLB + soccer de-scaffold)', () => {
  it('MLB factor scaffolding has no numbered checklist headings', () => {
    expect(getMlbSpreadFactors()).not.toMatch(/### \d+\./);
    expect(mlbPass1).not.toMatch(/### \d+\. [A-Z]/);
  });

  it('the quotable "shiny ERA is fragile" thesis line is gone from MLB awareness', () => {
    expect(getMlbSeasonAwareness()).not.toContain('shiny ERA is fragile');
    expect(mlbPass1).not.toContain('shiny ERA is fragile');
  });

  it('MLB Pass 1 no longer enumerates the causal-factor menu', () => {
    expect(mlbPass1).not.toContain('lineup handedness, park and weather');
  });

  it('MLB Pass 1 keeps the backing-framed cases (regression guard)', () => {
    expect(mlbPass1).toContain('Case for backing Braves');
    expect(mlbPass1).toContain('Case for backing Mets');
  });

  it('soccer Pass 1 no longer carries the inline factor menu', () => {
    expect(soccerPass1).not.toContain('(form, attack/xG, defense, set pieces');
  });
});

describe('F-11 REVERSED (Jul 7 April-shape port): no spot/psychology paragraphs in Pass 1', () => {
  // The winning NBA configuration (Mar 20-21 overhaul) REMOVED motivation and
  // spot narratives entirely — "motivation used as a factor" was a documented
  // loss pattern. Founder: port what NBA had when it was doing well.
  it('MLB Pass 1 keeps the era-B feel sentence, without the July spot-psychology expansion', () => {
    expect(mlbPass1).toContain('consider the feel of the game');
    expect(mlbPass1).not.toContain('let-down');
  });

  it('soccer Pass 1 carries no feel-of-the-match paragraph', () => {
    expect(soccerPass1).not.toContain('feel of the match');
    expect(soccerPass1).not.toContain('let-down');
  });
});

describe('F-12: conviction is decoupled from the price', () => {
  it('standard Pass 2.5 says confidence measures the read against the price', () => {
    expect(mlbPass25).toContain('not the shortness of the price');
  });

  it('soccer Pass 2.5 says the same for both plays', () => {
    expect(soccerPass25).toContain('not the shortness of the price');
  });
});

describe('J-series: judgment is licensed, numbers stay policed', () => {
  it('J-1: the shared system prompt draws the fact/opinion line', () => {
    const main = src('orchestrator/orchestratorMain.js');
    expect(main).toContain('JUDGMENT vs FABRICATION');
    // The number-discipline rules survive untouched.
    expect(main).toContain('FACT-CHECKING PROTOCOL (ZERO TOLERANCE)');
  });

  it('J-1: soccer stats discipline polices numbers without silencing judgment', () => {
    const c = src('constitution/soccerConstitution.js');
    expect(c).not.toContain('you have no basis to make a pick: do not manufacture one');
    expect(c).toContain('a thin tape does not silence your judgment');
  });

  it('J-2 REVERSED (Jul 7 April-shape port): stakes/spot/story factors removed from MLB + WC research', async () => {
    // The Mar 20-21 overhaul removed motivation and standings/context factors
    // from the winning sport's research walk. Ported: MLB #11/#11B/#12 and
    // soccer #9-#11 are gone; the run-line-reroute research instruction
    // ("evaluate whether the run line offers better structure") died with them.
    const f = src('flashInvestigationPrompts.js');
    const mlbSection = f.slice(f.indexOf('MLB_FACTORS'), f.indexOf('SOCCER_WC_FACTORS'));
    const soccerSection = f.slice(f.indexOf('SOCCER_WC_FACTORS'));
    expect(mlbSection).not.toContain('THE PUBLIC STORY');
    expect(mlbSection).not.toContain('THE SPOT');
    expect(mlbSection).not.toContain('run line offers better structure');
    expect(mlbSection).not.toContain('sharp action');
    expect(soccerSection).not.toContain('STAKES & SIGNIFICANCE');
    expect(soccerSection).not.toContain('THE PUBLIC STORY');
    // The relocated innings-limit fact survives inside RUN LINE & TOTAL CONTEXT.
    expect(mlbSection).toContain('innings limit or pitch count');

    const { INVESTIGATION_FACTORS } = await import(
      '../../../src/services/agentic/orchestrator/investigationFactors.js'
    );
    expect(Object.keys(INVESTIGATION_FACTORS.soccer_world_cup)).not.toContain('STAKES_SPOT_PUBLIC_STORY');
    // Alias stays shared — WC and soccer_world_cup can never drift.
    expect(INVESTIGATION_FACTORS.WC).toBe(INVESTIGATION_FACTORS.soccer_world_cup);
    // Grounding cap: tiered Jul 8 (cost audit lever #4) — canonical pin lives
    // in costLevers.test.js; here we only assert the stakes-era 10-for-WC
    // never comes back via the old flat cap.
    expect(src('orchestrator/flashAdvisor.js')).toContain('isWCSport ? 8 : 4');
  });

  it('identity: era-B four-sentence core + storyteller + THINK LIKE A SHARP (Jul 7 restoration)', () => {
    const main = src('orchestrator/orchestratorMain.js');
    // July philosophy paragraphs (mine) are gone; founder-authored pieces stay.
    expect(main).not.toContain('value bettor, not a market trader');
    expect(main).not.toContain('all of it is CLUES');
    expect(main).not.toContain('mirror, not a source');
    expect(main).not.toContain('quality of the decision, not the bounce of the ball');
    expect(main).toContain('paint the picture of how tonight');
    // December-pedigree sharp stance: the public moves lines by over/under-reacting.
    expect(main).toContain('THINK LIKE A SHARP');
    expect(main).toContain('the public overreacts and underreacts');
  });

  it('sport physics: MLB streaks are real currency (founder-requested license)', () => {
    // The soccer twin ("most upset-friendly format") was deleted Jul 7 — it
    // taught a directional worldview. The MLB streak license stays: the founder
    // explicitly asked for it, and it licenses a CLUE TYPE, not a side.
    expect(src('orchestrator/spreadEvaluationFactors.js')).toContain('Streaks are real currency');
  });

  // (Jul 7 eve: the J-4 script-commit and decision-integrity checkpoints were
  // removed with the best-bet grammar — no winning era carried decision-stage
  // philosophy; see the best-bet describe below.)

  it('rest de-fixation: soccer prompts state the schedule facts, canon-form (no superlatives)', () => {
    expect(src('constitution/soccerConstitution.js')).toContain('published before the line is set');
    expect(src('flashInvestigationPrompts.js')).toContain('rest days with dates and stop');
    // The constitution carries the public-facts discipline as facts, not verdicts.
    expect(src('constitution/soccerConstitution.js')).toContain('priced this match knowing both teams');
    expect(src('constitution/soccerConstitution.js')).not.toContain('the most public fact in sports');
  });

  it('J-4 superseded: the checkpoint is April-silent (commit, no philosophy)', () => {
    const p25 = buildPass25Message('Braves', 'Mets', 'MLB', 1.5, '');
    expect(p25).toContain('This is the final decision checkpoint.');
    expect(p25).not.toContain('Commit to a game script');
  });
});

describe('run-line discipline: bet mechanics only, no routing (Jul 7, trimmed same day)', () => {
  // Jun 29-Jul 6 forensics: when a team's ML priced -200+, Gary rerouted the same
  // take into -1.5 every time ("the ML is heavy, so the value lies in laying 1.5").
  // Founder standard: teach what the ticket PAYS (mechanics) and demand
  // script-coherence — never tell Gary when to take which bet.
  it('the run-line margin mechanics live at the decision stage (Pass 1 is priceless)', () => {
    expect(mlbPass25).toContain('not two prices for the same opinion');
    expect(mlbPass1).not.toContain('Run Line');
  });

  it('MLB Pass 2.5 carries mechanics + script-coherence, with zero routing instructions', () => {
    expect(mlbPass25).toContain('a one-run win pays the moneyline and LOSES -1.5');
    expect(mlbPass25).toContain('take the bet that pays if your read is right');
    // Routing-flavored lines are OUT (founder: never tell Gary what/when to pick).
    expect(mlbPass25).not.toContain('Lay -1.5 only when');
    expect(mlbPass25).not.toContain('the honest bet is that moneyline at its price');
    expect(mlbPass25).not.toContain('never because the moneyline feels expensive');
    // The generic spread note no longer serves MLB.
    expect(mlbPass25).not.toContain('SPREAD (picking a side to cover)');
  });

  it('MLB Pass 2.5 final-decision label offers both bet types', () => {
    expect(mlbPass25).toContain('moneyline or run line');
  });

  it('other sports keep the generic bet-type note (MLB-only change)', () => {
    const nbaPass25 = buildPass25Message('Lakers', 'Suns', 'NBA', -3.5, '');
    expect(nbaPass25).toContain('SPREAD (picking a side to cover)');
  });
});

describe('NBA-shape port to MLB (Jul 7 structural audit: the winning sport carries the least methodology)', () => {
  it('MLB awareness carries the NBA anti-fixation self-check (the Dodgers guard, done as a question)', () => {
    expect(getMlbSeasonAwareness()).toContain('same team several days running');
    expect(mlbPass1).toContain('same team several days running');
  });

  it('the canned run-line-size commentary block is gone', () => {
    expect(mlbPass1).not.toContain('RUN LINE SIZE');
    expect(mlbPass1).not.toContain('At this run line size');
  });

  it('season awareness is the era-B text (Jul 7 restoration) with the three approved emendations', () => {
    const aw = getMlbSeasonAwareness();
    expect(aw).toContain('162-game marathon');
    expect(aw).toContain('MLB game analysis — what to look at');
    expect(aw).toContain('same team several days running');
    expect(aw).toContain('Streaks are real currency');
    expect(aw).not.toContain('shiny ERA is fragile');
    // MLB's own public-narrative traps carry the NBA lens (founder, Jul 7 eve).
    expect(aw).toContain('announced before the line is set');
    expect(aw).toContain('whether the number moved too much, or not enough');
    // Founder: example stories become templates — the bullet stays fact + open
    // question, three directions live, Gary's own call from the matchup.
    expect(aw).not.toContain("an ace's start");
    expect(aw).toContain('or has him exactly right');
    expect(aw).toContain('factor in or not factor in to your final pick decision');
  });

  it('no DESCRIPTIVE vs CAUSAL section anywhere in MLB (superseded by best-bet grammar)', () => {
    expect(mlbPass1).not.toContain('DESCRIPTIVE vs CAUSAL');
    expect(mlbPass25).not.toContain('DESCRIPTIVE vs CAUSAL');
  });
});

describe('cagey de-seeding: the format line describes variance, never a match script (Jul 7)', () => {
  // Jul 6: all four WC bets were close-game bets (Draw, 2×Under, +0.5) and the
  // Belgium 4-1 rationale scripted "caution trumps ambition" gridlock. The seed
  // was ours: "single-elimination, LOW-SCORING football" read as a per-match
  // scoring script, and the coherence rule handed Gary the phrase "cagey
  // defensive battle" verbatim. Subtraction, not counter-rules.
  it('the soccer structure-truth paragraph is gone entirely (it taught HOW to pick)', () => {
    // Founder, Jul 7: "see how we just basically told Gary HOW to pick — low
    // scoring = underdog." Even rewritten, "upset-friendly format / metric edge
    // means less here" is a directional worldview, not a fact Gary lacks —
    // gpt-5.5 respected knockout variance with no such line. Subtraction to
    // zero: structural facts (ET/pens, 90-min settlement) live in the
    // tournament-structure paragraph; judgment clue types live in the identity.
    const c = src('constitution/soccerConstitution.js');
    expect(c).not.toContain('Structure truth');
    expect(c).not.toContain('upset-friendly');
    expect(c).not.toContain('low-scoring football');
    expect(c).not.toContain('metric edge means less');
    // The factual tournament mechanics survive.
    expect(c).toContain('extra time and penalties');
    expect(c).toContain('settles on the 90-minute result');
  });

  it('the coherence rule no longer hands Gary a ready-made match script', () => {
    expect(soccerPass25).not.toContain('cagey defensive battle');
    expect(soccerPass25).not.toContain('wide-open goal-fest');
    expect(soccerPass25).toContain('same read of the match');
  });
});

describe('HOW-to-pick sweep (Jul 7 — founder: "the prompts kept telling Gary how to pick")', () => {
  it('WC identity describes the markets without routing favorites to an instrument', () => {
    const main = src('orchestrator/orchestratorMain.js');
    expect(main).not.toContain('price favorites through the Asian handicap');
    expect(main).toContain('the 3-way market (home/draw/away), the Asian handicap, and totals');
  });

  it('the synthesis no longer scripts the "overpaying for a fragile number" phrase', () => {
    // F-6 template factory: the exact phrase we counted in 57-65/99 rationales
    // was INSTRUCTED, in quotes, at the decision stage. The whole xStats
    // paragraph left with the best-bet grammar; the price-not-verdict
    // discipline survives in MLB AWARENESS.
    expect(mlbPass25).not.toContain('overpaying for a fragile number');
    expect(mlbPass25).not.toContain('frame it exactly that way');
    expect(mlbPass25).not.toContain('context for value');
    expect(getMlbSeasonAwareness()).toContain('not a forecast');
  });

  it('Pass 1 asks whether the story holds up, not where to disagree', () => {
    expect(mlbPass1).not.toContain('decide where you disagree with the story');
    expect(soccerPass1).not.toContain('deciding where you disagree with the story');
  });

  it('MLB factors carry no market-sentiment worldview and no factor-weight superlative', () => {
    const f = getMlbSpreadFactors();
    expect(f).not.toContain('Public action follows brands');
    expect(f).not.toContain('biggest single input');
  });

  it('confidence guidance is symmetric — no directional emphasis', () => {
    expect(mlbPass25).not.toContain('when your strongest read is a dog, say so with full conviction');
    expect(soccerPass25).not.toContain('A plus-money underdog or the Draw can deserve');
  });

  it('the "data analyst reasoning only" contradiction of the judgment layer is gone', () => {
    expect(mlbPass25).not.toContain('Data analyst reasoning only');
    expect(mlbPass25).toContain('No tactical/scheme/film claims the provided data can\'t support');
  });

  it('the decision_freedom essay left MLB with the best-bet grammar (NCAAB keeps it)', () => {
    expect(mlbPass25).not.toContain('The goal is to win,');
    expect(mlbPass25).not.toContain('superstition');
    expect(mlbPass25).toContain('put your own money on');
    const ncaabP25 = buildPass25Message('Duke', 'UNC', 'NCAAB', -3.5, '');
    expect(ncaabP25).toContain('superstition');
  });

  it('identity: no worldview-class sport examples, symmetric take language', () => {
    const main = src('orchestrator/orchestratorMain.js');
    // The last member of the "structure truth" class is gone.
    expect(main).not.toContain('one goal can decide a knockout football match');
    expect(main).not.toContain('seven-game series protects');
    expect(main).not.toContain('earns its keep');
  });

  it('props stages agree: 2 per game is the standard, no_play is structural-only (founder call Jul 7)', () => {
    // Founder resolved the Pass 2.5 vs Pass 3 contradiction toward the
    // REQUIREMENT ("we still need 2 per game, that shouldn't be difficult") —
    // props volume is product; passing is for empty boards, never a judgment
    // escape hatch.
    expect(src('constitution/propsSharpFramework.js')).toContain('REQUIREMENT: 2 Props Per Game');
    expect(propsPass3).toContain('Select 2 props from DIFFERENT players');
    expect(propsPass3).not.toContain('passing is the sharp play');
    expect(propsPass3).toContain('a structural fallback, not a nightly option');
  });

  it('props constitutions state market thinness without promising edges (MLB/WC)', () => {
    // "Imprecise line = where edges live" is the CLAUDE.md "gap = edge" class;
    // "platoon splits lag in prop lines" seeded the props platoon monoculture.
    expect(src('constitution/wcPropsConstitution.js')).not.toContain('which is where edges live');
    expect(src('constitution/mlbPropsConstitution.js')).not.toContain('lag in prop line adjustments');
  });

  it('MLB awareness renders once — constitution pass1Context is injury labels only', () => {
    const c = src('constitution/mlbConstitution.js');
    expect(c).not.toContain('reaching for the same team across multiple games');
    expect(c).not.toContain('one of the first things to investigate');
    // The LOCKED injury tier system survives untouched.
    expect(c).toContain('MLB INJURY LABELS');
    expect(c).toContain('SP SCRATCH');
  });
});

describe('WC injury timing: absences are line questions, not factors (Jul 7, NBA port — founder-approved)', () => {
  it('soccer Pass 1 carries the FRESH/PRICED IN interpretation block', () => {
    expect(soccerPass1).toContain('INJURY & AVAILABILITY TIMING');
    expect(soccerPass1).toContain('PRICED IN');
    expect(soccerPass1).toContain('An absence is never the factor by itself');
  });

  it('the WC scout report computes availability timing from real lineups', () => {
    const s = src('scoutReport/sports/soccer.js');
    expect(s).toContain('AVAILABILITY TIMING');
    expect(s).toContain('getAvailabilityTiming');
  });
});

describe('WC competition-context: numbers carry the opposition they were earned against (Jul 7)', () => {
  // The NBA-class fix ("playoff stats are a separate sample") ported to the
  // WC: pool play, knockouts, and pre-tournament football are different
  // regimes with wildly different opponent tiers — Argentina's 2.03 xG/match
  // was compiled against Algeria/Jordan/Cape Verde and got used as direct
  // evidence for -1.5 against a knockout side.
  it('soccer awareness separates competition regimes and demands opposition context', () => {
    const c = src('constitution/soccerConstitution.js');
    expect(c).toContain('carries the opposition it was earned against');
    expect(c).toContain('not a trend line to extend');
    // The edge-hunting phrasing fixed in the builders this morning is gone
    // from the constitution copy too.
    expect(c).not.toContain('deciding where you disagree with the story');
  });

  it('Flash soccer factors report per-match averages with the opponents behind them', () => {
    expect(src('flashInvestigationPrompts.js')).toContain('name the opponents the sample was compiled against');
  });
});

describe('steering-line source lint (never rendered through an export)', () => {
  it('WC props context no longer steers toward shots/anytime-goal markets', () => {
    expect(src('wcPropsAgenticContext.js')).not.toContain('Favor attackers');
  });

  it('props Pass 3 no longer carries the directional over/under history instruction', () => {
    expect(propsPass3).not.toContain('Historically, graded over-picks');
    // The symmetric both-sides instruction stays.
    expect(propsPass3).toContain('THE UNDER IS A FIRST-CLASS PICK');
    expect(propsPass3).toContain('PRICE ANCHOR');
  });

  it('Gary identity bans invented autobiography', () => {
    expect(src('orchestrator/orchestratorMain.js')).toContain('no hometown team');
  });

  it('MLB scout report carries 3-day bullpen usage on the desk (Jul 7 — founder ask)', () => {
    const mlbBuilder = src('scoutReport/sports/mlb.js');
    expect(mlbBuilder).toContain('BULLPEN USAGE — LAST 3 GAMES');
    expect(mlbBuilder).toContain('numberOfPitches');
  });

  it('MLB scout report presents xStats gaps without verdict labels', () => {
    const mlbBuilder = src('scoutReport/sports/mlb.js');
    // The report shows ERA-vs-xERA / wOBA-vs-xwOBA numbers and the signed gap;
    // it never stamps the interpretation (Layer 3 in the data layer).
    expect(mlbBuilder).not.toContain("'underperforming' : 'overperforming'");
    expect(mlbBuilder).not.toContain("'unlucky' : 'lucky'");
  });
});
