#!/usr/bin/env node
/**
 * WINNERS REASON LABELS (Nov 5 2026, founder: "properly integrate this label idea for results coming on nov 23", then
 * "we just labeling if its apart of garys reasoning or not"). One yes/no fact about each Winners game bet: is comparing
 * tonight's two teams through a shared opponent part of Gary's reasoning for the pick? It answers what a Winners filter
 * on that reasoning would have done, without running one.
 *
 * It reads and records only: nothing here reaches Gary, a pick, or the Winners board. It does not say whether the
 * reasoning is good. The reader (Opus only, founder Nov 5 2026: "we trust Opus 5.5"; no tools, no web) sees the write-up
 * and never a score or a result, so the label can't lean on the outcome. A quote that isn't in the write-up gets one more
 * try, then is flagged.
 *
 *   node scripts/run-winners-reason-labels.js                 # label what's due; from Nov 23, write the report (safe to rerun)
 *   node scripts/run-winners-reason-labels.js --calibrate --from 2026-10-27 --to 2026-11-04 [--extra "nba/2026-11-04_Heat_at_Clippers"]
 *   node scripts/run-winners-reason-labels.js --report
 *
 * No schedule: it runs once on or after Nov 23, when the founder opens the review. The reads stay on disk, and the reader
 * never sees a result, so labeling them all at once is as blind as labeling them daily.
 * Files: ~/Library/Logs/Gary2.0/winners-labels/ labels.json, calibration.json, calibration.md, report-2026-11-23.md
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
await import('../src/loadEnv.js');
const { supabaseAdmin: db } = await import('../src/supabaseClient.js');
const { createModelSession, sendToSessionWithRetry } = await import('../src/services/gary/agentic/orchestrator/sessionManager.js');
const { readWinnersBook } = await import('./winners-book.js');

const START = '2026-11-05', END = '2026-11-22', REPORT_ON = '2026-11-23';
const LEAGUES = { NFL: 'nfl', NBA: 'nba', NCAAF: 'ncaaf' };
const DIR = `${homedir()}/Library/Logs/Gary2.0/winners-labels`; mkdirSync(DIR, { recursive: true });
const LABELS = `${DIR}/labels.json`, CALIBRATION = `${DIR}/calibration.json`, REPORT = `${DIR}/report-${REPORT_ON}.md`;
const READER = { modelName: 'claude-opus-5-5', routePinned: true, thinkingLevel: 'medium' };
const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const args = (name) => process.argv.flatMap((a, i) => (a === name ? [process.argv[i + 1]] : []));
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {});
const writeJson = (path, value) => { writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 1)); renameSync(`${path}.tmp`, path); };

const SYSTEM = `You label one narrow fact in a sports bettor's write-up. You do not judge whether the reasoning or the pick is good. Use only the text you are given.`;

const prompt = (bet, text) => `THE PICK: ${bet.pick}
TONIGHT'S TWO TEAMS: ${bet.away} and ${bet.home}

THE WRITE-UP
${text}

THE QUESTION
Is a shared-opponent comparison part of his reasoning for this pick?

A shared-opponent comparison sets how tonight's two teams each did against the same third team side by side, to say something about tonight's game. It can use any measure: margins, scores, yards, rushing. It doesn't need the words "common opponent". These all count, where A and B are tonight's teams and C is a third team:
- "Against C, A lost by 8 and B lost by 21."
- "The same C team that beat A by 5 beat B by 21."
- "The C comparison favors them."
- A table of how A and B each did against C.

Pick one role:
- "for_the_pick": he uses the comparison to support his pick. This holds if it's a small point, if he adds caveats or adjusts for who played, or if it only supports the size of the number.
- "against_the_pick": it appears only as a point against his pick, such as in a list of risks.
- "set_aside": he brings it up and says it doesn't count, it's a wash, or he isn't using it.
- "absent": no shared-opponent comparison appears. These are not one: a past meeting between tonight's two teams; one team's result against some opponent with no result for the other team against that same opponent; a mention of how strong a team's opponents have been; the same team's games compared with each other.

End with this JSON block and nothing after it. "quote" is the comparison in his exact words, copied character for character, and is empty only when the role is "absent".
\`\`\`json
{"role": "for_the_pick|against_the_pick|set_aside|absent", "quote": ""}
\`\`\``;

const ROLES = new Set(['for_the_pick', 'against_the_pick', 'set_aside', 'absent']);
const flat = (s) => String(s || '').replace(/[*_`#|]/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

function parseAnswer(text) {
  const blocks = [...String(text || '').matchAll(/```json\s*([\s\S]*?)```/g)];
  try { const v = JSON.parse(blocks.at(-1)?.[1] || ''); return ROLES.has(v?.role) ? v : null; } catch { return null; }
}

async function askReader(bet, text) {
  let last = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const session = await createModelSession({ ...READER, systemPrompt: SYSTEM, tools: null, browse: false, enableCache: false });
    const reply = await sendToSessionWithRetry(session, prompt(bet, text));
    const answer = parseAnswer(reply?.content);
    if (!answer) { last = { error: 'no readable answer' }; continue; }
    const quoteOk = answer.role === 'absent' ? !flat(answer.quote) : Boolean(flat(answer.quote)) && flat(text).includes(flat(answer.quote));
    last = { role: answer.role, part_of_reasoning: answer.role === 'for_the_pick', quote: answer.quote || '', quote_ok: quoteOk, model: READER.modelName };
    if (quoteOk) break;
  }
  return last;
}

async function labelBet(bet) {
  const answer = await askReader(bet, bet.text).catch((e) => ({ error: e.message }));
  const { text, ...kept } = bet;
  const read = answer && !answer.error;
  return { ...kept, ...answer, status: read ? 'read' : 'unread', part_of_reasoning: read ? answer.part_of_reasoning : null, labeled_at: new Date().toISOString() };
}

const section = (text, name) => { const m = text.match(new RegExp(`########## ${name}\\n([\\s\\S]*?)(?=\\n\\n########## |$)`)); return m ? m[1].trim() : null; };
const lastWord = (team) => String(team || '').trim().split(/\s+/).pop();

/** The read for this game: the file whose game line names both teams, or failing that its file name. */
function findRead(league, date, away, home) {
  const folder = `${homedir()}/Library/Logs/gary-${LEAGUES[league]}-read`;
  if (!existsSync(folder)) return null;
  const files = readdirSync(folder).filter((f) => f.startsWith(`${date}_`) && f.endsWith('.md'));
  const named = files.find((f) => f === `${date}_${lastWord(away)}_at_${lastWord(home)}.md`);
  for (const f of named ? [named, ...files] : files) {
    const full = readFileSync(`${folder}/${f}`, 'utf8');
    const gameLine = (section(full, 'ASKED')?.match(/^## THE GAME\s*\n+(.+)$/m) || [])[1] || '';
    if (f === named || (gameLine.includes(away) && gameLine.includes(home))) return { file: `${folder}/${f}`, text: section(full, 'ANSWERED') };
  }
  return null;
}

async function boardBets(from, to) {
  const { data, error } = await db.from('winners_board').select('game_date,league,game_id,pick_snapshot,scratched_at')
    .eq('kind', 'game').in('league', Object.keys(LEAGUES)).gte('game_date', from).lte('game_date', to).is('scratched_at', null);
  if (error) throw new Error(`winners_board: ${error.message}`);
  return (data || []).map((r) => {
    const s = r.pick_snapshot || {};
    const read = findRead(r.league, r.game_date, s.awayTeam, s.homeTeam);
    const text = read?.text || s.rationale || '';
    return { key: `${r.league}|${r.game_id}|${s.pick}`, game_date: r.game_date, league: r.league, game_id: String(r.game_id), pick: s.pick, away: s.awayTeam, home: s.homeTeam,
      read_file: read?.file || null, source: read?.text ? 'read' : s.rationale ? 'pick rationale' : 'none', text };
  });
}

function extraBet(spec) {
  const [slug, name] = spec.split('/');
  const league = Object.keys(LEAGUES).find((l) => LEAGUES[l] === slug);
  const file = `${homedir()}/Library/Logs/gary-${slug}-read/${name}.md`;
  const full = readFileSync(file, 'utf8');
  const [away, home] = ((section(full, 'ASKED')?.match(/^## THE GAME\s*\n+(.+)$/m) || [])[1] || '').split(' @ ').map((x) => x?.trim());
  const text = section(full, 'ANSWERED') || '';
  const pick = (text.match(/^.*[+-]\d+(?:\.\d)?.*$/m) || [''])[0].replace(/[#*]/g, '').trim().slice(0, 80);
  return { key: `extra|${name}`, game_date: name.slice(0, 10), league, game_id: name, pick: pick || 'see the write-up', away, home, read_file: file, source: 'read', text, extra: true };
}

async function pool(items, size, work) {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (next < items.length) { const i = next++; await work(items[i], i); } }));
}

async function runLabels(bets, path) {
  const labels = readJson(path);
  const due = bets.filter((b) => labels[b.key]?.status !== 'read' && b.text);
  console.log(`[labels] ${bets.length} bets, ${due.length} to read`);
  await pool(due, 3, async (bet) => {
    const row = await labelBet(bet);
    labels[bet.key] = row;
    writeJson(path, labels);
    console.log(`[labels] ${row.game_date} ${row.league} ${row.pick} | ${row.role || row.error}`);
  });
  for (const b of bets.filter((x) => !x.text)) console.warn(`[labels] nothing to read for ${b.key}`);
  return labels;
}

function calibrationReport(labels) {
  const rows = Object.values(labels).sort((a, b) => a.game_date.localeCompare(b.game_date));
  const read = rows.filter((r) => r.status === 'read');
  const lines = ['# Winners reason labels: calibration', '',
    `${rows.length} past bets and known cases, with no results shown. These don't count toward the Nov 5-22 numbers.`,
    `Part of his reasoning: ${read.filter((r) => r.part_of_reasoning).length}. Not part: ${read.filter((r) => !r.part_of_reasoning).length}. Unread: ${rows.length - read.length}.`, ''];
  for (const r of rows) lines.push(`- ${r.game_date} ${r.league} ${r.away} @ ${r.home} · ${r.pick}${r.extra ? ' (known case)' : ''}: ${r.role || r.error}${r.quote ? ` · "${r.quote.replace(/\s+/g, ' ').slice(0, 280)}"` : ''}${r.quote_ok === false ? ' · QUOTE NOT FOUND' : ''}`);
  writeFileSync(`${DIR}/calibration.md`, `${lines.join('\n')}\n`);
  console.log(`[labels] ${lines[3]}\n[labels] ${DIR}/calibration.md`);
}

/** Two-sided Fisher exact test on wins and losses, for how often a gap this size shows up by chance. */
function fisher(a, b, c, d) {
  const lf = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
  const p = (x) => Math.exp(lf(a + b) + lf(c + d) + lf(a + c) + lf(b + d) - lf(a + b + c + d) - lf(x) - lf(a + b - x) - lf(a + c - x) - lf(d - a + x));
  const seen = p(a); let sum = 0;
  for (let x = Math.max(0, a - d); x <= Math.min(a + b, a + c); x++) { const q = p(x); if (q <= seen * (1 + 1e-9)) sum += q; }
  return Math.min(1, sum);
}

const sign = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
function tally(rows) {
  const won = rows.filter((r) => r.result === 'won').length, lost = rows.filter((r) => r.result === 'lost').length, other = rows.filter((r) => r.result && !['won', 'lost'].includes(r.result)).length, open = rows.filter((r) => !r.result).length;
  return { won, lost, other, open, units: rows.reduce((s, r) => s + (r.units || 0), 0), text: `${won}-${lost}${other ? `, ${other} push or void` : ''}${open ? `, ${open} ungraded` : ''}` };
}

async function writeReport() {
  const labels = readJson(LABELS);
  const bets = await boardBets(START, END);
  const book = await readWinnersBook(db, { since: START, until: END });
  const graded = new Map(book.filter((r) => r.kind === 'game' && r.published).map((r) => [`${r.league}|${r.game_id}`, r]));
  const rows = bets.map((b) => ({ ...b, ...(labels[b.key] || { status: 'unread' }), result: graded.get(`${b.league}|${b.game_id}`)?.result || null, units: graded.get(`${b.league}|${b.game_id}`)?.units ?? null }));
  const yes = rows.filter((r) => r.status === 'read' && r.part_of_reasoning), no = rows.filter((r) => r.status === 'read' && !r.part_of_reasoning);
  const unread = rows.filter((r) => r.status !== 'read');
  const [Y, N] = [tally(yes), tally(no)];
  const chance = Y.won + Y.lost && N.won + N.lost ? fisher(Y.won, Y.lost, N.won, N.lost) : null;
  const row = (name, t, n) => `| ${name} | ${n} | ${t.text} | ${sign(t.units)} |`;
  const lines = [`# Winners reason labels: results, ${START} to ${END}`, '',
    `Written ${today}. Winners and Gary were not changed by any of this. The reader saw no results. Units are 1 risked per bet at its recorded price.`, '',
    '| Shared-opponent comparison in his reasoning | Bets | Record | Units |', '|---|---|---|---|',
    row('Yes', Y, yes.length), row('No', N, no.length), ...(unread.length ? [row('Not read', tally(unread), unread.length)] : []), '',
    chance === null ? 'Too few graded bets on one side to compare.' : `If this reasoning made no difference, a gap this size would still show up by chance about ${Math.max(1, Math.round(chance * 100))} times in 100. Small counts: this can't prove a cause.`, '',
    `What a filter on "Yes" would have done: pulled ${yes.length} bets (${Y.text}, ${sign(Y.units)} units) and left ${rows.length - yes.length} (${tally(rows.filter((r) => !yes.includes(r))).text}, ${sign(tally(rows.filter((r) => !yes.includes(r))).units)} units).`, '',
    '## By sport', '', 'College: the founder counts this as a fair way to judge teams on very different schedules (Nov 5 2026), so a yes there is not a flaw.', '', '| Sport | Yes | No |', '|---|---|---|'];
  for (const l of Object.keys(LEAGUES)) lines.push(`| ${l} | ${tally(yes.filter((r) => r.league === l)).text} | ${tally(no.filter((r) => r.league === l)).text} |`);
  const list = (title, set) => { lines.push('', `## ${title} (${set.length})`, ''); for (const r of set.sort((a, b) => a.game_date.localeCompare(b.game_date))) lines.push(`- ${r.game_date} ${r.league} ${r.pick}: ${r.result || 'ungraded'}${r.quote ? ` · "${r.quote.replace(/\s+/g, ' ').slice(0, 240)}"` : ''}${r.quote_ok === false ? ' · QUOTE NOT FOUND' : ''}`); };
  list('Yes', yes);
  lines.push('', `## No (${no.length})`, '', no.sort((a, b) => a.game_date.localeCompare(b.game_date)).map((r) => `${r.game_date} ${r.league} ${r.pick}: ${r.result || 'ungraded'}`).join('\n'));
  if (unread.length) { lines.push('', `## Not read (${unread.length})`, '', unread.map((r) => `${r.game_date} ${r.league} ${r.pick}`).join('\n')); }
  writeFileSync(REPORT, `${lines.join('\n')}\n`);
  const open = rows.filter((r) => !r.result).length;
  console.log(`[labels] report ${REPORT}: ${rows.length} bets, ${open} ungraded`);
  return open;
}

if (process.argv.includes('--calibrate')) {
  const bets = [...await boardBets(arg('--from') || '2026-10-27', arg('--to') || '2026-11-04'), ...args('--extra').map(extraBet)];
  calibrationReport(await runLabels(bets, CALIBRATION));
  process.exit(0);
}
if (process.argv.includes('--report')) { await writeReport(); process.exit(0); }

const yesterday = new Date(Date.now() - 24 * 3600_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const through = yesterday < END ? yesterday : END;
if (through >= START) await runLabels(await boardBets(START, through), LABELS);
if (today >= REPORT_ON) await writeReport();
process.exit(0);
