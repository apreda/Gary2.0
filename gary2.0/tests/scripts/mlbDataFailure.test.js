import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordMlbDataFailure } from '../../scripts/lib/mlbDataFailure.js';

describe('durable MLB data incident', () => {
  it('retains the first failure and updates the latest reason across scheduled attempts', () => {
    const incidentDirectory = mkdtempSync(join(tmpdir(), 'gary-readiness-incident-'));
    try {
      const game = { id: 123, home_team: 'Cardinals', away_team: 'Giants', commence_time: '2026-09-16T17:15:00Z' };
      recordMlbDataFailure(game, new Error('Roster unavailable'), { incidentDirectory, now: new Date('2026-09-16T15:15:00Z') });
      recordMlbDataFailure(game, { error: 'Missing starter' }, { incidentDirectory, now: new Date('2026-09-16T15:30:00Z') });
      const saved = JSON.parse(readFileSync(join(incidentDirectory, '2026-09-16__MLB__123.json'), 'utf8'));
      expect(saved).toMatchObject({ game_id: '123', first_failed_at: '2026-09-16T15:15:00.000Z',
        last_failed_at: '2026-09-16T15:30:00.000Z', attempts: 2, error: 'Missing starter', publication_blocked: true });
    } finally { rmSync(incidentDirectory, { recursive: true, force: true }); }
  });
});
