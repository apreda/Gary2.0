#!/usr/bin/env node
// Independent Fantasy publication. It runs on quiet league days too, outside
// the general Hub row caps, and never starts a game-pick run.
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchBdlPages } from '../src/services/bdlPagination.js';
import { waitForBdlRequestSlot } from '../src/services/bdlRequestGate.js';
import { etDateStr, gameLabel, shiftDateStr } from '../src/services/insights/shared.js';
import { canReuseFantasyBriefing, createFantasyStatusReader, createFantasyStorage, fantasyPartition, validateFantasyPublication } from '../src/services/insights/fantasyStorage.js';
import { acquireFantasyRunLock } from './lib/fantasyRunLock.js';

export function parseFantasyArgs(args, today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })) {
  const flags = { date: today, league: 'MLB', dryRun: false, factsOnly: false, force: false, output: null, timeoutMs: 540_000 };
  for (let i = 0; i < args.length; i++) {
    const [flag, ...inline] = args[i].split('=');
    if (['--dry-run', '--facts-only', '--force'].includes(flag)) {
      if (inline.length) throw new Error(`${flag} takes no value`);
      flags[flag === '--dry-run' ? 'dryRun' : flag === '--facts-only' ? 'factsOnly' : 'force'] = true;
      continue;
    }
    if (!['--date', '--league', '--output', '--timeout-ms'].includes(flag)) throw new Error(`Unknown Fantasy argument: ${flag}`);
    const value = inline.length ? inline.join('=') : args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--timeout-ms') {
      const ms = Number(value);
      if (!Number.isInteger(ms) || ms < 1000 || ms > 540_000) throw new Error('Fantasy timeout must be 1000 to 540000 milliseconds');
      flags.timeoutMs = ms;
    } else flags[flag.slice(2)] = value;
  }
  Object.assign(flags, fantasyPartition(flags.date, flags.league));
  return flags;
}

/** A strict endpoint reader: the shared display helper intentionally turns
 * outages into [], which cannot establish a healthy empty Fantasy slate. */
export function createMlbFantasyDayReader({ client, apiKey, waitForSlot = waitForBdlRequestSlot }) {
  if (!client || !apiKey) throw new Error('MLB Fantasy requires the existing Ball Don\'t Lie connection');
  return (date, { signal } = {}) => fetchBdlPages(async cursor => {
    signal?.throwIfAborted();
    await waitForSlot(`fantasy_mlb_schedule_${date}`, { signal });
    const { data } = await client({
      method: 'GET', url: 'https://api.balldontlie.io/mlb/v1/games',
      headers: { Authorization: apiKey }, timeout: 12_000, signal,
      params: { 'dates[]': date, per_page: 100, ...(cursor != null ? { cursor } : {}) },
    });
    return data;
  }, { label: `MLB Fantasy schedule ${date}`, maxPages: 5 });
}

export async function resolveMlbFantasyGames({ date, readDay, signal }) {
  fantasyPartition(date, 'MLB');
  const days = [date, shiftDateStr(date, 1)];
  const results = await Promise.all(days.map(day => readDay(day, { signal })));
  const seen = new Map();
  for (const rows of results) {
    if (!Array.isArray(rows)) throw new Error('MLB Fantasy schedule is not a complete array');
    for (const game of rows) {
      const at = Date.parse(game?.date);
      if (game?.id == null || !Number.isFinite(at)) throw new Error('MLB Fantasy schedule contains an invalid game');
      if (etDateStr(game.date) !== date) continue;
      const id = String(game.id);
      const old = seen.get(id);
      const signature = row => JSON.stringify([
        row.date, row.status, row.home_team?.id, (row.away_team ?? row.visitor_team)?.id,
      ]);
      if (old && signature(old) !== signature(game)) throw new Error(`MLB Fantasy schedule conflicts for game ${id}`);
      seen.set(id, { ...game,
        away_team: game.away_team ?? game.visitor_team,
        visitor_team: game.visitor_team ?? game.away_team,
      });
    }
  }
  signal?.throwIfAborted();
  return [...seen.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || String(a.id).localeCompare(String(b.id)));
}

/** All dependencies are explicit so fixture tests never load production env,
 * call a model, or write production data. Publication happens only at the end. */
export async function runFantasyBriefing({
  date, league = 'MLB', bdl, provider, readDay, readStatusSnapshots, buildEvidence, createBriefing, inputFingerprint,
  storage, now = () => new Date(), signal, dryRun = false, factsOnly = false, force = false,
}) {
  const partition = fantasyPartition(date, league);
  signal?.throwIfAborted();
  // A failed storage read stops before provider/model work. Dry runs need only
  // read access to the status context already shown elsewhere in the app.
  const stored = !dryRun && !factsOnly ? await storage.load({ ...partition, signal }) : null;
  const fetched = new Date(now());
  let context;
  if (partition.league === 'MLB') {
    if (typeof readStatusSnapshots !== 'function') throw new Error('MLB Fantasy requires the existing app status context reader');
    const statusSnapshots = await readStatusSnapshots({ date, signal });
    if (!Array.isArray(statusSnapshots)) throw new Error('MLB Fantasy status context is not a complete array');
    const games = await resolveMlbFantasyGames({ date, readDay, signal });
    context = { date, league: 'mlb', season: Number(date.slice(0, 4)), games, bdl, statusSnapshots, helpers: { gameLabel }, as_of: fetched.toISOString() };
  } else {
    // NFL owns regular-season week discovery inside its evidence builder.
    // Tuesday and Wednesday must not inherit a today-only baseball slate gate.
    if (!provider) throw new Error('NFL Fantasy requires its independent provider');
    context = { date, league: 'nfl', as_of: fetched.toISOString(), provider };
  }
  const evidence = await buildEvidence(context, { now: fetched, asOf: fetched.toISOString(), signal });
  signal?.throwIfAborted();
  if (factsOnly) return { status: 'facts-only', ...partition, evidence };
  if (evidence?.coverage?.complete !== true) throw new Error(`${partition.league} Fantasy evidence is incomplete; previous briefing preserved`);
  const fingerprint = inputFingerprint(evidence);
  // Recollect and regenerate before the next hourly run could overlap expiry.
  // Reusing a row never advances its original evidence/expiry timestamps.
  if (!force && canReuseFantasyBriefing(stored, { ...partition, inputFingerprint: fingerprint, now: now(), minRemainingMs: 70 * 60_000 })) {
    return { status: 'unchanged', ...partition, decisionCount: stored.payload.decisions.length, generated_at: stored.generated_at, expires_at: stored.expires_at };
  }
  const payload = await createBriefing(evidence, { now: now(), signal });
  signal?.throwIfAborted();
  validateFantasyPublication(payload);
  if (payload.date !== partition.date || payload.league !== partition.league
      || payload.input_fingerprint !== fingerprint || payload.fetched_as_of !== evidence.as_of) {
    throw new Error('Fantasy decision output does not match its source evidence');
  }
  if (Date.parse(payload.expires_at) <= new Date(now()).getTime()) throw new Error('Fantasy briefing expired during generation; previous briefing preserved');
  if (dryRun) return { status: 'dry-run', ...partition, decisionCount: payload.decisions.length, payload };
  const published = await storage.publish(payload, { signal });
  return { status: published ? 'published' : 'newer-snapshot-preserved', ...partition, decisionCount: payload.decisions.length, payload };
}

async function main() {
  // The executable is the only place production environment and provider
  // adapters are loaded. Importing the pure runner in tests has no side effects.
  await import('../src/loadEnv.js');
  const flags = parseFantasyArgs(process.argv.slice(2));
  if (flags.output) {
    // Catch a reused review filename before spending provider/model work. The
    // final exclusive write still protects a file created during this run.
    try {
      await access(resolve(flags.output));
      throw new Error('Fantasy review output already exists; choose a new output path');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const lock = acquireFantasyRunLock();
  if (!lock.acquired) {
    console.log(`[fantasy] ${flags.league} ${flags.date}: another Fantasy run owns the worker; skipped`);
    return;
  }
  const controller = new AbortController();
  const stop = () => controller.abort(new Error('Fantasy briefing cancelled'));
  const timeout = setTimeout(() => controller.abort(new Error('Fantasy briefing exceeded its runtime budget')), flags.timeoutMs);
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    const [{ default: axios }, { ballDontLieService, getApiKey }, { createFantasyBriefing, fantasyInputFingerprint }] = await Promise.all([
      import('axios'), import('../src/services/ballDontLieService.js'), import('../src/services/insights/fantasyDecision.js'),
    ]);
    const storage = flags.dryRun || flags.factsOnly ? null : createFantasyStorage({
      client: axios, supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
    let leagueInputs;
    if (flags.league === 'MLB') {
      const { buildMlbFantasyEvidence } = await import('../src/services/insights/mlbFantasyEvidence.js');
      leagueInputs = {
        bdl: ballDontLieService,
        readDay: createMlbFantasyDayReader({ client: axios, apiKey: getApiKey() }),
        readStatusSnapshots: createFantasyStatusReader({
          client: axios, supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
          readKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
            || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
        }),
        buildEvidence: buildMlbFantasyEvidence,
      };
    } else {
      const [{ createNflFantasyProvider }, { buildNflFantasyEvidence }] = await Promise.all([
        import('../src/services/insights/nflFantasyProvider.js'), import('../src/services/insights/nflFantasyEvidence.js'),
      ]);
      leagueInputs = {
        provider: createNflFantasyProvider({ client: axios, apiKey: getApiKey(), signal: controller.signal }),
        buildEvidence: buildNflFantasyEvidence,
      };
    }
    const result = await runFantasyBriefing({
      ...flags, ...leagueInputs, storage, signal: controller.signal,
      createBriefing: createFantasyBriefing, inputFingerprint: fantasyInputFingerprint,
    });
    if (flags.output) {
      const output = resolve(flags.output);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(result.payload || result.evidence || result, null, 2)}\n`, { flag: 'wx' });
      console.log(`[fantasy] review artifact: ${output}`);
    }
    console.log(`[fantasy] ${result.league} ${result.date}: ${result.status}; ${result.decisionCount ?? result.evidence?.candidates?.length ?? 0} ${flags.factsOnly ? 'candidates' : 'decisions'}`);
  } finally {
    if (!controller.signal.aborted) controller.abort(new Error('Fantasy run finished'));
    clearTimeout(timeout);
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    lock.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    // Do not serialize Axios errors: their request config contains credentials.
    console.error(`[fantasy] ${error?.message || 'Briefing failed'}`);
    process.exitCode = 1;
  });
}
