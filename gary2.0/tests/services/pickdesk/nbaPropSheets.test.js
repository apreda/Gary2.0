// One NBA player's prop sheet failing alone (Nov 12 2026): he is off the board for the run and the others go ahead; more
// than half failing is a failed load that holds the game's props for the next tier.
import { describe, expect, it } from 'vitest';
import { nbaSheetsOrHold } from '../../../src/services/gary/pickdesk/nbaPropsDesk.js';
import { PickDataError } from '../../../src/services/gary/pickDataIntegrity.js';

const players = ['Jalen Brunson', 'Karl-Anthony Towns', 'OG Anunoby', 'Mikal Bridges'].map((player) => ({ player, team: 'New York Knicks' }));
const failing = (...names) => async (p) => { if (names.includes(p.player)) throw new Error('BDL 503'); return `${p.player} sheet`; };

describe('the NBA prop sheets', () => {
  it('takes a player whose sheet failed off the board, names him once, and keeps the rest', async () => {
    const said = [];
    const got = await nbaSheetsOrHold(players, failing('OG Anunoby'), { log: (l) => said.push(l) });
    expect(got.text).toEqual(['Jalen Brunson sheet', 'Karl-Anthony Towns sheet', 'Mikal Bridges sheet']);
    expect([...got.dropped.keys()]).toEqual(['og anunoby']);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/OG Anunoby .*BDL 503/);
  });

  it('holds the game when more than half of the sheets fail', async () => {
    await expect(nbaSheetsOrHold(players, failing('OG Anunoby', 'Mikal Bridges', 'Jalen Brunson'), { log: () => {} })).rejects.toBeInstanceOf(PickDataError);
    await expect(nbaSheetsOrHold(players.slice(0, 1), failing('Jalen Brunson'), { log: () => {} })).rejects.toBeInstanceOf(PickDataError);
    const half = await nbaSheetsOrHold(players, failing('OG Anunoby', 'Mikal Bridges'), { log: () => {} });
    expect(half.dropped.size).toBe(2);
  });
});
