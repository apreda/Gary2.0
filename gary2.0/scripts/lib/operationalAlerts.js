// Ordinary monitoring only: no model imports, provider calls, or pick writes.
export function failureCategory(value) {
  const text = String(value || '');
  if (/revoked|not logged in|401|403|unauthori[sz]ed|refresh.token/i.test(text)) return 'Provider sign-in failed';
  if (/quota|429|rate.limit|credit|usage.limit/i.test(text)) return 'Provider quota or rate limit';
  if (/lineup|roster|required.data|readiness|missing.*stat/i.test(text)) return 'Required sports data unavailable';
  if (/timeout|timed.out|deadline/i.test(text)) return 'Job timed out';
  return 'Job failed; inspect the private run log';
}

export function easternLogTime(value) {
  const match = value.match(/^(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+) (AM|PM)$/);
  if (!match) return null;
  const [, month, day, year, hour, minute, second, half] = match;
  const h = Number(hour) % 12 + (half === 'PM' ? 12 : 0);
  const rough = new Date(Date.UTC(+year, +month - 1, +day, h, +minute, +second));
  const zone = new Intl.DateTimeFormat('en', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(rough).find(p => p.type === 'timeZoneName').value;
  const offset = Number(zone.replace('GMT', '') || 0);
  return new Date(rough.getTime() - offset * 3600000).toISOString();
}

export function collectorReadObservation(error, source, date, schedulerAt, now = Date.now()) {
  const [year, month, day] = date.split('-');
  const midnight = Date.parse(easternLogTime(`${Number(month)}/${Number(day)}/${year}, 12:00:00 AM`));
  const heartbeat = Date.parse(schedulerAt);
  // The collector can run before the scheduler's first 30-second heartbeat
  // after midnight. Keep the observation incomplete (never infer recovery),
  // but allow that one-minute handover only with a fresh pre-midnight beat.
  if (source === 'scheduler' && error?.code === 'ENOENT'
    && now >= midnight && now < midnight + 60_000
    && heartbeat < midnight && now - heartbeat <= 3 * 60_000) return null;
  const input = source === 'scheduler' ? `Scheduler log for ${date}` : 'Required-data incident records';
  const reason = error?.code === 'ENOENT' ? 'missing file'
    : ['EACCES', 'EPERM'].includes(error?.code) ? 'could not be read because access was denied'
      : error instanceof SyntaxError ? 'contain invalid JSON'
        : error?.code === 'EINPUTSIZE' ? 'exceed the bounded read limit' : 'could not be read completely';
  return { key: 'collector:read', title: 'Failure records unreadable',
    detail: `${input}: ${reason}. Previous incidents remain open.` };
}

// Reconstruct from the scheduler's own accepted stored/pass outcomes. A zero
// exit, another game's success, or midnight never clears a failed game.
export function schedulerObservations(text, date) {
  const active = new Map();
  const contexts = new Map();
  const outcomes = new Map();
  for (const line of text.split('\n')) {
    const row = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!row) continue;
    const at = easternLogTime(row[1]);
    if (!at) continue;
    const message = row[2];
    const start = message.match(/(?:📊 Game picks|🎯 Props): (.+?) \[.*\] \(id ([\w-]+)\)/);
    if (start) contexts.set(`${message.includes('🎯') ? 'props' : 'game'}:${start[1]}`, start[2]);
    const failed = message.match(/❌ (Game picks|Props) failed: (.+?) \[.*?\]: (.*)/);
    const missed = message.match(/MISSED (PICK|PROPS): (MLB|NFL|NCAAF|NBA) (.+?) — .*?\(id ([\w-]+)\)(.*)/);
    const success = message.match(/🧾 (Game-pick|Props) outcome: (stored|pass) for (.+?)(?: \(\d+ pick\(s\)\))?$/);
    if (failed || missed) {
      const kind = missed ? (missed[1] === 'PROPS' ? 'props' : 'game') : (failed[1] === 'Props' ? 'props' : 'game');
      const matchup = missed ? missed[3] : failed[2];
      const gameId = missed ? missed[4] : contexts.get(`${kind}:${matchup}`);
      const key = `${date}:${kind}:${gameId || matchup}`;
      const previous = active.get(key);
      active.set(key, { key, title: `${kind === 'props' ? 'Props' : 'Game pick'}: ${matchup}`,
        detail: missed ? 'Final retry ended without a verified stored outcome or accepted props pass.' : failureCategory(failed[3]),
        at: previous?.at || at, last_at: at, game_id: gameId, kind });
    }
    if (success) {
      const kind = success[1] === 'Props' ? 'props' : 'game';
      const gameId = contexts.get(`${kind}:${success[3]}`);
      const key = `${date}:${kind}:${gameId || success[3]}`;
      active.delete(key);
      outcomes.set(key, at);
    }
  }
  return { active, outcomes };
}

export function mergeDataFailures(parsed, failures, date) {
  for (const row of failures) {
    if (!['MLB', 'NFL', 'NCAAF'].includes(row.league)) continue;
    const key = `${date}:${row.kind || 'game'}:${row.game_id}`;
    if (Date.parse(parsed.outcomes.get(key)) >= Date.parse(row.last_failed_at)) continue;
    const existing = parsed.active.get(key);
    parsed.active.set(key, { key,
      title: existing?.title || `${row.league} ${row.kind || 'game'}: ${row.away_team || '?'} @ ${row.home_team || '?'}`,
      detail: failureCategory(`${row.code} ${row.error}`),
      at: existing?.at || row.first_failed_at, last_at: row.last_failed_at });
  }
  return parsed;
}

export function healthObservations(report, now = Date.now()) {
  if (!report || !Array.isArray(report.checks) || !report.checks.length
    || !Number.isFinite(Date.parse(report.checked_at)) || now - Date.parse(report.checked_at) > 15 * 60000) {
    return [{ key: 'coverage:unverified', title: 'Coverage checks unavailable', detail: 'No complete host coverage report in the last 15 minutes.' }];
  }
  return report.checks.filter(c => c.status === 'fail').map(c => ({
    key: `coverage:${c.id}`, title: `Coverage failure: ${c.id}`,
    // Avoid mailing raw provider messages; the report remains on the Mac.
    detail: 'The published data/coverage check failed. Inspect host-health-latest.json for exact missing games or data.',
  }));
}

// One incident per game, retained until a completed comparison covers it.
// A valid decision selecting zero props is healthy. No model is invoked here.
export function winnersPropsObservations(runs, date, now = Date.now()) {
  const latest = new Map();
  for (const run of [...runs].sort((a, b) => a.id - b.id)) {
    for (const c of run.input_snapshot?.candidates || []) latest.set(`${c.league}:${c.game_id}`, run);
  }
  const incidents = [];
  for (const [game, run] of latest) {
    if (run.status === 'failed' || (run.status === 'selecting' && Date.parse(run.lease_until) <= now)) {
      incidents.push({ key: `${date}:winners-props:${game}`, title: `Winners prop selection failed: ${game}`,
        detail: run.error || 'The comparison lease expired before a completed decision. No substitute pick was published.' });
    }
  }
  return incidents;
}
