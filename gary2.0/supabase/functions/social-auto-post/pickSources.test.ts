import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSocialPickSources, sameSourceGame, hasPostedSourcePick, hasLoggedTicket } from './pickSources.js';
import { selectPicks } from './window.ts';
import { socialRunHealth } from './health.js';

const nfl = { league: 'NFL', game_id: '100', awayTeam: 'Patriots', homeTeam: 'Seahawks', commence_time: '2026-09-10T00:20:00Z', pick: 'Patriots +3', rationale: 'Exact original reason.' };
const week = (picks = [nfl], week_start = '2026-09-08') => ({ week_start, picks });

test('Wednesday NFL kickoff stored in the Thursday UTC date is available on its Eastern game date', () => {
  assert.deepEqual(mergeSocialPickSources([], week(), '2026-09-09'), [nfl]);
  assert.equal(mergeSocialPickSources([], week(), '2026-09-10').length, 0);
});

test('stale and future weeks, other game dates, props and non-NFL weekly rows do not enter the queue', () => {
  assert.equal(mergeSocialPickSources([], week([nfl], '2026-09-02'), '2026-09-09').length, 0);
  assert.equal(mergeSocialPickSources([], week([nfl], '2026-09-10'), '2026-09-09').length, 0);
  assert.equal(mergeSocialPickSources([], week([{ ...nfl, commence_time: '2026-09-13T17:00:00Z' }, { ...nfl, type: 'prop' }, { ...nfl, league: 'MLB' }]), '2026-09-09').length, 0);
});

test('mixed MLB and weekly NFL preserve exact copy and prefer the canonical daily version by game ID', () => {
  const mlb = { league: 'MLB', game_id: 200, pick: 'Tigers ML', commence_time: '2026-09-09T23:10:00Z' };
  const current = { ...nfl, game_id: 100, pick: 'Patriots +3.5', rationale: 'Fresh daily source.' };
  assert.deepEqual(mergeSocialPickSources([mlb, current], week(), '2026-09-09'), [mlb, current]);
  assert.deepEqual(mergeSocialPickSources([mlb], week(), '2026-09-09'), [mlb, nfl]);
});

test('legacy weekly rows lacking an ID deduplicate only with league, exact teams and exact kickoff', () => {
  assert.equal(sameSourceGame(nfl, { ...nfl, game_id: undefined }), true);
  assert.equal(sameSourceGame(nfl, { ...nfl, game_id: 'other' }), false);
  assert.equal(sameSourceGame(nfl, { ...nfl, game_id: undefined, commence_time: '2026-09-10T01:20:00Z' }), false);
});

test('real weekly NFL bdl_game_id identity wins across kickoff corrections and rejects conflicting IDs', () => {
  const weeklyPick = { ...nfl, game_id: undefined, bdl_game_id: 100, commence_time: '2026-09-10T00:30:00Z' };
  assert.equal(sameSourceGame(nfl, weeklyPick), true);
  assert.deepEqual(mergeSocialPickSources([nfl], week([weeklyPick]), '2026-09-09'), [nfl]);
  assert.equal(sameSourceGame(weeklyPick, { ...weeklyPick, bdl_game_id: 101 }), false);
  assert.equal(sameSourceGame(weeklyPick, { ...weeklyPick, bdl_game_id: 101, game_id: 100 }), false);
});

test('doubleheaders keep distinct game IDs and identical tickets need distinct log start times', () => {
  const earlier = { league: 'MLB', game_id: 8968598, awayTeam: 'Tigers', homeTeam: 'Guardians', pick: 'Tigers ML', commence_time: '2026-09-04T18:10:00Z' };
  const later = { ...earlier, game_id: 5059887, commence_time: '2026-09-04T23:15:00Z' };
  assert.equal(sameSourceGame(earlier, later), false);
  assert.equal(mergeSocialPickSources([earlier, later], null, '2026-09-04').length, 2);
  assert.equal(hasPostedSourcePick(later, [{ pick_text: earlier.pick, commence_time: earlier.commence_time }]), false);
  assert.equal(hasPostedSourcePick(earlier, [{ pick_text: earlier.pick, commence_time: earlier.commence_time }]), true);
});

test('weekly NFL goes through the unchanged pregame window and cannot post after kickoff', () => {
  const picks = mergeSocialPickSources([], week(), '2026-09-09');
  const options = { leadMinMin: 5, leadMaxMin: 120, maxPerRun: 8, dailyCap: 30, postedToday: 0, reserve: {} };
  assert.equal(selectPicks(picks, { ...options, nowMs: Date.parse('2026-09-09T23:00:00Z') }).queue.length, 1);
  assert.equal(selectPicks(picks, { ...options, nowMs: Date.parse('2026-09-10T00:21:00Z') }).queue.length, 0);
});

test('a weekly source outage is visible without inventing a failed post', () => {
  const health = socialRunHealth({ source_errors: ['WEEKLY_NFL_SOURCE_UNAVAILABLE'], results: [{ posted: true }] });
  assert.equal(health.status, 'degraded');
  assert.deepEqual(health.issues, ['PICK_SOURCE_UNAVAILABLE']);
  assert.equal(health.posted_picks, 1);
  assert.equal(health.failed_posts, 0);
});

test('publisher retains unique-ticket no-repost protection when a scheduled start changes', () => {
  const logs = [{ pick_text: nfl.pick, commence_time: nfl.commence_time }];
  const corrected = { ...nfl, commence_time: '2026-09-10T00:30:00Z' };
  assert.equal(hasLoggedTicket(corrected, logs), true);
  assert.equal(hasPostedSourcePick(corrected, logs), false); // readiness reports uncertainty
});

test('successful tweet with failed log persistence is visible and is not reported as a failed publication', () => {
  const health = socialRunHealth({ results: [{ posted: true, error: 'POST_LOG_WRITE_FAILED' }] });
  assert.equal(health.status, 'degraded');
  assert.deepEqual(health.issues, ['POST_LOG_WRITE_FAILED']);
  assert.equal(health.posted_picks, 1);
  assert.equal(health.failed_posts, 0);
});
