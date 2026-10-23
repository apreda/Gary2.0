/**
 * THE NBA'S OWN INJURY REPORT (Oct 13 2026). The league posts its official injury report as a PDF every 15 minutes
 * on game days (ak-static.cms.nba.com/referee/injury/Injury-Report_YYYY-MM-DD_HH_MM(AM|PM).pdf). The paid "NBA
 * Injuries Reports" API (lapsed) copied this same report three times a day; reading it directly is free and
 * fresher. The newest report at or before now is read with `pdftotext -layout` and parsed into one row per player:
 * { gameDate, gameTime, matchup, team, player ("First Last"), status, reason }.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'https://ak-static.cms.nba.com/referee/injury';
const SLOT_MS = 15 * 60_000;
const HOUR_MS = 60 * 60_000;
// A posted report never changes, so each one read (or a slot found empty an hour after it passed) is kept on disk: a
// story's look back through the day's reports then asks the league's CDN once per report for the whole slate (Oct 23
// 2026; on Oct 19 the CDN blocked this host after a few hundred probes).
const CACHE_DIR = process.env.GARY_NBA_IR_CACHE_DIR || join(tmpdir(), 'gary-nba-injury-reports-v1');
const cacheOn = () => !process.env.VITEST || Boolean(process.env.GARY_NBA_IR_CACHE_DIR);
const STATUSES = ['Out', 'Doubtful', 'Questionable', 'Probable', 'Available'];

/** The report URL for an instant, on the quarter hour, in Eastern time. */
export function reportUrlFor(instant) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }).formatToParts(instant).map((p) => [p.type, p.value]));
  const minute = String(Math.floor(Number(parts.minute) / 15) * 15).padStart(2, '0');
  return `${BASE}/Injury-Report_${parts.year}-${parts.month}-${parts.day}_${parts.hour}_${minute}${String(parts.dayPeriod).toUpperCase()}.pdf`;
}

function pdfToText(buffer) {
  const dir = mkdtempSync(join(tmpdir(), 'nba-ir-'));
  const file = join(dir, 'report.pdf');
  writeFileSync(file, buffer);
  const run = (bin) => new Promise((resolve, reject) => execFile(bin, ['-layout', file, '-'], { maxBuffer: 16 * 1024 * 1024 },
    (error, stdout) => (error ? reject(error) : resolve(stdout))));
  return run('pdftotext').catch(() => run('/opt/homebrew/bin/pdftotext')).finally(() => rmSync(dir, { recursive: true, force: true }));
}

const flipName = (name) => {
  const [last, first] = String(name || '').split(/,\s*/);
  return first ? `${first.trim()} ${last.trim()}` : String(name || '').trim();
};

/**
 * Rows from the report's `pdftotext -layout` text. Columns shift from page to page (an empty date column moves
 * everything left), so a row is read by its shape: a "Last, First" name two spaces before a status word, with the
 * date, time, matchup and team carried down from the rows above. A reason that wraps prints above and below its
 * row, so rows are blank-line blocks; a block with no row (a page break) continues the previous row's reason.
 */
const ROW = new RegExp(String.raw`^\s*(?:(\d{2}/\d{2}/\d{4})\s+)?(?:(\d{1,2}:\d{2}\s*\(ET\))\s+)?(?:([A-Z]{2,3}@[A-Z]{2,3})\s+)?`
  + String.raw`(?:(\S.*?)\s{2,})?([^\s,][^,]*?,\s*\S.*?)\s{2,}(${STATUSES.join('|')})(?:\s{2,}(.*))?$`);
const NOT_SUBMITTED = /^\s*(?:(\d{2}\/\d{2}\/\d{4})\s+)?(?:(\d{1,2}:\d{2}\s*\(ET\))\s+)?(?:([A-Z]{2,3}@[A-Z]{2,3})\s+)?(\S.*?)\s{2,}NOT YET SUBMITTED/;

export function parseOfficialReport(text) {
  const rows = [];
  const notSubmitted = [];
  let carry = { gameDate: null, gameTime: null, matchup: null, team: null };
  const lines = String(text || '').replace(/\f/g, '\n\n').split('\n')
    .filter((l) => !/Injury Report:|^\s*Page \d+ of \d+|Game Date\s+Game Time/.test(l));
  const blocks = [];
  let block = [];
  for (const line of lines) {
    if (!line.trim()) { if (block.length) blocks.push(block); block = []; } else block.push(line);
  }
  if (block.length) blocks.push(block);
  for (const b of blocks) {
    const at = b.findIndex((l) => ROW.test(l) || NOT_SUBMITTED.test(l));
    if (at < 0) {   // a reason continued past a page break
      if (rows.length) rows[rows.length - 1].reason = `${rows[rows.length - 1].reason} ${b.map((l) => l.trim()).join(' ')}`.trim();
      continue;
    }
    const ns = b[at].match(NOT_SUBMITTED);
    if (ns && !ROW.test(b[at])) {
      carry = { gameDate: ns[1] || carry.gameDate, gameTime: ns[2] || carry.gameTime, matchup: ns[3] || carry.matchup, team: ns[4] || carry.team };
      notSubmitted.push({ ...carry });
      continue;
    }
    const m = b[at].match(ROW);
    carry = { gameDate: m[1] || carry.gameDate, gameTime: m[2] || carry.gameTime, matchup: m[3] || carry.matchup, team: m[4] || carry.team };
    const reason = [...b.slice(0, at).map((l) => l.trim()), m[7] || '', ...b.slice(at + 1).map((l) => l.trim())]
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    rows.push({ ...carry, player: flipName(m[5]), status: m[6], reason });
  }
  return { rows, notSubmitted };
}

/** The report posted at one quarter-hour slot: { url, postedAt, rows, notSubmitted }, or { url, missing: true }. */
async function reportAtSlot(t, fetchImpl = fetch) {
  const url = reportUrlFor(new Date(t));
  const file = join(CACHE_DIR, url.split('/').pop().replace(/\.pdf$/, '.json'));
  if (cacheOn()) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { /* not read yet */ } }
  // Each request gets 20 s, and a network failure stops the search at once: on a dead connection the reader asked
  // for every quarter hour of a day and a half (Oct 23 2026 source audit).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let response;
  try {
    response = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 (GaryAI injury reader)' }, signal: controller.signal });
  } catch (error) {
    throw new Error(`Official NBA injury report unreachable (${error.name === 'AbortError' ? 'timed out after 20 s' : error.message})`);
  } finally {
    clearTimeout(timer);
  }
  // A 403 is the CDN refusing this client (Oct 19 2026: Akamai blocked the host after a few hundred probes), not a
  // slot with no report: stop at once instead of asking for every quarter hour of the day and a half.
  if (response?.status === 403) throw new Error('Official NBA injury report blocked (403) by the CDN');
  const value = response?.ok
    ? { url, postedAt: new Date(t).toISOString(), ...parseOfficialReport(await pdfToText(Buffer.from(await response.arrayBuffer()))) }
    : { url, missing: true };
  if (cacheOn() && (!value.missing || Date.now() - t > HOUR_MS)) {
    try { mkdirSync(CACHE_DIR, { recursive: true }); writeFileSync(file, JSON.stringify(value)); } catch { /* the next read asks again */ }
  }
  return value;
}

/** The newest official report at or before `now` (up to `lookbackHours` back). Throws when none is found. */
export async function latestOfficialReport({ now = new Date(), lookbackHours = 36, fetchImpl = fetch } = {}) {
  const start = Math.floor(now.getTime() / SLOT_MS) * SLOT_MS;
  for (let t = start; t > start - lookbackHours * 3_600_000; t -= SLOT_MS) {
    const report = await reportAtSlot(t, fetchImpl);
    if (!report.missing) return report;
  }
  throw new Error(`No official NBA injury report in the last ${lookbackHours} hours`);
}

// Teams by nickname ("Cleveland Cavaliers", "LA Clippers" / "Los Angeles Clippers" -> "cavaliers", "clippers"), players
// by letters only ("Kel'el Ware", "Nikola Jokić").
const teamKey = (name) => String(name || '').trim().split(/\s+/).pop().toLowerCase();
export const playerKey = (name) => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\b(?:jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');

/**
 * One game's listing on a report, for each of its two teams: a Map of player key -> { name, status, reason }, or
 * 'unfiled' when that team had not filed for the game yet (marked NOT YET SUBMITTED, or the game not on the report).
 * A team with no rows while the other team's are there filed with nobody listed. `gameDate` is MM/DD/YYYY.
 */
export function gameListing(report, gameDate, home, away) {
  const of = (team) => {
    const rows = (report?.rows || []).filter((r) => r.gameDate === gameDate && teamKey(r.team) === teamKey(team));
    const unfiled = (report?.notSubmitted || []).some((r) => r.gameDate === gameDate && teamKey(r.team) === teamKey(team));
    return { rows, unfiled };
  };
  const h = of(home), a = of(away);
  const onReport = h.rows.length || a.rows.length || h.unfiled || a.unfiled;
  const side = (s) => (s.unfiled || !onReport ? 'unfiled' : new Map(s.rows.map((r) => [playerKey(r.player), { name: r.player, status: r.status, reason: r.reason }])));
  return { [home]: side(h), [away]: side(a) };
}

/**
 * When each player on a game's report at `anchorAt` was first listed for that game, and how his status went since
 * (Oct 23 2026 data audit: Jarrett Allen first appeared on the 5:00 PM report and the line moved at 5:11; nothing said
 * when a listing came out). Walks back one report an hour (on the hour, so a whole slate shares them) until every
 * player's run of listings ends, then narrows each change to its quarter hour. Returns Map(player key -> { firstAt,
 * teamFirst (his first listing was his team's first report for the game), openEnded (still listed `maxHours` back),
 * statuses: [{ status, from }] }).
 */
export async function listingHistory({ anchorAt, gameDate, home, away, maxHours = 48, fetchImpl = fetch } = {}) {
  const anchorT = Date.parse(anchorAt);
  const anchor = await reportAtSlot(anchorT, fetchImpl);
  if (anchor.missing) throw new Error(`no official report at ${anchorAt}`);
  const valueAt = (report, team, key) => {
    const side = gameListing(report, gameDate, home, away)[team];
    return side === 'unfiled' ? 'unfiled' : side.get(key)?.status || null;
  };
  const tracked = [home, away].flatMap((team) => {
    const side = gameListing(anchor, gameDate, home, away)[team];
    return side === 'unfiled' ? [] : [...side.keys()].map((key) => ({ team, key }));
  });
  const seq = [{ t: anchorT, report: anchor }];
  const open = new Set(tracked.map((p) => `${p.team}|${p.key}`));
  for (let t = Math.floor((anchorT - 1) / HOUR_MS) * HOUR_MS; open.size && anchorT - t <= maxHours * HOUR_MS; t -= HOUR_MS) {
    const report = await reportAtSlot(t, fetchImpl);
    if (report.missing) continue;
    seq.unshift({ t, report });
    for (const p of tracked) if (open.has(`${p.team}|${p.key}`) && !STATUSES.includes(valueAt(report, p.team, p.key))) open.delete(`${p.team}|${p.key}`);
  }
  // The first quarter-hour slot after `lo` whose value matches the one at `hi` (the two differ). A slot with no report
  // counts as before the change.
  const narrow = async (lo, hi, value, want) => {
    while (hi.t - lo.t > SLOT_MS) {
      const t = lo.t + Math.floor((hi.t - lo.t) / SLOT_MS / 2) * SLOT_MS;
      const report = await reportAtSlot(t, fetchImpl);
      if (!report.missing && value(report) === want) hi = { t, v: want }; else lo = { t, v: report.missing ? lo.v : value(report) };
    }
    return { at: hi.t, before: lo.v };
  };
  const out = new Map();
  for (const p of tracked) {
    const value = (report) => valueAt(report, p.team, p.key);
    const values = seq.map((s) => value(s.report));
    let s = values.length - 1;
    while (s > 0 && STATUSES.includes(values[s - 1])) s -= 1;
    let firstAt = seq[s].t, teamFirst = false;
    const openEnded = s === 0 && STATUSES.includes(values[0]);
    if (s > 0) {
      const found = await narrow({ t: seq[s - 1].t, v: values[s - 1] }, { t: seq[s].t, v: values[s] }, (r) => (STATUSES.includes(value(r)) ? 'listed' : value(r)), 'listed');
      firstAt = found.at; teamFirst = found.before === 'unfiled';
    }
    const statuses = [{ status: values[s], from: new Date(firstAt).toISOString() }];
    for (let k = s + 1; k < values.length; k++) {
      if (values[k] === values[k - 1]) continue;
      const found = await narrow({ t: seq[k - 1].t, v: values[k - 1] }, { t: seq[k].t, v: values[k] }, value, values[k]);
      statuses.push({ status: values[k], from: new Date(found.at).toISOString() });
    }
    out.set(p.key, { team: p.team, firstAt: new Date(firstAt).toISOString(), teamFirst, openEnded, statuses });
  }
  return out;
}
