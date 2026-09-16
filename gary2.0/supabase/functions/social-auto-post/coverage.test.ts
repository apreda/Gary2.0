import test from 'node:test';
import assert from 'node:assert/strict';
import { selectGameCoverage, coverageDeadlineOutcomes } from './coverage.ts';
import { publicationKey } from './pickSources.js';
import { socialRunHealth } from './health.js';
const day = '2026-09-20';
const at = (time: string) => Date.parse(`${day}T${time}:00-04:00`);
const pick = (id: number, league = 'MLB', time = '13:00') => ({ game_id: id, league, awayTeam: `Away ${id}`, homeTeam: `Home ${id}`, pick: `Away ${id} ML`, commence_time: new Date(at(time)).toISOString() });
const slate = (p: any) => ({ ...p, bdl_game_id: p.game_id, away_team: p.awayTeam, home_team: p.homeTeam });
const receipt = (p: any, now: number) => ({ league: p.league, publication_key: publicationKey(p), pick_text: p.pick, thread_format: 'standard', posted_at: new Date(now).toISOString() });

test('every MLB and NFL game posts on a mixed 30-game Sunday, including a simultaneous 18-game window', () => {
  const games = Array.from({ length: 30 }, (_, i) => pick(i, i < 15 ? 'MLB' : 'NFL', i < 18 ? '13:00' : i < 27 ? '16:25' : '20:20'));
  const logs: any[] = [];
  // Research completes 100 minutes before each start. Simulate five-minute cron
  // and variable 10–45s composition latency; this used to stop at twelve roots.
  for (let now = at('08:00'), tick = 0; now < at('23:00'); now += 5 * 60_000, tick++) {
    const ready = games.filter(p => Date.parse(p.commence_time) - now <= 100 * 60_000);
    const choice = selectGameCoverage(ready, games.map(slate), logs, [], now).queue[0];
    if (choice) logs.push(receipt(choice, now + (10 + tick % 36) * 1000));
  }
  assert.equal(logs.length, 30);
  assert.equal(new Set(logs.map(p => p.publication_key)).size, 30);
});
test('urgency wins over popularity and the old twelve-root cap', () => {
  const p = pick(1), later = pick(2, 'NFL', '13:30');
  const logs = Array.from({length: 15}, (_,i) => receipt(pick(i+100), at('10:00') + i * 5000));
  const result = selectGameCoverage([later,p], [p,later].map(slate), logs, [], at('11:30'));
  assert.equal(result.queue[0].game_id, 1);
  assert.equal(result.queue.length, 2);
  assert.equal(result.cap, null);
});
test('cancelled, live, future-day, pass, duplicate and late games cannot post', () => {
  const p = pick(1);
  for (const game_status of ['cancelled','postponed','suspended','final','in_progress','live'])
    assert.equal(selectGameCoverage([p], [{...slate(p),game_status}], [], [], at('11:00')).queue.length,0);
  assert.equal(selectGameCoverage([p], [slate(p)], [receipt(p,at('10:00'))], [], at('11:00')).queue.length,0);
  assert.equal(selectGameCoverage([{...p,pick:'PASS'}], [slate(p)], [], [], at('11:00')).queue.length,0);
  for (const time of ['10:59','12:56','13:01']) assert.equal(selectGameCoverage([p], [slate(p)], [], [], at(time)).queue.length,0);
  assert.equal(selectGameCoverage([{...p,commence_time:'2026-09-21T00:30:00-04:00'}], [], [], at('23:00')).queue.length,0);
});
test('international morning games are eligible, and recent roots hold the global interval', () => {
  const p=pick(1,'NFL','07:00');
  assert.equal(selectGameCoverage([p],[slate(p)],[],[],at('05:00')).queue.length,1);
  assert.equal(selectGameCoverage([p],[slate(p)],[receipt(pick(2),at('04:58'))],[],at('05:00')).queue.length,0);
});
test('missing every-game publications are failures without a claim; college omissions remain intentional', () => {
  const games=[pick(1),pick(2,'NFL'),pick(3,'NCAAF'),{...pick(4),pick:'PASS'},pick(5)];
  const result=coverageDeadlineOutcomes(games,[],[],at('13:00'),[{...slate(games[4]),game_status:'cancelled'}]);
  assert.deepEqual(result.missed,[games[0].pick,games[1].pick]);
  assert.deepEqual(result.skipped_pregame,[games[2].pick]);
  assert.ok(socialRunHealth(result).issues.includes('MISSED_PREGAME_POSTS'));
});
test('September 16 intentional omissions do not become retroactive incidents', () => {
  const p={...pick(1),commence_time:'2026-09-16T13:00:00-04:00'};
  assert.equal(coverageDeadlineOutcomes([p],[],[],Date.parse('2026-09-16T18:00:00Z')).missed.length,0);
});
