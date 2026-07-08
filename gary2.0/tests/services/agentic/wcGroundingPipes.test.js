// Jul 8 2026 — WC gets the same grounding pipes MLB has, built from the start
// against the founder's fan-parity doctrine (feedback-grounding-fan-parity.md):
// grounding's job is everything a FAN following the match would know that no
// stat token captures — storylines, squad/roster news, fan & media sentiment,
// team/player reputation, travel-as-story, venue conditions — never other
// people's picks. Awareness only; Gary decides what matters (Layer 1, never 3).
//
//   Pipe 1  scout SAME-DAY WIRE — one grounded call per match, always on,
//           tight to dated, concrete, day-of facts (mirrors MLB's Jun 29
//           "breaking news only" design). Replaces the stale trailing note
//           that pointed everything at Flash's walk.
//   Pipe 2  WC_GAME_PREVIEW token — broader, on-demand fan-context pull
//           (reputation, sentiment, storylines) Flash/Gary invoke when a
//           factor calls for it — mirrors MLB_GAME_PREVIEW's role.
//   Pipe 3  the suspension / yellow-card watch (WC's analogue of MLB's
//           bullpen-news pipe — no structured feed anywhere) lives inside
//           pipe 1's query, not as a separate call.
//   Pipe 4  Flash's capped walk searches + Gary's own tool (pre-existing).
//
// "Trade rumors" has no literal WC analogue (national teams don't trade) —
// translated honestly to squad/call-up/roster news, the real WC equivalent.
//
// Also fixes a wiring gap: LINEUPS and AVAILABILITY are real, working
// fetchers (soccerFetchers.js) that were never in the WC token allowlist, so
// Flash's own AVAILABILITY-factor calls bounced off with "Not available for
// WC" — a backed-but-unreachable token, same bug class as an unbacked one.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { getTokensForSport } from '../../../src/services/agentic/tools/toolDefinitions.js';
import { INVESTIGATION_FACTORS } from '../../../src/services/agentic/orchestrator/investigationFactors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../../../src');
const src = (rel) => readFileSync(path.join(root, rel), 'utf8');

describe('pipe 1: WC scout report carries a SAME-DAY WIRE grounding call', () => {
  it('soccer.js makes the grounded call and unwraps .data (built correctly, no retrofit)', () => {
    const s = src('services/agentic/scoutReport/sports/soccer.js');
    expect(s).toContain("import { geminiGroundingSearch } from '../shared/grounding.js'");
    expect(s).toContain('geminiGroundingSearch(');
    expect(s).toContain("r?.data || ''");
  });

  it('the wire query covers the fan-parity checklist: storylines, squad/roster news, sentiment, reputation, travel, suspensions/cards', () => {
    const s = src('services/agentic/scoutReport/sports/soccer.js');
    expect(s).toContain('storylines');
    expect(s).toMatch(/squad|roster/i);
    expect(s).toMatch(/fans?.{0,15}(saying|talking|sentiment)|sentiment/i);
    expect(s).toContain('reputation');
    expect(s).toMatch(/travel|host cities/i);
    expect(s).toContain('yellow-card');
    expect(s).toContain('suspension');
  });

  it('the wire query stays dated/concrete and forbids other people\'s picks', () => {
    const s = src('services/agentic/scoutReport/sports/soccer.js');
    expect(s).toMatch(/concrete|dated/i);
    expect(s).toContain('do NOT include expert picks, betting predictions, or projections');
  });

  it('the SAME-DAY WIRE section replaces the stale "everything comes from Flash grounding" note', () => {
    const s = src('services/agentic/scoutReport/sports/soccer.js');
    expect(s).toContain('SAME-DAY WIRE');
    expect(s).not.toContain('(Injuries, suspensions, confirmed lineups, and weather/altitude come from Flash grounding for this match.)');
  });
});

describe('pipe 2: WC_GAME_PREVIEW — on-demand fan-context token', () => {
  it('soccerFetchers exports WC_GAME_PREVIEW and unwraps .data from the start', () => {
    const f = src('services/agentic/tools/statRouters/soccerFetchers.js');
    expect(f).toContain('WC_GAME_PREVIEW');
    expect(f).toContain("result?.data || 'N/A'");
  });

  it('the query covers reputation, sentiment, and squad storylines, and forbids picks', () => {
    const f = src('services/agentic/tools/statRouters/soccerFetchers.js');
    expect(f).toContain('reputation');
    expect(f).toMatch(/fans?.{0,20}(pundits|received|talked)/i);
    expect(f).toMatch(/squad|roster/i);
    expect(f).toContain('do NOT include expert picks, betting predictions, or projections');
  });

  it('GAME_PREVIEW is reachable: in the WC allowlist and given its own factor slot in the research walk', () => {
    expect(getTokensForSport('WC')).toContain('GAME_PREVIEW');
    expect(INVESTIGATION_FACTORS.soccer_world_cup.STORYLINES).toEqual(['GAME_PREVIEW']);
  });
});

describe('wiring gap: LINEUPS/AVAILABILITY are backed tokens — now actually reachable', () => {
  it('LINEUPS and AVAILABILITY are in the WC token allowlist', () => {
    const tokens = getTokensForSport('WC');
    expect(tokens).toContain('LINEUPS');
    expect(tokens).toContain('AVAILABILITY');
  });
});

describe('factor 4 instruction reflects what is structured now (post injury-timing port)', () => {
  it('no longer claims lineups/injuries have no structured source', () => {
    const p = src('services/agentic/flashInvestigationPrompts.js');
    const soccerSection = p.slice(p.indexOf('SOCCER_WC_FACTORS'));
    expect(soccerSection).not.toContain('grounding only — no structured source');
    expect(soccerSection).toContain('AVAILABILITY TIMING');
    expect(soccerSection).toContain('Suspensions and yellow-card accumulation');
  });

  it('a dedicated STORYLINES factor exists in the Flash investigation checklist', () => {
    const p = src('services/agentic/flashInvestigationPrompts.js');
    const soccerSection = p.slice(p.indexOf('SOCCER_WC_FACTORS'));
    expect(soccerSection).toContain('STORYLINES');
    expect(soccerSection).toContain('GAME_PREVIEW');
  });

  it('the baseline line no longer routes lineups/injuries to grounding', () => {
    const p = src('services/agentic/flashInvestigationPrompts.js');
    expect(p).not.toContain('use grounding for lineups/injuries/suspensions/weather');
  });
});
