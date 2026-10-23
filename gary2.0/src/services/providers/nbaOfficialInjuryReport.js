/**
 * THE NBA'S OWN INJURY REPORT (Oct 13 2026). The league posts its official injury report as a PDF every 15 minutes
 * on game days (ak-static.cms.nba.com/referee/injury/Injury-Report_YYYY-MM-DD_HH_MM(AM|PM).pdf). The paid "NBA
 * Injuries Reports" API (lapsed) copied this same report three times a day; reading it directly is free and
 * fresher. The newest report at or before now is read with `pdftotext -layout` and parsed into one row per player:
 * { gameDate, gameTime, matchup, team, player ("First Last"), status, reason }.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'https://ak-static.cms.nba.com/referee/injury';
const SLOT_MS = 15 * 60_000;
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

/** The newest official report at or before `now` (up to `lookbackHours` back). Throws when none is found. */
export async function latestOfficialReport({ now = new Date(), lookbackHours = 36, fetchImpl = fetch } = {}) {
  const start = Math.floor(now.getTime() / SLOT_MS) * SLOT_MS;
  for (let t = start; t > start - lookbackHours * 3_600_000; t -= SLOT_MS) {
    const url = reportUrlFor(new Date(t));
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
    if (!response?.ok) continue;
    const text = await pdfToText(Buffer.from(await response.arrayBuffer()));
    return { url, postedAt: new Date(t).toISOString(), ...parseOfficialReport(text) };
  }
  throw new Error(`No official NBA injury report in the last ${lookbackHours} hours`);
}
