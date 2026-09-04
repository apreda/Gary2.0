import test from 'node:test';
import assert from 'node:assert/strict';
import { socialRunHealth } from './health.js';

test('HTTP-200 poster body still exposes the real depleted-credit failure', () => {
  const health = socialRunHealth({ results: [{ error: 'post-single-tweet failed: {"status":402,"details":"credits depleted"}' }] });
  assert.equal(health.status, 'degraded');
  assert.deepEqual(health.issues, ['X_CREDITS_UNAVAILABLE']);
  assert.equal(health.failed_posts, 1);
  assert.equal(JSON.stringify(health).includes('details'), false);
});

test('per-pick errors, missed deadlines and metrics outages survive a partially successful run', () => {
  const health = socialRunHealth({ results: [{ posted: true }, { error: 'NO_SAFE_COPY: no standalone reason' }],
    missed: ['another pick'], metrics: { checked: 20, updated: 0 } });
  assert.deepEqual(health.issues, ['METRICS_UNAVAILABLE', 'MISSED_PREGAME_POSTS', 'NO_SAFE_COPY']);
  assert.equal(health.posted_picks, 1);
  assert.equal(health.failed_posts, 1);
  assert.equal(health.missed_picks, 1);
});

test('off-hours, an empty slate, retired modes and throttled metrics are healthy skips', () => {
  const health = socialRunHealth({ posted: false, reason: 'no pick inside the lead window',
    verdict: { posted: false, reason: 'retired' }, metrics: { skipped: 'refreshed within 45min' } });
  assert.equal(health.status, 'ok');
  assert.deepEqual(health.issues, []);
});

test('auth, rate limit and recap errors are visible without leaking the original error text', () => {
  const health = socialRunHealth({ error: '403 forbidden private-text', metrics: { error: '429 rate limit' }, recap: { error: 'database broke' } });
  assert.deepEqual(health.issues, ['PROVIDER_AUTH_FAILED', 'PROVIDER_RATE_LIMIT', 'RUN_FAILED']);
  assert.equal(JSON.stringify(health).includes('private-text'), false);
});
