#!/usr/bin/env node
/**
 * THE READ CHECK (Oct 24 2026, founder: "audit to make sure Gary's reasoning and points for taking Indiana -7.5 are
 * actually true in the real world ... we should do that for all the games Gary has picked"). The data check reads a
 * game the morning after; this one reads each of the day's reads before kickoff. A background checker with web search
 * takes the read's transcript (the data Gary had and what he wrote) and checks every claim the read leans on against
 * reporting published before kickoff: false, stale (a player back or out, a quarterback change, a number from a
 * different team than the one playing today) or missing the context that changes it, and what the public knew that the
 * read left out. It never judges the side, never reaches Gary, and fixes nothing itself: the report is for the session
 * that owns the pick system, which fixes the data.
 *
 *   node scripts/run-read-check.js [--date 2026-10-24] [--only "Wolverines"]
 * Report: ~/Library/Logs/Gary2.0/data-checks/read-checks/<date>.md (and .json). Already-checked reads are skipped.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
await import('../src/loadEnv.js');
const { subscriptionSearch } = await import('../src/services/gary/agentic/orchestrator/subscriptionSearch.js');
const { BACKGROUND_GPT } = await import('../src/services/gary/agentic/orchestrator/subscriptionRoutes.js');

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const date = arg('--date') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const only = arg('--only');
const LEAGUES = { ncaaf: 'NCAAF', nba: 'NBA', nfl: 'NFL' };
const dir = `${homedir()}/Library/Logs/Gary2.0/data-checks/read-checks`; mkdirSync(dir, { recursive: true });
const jsonPath = `${dir}/${date}.json`;
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

const prompt = (r) => `You fact-check a sports bettor's pre-game read against the real world. The bettor is Gary, an AI. Below is the game data he was given and the read he wrote for ${r.league} ${r.matchup} (${r.kickoff}).

Search reporting published BEFORE kickoff only (team announcements, official injury and availability reports, beat reporters, box scores of games already played). Use nothing from after kickoff.

Check every specific claim the read leans on: who is playing and who is out, roles, what happened in recent games, the numbers it cites, the matchup claims. For each one that is not right, say which kind:
- false: the claim is wrong.
- stale: true once, not now (a player back or out, a quarterback change, a coach or play-caller change, numbers that came with a different lineup than the one playing today).
- context: true, but missing what changes its meaning (who it came against, garbage time, a blowout, weather, a small sample read as a trend).
- missed: something the public knew before kickoff that matters to this game and is in neither the data nor the read.

Do not judge the pick or the side, do not predict the game, and do not report style. Report only what is wrong or missing; a claim that checks out needs no line.

THE DATA GARY HAD
${r.asked}

GARY'S READ
${r.answered}

End with this JSON block and nothing after it:
\`\`\`json
{"sound": true, "issues": [{"kind": "false|stale|context|missed", "claim": "what the read or data said", "truth": "what was true before kickoff", "evidence": "source and publication date", "matters": "how it changes what the read rests on", "in_data": true}], "summary": "one sentence"}
\`\`\``;

function parse(text) {
  const blocks = [...String(text || '').matchAll(/```json\s*([\s\S]*?)```/g)];
  try { const j = JSON.parse(blocks.at(-1)?.[1] || ''); return { sound: Boolean(j.sound), issues: Array.isArray(j.issues) ? j.issues : [], summary: j.summary || '' }; } catch { return null; }
}

async function check(r) {
  const t0 = Date.now();
  const res = await subscriptionSearch(prompt(r), { model: BACKGROUND_GPT, effort: 'high', timeoutMs: 15 * 60 * 1000, maxTokens: 10000, freshnessHours: 8 * 24 });
  const text = typeof res?.data === 'string' ? res.data : res?.data?.text || res?.data?.content || (res?.data ? JSON.stringify(res.data) : '');
  return { league: r.league, file: r.file, matchup: r.matchup, kickoff: r.kickoff, pick: r.pick, ok: Boolean(res?.success), check: parse(text), error: res?.success ? null : res?.error, secs: Math.round((Date.now() - t0) / 1000) };
}

function report(rows) {
  const lines = [`# Read check, ${date}`, '', `${rows.length} reads · ${rows.filter((r) => r.check && !r.check.sound).length} with problems · ${rows.filter((r) => r.check?.sound).length} sound · ${rows.filter((r) => !r.check).length} unchecked`, ''];
  for (const r of rows) {
    lines.push(`## ${r.league} · ${r.matchup} · ${r.pick || 'pick not parsed'} (${r.kickoff})`);
    if (!r.check) { lines.push(`Unchecked: ${r.error || 'no JSON in the answer'}`, ''); continue; }
    lines.push(r.check.summary ? `${r.check.summary}` : '', r.check.sound ? 'Sound.' : `${r.check.issues.length} issue(s):`);
    for (const i of r.check.issues) lines.push(`- **${i.kind}**${i.in_data === false ? ' (not in the data)' : ''}: ${i.claim} → ${i.truth}. Matters: ${i.matters}. Evidence: ${i.evidence}`);
    lines.push('');
  }
  return lines.join('\n');
}

const todo = reads().filter((r) => !done.some((d) => d.file === r.file && d.check));
console.log(`Read check ${date}: ${todo.length} read(s) to check`);
const rows = done.filter((d) => !todo.some((r) => r.file === d.file));
let i = 0;
await Promise.all(Array.from({ length: 2 }, async () => {
  while (i < todo.length) {
    const r = todo[i++];
    try { rows.push(await check(r)); } catch (e) { rows.push({ league: r.league, file: r.file, matchup: r.matchup, kickoff: r.kickoff, pick: r.pick, error: e.message }); }
    const x = rows[rows.length - 1];
    console.log(`  ${x.league} ${x.matchup}: ${x.check ? (x.check.sound ? 'sound' : `${x.check.issues.length} issue(s)`) : `unchecked (${x.error || 'no JSON'})`}${x.secs ? ` ${x.secs}s` : ''}`);
    writeFileSync(jsonPath, JSON.stringify(rows, null, 1));
    writeFileSync(`${dir}/${date}.md`, report(rows));
  }
}));
console.log(`Report: ${dir}/${date}.md`);
process.exit(0);
