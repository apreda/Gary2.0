import { describe, it, expect } from 'vitest';
import { REASON_TYPES, MECHANISM_LABELS, isSideNote, summarizeByReason, buildNotebook } from '../../../src/services/diary/notebook.js';
import { buildAutopsyAsk, parseAutopsy, writeAutopsy, AUTOPSY_SYSTEM } from '../../../src/services/diary/autopsy.js';

const a = (over) => ({
  game_date: '2026-09-01', home_team: 'Boston Red Sox', away_team: 'Seattle Mariners', pick_text: 'Red Sox ML -144', result: 'lost',
  reason_type: 'starter_recent_form', reason_status: 'irrelevant', note: 'the pen was the story, not the starter\'s last three', ...over,
});

describe('notebook — notes and the reason table', () => {
  it('a side-note is a rule with his handwriting on it, and is refused', () => {
    expect(isSideNote('fade road favorites')).toBe(true);
    expect(isSideNote('always take the dog when the closer is down')).toBe(true);
    expect(isSideNote('the pen decided it, not the starter\'s last three')).toBe(false);
    expect(isSideNote('')).toBe(false);
  });

  it('summarizes by reason type with record and how often the reason decided the game', () => {
    const rows = [
      a(), a({ result: 'won', reason_status: 'right' }), a({ result: 'won', reason_status: 'right', game_date: '2026-09-02' }),
      a({ reason_type: 'run_differential', result: 'lost', reason_status: 'wrong' }),
      a({ reason_type: 'nonsense', result: 'won', reason_status: 'right' }),
    ];
    const t = summarizeByReason(rows);
    expect(t[0]).toMatchObject({ reason: 'starter_recent_form', bets: 3, record: '2-1', judged: 3, right: 2, rightRate: 67 });
    expect(t.find((x) => x.reason === 'run_differential')).toMatchObject({ bets: 1, record: '0-1', right: 0 });
    expect(t.find((x) => x.reason === 'other').bets).toBe(1);
  });

  it('builds the notebook text with counts labelled small, tonight\'s clubs first, and drops side-notes', () => {
    const rows = [
      a(), a({ result: 'won', reason_status: 'right', game_date: '2026-09-02' }),
      a({ home_team: 'New York Yankees', away_team: 'Toronto Blue Jays', pick_text: 'Yankees ML -150', game_date: '2026-09-03', note: 'the big inning came off the third arm, not the starter' }),
      a({ note: 'fade road favorites', game_date: '2026-09-02' }),
    ];
    const nb = buildNotebook(rows, { homeTeam: 'New York Yankees', awayTeam: 'Boston Red Sox', maxNotes: 3 });
    expect(nb.notes).toBe(3);
    expect(nb.text).toContain('YOUR NOTEBOOK');
    expect(nb.text).toContain("the starter's recent starts: 3 bets, 1-2; it decided the game 1 of 3 (small count)");
    expect(nb.text).not.toContain('fade road favorites');
    const first = nb.text.indexOf('Yankees ML -150');
    const second = nb.text.indexOf('Red Sox ML -144');
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(second); // tonight's club first
    expect(buildNotebook([], {}).text).toBe('');
    expect(buildNotebook([a({ note: 'never lay the road number' })], {}).text).toBe('');
  });

  it('the vocabularies are what the autopsy contract advertises', () => {
    expect(REASON_TYPES).toContain('pen_availability');
    expect(MECHANISM_LABELS).toContain('pen_collapse');
  });
});

describe('autopsy — the ask, the parse, the run', () => {
  const answer = (note = 'the pen was the story, not the starter') => JSON.stringify({
    mechanism_stated: 'Crochet\'s last three starts', reason_type: 'starter_recent_form',
    decided_by: 'the Mariners scored four off the pen in the seventh', mechanism_label: 'pen_collapse', reason_status: 'irrelevant', note,
  });

  it('the ask carries the bet, the card, the game, and forbids side rules', () => {
    const ask = buildAutopsyAsk({ homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners', gameDate: '2026-09-02', pickText: 'Red Sox ML -144', result: 'lost', rationale: 'CARD', caseText: 'CASE', story: 'FINAL: Mariners 6, Red Sox 3' });
    expect(ask).toContain('You took Red Sox ML -144. It LOST.');
    expect(ask).toContain('CARD');
    expect(ask).toContain('YOUR CASE FOR THAT SIDE');
    expect(ask).toContain('FINAL: Mariners 6, Red Sox 3');
    expect(ask).toContain('never write it: "fade road favorites."');
    expect(AUTOPSY_SYSTEM).toContain('never write a rule about which side to take');
  });

  it('parses, normalizes vocabularies, and blanks a side-note', () => {
    const p = parseAutopsy('```json\n' + answer() + '\n```');
    expect(p).toMatchObject({ reason_type: 'starter_recent_form', mechanism_label: 'pen_collapse', reason_status: 'irrelevant', note_dropped_as_side: false });
    expect(p.note).toContain('the pen was the story');
    const bad = parseAutopsy(answer('always fade the road favorite here'));
    expect(bad.note).toBe('');
    expect(bad.note_dropped_as_side).toBe(true);
    expect(parseAutopsy(JSON.stringify({ reason_type: 'made_up', reason_status: 'maybe' })).reason_type).toBe('other');
    expect(parseAutopsy('nothing')).toBeNull();
  });

  it('writeAutopsy runs one call without search on its own breaker and never throws', async () => {
    let seen = null;
    const out = await writeAutopsy({ homeTeam: 'H', awayTeam: 'A', gameDate: 'd', pickText: 'H ML -120', result: 'won', rationale: 'card', story: 's' }, { oneShot: async (p, o) => { seen = o; return { success: true, data: answer() }; } });
    expect(out.ok).toBe(true);
    expect(seen).toMatchObject({ search: false, breakerKey: 'codex-autopsy' });
    expect((await writeAutopsy({ pickText: 'x' }, { oneShot: async () => ({ success: true, data: answer() }) })).error).toBe('missing pick or card');
    expect((await writeAutopsy({ pickText: 'x', rationale: 'c' }, { oneShot: async () => { throw new Error('boom'); } })).ok).toBe(false);
  });
});
