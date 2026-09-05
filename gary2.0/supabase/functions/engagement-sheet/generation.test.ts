import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEngagementDrafts, persistEngagementDrafts, findEngagementPick } from './generation.js';

test('drafts only receive pick facts for a unique full-team match', () => {
  const picks = [{awayTeam:'Michigan State',homeTeam:'Boston College'}, {awayTeam:'Ohio State',homeTeam:'Michigan'}];
  assert.equal(findEngagementPick('State of football today', picks), null);
  assert.equal(findEngagementPick('Boston College: the fourth quarter mattered.', picks), picks[0]);
  assert.equal(findEngagementPick('Boston College and Ohio State both play today', picks), null);
  assert.equal(findEngagementPick('Boston Collegeville is a town', picks), null);
});

test('credit failure stops the batch and cannot erase existing private drafts', async () => {
  let calls = 0, writes = 0;
  const batch = await collectEngagementDrafts([1, 2, 3], async () => {
    calls++; throw new Error('Anthropic 400: Your credit balance is too low');
  });
  assert.equal(calls, 1);
  assert.equal(batch.failed, 1);
  assert.deepEqual(batch.health, { status: 'degraded', issues: ['MODEL_CREDITS_UNAVAILABLE'] });
  assert.deepEqual(await persistEngagementDrafts('2026-09-05', batch, async () => { writes++; }), { generated: 0, preserved_existing: true });
  assert.equal(writes, 0);
});

test('partial provider failure keeps previous sheet; editorial skip alone does not fail the batch', async () => {
  const batch = await collectEngagementDrafts([1, 2, 3], async (n) => {
    if (n === 1) return null;
    if (n === 2) return { draft: 'A real thought.' };
    throw new Error('invalid model JSON');
  });
  assert.equal(batch.skipped, 1);
  assert.equal(batch.rows.length, 1);
  assert.equal((await persistEngagementDrafts('2026-09-05', batch, async () => { throw new Error('must not write'); })).preserved_existing, true);
});

test('successful complete batches replace atomically and empty batches preserve the prior sheet', async () => {
  const batch = await collectEngagementDrafts([1, 2, 3], async (n) => ({ draft: String(n) }), 2);
  assert.equal(batch.attempted, 2);
  assert.deepEqual(await persistEngagementDrafts('2026-09-05', batch, async (_, rows) => rows.length), { generated: 2, preserved_existing: false });
  const empty = await collectEngagementDrafts([1], async () => null);
  assert.equal((await persistEngagementDrafts('2026-09-05', empty, async () => { throw new Error('must not write'); })).preserved_existing, true);
});

test('storage failure propagates and is never reported as generated', async () => {
  const batch = await collectEngagementDrafts([1], async () => ({ draft: 'Valid' }));
  await assert.rejects(persistEngagementDrafts('2026-09-05', batch, async () => { throw new Error('database failure'); }), /database failure/);
  await assert.rejects(persistEngagementDrafts('2026-09-05', batch, async () => 0), /COUNT_MISMATCH/);
});
