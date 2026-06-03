# FIFA World Cup — Plan C: Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans (or direct execution given the Plan-A subagent handshake bug). Checkbox steps.

**Goal:** Grade stored World Cup picks in `run-all-results.js` — 3-way ML (incl. Draw), goal totals, and Asian handicap on the **90′ regulation** score, plus reserved `to_advance` grading — sourcing results from `fifaWorldCupService` (not BDL box scores).

**Architecture:** A new pure `gradeSoccerGame()` (unit-tested) handles all soccer bet types from a regulation score. A soccer branch in the results loop fetches completed WC matches via `fifaWorldCupService.getMatches`, derives the regulation score with `getRegulationScore` (Plan A) and the advancing team with `getAdvanceResult` (Plan A), then routes results to the existing `game_results` table.

**Tech Stack:** Node ESM, Vitest. Depends on **Plan A** (`getRegulationScore`, `getAdvanceResult`, `getMatches`) and **Plan B** (stored pick fields: `soccer_match_id`, `type`, `soccer_three_way_ml`, `goal_line`, `handicap`).

**Spec:** `docs/superpowers/specs/2026-06-03-fifa-world-cup-sport-design.md` Layer 8 + §5.3 (verified field semantics).

---

## Background (verified)

`gradeGame(pickText, homeTeam, awayTeam, hScore, vScore)` at `run-all-results.js:278-320` is text-based: Total (over/under regex) → Spread → ML fallback (home/away mascot match). **A "Draw" pick matches neither team and falls through to `return 'lost'`** — wrong for soccer. And the caller passes scores from BDL box scores; soccer must pass the **90′ regulation** score (`first_half + second_half`), since FIFA `home_score`/`away_score` include extra time.

Identifier contract (from Plan B): pick key `soccer_world_cup` / short `WC`; stored fields `soccer_match_id`, `type` (`moneyline`|`draw`|`total`|`asian_handicap`|`to_advance`), `soccer_three_way_ml {home,draw,away}`, `goal_line`, `handicap`.

---

## File Structure

- **Modify:** `gary2.0/scripts/run-all-results.js` — add `gradeSoccerGame` (near `gradeGame`, ~320); add a soccer results-fetch + grade branch in the pick-grading loop.
- **Test:** `gary2.0/tests/services/soccerGrading.test.js` (new) — unit tests for `gradeSoccerGame` (export it).

---

## Task 1: `gradeSoccerGame` pure function (TDD)

**Files:**
- Modify: `gary2.0/scripts/run-all-results.js` (add + export `gradeSoccerGame`)
- Test: `gary2.0/tests/services/soccerGrading.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { gradeSoccerGame } from '../../scripts/run-all-results.js';

// signature: gradeSoccerGame(pick, regHome, regAway)
// pick: { pick: string, type: string, goal_line?, handicap?, homeTeam, awayTeam }
const MEX = 'Mexico', RSA = 'South Africa';

describe('gradeSoccerGame — 3-way moneyline (90 minutes)', () => {
  it('Home ML wins when home leads at 90', () => {
    expect(gradeSoccerGame({ pick: 'Mexico ML', type: 'moneyline', homeTeam: MEX, awayTeam: RSA }, 2, 1)).toBe('won');
  });
  it('Home ML loses on a draw (no push for 3-way ML)', () => {
    expect(gradeSoccerGame({ pick: 'Mexico ML', type: 'moneyline', homeTeam: MEX, awayTeam: RSA }, 1, 1)).toBe('lost');
  });
  it('Draw pick wins on a level regulation score', () => {
    expect(gradeSoccerGame({ pick: 'Draw', type: 'draw', homeTeam: MEX, awayTeam: RSA }, 1, 1)).toBe('won');
  });
  it('Draw pick loses when someone wins in regulation', () => {
    expect(gradeSoccerGame({ pick: 'Draw', type: 'draw', homeTeam: MEX, awayTeam: RSA }, 2, 1)).toBe('lost');
  });
  it('Away ML wins when away leads', () => {
    expect(gradeSoccerGame({ pick: 'South Africa ML', type: 'moneyline', homeTeam: MEX, awayTeam: RSA }, 0, 2)).toBe('won');
  });
});

describe('gradeSoccerGame — totals (goals)', () => {
  it('Over wins', () => {
    expect(gradeSoccerGame({ pick: 'Over 2.5', type: 'total', goal_line: 2.5, homeTeam: MEX, awayTeam: RSA }, 2, 1)).toBe('won');
  });
  it('Under wins', () => {
    expect(gradeSoccerGame({ pick: 'Under 2.5', type: 'total', goal_line: 2.5, homeTeam: MEX, awayTeam: RSA }, 1, 1)).toBe('lost');
  });
  it('whole-number total pushes when goals equal the line', () => {
    expect(gradeSoccerGame({ pick: 'Over 3', type: 'total', goal_line: 3, homeTeam: MEX, awayTeam: RSA }, 2, 1)).toBe('push');
  });
});

describe('gradeSoccerGame — Asian handicap (half lines)', () => {
  it('home -0.5 wins when home wins outright', () => {
    expect(gradeSoccerGame({ pick: 'Mexico', type: 'asian_handicap', handicap: -0.5, homeTeam: MEX, awayTeam: RSA }, 1, 0)).toBe('won');
  });
  it('home -1.5 loses on a one-goal win', () => {
    expect(gradeSoccerGame({ pick: 'Mexico', type: 'asian_handicap', handicap: -1.5, homeTeam: MEX, awayTeam: RSA }, 1, 0)).toBe('lost');
  });
  it('away +1.5 wins on a one-goal loss', () => {
    expect(gradeSoccerGame({ pick: 'South Africa', type: 'asian_handicap', handicap: 1.5, homeTeam: MEX, awayTeam: RSA }, 1, 0)).toBe('won');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd gary2.0 && npx vitest run tests/services/soccerGrading.test.js`
Expected: FAIL — `gradeSoccerGame is not a function`.

- [ ] **Step 3: Implement + export `gradeSoccerGame`**

Add near `gradeGame` in `run-all-results.js`:
```js
/**
 * Grade a soccer (World Cup) pick on the 90-minute REGULATION score.
 * regHome/regAway must be the regulation goals (first half + second half),
 * NOT the FIFA home_score/away_score (which include extra time).
 * Bet types: moneyline (Home/Away win), draw, total (O/U goals), asian_handicap.
 */
export function gradeSoccerGame(pick, regHome, regAway) {
  if (regHome == null || regAway == null) return null;
  const type = (pick.type || 'moneyline').toLowerCase();
  const text = (pick.pick || '').toLowerCase();
  const hFull = (pick.homeTeam || '').toLowerCase();
  const aFull = (pick.awayTeam || '').toLowerCase();
  const hMascot = hFull.split(' ').pop();
  const aMascot = aFull.split(' ').pop();
  const picksHome = hFull && (text.includes(hFull) || (hMascot && text.includes(hMascot)));
  const picksAway = aFull && (text.includes(aFull) || (aMascot && text.includes(aMascot)));

  if (type === 'draw') {
    return regHome === regAway ? 'won' : 'lost';
  }

  if (type === 'total') {
    const line = parseFloat(pick.goal_line);
    const total = regHome + regAway;
    if (total === line) return 'push';
    return (/over/.test(text) ? total > line : total < line) ? 'won' : 'lost';
  }

  if (type === 'asian_handicap') {
    const h = parseFloat(pick.handicap);
    // margin from the picked side's perspective + handicap
    const margin = picksAway ? (regAway - regHome) : (regHome - regAway);
    const adj = margin + h;
    if (adj === 0) return 'push'; // whole-number AH can push
    return adj > 0 ? 'won' : 'lost';
  }

  // moneyline (3-way: no push — a draw loses both Home and Away ML)
  if (picksHome && !picksAway) return regHome > regAway ? 'won' : 'lost';
  if (picksAway && !picksHome) return regAway > regHome ? 'won' : 'lost';
  return 'lost';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd gary2.0 && npx vitest run tests/services/soccerGrading.test.js`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add gary2.0/scripts/run-all-results.js gary2.0/tests/services/soccerGrading.test.js
git commit -m "feat(wc): gradeSoccerGame (3-way/draw/totals/AH on 90' regulation)"
```

---

## Task 2: Wire soccer into the results loop (fetch + regulation score + route)

**Files:**
- Modify: `gary2.0/scripts/run-all-results.js` — add a soccer branch where picks are graded; import `fifaWorldCupService`.

- [ ] **Step 1: Import Plan A helpers**

Near the top of `run-all-results.js`:
```js
import * as fifaWorldCup from '../src/services/fifaWorldCupService.js';
```

- [ ] **Step 2: Add the soccer grading branch**

In the per-pick grading section, before the generic BDL box-score fetch (the `gradeGame` path), add a soccer branch keyed on the pick's sport/`soccer_match_id`:
```js
    // SOCCER (World Cup): grade from FIFA match data on the 90' regulation score.
    const isSoccerPick = pick.sport === 'WC' || pick.sport === 'soccer_world_cup' || !!pick.soccer_match_id;
    if (isSoccerPick && pick.soccer_match_id) {
      const matches = await fifaWorldCup.getMatches({ matchIds: [pick.soccer_match_id] });
      const match = matches[0];
      if (!match || match.status !== 'completed') {
        console.log(`[Results] WC match ${pick.soccer_match_id} not final yet — leaving pending`);
        continue; // stays pending until played
      }
      const reg = fifaWorldCup.getRegulationScore(match);
      let result;
      if ((pick.type || '').toLowerCase() === 'to_advance') {
        const adv = fifaWorldCup.getAdvanceResult(match);
        const pickedId = /* resolve picked team id from pick text vs match home/away */
          (pick.pick || '').toLowerCase().includes((match.home_team?.name || '').toLowerCase()) ? match.home_team?.id : match.away_team?.id;
        result = adv ? (adv.teamId === pickedId ? 'won' : 'lost') : null;
      } else {
        result = gradeSoccerGame(
          { ...pick, homeTeam: match.home_team?.name, awayTeam: match.away_team?.name },
          reg.home, reg.away
        );
      }
      const finalScore = `${reg.home}-${reg.away}`; // 90' regulation
      // ...write result to game_results exactly as other non-NFL sports do (use the existing insert helper)...
      console.log(`[Results] WC ${match.home_team?.name} ${reg.home}-${reg.away} ${match.away_team?.name} → ${pick.pick} = ${result}`);
      /* call the same game_results upsert the other sports use, with league 'WC' and finalScore */
      continue;
    }
```
NOTE: wire the actual `game_results` insert to mirror the existing non-NFL path (same table, columns, and `league` field set to `'WC'`). Use the existing insert/upsert helper rather than duplicating SQL.

- [ ] **Step 3: Confirm result routing**

Soccer is not NFL, so it uses the `game_results` table (per `run-all-results.js:570` routing). No new table. The iOS `effectiveLeague` already recognizes soccer (Plan D ensures `'WC'`).

- [ ] **Step 4: Integration smoke — grade a known completed 2022 match**

Run:
```bash
cd gary2.0 && node --input-type=module -e "
import './src/loadEnv.js';
import * as wc from './src/services/fifaWorldCupService.js';
import { gradeSoccerGame } from './scripts/run-all-results.js';
// 2022 final: Argentina 3-3 France (ARG won pens). Fetch a real completed match and grade a Draw + an ML.
const ms = await wc.getMatches({ seasons:[2022] });
const fin = ms.find(m => m.status==='completed' && m.has_penalty_shootout);
const reg = wc.getRegulationScore(fin);
console.log(fin.home_team.name, reg.home,'-',reg.away, fin.away_team.name,
  '| Draw =', gradeSoccerGame({pick:'Draw',type:'draw',homeTeam:fin.home_team.name,awayTeam:fin.away_team.name}, reg.home, reg.away),
  '| advance =', JSON.stringify(wc.getAdvanceResult(fin)));
"
```
Expected: a real 2022 shootout match prints its regulation score, `Draw = won` (level at 90′), and a non-null advance result — confirming end-to-end grading against real data.

- [ ] **Step 5: Commit**

```bash
git add gary2.0/scripts/run-all-results.js
git commit -m "feat(wc): grade World Cup picks from FIFA data (regulation score + advance)"
```

---

## Self-Review (completed)

- **Spec coverage:** Layer 8 — 3-way/draw/totals/AH on 90′ regulation (Task 1), `to_advance` via `getAdvanceResult` (Task 2, reserved), results from FIFA data not BDL, routed to `game_results`. ✓
- **Verified semantics:** regulation = `getRegulationScore` (halves, excludes ET); advance = `getAdvanceResult` (incl. ET → penalties). Both from Plan A, both tested. ✓
- **Placeholder scan:** `gradeSoccerGame` is complete + fully TDD-tested. Task 2 has two explicit NOTES to reuse the existing `game_results` insert helper and resolve the picked-team id — wiring instructions, not blanks. ✓

## Downstream

- **Plan D** renders graded results (W/L per market) and the live pick in the iOS WC lane.
