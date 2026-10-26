#!/usr/bin/env node
/**
 * THE POST-GAME DATA REVIEW (Oct 25 2026; data only from Oct 26). One question per game, after it is played: what
 * decided the game that was knowable before kickoff and never reached the data Gary read, or reached it wrong? The work
 * splits three ways (founder, Oct 26 2026: "Me and you review the reasoning the checker just needs to check the data"):
 * the read check, before kickoff, asks whether the data is right and complete; this review asks whether something that
 * mattered and could have been known missed it; Gary's reasoning is read by the founder and the session that owns the
 * pick system, never graded here. So the reviewer sees the data Gary had and not his read or his pick, and gives no
 * verdict. What decided a game is named after the fact, so only what was published before kickoff counts, and each gap
 * is checked against the source before anything is fixed (the blind grader before this one called 8 of 9 winning reads
 * and 8 of 10 losing reads unsound, about 25 findings a read either way: not a signal).
 *
 *   node scripts/run-read-review.js [--date 2026-10-24] [--league NCAAF] [--only "Ducks"] [--opus]
 * The morning schedule (com.gary.read-review, 9:30 ET) runs it with --opus for yesterday, through Nov 7.
 * Report: ~/Library/Logs/Gary2.0/data-checks/read-reviews/<date>.data[.opus].md (and .json). Reviewed games are skipped.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
await import('../src/loadEnv.js');
const { subscriptionSearch } = await import('../src/services/gary/agentic/orchestrator/subscriptionSearch.js');
const { BACKGROUND_GPT } = await import('../src/services/gary/agentic/orchestrator/subscriptionRoutes.js');

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
// Without --date, yesterday (Eastern): the morning run reviews the slate that just finished, until RUNS_UNTIL.
const yesterday = new Date(Date.now() - 24 * 3600_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const date = arg('--date') || yesterday;
const RUNS_UNTIL = '2026-11-07';
if (!arg('--date') && date > RUNS_UNTIL) { console.log(`Read review: the loop ended ${RUNS_UNTIL}; unload com.gary.read-review`); process.exit(0); }
const only = arg('--only');
const LEAGUES = Object.fromEntries(Object.entries({ ncaaf: 'NCAAF', nba: 'NBA', nfl: 'NFL' }).filter(([, l]) => !arg('--league') || l === arg('--league')));
// --opus: the reviewer is Opus (founder, Oct 25 2026: "run this on opus too ... I don't trust chat gpt as much").
// Opus draws on the same weekly Claude limit as Gary's picks.
const opus = process.argv.includes('--opus');
const dir = `${homedir()}/Library/Logs/Gary2.0/data-checks/read-reviews`; mkdirSync(dir, { recursive: true });
const base = `${dir}/${date}.data${opus ? '.opus' : ''}`;
const jsonPath = `${base}.json`;
const done = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : [];

const part = (text, name) => { const m = text.match(new RegExp(`########## ${name}\\n([\\s\\S]*?)(?=\\n\\n########## |$)`)); return m ? m[1].trim() : null; };

/** The day's games: the data Gary read for each, one transcript per game per league. */
function reads() {
  const out = [];
  for (const [slug, league] of Object.entries(LEAGUES)) {
    const folder = `${homedir()}/Library/Logs/gary-${slug}-read`;
    if (!existsSync(folder)) continue;
    for (const file of readdirSync(folder).filter((f) => f.startsWith(`${date}_`) && f.endsWith('.md'))) {
      if (only && !file.includes(only)) continue;
      const asked = part(readFileSync(`${folder}/${file}`, 'utf8'), 'ASKED');
      if (!asked) continue;
      const matchup = (asked.match(/^## THE GAME\s*\n+(.+)$/m) || [])[1]?.trim() || file;
      const kickoff = (asked.match(/^## THE GAME\s*\n+.+\n(.+)$/m) || [])[1]?.trim() || '';
      out.push({ league, file, matchup, kickoff, asked });
    }
  }
  return out;
}

const prompt = (r) => `Below is the pre-game data a sports bettor read for ${r.league} ${r.matchup} (${r.kickoff}). You are checking the data, not anyone's pick: there is no pick here.

Search the final score, box score, recaps and post-game reporting for this game, and the reporting published before kickoff.

Answer:
1. The final score.
2. What decided the game: the two or three things that made the result, with the evidence.
3. For each: was it knowable before kickoff (published before kickoff: say where and when), and was it in the data below (quote the line), missing, or in it wrong?

Name only what decided this game. Something that came up during the game (an in-game injury, a fluke play) is not knowable before kickoff; say so. Be specific and short.

THE DATA
${r.asked}

End with this JSON block and nothing after it:
\`\`\`json
{"final": "score", "decided_by": [{"what": "", "evidence": "", "knowable_pre": true, "published": "where and when", "in_data": "yes|missing|wrong", "data_line": ""}], "summary": "one sentence"}
\`\`\``;

function parse(text) {
  const blocks = [...String(text || '').matchAll(/```json\s*([\s\S]*?)```/g)];
  try { return JSON.parse(blocks.at(-1)?.[1] || ''); } catch { return null; }
}

async function review(r) {
  const t0 = Date.now();
  const res = await subscriptionSearch(prompt(r), { model: opus ? 'claude-opus-5-5' : BACKGROUND_GPT, tier: opus ? 'heavy' : 'light', effort: 'high', timeoutMs: 15 * 60 * 1000, maxTokens: 8000, freshnessHours: 8 * 24 });
  const text = typeof res?.data === 'string' ? res.data : res?.data?.text || res?.data?.content || (res?.data ? JSON.stringify(res.data) : '');
  return { league: r.league, file: r.file, matchup: r.matchup, ok: Boolean(res?.success), model: res?.model || res?.route || null, review: parse(text), error: res?.success ? null : res?.error, secs: Math.round((Date.now() - t0) / 1000) };
}

// A gap: knowable before kickoff, and missing from the data or in it wrong. To verify against the source before a fix.
const gapsOf = (v) => (v?.decided_by || []).filter((d) => d.knowable_pre && d.in_data !== 'yes');
function report(rows) {
  const ok = rows.filter((r) => r.review);
  const gaps = ok.reduce((a, r) => a + gapsOf(r.review).length, 0);
  const lines = [`# Post-game data review, ${date}${opus ? ' (Opus)' : ''}`, '',
    `${rows.length} games · ${gaps} gap${gaps === 1 ? '' : 's'} (knowable before kickoff, missing from the data or wrong in it) · ${rows.length - ok.length} unreviewed`,
    'Each gap is checked against the source before anything is fixed. Reasoning is not reviewed here.', ''];
  for (const r of rows) {
    const v = r.review;
    lines.push(`## ${r.league} · ${r.matchup}${v ? ` · ${v.final}` : ''}`);
    if (!v) { lines.push(`Unreviewed: ${r.error || 'no JSON'}`, ''); continue; }
    if (v.summary) lines.push(v.summary);
    for (const d of v.decided_by || []) {
      const tag = !d.knowable_pre ? 'not knowable before kickoff' : d.in_data === 'yes' ? 'in the data' : d.in_data === 'wrong' ? 'GAP: in the data wrong' : 'GAP: missing from the data';
      lines.push(`- [${tag}] ${d.what}${d.published && d.knowable_pre ? ` (published: ${d.published})` : ''}${d.data_line ? ` · data: "${d.data_line}"` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

const todo = reads().filter((r) => !done.some((d) => d.file === r.file && d.review));
console.log(`Post-game data review ${date}: ${todo.length} game(s) to review`);
const rows = done.filter((d) => !todo.some((r) => r.file === d.file));
let i = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (i < todo.length) {
    const r = todo[i++];
    try { rows.push(await review(r)); } catch (e) { rows.push({ league: r.league, file: r.file, matchup: r.matchup, error: e.message }); }
    const x = rows[rows.length - 1];
    console.log(`  ${x.league} ${x.matchup}: ${x.review ? `${gapsOf(x.review).length} gap(s)` : `unreviewed (${x.error || 'no JSON'})`}${x.secs ? ` ${x.secs}s` : ''}`);
    writeFileSync(jsonPath, JSON.stringify(rows, null, 1));
    writeFileSync(`${base}.md`, report(rows));
  }
}));
console.log(`Report: ${base}.md`);
process.exit(0);
