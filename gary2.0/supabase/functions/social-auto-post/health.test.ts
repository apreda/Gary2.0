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

test('a hook failure and a metrics outage stay visible', () => {
  const health = socialRunHealth({ results: [{ posted: false, error: 'HOOK_OUTPUT_INVALID: model=x' }], metrics: { checked: 20, updated: 0 } });
  assert.deepEqual(health.issues, ['HOOK_OUTPUT_INVALID', 'METRICS_UNAVAILABLE']);
  assert.equal(health.failed_posts, 1);
});

test('no pick chosen yet and throttled metrics are healthy skips', () => {
  const health = socialRunHealth({ results: [{ posted: false, reason: "today's free pick is not chosen yet" }], metrics: { skipped: 'refreshed within 45min' } });
  assert.equal(health.status, 'ok');
  assert.deepEqual(health.issues, []);
});

test('auth and rate-limit errors are visible without leaking the original error text', () => {
  const health = socialRunHealth({ error: '403 forbidden private-text', metrics: { error: '429 rate limit' } });
  assert.deepEqual(health.issues, ['PROVIDER_AUTH_FAILED', 'PROVIDER_RATE_LIMIT']);
  assert.equal(JSON.stringify(health).includes('private-text'), false);
});
