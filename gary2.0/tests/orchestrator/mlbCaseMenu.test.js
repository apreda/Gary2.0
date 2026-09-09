import { describe, it, expect } from 'vitest';
import { mlbCappedMenu, mlbCaseHeadings, mlbCaseOrder, mlbPass1Opening, ticketMenu, menuTruthLines } from '../../src/services/agentic/orchestrator/mlbCaseMenu.js';
import { buildPass1Message, buildPass2Message } from '../../src/services/agentic/orchestrator/passBuilders.js';
import { getFlashInvestigationPrompt } from '../../src/services/agentic/flashInvestigationPrompts.js';
import { MLB_CONSTITUTION } from '../../src/services/agentic/constitution/mlbConstitution.js';

const capped = { moneyline_home: -230, moneyline_away: 210, spread_home: -1.5, spread_home_odds: -111, spread_away: 1.5, spread_away_odds: -109 };
const cappedAway = { moneyline_home: 184, moneyline_away: -220, spread_home: 1.5, spread_home_odds: -125, spread_away: -1.5, spread_away_odds: 104 };
const legal = { moneyline_home: -150, moneyline_away: 130, spread_home: -1.5, spread_home_odds: 120, spread_away: 1.5, spread_away_odds: -140 };

describe('mlbCaseOrder — the case written last alternates by game id (founder GO, Sep 2)', () => {
  it('even id home first, odd id away first, no id home first', () => {
    expect(mlbCaseOrder({ id: 5059862 })).toBe('home-first');
    expect(mlbCaseOrder({ id: 5059863 })).toBe('away-first');
    expect(mlbCaseOrder({ bdl_game_id: '5059863' })).toBe('away-first');
    expect(mlbCaseOrder({})).toBe('home-first');
    expect(mlbCaseOrder(null)).toBe('home-first');
  });
  it('the headings print in the game\'s order and name the club read last', () => {
    const even = mlbCaseHeadings('Braves', 'Rockies', { ...legal, id: 100 });
    expect(even.first).toBe('CASE FOR BACKING BRAVES TONIGHT:');
    expect(even.second).toBe('CASE FOR BACKING ROCKIES TONIGHT:');
    expect(even.lastSide).toBe('away');
    const odd = mlbCaseHeadings('Braves', 'Rockies', { ...legal, id: 101 });
    expect(odd.first).toBe('CASE FOR BACKING ROCKIES TONIGHT:');
    expect(odd.second).toBe('CASE FOR BACKING BRAVES TONIGHT:');
    expect(odd.lastSide).toBe('home');
    const msg = buildPass1Message('DESK', 'Braves', 'Rockies', '2026-09-02', 'baseball_mlb', -1.5, { game: { ...legal, id: 101 } });
    expect(msg.indexOf('CASE FOR BACKING ROCKIES TONIGHT:')).toBeLessThan(msg.indexOf('CASE FOR BACKING BRAVES TONIGHT:'));
    const p = MLB_CONSTITUTION.bilateralCasePrompt('Braves', 'Rockies', { ...legal, id: 101 });
    expect(p.indexOf('CASE FOR BACKING ROCKIES TONIGHT:')).toBeLessThan(p.indexOf('CASE FOR BACKING BRAVES TONIGHT:'));
  });
});

describe('mlbCappedMenu', () => {
  it('names the tickets when the home favorite is past the cap', () => {
    const m = mlbCappedMenu(capped, 'Braves', 'Rockies');
    expect(m).toEqual({ fav: 'Braves', favLine: '-1.5 (-111)', dog: 'Rockies', dogLine: '+1.5 (-109)', dogMl: '+210' });
  });
  it('handles an away favorite', () => {
    const m = mlbCappedMenu(cappedAway, 'Rangers', 'Athletics');
    expect(m.fav).toBe('Athletics');
    expect(m.dog).toBe('Rangers');
    expect(m.dogMl).toBe('+184');
  });
  it('is null on a legal board, a missing board, or an unpriced run line', () => {
    expect(mlbCappedMenu(legal, 'A', 'B')).toBeNull();
    expect(mlbCappedMenu(null, 'A', 'B')).toBeNull();
    expect(mlbCappedMenu({ ...capped, spread_home_odds: null }, 'A', 'B')).toBeNull();
  });
});

describe('mlbCaseHeadings', () => {
  it('keeps the who-wins headings on a legal board', () => {
    const h = mlbCaseHeadings('Braves', 'Rockies', legal);
    expect(h.capped).toBe(false);
    expect(h.home).toBe('CASE FOR BACKING BRAVES TONIGHT:');
    expect(h.away).toBe('CASE FOR BACKING ROCKIES TONIGHT:');
  });
  it('a run-line game keeps the club names in the headings; the kind and tickets ride the opener (founder, Sep 2)', () => {
    const h = mlbCaseHeadings('Braves', 'Rockies', capped);
    expect(h.kind).toBe('runline');
    expect(h.fav).toBe('Braves');
    expect(h.dog).toBe('Rockies');
    expect(h.home).toBe('CASE FOR BACKING BRAVES TONIGHT:');
    expect(h.away).toBe('CASE FOR BACKING ROCKIES TONIGHT:');
  });
  it('never puts a line in a heading, whichever side is the run-line favorite', () => {
    const h = mlbCaseHeadings('Rangers', 'Athletics', cappedAway);
    expect(h.kind).toBe('runline');
    expect(h.fav).toBe('Athletics');
    expect(h.home).toBe('CASE FOR BACKING RANGERS TONIGHT:');
    expect(h.away).toBe('CASE FOR BACKING ATHLETICS TONIGHT:');
  });
});

describe('Pass 1 and the bilateral prompt agree', () => {
  it('the desk speaks first — no opening paragraph, no WHERE TO LOOK list (founder, Sep 9 2026); the cases keep their exact headings', () => {
    const msg = buildPass1Message('DESK', 'Braves', 'Rockies', '2026-09-01', 'baseball_mlb', -1.5, { game: capped });
    expect(msg.startsWith('<scout_report>')).toBe(true);
    expect(msg).not.toContain("You're deciding");
    expect(msg).not.toContain('Where tonight lives on the desk');
    expect(msg).toContain('CASE FOR BACKING BRAVES TONIGHT:');
    expect(msg).toContain('CASE FOR BACKING ROCKIES TONIGHT:');
    expect(msg).not.toContain('-1.5 TONIGHT:');
    expect(msg).not.toContain('+1.5 TONIGHT:');
    expect(msg.toLowerCase()).not.toContain('house limit');
    expect(msg).not.toContain('OUTRIGHT AT');
  });
  it('a moneyline board reads the same way — desk first, cases under the headings', () => {
    const msg = buildPass1Message('DESK', 'Braves', 'Rockies', '2026-09-01', 'baseball_mlb', -1.5, { game: legal });
    expect(msg.startsWith('<scout_report>')).toBe(true);
    expect(msg).not.toContain('Tonight is a moneyline game.');
    expect(msg).toContain('CASE FOR BACKING BRAVES TONIGHT:');
    expect(msg).toContain('CASE FOR BACKING ROCKIES TONIGHT:');
  });
  it('the constitution bilateral prompt carries the same headings', () => {
    const p = MLB_CONSTITUTION.bilateralCasePrompt('Braves', 'Rockies', capped);
    expect(p).toContain('CASE FOR BACKING BRAVES TONIGHT:');
    expect(p).toContain('CASE FOR BACKING ROCKIES TONIGHT:');
    expect(p).toContain('the case for taking that side tonight');
    expect(MLB_CONSTITUTION.bilateralCasePrompt('Braves', 'Rockies')).toContain('CASE FOR BACKING BRAVES TONIGHT:');
  });
  it('mlbPass1Opening names the existing kind and asks for that ticket outcome', () => {
    expect(mlbPass1Opening({ kind: 'moneyline' })).toContain('choose the team you actually expect to win');
    const rl = mlbPass1Opening({ kind: 'runline', fav: 'Braves', dog: 'Rockies' });
    expect(rl).toContain('Tonight is a run-line game: Braves -1.5 or Rockies +1.5.');
    expect(rl).toContain('choose the run-line outcome you actually expect');
    expect(rl).not.toContain('choose the team you actually expect to win');
    expect(rl.toLowerCase()).not.toContain('house limit');
  });
});

describe('ticketMenu / menuTruthLines — one definition of a ticket', () => {
  it('rejects malformed American odds while keeping a real zero-point spread', () => {
    for (const odds of [0, true, ' ', -99, 1.91, -110.5, Infinity]) {
      expect(ticketMenu({ moneyline_home: odds, spread_home: -1.5, spread_home_odds: odds }, 'A', 'B').tickets).toEqual([]);
    }
    expect(ticketMenu({ spread_home: 0, spread_home_odds: -110 }, 'A', 'B').tickets).toEqual(['A 0 (-110)']);
    expect(ticketMenu({ spread_home: ' ', spread_home_odds: -110 }, 'A', 'B').tickets).toEqual([]);
  });
  it('drops a capped moneyline and lists every priced ticket, home first by default', () => {
    const m = ticketMenu(capped, 'Braves', 'Rockies');
    expect(m.dropped).toEqual(['Braves -230']);
    expect(m.tickets).toEqual(['Braves -1.5 (-111)', 'Rockies +210', 'Rockies +1.5 (-109)']);
    const lines = menuTruthLines(capped, 'Braves', 'Rockies', { when: 'tonight' });
    expect(lines[0]).toBe('House limit: no moneyline heavier than -179. Braves -230 is past it and is not a ticket tonight.');
    expect(lines[1]).toBe('Tickets on this game: Braves -1.5 (-111) · Rockies +210 · Rockies +1.5 (-109)');
  });
  it('football order is away-first and the wording is the week', () => {
    const lines = menuTruthLines(cappedAway, 'Rangers', 'Athletics', { when: 'this week', order: 'away-first' });
    expect(lines[0]).toContain('is not a ticket this week');
    expect(lines[1]).toBe('Tickets on this game: Athletics -1.5 (+104) · Rangers +184 · Rangers +1.5 (-125)');
  });
  it('a legal board lists both moneylines and both lines, nothing dropped', () => {
    const m = ticketMenu(legal, 'A', 'B');
    expect(m.dropped).toEqual([]);
    expect(m.tickets.length).toBe(4);
  });
  it('an unpriced line is not a ticket', () => {
    const m = ticketMenu({ ...legal, spread_home_odds: null, spread_away_odds: null }, 'A', 'B');
    expect(m.tickets).toEqual(['A -150', 'B +130']);
  });
});

describe('MLB expected ticket outcome assignment (founder, Sep 8 2026)', () => {
  it('removes price-hunting assignments from the complete MLB prompt surfaces', () => {
    for (const h of [{ kind: 'moneyline' }, { kind: 'runline', fav: 'Dodgers', dog: 'Padres' }]) {
      const msg = [mlbPass1Opening(h), MLB_CONSTITUTION.pass1Context,
        getFlashInvestigationPrompt('baseball_mlb'), buildPass2Message('Dodgers', 'Padres', 'MLB', -1.5)].join('\n');
      expect(msg).not.toMatch(/The board comes first|whether the price has accounted|The market already knows|uncertainty is never a reason|PRICE AWARENESS|Report the implied probability|whether the price reflects it|Context for the price|OBSERVABLE SPREAD DRIVERS/i);
      expect(mlbPass1Opening(h)).not.toMatch(/cheap|expensive|underdog|favorite is|value|probabilit/i);
    }
  });
  it('retains the exact moneyline-cap boundary and chooses run-line before reading evidence', () => {
    const atCap = buildPass1Message('DESK', 'Braves', 'Rockies', '2026-09-08', 'MLB', -1.5, { game: { ...capped, moneyline_home: -179 } });
    const pastCap = buildPass1Message('DESK', 'Braves', 'Rockies', '2026-09-08', 'MLB', -1.5, { game: { ...capped, moneyline_home: -180 } });
    // The kind no longer opens the message; the boundary still decides the ticket menu.
    expect(atCap).not.toContain('Tonight is a');
    expect(pastCap).not.toContain('Tonight is a');
    expect(mlbCaseHeadings('Braves', 'Rockies', { ...capped, moneyline_home: -179 }).kind).toBe('moneyline');
    expect(mlbCaseHeadings('Braves', 'Rockies', { ...capped, moneyline_home: -180 }).kind).toBe('runline');
  });
  it('keeps the simple final question, evidence questions, and confidence as Gary\'s judgment', () => {
    const msg = buildPass2Message('Braves', 'Rockies', 'MLB', -1.5);
    expect(msg).toContain("What's your bet, and what are the reasons why?");
    expect(msg).not.toContain('Which supplied facts carry this decision?'); // removed Sep 9 2026 (founder)
    expect(msg).toContain('How confident are you in this pick?');
    expect(msg).not.toMatch(/expected value|implied probability|win probability|mispric/i);
  });
  it('retains late-update factual research and the locked injury awareness', () => {
    const research = getFlashInvestigationPrompt('MLB');
    expect(research).toContain('### LATE GAME UPDATES');
    expect(research).toContain('confirmed lineups (vs projected), bullpen availability (who pitched last night), day-of weather updates, and any late scratches or IL moves');
    expect(MLB_CONSTITUTION.pass1Context).toContain('### MLB INJURY LABELS (READ FROM SCOUT REPORT)');
    expect(MLB_CONSTITUTION.pass1Context).toContain('**ESTABLISHED** — 3+ team games missed');
  });
});

describe('where to look (founder GO, Sep 3 2026)', () => {
  it('both openers carry the where-to-look line after the ticket assignment, and it names places only', async () => {
    const { mlbPass1Opening, MLB_WHERE_TO_LOOK } = await import('../../src/services/agentic/orchestrator/mlbCaseMenu.js');
    for (const h of [{ kind: 'moneyline' }, { kind: 'runline', fav: 'Dodgers', dog: 'Padres' }]) {
      const msg = mlbPass1Opening(h);
      expect(msg.indexOf('Read the whole game')).toBeLessThan(msg.indexOf(MLB_WHERE_TO_LOOK));
    }
    expect(MLB_WHERE_TO_LOOK).toContain('which arms in each pen can actually go tonight');
    expect(MLB_WHERE_TO_LOOK).not.toMatch(/\b(edge|value|fade|favorite|underdog|means|therefore|so take|bet the)\b/i);
  });
});
