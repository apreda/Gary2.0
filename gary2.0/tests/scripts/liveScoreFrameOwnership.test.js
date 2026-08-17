import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CLOUD_OWNED_FRAME_LEAGUES,
  isCloudOwnedFrameLeague,
  localFrameRows,
} from '../../supabase/functions/_shared/liveScoreFrameOwnership.js';

const pollerSrc = readFileSync(new URL('../../scripts/poll-live-scores.js', import.meta.url), 'utf8');
const edgeSrc = readFileSync(new URL('../../supabase/functions/live-scores/index.ts', import.meta.url), 'utf8');
const footballSharedSrc = readFileSync(new URL('../../supabase/functions/_shared/liveScoreFootball.js', import.meta.url), 'utf8');

// Single-home decision (Aug 17 2026): the cloud live-scores edge function is
// the SOLE writer of MLB/NFL/NCAAF score frames; the local poller keeps every
// duty the cloud does not have — NBA/NHL frames, MLB outs/bases + cashed-prop
// events (surgical PATCH), grading queues, football proof, phantom cleanup.

describe('live-score frame ownership', () => {
  it('marks exactly MLB, NFL, and NCAAF as cloud-owned frame leagues', () => {
    expect([...CLOUD_OWNED_FRAME_LEAGUES].sort()).toEqual(['MLB', 'NCAAF', 'NFL']);
    expect(isCloudOwnedFrameLeague('MLB')).toBe(true);
    expect(isCloudOwnedFrameLeague('NFL')).toBe(true);
    expect(isCloudOwnedFrameLeague('NCAAF')).toBe(true);
  });

  it('keeps NBA and NHL as local frame leagues, case-insensitively', () => {
    expect(isCloudOwnedFrameLeague('NBA')).toBe(false);
    expect(isCloudOwnedFrameLeague('NHL')).toBe(false);
    expect(isCloudOwnedFrameLeague('mlb')).toBe(true);
    expect(isCloudOwnedFrameLeague('nba')).toBe(false);
  });

  it('defaults an unknown or missing league to local ownership (fail-open coverage)', () => {
    expect(isCloudOwnedFrameLeague('XFL')).toBe(false);
    expect(isCloudOwnedFrameLeague(null)).toBe(false);
    expect(isCloudOwnedFrameLeague(undefined)).toBe(false);
  });

  it('localFrameRows drops cloud-owned frames and keeps everything else intact', () => {
    const rows = [
      { league: 'MLB', game_id: '1' },
      { league: 'NBA', game_id: '2' },
      { league: 'NFL', game_id: '3' },
      { league: 'NHL', game_id: '4' },
      { league: 'NCAAF', game_id: '5' },
    ];
    expect(localFrameRows(rows).map((r) => r.league)).toEqual(['NBA', 'NHL']);
    // Never mutates the input.
    expect(rows).toHaveLength(5);
  });
});

describe('local poller wiring', () => {
  it('filters the frame upsert through localFrameRows instead of writing every league', () => {
    expect(pollerSrc).toContain("from '../supabase/functions/_shared/liveScoreFrameOwnership.js'");
    expect(pollerSrc).toContain('localFrameRows(stamped)');
  });

  it('moves MLB outs/bases into the clobber-proof surgical PATCH beside events', () => {
    // The frame upsert no longer carries the enrichment for cloud-owned MLB;
    // the per-live-game PATCH must carry outs and bases with the events.
    expect(pollerSrc).toContain('const patch = { outs: r.outs, bases: r.bases };');
    expect(pollerSrc).toContain('if (events) patch.events = events;');
  });
});

describe('cloud edge function contract', () => {
  it('never writes outs/bases columns it does not compute (clobbered local enrichment)', () => {
    expect(edgeSrc).not.toContain('outs: null');
    expect(edgeSrc).not.toContain('bases: null');
    expect(edgeSrc).not.toContain('outs: number | null');
    expect(edgeSrc).not.toContain('bases: string | null');
  });

  it('keeps the shared football rows free of MLB-only enrichment columns', () => {
    // Football rows batch into the same PostgREST upsert as the slimmed MLB
    // rows; PostgREST bulk writes require uniform keys, and outs/bases are
    // MLB-only enrichment owned by the local PATCH.
    expect(footballSharedSrc).not.toContain('outs: null');
    expect(footballSharedSrc).not.toContain('bases: null');
  });
});
