import { describe, expect, it, vi } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { buildOffSlatePack } from '../../../src/services/insights/playerInsightCards.js';

function fixture({ position = 'P', seasonRecord = null, logs = [] } = {}) {
  return {
    playerId: 42, season: 2026,
    playersById: { 42: { name: 'Test Player', position, teamAbbr: 'TEX', batsThrows: 'R-R' } },
    seasonById: new Map(seasonRecord ? [['42', seasonRecord]] : []),
    batterX: new Map(), pitcherX: new Map(),
    bdl: { getMlbPlayerGameRowsChrono: vi.fn().mockResolvedValue(logs), getMlbPlayerSplits: vi.fn().mockResolvedValue(null) },
  };
}
const pitcher = () => fixture({
  seasonRecord: { pitching_era: 3.21, pitching_whip: 1.04, pitching_k_per_9: 10.2 },
  logs: [
    { ip: '4.0', er: 1, p_k: 4, p_hits: 3, p_bb: 1, _game: { date: '2026-08-23' } },
    { ip: '5.1', er: 2, p_k: 6, p_hits: 4, p_bb: 1, _game: { date: '2026-08-28' } },
    { ip: '5.2', er: 2, p_k: 7, p_hits: 5, p_bb: 1, _game: { date: '2026-09-03' } },
    { ip: 0, at_bats: 4, _game: { date: '2026-09-04' } },
  ],
});
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;

describe('MLB off-slate card source and native contract', () => {
  it('publishes season and grounded pitcher form using completed outings and baseball outs', async () => {
    const input = pitcher();
    const { payload, gameId } = await buildOffSlatePack(input);
    expect(gameId).toBeNull();
    expect(payload.season).toEqual({ line1: '3.21 ERA · 1.04 WHIP', line2: '10.2 K/9' });
    expect(payload).not.toHaveProperty('seasonDisplay');
    expect(input.bdl.getMlbPlayerGameRowsChrono).toHaveBeenCalledWith(42, 2026);
    expect(payload.formRows).toEqual([
      { label: 'LAST OUTING', value: '5.2 IP · 2 ER · 7 K', detail: 'SEP 3' },
      { label: 'LAST 3 OUTINGS', value: '3.00 ERA · 15.0 IP', detail: '17 K · 1.00 WHIP' },
    ]);
  });

  it('omits unsupported season and form sections instead of inventing stats', async () => {
    const { payload } = await buildOffSlatePack(fixture());
    expect(payload.name).toBe('Test Player');
    expect(payload).not.toHaveProperty('season');
    expect(payload).not.toHaveProperty('formRows');
  });

  it('uses the same season field for off-slate hitters', async () => {
    const { payload } = await buildOffSlatePack(fixture({ position: 'OF', seasonRecord: { batting_avg: 0.3, batting_obp: 0.4, batting_slg: 0.5 } }));
    expect(payload.season?.line1).toContain('.300');
    expect(payload).not.toHaveProperty('seasonDisplay');
  });

  it.skipIf(!hasSwift)('decodes the generated card with the actual current native DTO', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-mlb-card-contract-'));
    try {
      const models = readFileSync(new URL('../../../../ios/GaryApp/Models.swift', import.meta.url), 'utf8');
      const dto = models.match(/struct PlayerInsightPack: Decodable \{[\s\S]*?\n\}/)?.[0];
      expect(dto).toBeTruthy();
      const { payload } = await buildOffSlatePack(pitcher());
      const json = join(directory, 'card.json');
      writeFileSync(json, JSON.stringify(payload));
      const swift = join(directory, 'contract.swift');
      writeFileSync(swift, `import Foundation\n${dto}\nlet data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))\nlet card = try JSONDecoder().decode(PlayerInsightPack.self, from: data)\nprecondition(card.season?.line1 == "3.21 ERA · 1.04 WHIP")\nprecondition(card.formRows?.first?.value == "5.2 IP · 2 ER · 7 K")\nprint("Native season and form decoded")\n`);
      expect(execFileSync('swift', [swift, json], { encoding: 'utf8', timeout: 30_000 })).toContain('Native season and form decoded');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 40_000);
});
