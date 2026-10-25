#!/usr/bin/env node
/**
 * THE READ REVIEW (Oct 25 2026, founder: "now look at Gary's reads vs reality and see where and why his logic was off").
 * The read check reads each read before kickoff; this one reads it after the game. A background checker with web search
 * takes the read's transcript (the data Gary had and what he wrote), the final score and the game's reporting, and
 * says what decided the game, whether that was knowable before kickoff, and for a miss whether it came from the data
 * (a gap or a misleading number), from the reasoning (the data had it and the read weighed it wrong, or reasoned from a
 * pattern), or from variance. It never reaches Gary and fixes nothing itself.
 *
 *   node scripts/run-read-review.js --date 2026-10-24 [--league NCAAF] [--only "Ducks"] [--opus]
 * Report: ~/Library/Logs/Gary2.0/data-checks/read-reviews/<date>.md (and .json). Already-reviewed reads are skipped.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
await import('../src/loadEnv.js');
const { subscriptionSearch } = await import('../src/services/gary/agentic/orchestrator/subscriptionSearch.js');
const { BACKGROUND_GPT } = await import('../src/services/gary/agentic/orchestrator/subscriptionRoutes.js');

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const date = arg('--date');
if (!date) { console.log('--date is required'); process.exit(1); }
const only = arg('--only');
const LEAGUES = Object.fromEntries(Object.entries({ ncaaf: 'NCAAF', nba: 'NBA', nfl: 'NFL' }).filter(([, l]) => !arg('--league') || l === arg('--league')));
// --opus: the reviewer is Opus (founder, Oct 25 2026: "run this on opus too ... I don't trust chat gpt as much"); its
// report sits beside the GPT one. Opus draws on the same weekly Claude limit as Gary's picks.
const opus = process.argv.includes('--opus');
const dir = `${homedir()}/Library/Logs/Gary2.0/data-checks/read-reviews`; mkdirSync(dir, { recursive: true });
const base = `${dir}/${date}${opus ? '.opus' : ''}`;
const jsonPath = `${base}.json`;
const done = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : [];

const part = (text, name) => { const m = text.match(new RegExp(`########## ${name}\\n([\\s\\S]*?)(?=\\n\\n########## |$)`)); return m ? m[1].trim() : null; };

/** The day's reads: one transcript per game per league, as Gary read it. */
function reads() {
  const out = [];
  for (const [slug, league] of Object.entries(LEAGUES)) {
    const folder = `${homedir()}/Library/Logs/gary-${slug}-read`;
    if (!existsSync(folder)) continue;
    for (const file of readdirSync(folder).filter((f) => f.startsWith(`${date}_`) && f.endsWith('.md'))) {
      if (only && !file.includes(only)) continue;
      const text = readFileSync(`${folder}/${file}`, 'utf8');
      const asked = part(text, 'ASKED'), answered = part(text, 'ANSWERED');
      if (!asked || !answered) continue;
      const matchup = (asked.match(/^## THE GAME\s*\n+(.+)$/m) || [])[1]?.trim() || file;
      const kickoff = (asked.match(/^## THE GAME\s*\n+.+\n(.+)$/m) || [])[1]?.trim() || '';
      const pick = (answered.match(/"final_pick":\s*"([^"]+)"/) || [])[1] || (answered.match(/^#+ .*?(?:pick|side)[^:\n]*:\s*(.+)$/im) || [])[1] || '';
      out.push({ league, file, matchup, kickoff, pick, asked, answered });
    }
  }
  return out;
}

const prompt = (r) => `You review a sports bettor's pre-game read against what happened. The bettor is Gary, an AI. Below is the game data he was given and the read he wrote for ${r.league} ${r.matchup} (${r.kickoff}); his pick was ${r.pick || 'in the read'}.

Search the final score, box score, recaps and post-game reporting for this game, and the pre-game reporting.

Answer:
1. The final score and whether the pick won.
2. What decided the game (the two or three things that made the result), with the evidence.
3. For each: was it knowable before kickoff (an injury, a quarterback, a matchup, weather, form), and was it in the data Gary had?
4. The read's logic against reality: which of its main reasons held, which were wrong, and why. For each wrong one, say which kind:
- data: the data was missing, wrong or misleading (say what it showed and what was true).
- reasoning: the data had what mattered and the read weighed it wrong, read a number without its context, leaned on a small or selective sample, or reasoned from a general pattern instead of this game.
- variance: the read was sound and the game turned on something no one could know (a fluke play, an in-game injury).

Do not grade by the result alone: a losing pick can be a sound read and a winning pick an unsound one. Be specific and short.

THE DATA GARY HAD
${r.asked}

GARY'S READ
${r.answered}

End with this JSON block and nothing after it:
\`\`\`json
{"final": "score", "won": true, "decided_by": ["..."], "read_sound": true, "verdict": "sound|data|reasoning|variance", "data_gaps": [{"what": "", "truth": "", "knowable_pre": true}], "reasoning_errors": [{"claim": "", "why_wrong": ""}], "summary": "one sentence"}
\`\`\``;

function parse(text) {
  const blocks = [...String(text || '').matchAll(/```json\s*([\s\S]*?)```/g)];
  try { return JSON.parse(blocks.at(-1)?.[1] || ''); } catch { return null; }
}

async function review(r) {
  const t0 = Date.now();
  const res = await subscriptionSearch(prompt(r), { model: opus ? 'claude-opus-5-5' : BACKGROUND_GPT, tier: opus ? 'heavy' : 'light', effort: 'high', timeoutMs: 15 * 60 * 1000, maxTokens: 8000, freshnessHours: 8 * 24 });
  const text = typeof res?.data === 'string' ? res.data : res?.data?.text || res?.data?.content || (res?.data ? JSON.stringify(res.data) : '');
  return { league: r.league, file: r.file, matchup: r.matchup, pick: r.pick, ok: Boolean(res?.success), model: res?.model || res?.route || null, review: parse(text), error: res?.success ? null : res?.error, secs: Math.round((Date.now() - t0) / 1000) };
}

function report(rows) {
  const ok = rows.filter((r) => r.review);
  const count = (v) => ok.filter((r) => r.review.verdict === v).length;
  const lines = [`# Read review, ${date}${opus ? ' (Opus)' : ''}`, '', `${rows.length} reads · ${ok.filter((r) => r.review.won).length} won · verdicts: ${count('sound')} sound, ${count('data')} data, ${count('reasoning')} reasoning, ${count('variance')} variance · ${rows.length - ok.length} unreviewed`, ''];
  for (const r of rows) {
    const v = r.review;
    lines.push(`## ${r.league} · ${r.matchup} · ${r.pick || 'pick not parsed'}${v ? ` · ${v.final} · ${v.won ? 'WON' : 'LOST'} · ${v.verdict}` : ''}`);
    if (!v) { lines.push(`Unreviewed: ${r.error || 'no JSON'}`, ''); continue; }
    lines.push(v.summary || '');
    if (v.decided_by?.length) lines.push(`Decided by: ${v.decided_by.join(' | ')}`);
    for (const g of v.data_gaps || []) lines.push(`- data${g.knowable_pre === false ? ' (not knowable)' : ''}: ${g.what} → ${g.truth}`);
    for (const e of v.reasoning_errors || []) lines.push(`- reasoning: ${e.claim} → ${e.why_wrong}`);
    lines.push('');
  }
  return lines.join('\n');
}

const todo = reads().filter((r) => !done.some((d) => d.file === r.file && d.review));
console.log(`Read review ${date}: ${todo.length} read(s) to review`);
const rows = done.filter((d) => !todo.some((r) => r.file === d.file));
let i = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (i < todo.length) {
    const r = todo[i++];
    try { rows.push(await review(r)); } catch (e) { rows.push({ league: r.league, file: r.file, matchup: r.matchup, pick: r.pick, error: e.message }); }
    const x = rows[rows.length - 1];
    console.log(`  ${x.league} ${x.matchup}: ${x.review ? `${x.review.won ? 'won' : 'lost'}, ${x.review.verdict}` : `unreviewed (${x.error || 'no JSON'})`}${x.secs ? ` ${x.secs}s` : ''}`);
    writeFileSync(jsonPath, JSON.stringify(rows, null, 1));
    writeFileSync(`${base}.md`, report(rows));
  }
}));
console.log(`Report: ${base}.md`);
process.exit(0);
