/**
 * NO DATA, NO DARTS (founder, Nov 9 2026: "this has to be hard fail darts are broken if there is no data for gary").
 * On Sunday Nov 8 the nflverse downloads hung at 5:40 AM: all 477 lines of the list Gary names his sheets from read
 * "games not on file (the weekly stats did not load)", the sheets had no schedule and no snap counts, and the darts were
 * thrown anyway (11-17). A league's run now stops before any ask when anything Gary would read did not load; nothing is
 * thrown, and the next scheduled run tries again on its own.
 */
export const DATA_MISSING = 'data missing, no darts thrown';

export class DartsDataMissing extends Error {
  constructor(what) {
    const list = [...new Set([].concat(what).filter(Boolean))];
    super(`${DATA_MISSING}: ${list.join('; ')}`);
    this.name = 'DartsDataMissing';
    this.what = list;
  }
}

/** A dart_runs row that stopped for missing data: the next run tries again without waiting out the hour. */
export const isDataMissingRun = (run) => run?.status === 'failed' && String(run?.error || '').startsWith(DATA_MISSING);

/**
 * Ask for each load until it answers, a few tries apart (the loaders drop a failed download, so asking again downloads
 * again). `loads` = { name: () => Promise<value> }; null, an empty list or map, and `.unavailable` are failures.
 * Returns the values by name; throws DartsDataMissing naming what never loaded.
 */
export async function loadAllOrFail(loads, { tries = 3, gapMs = 30_000, log = () => {} } = {}) {
  const loaded = (v) => v != null && !v.unavailable && (v.size ?? v.length ?? v.rows?.length ?? 1) > 0;
  const out = {};
  let pending = Object.keys(loads);
  for (let attempt = 1; pending.length; attempt++) {
    const got = await Promise.all(pending.map((name) => Promise.resolve().then(loads[name]).catch(() => null)));
    pending = pending.filter((name, i) => { if (loaded(got[i])) { out[name] = got[i]; return false; } return true; });
    if (!pending.length) break;
    if (attempt >= tries) throw new DartsDataMissing(pending.map((name) => `${name} did not load`));
    log(`data: ${pending.join(', ')} did not load, try ${attempt} of ${tries}; trying again`);
    await new Promise((done) => setTimeout(done, gapMs));
  }
  return out;
}

/**
 * Every failed load said anywhere in what Gary would read: the list lines, the sheets, the notes and the game frames.
 * The boards say a failed feed in words ("... did not load"); one such line anywhere stops the league's throw.
 */
export function failedLoads({ screens = [], blocks = new Map(), skip = [] } = {}) {
  const found = new Set();
  // `skip`: text a desk wrote in its own words (the day's news), which is not a feed's failure line.
  const written = skip.filter((t) => typeof t === 'string' && t.length);
  const scan = (text) => {
    for (const m of String(text || '').matchAll(/[^().;·\n]*did not load[^().;·\n]*/gi)) found.add(m[0].trim().slice(0, 140));
  };
  for (const s of screens) {
    scan(s?.note);
    for (const m of s?.menu || []) { scan(m.line); scan(m.sheet); }
  }
  for (const block of blocks.values()) scan(written.reduce((text, t) => text.split(t).join(''), String(block || '')));
  return [...found];
}
