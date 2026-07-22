// Prompt-framing regression tests — July 5 2026 audit fixes (F-1, F-2, F-10, F-11, F-12).
//
// Gary must reason per-game, not walk a scripted recipe. These tests pin the
// prompt properties that keep that true:
//   F-10 no enumerated factor checklists / quotable thesis lines in MLB
//   F-11 the spot/psychology lens is licensed (awareness-only)
//   F-12 confidence measures the read against the price, not the price itself
// Plus source lint for steering lines that never render through an export.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { buildPass1Message, buildPass25Message, buildPass3Props } from '../../../src/services/agentic/orchestrator/passBuilders.js';
import { getMlbSpreadFactors, getMlbSeasonAwareness } from '../../../src/services/agentic/orchestrator/spreadEvaluationFactors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '../../../src/services/agentic');
const src = (rel) => readFileSync(path.join(srcRoot, rel), 'utf8');

const mlbPass1 = buildPass1Message('SCOUT REPORT BODY', 'Braves', 'Mets', '2026-07-06', 'MLB', 1.5);
const mlbPass25 = buildPass25Message('Braves', 'Mets', 'MLB', 1.5, '');
const propsPass3 = buildPass3Props('Braves', 'Mets', {});

describe('best-bet grammar (Jul 7 eve — R1-R4, founder-approved)', () => {
  it('R2/R3: the price enters exactly once — never in Pass 1', () => {
    expect(mlbPass1).not.toContain('THE MONEYLINE IS A PRICE');
    expect(mlbPass1).not.toContain('MLB BET TYPES');
  });

  it('R1: the decision stage is April-silent — no script-commit, no integrity essay, no xStats habit', () => {
    expect(mlbPass25).not.toContain('Commit to a game script');
    expect(mlbPass25).not.toContain('LOSES more vividly');
    expect(mlbPass25).not.toContain('luck-adjusted metrics');
  });

  it('the decision ask is the founder\'s best-bet articulation', () => {
    expect(mlbPass25).toContain('who is better or who wins on paper');
    expect(mlbPass25).toContain('BEST BET');
    expect(mlbPass25).toContain('a real sports betting decision');
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

describe('F-10: no scripted recipe (MLB de-scaffold)', () => {
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
});

describe('F-11 REVERSED (Jul 7 April-shape port): no spot/psychology paragraphs in Pass 1', () => {
  // The winning NBA configuration (Mar 20-21 overhaul) REMOVED motivation and
  // spot narratives entirely — "motivation used as a factor" was a documented
  // loss pattern. Founder: port what NBA had when it was doing well.
  it('MLB Pass 1 task is the simple read ask — no factor enumeration, no feel-of-game script (founder, Jul 22)', () => {
    expect(mlbPass1).not.toContain('consider the feel of the game');
    expect(mlbPass1).not.toContain('the pitchers taking the mound tonight, the lineups');
    expect(mlbPass1).not.toContain('let-down');
    expect(mlbPass1).toContain('investigate this game and build your honest read');
  });
});

describe('F-12: conviction is decoupled from the price', () => {
  it('standard Pass 2.5 says confidence measures the read against the price', () => {
    expect(mlbPass25).toContain('not the shortness of the price');
  });
});

describe('J-series: judgment is licensed, numbers stay policed', () => {
  it('J-1: the shared system prompt draws the fact/opinion line', () => {
    const main = src('orchestrator/orchestratorMain.js');
    expect(main).toContain('JUDGMENT vs FABRICATION');
    // The number-discipline rules survive untouched.
    expect(main).toContain('FACT-CHECKING PROTOCOL (ZERO TOLERANCE)');
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

  it('no team fandom in Gary\'s identity (Reds-fan injection removed Jul 9)', () => {
    // A "lifelong Cincinnati Reds fan" line rode the system prompt for every
    // Reds game since ~April: Gary took the Reds in 25 of their 72 graded
    // games at 40.0% / -5.0u while his opponent-side picks in the SAME games
    // ran 66.0% / +10.3u. Instructed optimism about one franchise is a bought
    // bias — Gary roots for his pick, never for a team (founder order, Jul 9).
    const main = src('orchestrator/orchestratorMain.js');
    expect(main).not.toContain('lifelong Cincinnati Reds fan');
    expect(main).not.toContain('redsInGame');
  });

  it('sport physics: MLB streaks are real currency (founder-requested license)', () => {
    // The founder explicitly asked for it, and it licenses a CLUE TYPE, not a side.
    expect(src('orchestrator/spreadEvaluationFactors.js')).toContain('Streaks are real currency');
  });

  // (Jul 7 eve: the J-4 script-commit and decision-integrity checkpoints were
  // removed with the best-bet grammar — no winning era carried decision-stage
  // philosophy; see the best-bet describe below.)

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
  it('awareness is ONLY the two founder-kept bullets (Jul 22): variance + momentum/streaks', () => {
    const aw = getMlbSeasonAwareness();
    expect(aw).not.toContain('same team several days running');
    expect(aw).toContain('heavy game-to-game variance');
    expect(aw).toContain('Streaks are real currency');
  });

  it('the canned run-line-size commentary block is gone', () => {
    expect(mlbPass1).not.toContain('RUN LINE SIZE');
    expect(mlbPass1).not.toContain('At this run line size');
  });

  it('season awareness is trimmed to the two kept bullets — all baseball tutoring removed (founder, Jul 22)', () => {
    const aw = getMlbSeasonAwareness();
    expect(aw).not.toContain('162-game marathon');
    expect(aw).not.toContain('MLB game analysis — what to look at');
    expect(aw).not.toContain('one lever, not the whole game');
    expect(aw).not.toContain('announced before the line is set');
    expect(aw).not.toContain('Park factors are real');
    expect(aw).not.toContain('shiny ERA is fragile');
    expect(aw).toContain('heavy game-to-game variance');
    expect(aw).toContain('Streaks are real currency');
  });

  it('no DESCRIPTIVE vs CAUSAL section anywhere in MLB (superseded by best-bet grammar)', () => {
    expect(mlbPass1).not.toContain('DESCRIPTIVE vs CAUSAL');
    expect(mlbPass25).not.toContain('DESCRIPTIVE vs CAUSAL');
  });
});

describe('HOW-to-pick sweep (Jul 7 — founder: "the prompts kept telling Gary how to pick")', () => {
  it('the synthesis no longer scripts the "overpaying for a fragile number" phrase', () => {
    // F-6 template factory: the exact phrase we counted in 57-65/99 rationales
    // was INSTRUCTED, in quotes, at the decision stage. The whole xStats
    // paragraph left with the best-bet grammar; the price-not-verdict
    // discipline survives in MLB AWARENESS.
    expect(mlbPass25).not.toContain('overpaying for a fragile number');
    expect(mlbPass25).not.toContain('frame it exactly that way');
    expect(mlbPass25).not.toContain('context for value');
  });

  it('Pass 1 asks whether the story holds up, not where to disagree', () => {
    expect(mlbPass1).not.toContain('decide where you disagree with the story');
  });

  it('MLB factors carry no market-sentiment worldview and no factor-weight superlative', () => {
    const f = getMlbSpreadFactors();
    expect(f).not.toContain('Public action follows brands');
    expect(f).not.toContain('biggest single input');
  });

  it('confidence guidance is symmetric — no directional emphasis', () => {
    expect(mlbPass25).not.toContain('when your strongest read is a dog, say so with full conviction');
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

  it('props constitutions state market thinness without promising edges (MLB)', () => {
    // "Imprecise line = where edges live" is the CLAUDE.md "gap = edge" class;
    // "platoon splits lag in prop lines" seeded the props platoon monoculture.
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

describe('steering-line source lint (never rendered through an export)', () => {
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
