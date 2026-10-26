#!/usr/bin/env node
/**
 * THE READ REVIEW (Oct 25 2026, founder: "now look at Gary's reads vs reality and see where and why his logic was off").
 * The read check reads each read before kickoff; this one reads it after the game, in two passes, and never reaches Gary.
 *
 * BLIND FIRST (Oct 26 2026, founder: "we could end up fixing flaws that were only hindsight. how do we prevent
 * ourselves from doing that?"). Pass 1 is Opus with no web and no score: the data Gary had and what he wrote, nothing
 * else (the games are past the model's training, so it cannot know how they ended). It lists the misleading or missing
 * data and the reasoning flaws as anyone could have seen them before kickoff; those are the only fix candidates. Pass 2
 * searches the result and the reporting, says what decided the game and whether each blind finding showed up in it,
 * and lists what the blind pass missed apart, as after-the-fact: a reasoning flaw seen only after the result is
 * hindsight and is never fixed on its own; a fact knowable before kickoff that the data lacked is listed to verify.
 * The report counts blind findings in won and lost reads: over weeks, findings that sit as often in wins as in losses
 * are not what is losing games.
 *
 *   node scripts/run-read-review.js [--date 2026-10-24] [--league NCAAF] [--only "Ducks"] [--opus]
 * The morning schedule (com.gary.read-review, 9:30 ET) runs it with --opus for yesterday, through Nov 7. --opus makes
 * pass 2 Opus too (pass 1 is always Opus, without search).
 * Report: ~/Library/Logs/Gary2.0/data-checks/read-reviews/<date>.blind[.opus].md (and .json). Reviewed reads are skipped.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
await import('../src/loadEnv.js');
const { subscriptionSearch } = await import('../src/services/gary/agentic/orchestrator/subscriptionSearch.js');
const { BACKGROUND_GPT } = await import('../src/services/gary/agentic/orchestrator/subscriptionRoutes.js');
const { createClaudeCliSession, sendToClaudeCliSession } = await import('../src/services/gary/agentic/orchestrator/providerAdapters/claudeCliSession.js');

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
// Without --date, yesterday (Eastern): the morning run reviews the slate that just finished, until RUNS_UNTIL.
const yesterday = new Date(Date.now() - 24 * 3600_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const date = arg('--date') || yesterday;
const RUNS_UNTIL = '2026-11-07';
if (!arg('--date') && date > RUNS_UNTIL) { console.log(`Read review: the loop ended ${RUNS_UNTIL}; unload com.gary.read-review`); process.exit(0); }
const only = arg('--only');
const LEAGUES = Object.fromEntries(Object.entries({ ncaaf: 'NCAAF', nba: 'NBA', nfl: 'NFL' }).filter(([, l]) => !arg('--league') || l === arg('--league')));
// --opus: the reviewer is Opus (founder, Oct 25 2026: "run this on opus too ... I don't trust chat gpt as much"); its
// report sits beside the GPT one. Opus draws on the same weekly Claude limit as Gary's picks.
const opus = process.argv.includes('--opus');
const dir = `${homedir()}/Library/Logs/Gary2.0/data-checks/read-reviews`; mkdirSync(dir, { recursive: true });
const base = `${dir}/${date}.blind${opus ? '.opus' : ''}`;
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
      const pick = (answered.match(/"final_pick":\s*"([^"]+)"/) || [])[1] || (answered.match(/^#+ .*?(?:pick|side)[^:\n]*:\s*(.+)$/im) || [])[1]
        || (answered.match(/^#+ [^\n]*?:\s*(?:take|taking)\s+(.+)$/im) || [])[1] || '';
      out.push({ league, file, matchup, kickoff, pick, asked, answered });
    }
  }
  return out;
}

// Pass 1: what anyone could see before kickoff. No score, no search, no grade of the pick.
const blindPrompt = (r) => `You review a sports bettor's pre-game read before the game is played. The bettor is Gary, an AI. Below is the game data he was given and the read he wrote for ${r.league} ${r.matchup} (${r.kickoff}). You do not know how the game ended and must not guess it; judge only what could be seen before kickoff.

Answer:
1. Data: numbers in the data that are accurate but misleading as shown (a number without the context that changes what it means: who it came against, which players played then and which play tonight, a blowout, overtime or garbage time inside it, a small sample that reads as a pattern, a fact shown for one team and not the other, something from before a trade, injury or coaching change, two numbers that duplicate or contradict each other, or anything else), and facts a bettor would want before this game that are missing. Quote the line and say what context it lacks.
2. Reasoning: claims in the read the data does not support; the strongest points in the data for the side he did not take, and whether the read weighed them or waved them off; numbers read without their context; small or selective samples; general patterns used in place of this game.
3. Whether the read, as reasoning from this data, holds together.

Be specific and short. Do not say which side you would take.

THE DATA GARY HAD
${r.asked}

GARY'S READ
${r.answered}

End with this JSON block and nothing after it:
\`\`\`json
{"read_sound": true, "misleading_data": [{"line": "", "missing_context": ""}], "missing_data": [{"what": ""}], "reasoning_flaws": [{"claim": "", "why": ""}], "other_side_best_points": [{"point": "", "weighed": true}], "summary": "one sentence"}
\`\`\``;

// The blind findings, numbered so pass 2 answers each by id: D misleading data, M missing data, R reasoning, O the
// other side's points the read did not weigh.
const findings = (b) => [
  ...(b?.misleading_data || []).map((m, i) => ({ id: `D${i + 1}`, kind: 'misleading data', text: `${m.line} → ${m.missing_context}` })),
  ...(b?.missing_data || []).map((m, i) => ({ id: `M${i + 1}`, kind: 'missing data', text: m.what })),
  ...(b?.reasoning_flaws || []).map((e, i) => ({ id: `R${i + 1}`, kind: 'reasoning', text: `${e.claim} → ${e.why}` })),
  ...(b?.other_side_best_points || []).filter((x) => x.weighed === false).map((x, i) => ({ id: `O${i + 1}`, kind: 'other side, not weighed', text: x.point })),
];

// Pass 2: the result, the blind findings checked against it, and what the blind pass missed, kept apart.
const revealPrompt = (r, blind) => `A reviewer read the pre-game read below without knowing the result and found the BLIND FINDINGS. Now search the final score, box score, recaps and post-game reporting for ${r.league} ${r.matchup} (${r.kickoff}), and the pre-game reporting. Gary's pick was ${r.pick || 'in the read'}.

Answer:
1. The final score and whether the pick won.
2. What decided the game (the two or three things that made the result), with the evidence.
3. For each blind finding, by its id: did the game bear it out, was it not a factor, or did the game go against it?
4. What decided the game that the blind findings do not name: was it knowable before kickoff, and was it in the data Gary had? Mark each one you name only now, after the result, as after the fact.

Do not grade by the result alone: a losing pick can be a sound read and a winning pick an unsound one. Be specific and short.

BLIND FINDINGS
${findings(blind).map((f) => `${f.id}. ${f.text}`).join('\n') || 'None.'}

THE DATA GARY HAD
${r.asked}

GARY'S READ
${r.answered}

End with this JSON block and nothing after it:
\`\`\`json
{"final": "score", "won": true, "decided_by": ["..."], "blind_checked": [{"id": "D1", "in_the_game": "bore_out|not_a_factor|went_against"}], "after_the_fact": [{"what": "", "knowable_pre": true, "in_data": false}], "verdict": "sound|data|reasoning|variance", "summary": "one sentence"}
\`\`\``;

function parse(text) {
  const blocks = [...String(text || '').matchAll(/```json\s*([\s\S]*?)```/g)];
  try { return JSON.parse(blocks.at(-1)?.[1] || ''); } catch { return null; }
}

// Pass 1 runs in a session with no tools at all: no web, so no score.
async function blindPass(r) {
  const session = await createClaudeCliSession({ modelName: 'claude-opus-5-5', thinkingLevel: 'high', browse: false });
  const res = await sendToClaudeCliSession(session, blindPrompt(r));
  return parse(res?.content);
}

async function review(r) {
  const t0 = Date.now();
  const blind = await blindPass(r);
  if (!blind) return { league: r.league, file: r.file, matchup: r.matchup, pick: r.pick, error: 'blind pass gave no JSON', secs: Math.round((Date.now() - t0) / 1000) };
  const res = await subscriptionSearch(revealPrompt(r, blind), { model: opus ? 'claude-opus-5-5' : BACKGROUND_GPT, tier: opus ? 'heavy' : 'light', effort: 'high', timeoutMs: 15 * 60 * 1000, maxTokens: 8000, freshnessHours: 8 * 24 });
  const text = typeof res?.data === 'string' ? res.data : res?.data?.text || res?.data?.content || (res?.data ? JSON.stringify(res.data) : '');
  return { league: r.league, file: r.file, matchup: r.matchup, pick: r.pick, ok: Boolean(res?.success), model: res?.model || res?.route || null, blind, review: parse(text), error: res?.success ? null : res?.error, secs: Math.round((Date.now() - t0) / 1000) };
}

const blindCount = (b) => findings(b).length;
function report(rows) {
  const ok = rows.filter((r) => r.review && r.blind);
  const count = (v) => ok.filter((r) => r.review.verdict === v).length;
  const won = ok.filter((r) => r.review.won), lost = ok.filter((r) => !r.review.won);
  const per = (rs) => (rs.length ? (rs.reduce((a, r) => a + blindCount(r.blind), 0) / rs.length).toFixed(1) : '0');
  const unsound = (rs) => rs.filter((r) => r.blind.read_sound === false).length;
  const lines = [`# Read review, ${date} (blind first${opus ? ', Opus' : ''})`, '',
    `${rows.length} reads · ${won.length} won · verdicts: ${count('sound')} sound, ${count('data')} data, ${count('reasoning')} reasoning, ${count('variance')} variance · ${rows.length - ok.length} unreviewed`,
    `Blind: ${unsound(won)} of ${won.length} won reads and ${unsound(lost)} of ${lost.length} lost reads called unsound before the result; findings per read ${per(won)} in wins, ${per(lost)} in losses.`,
    'Fix candidates are the blind findings only. After-the-fact items are hindsight unless knowable before kickoff and missing from the data.', ''];
  for (const r of rows) {
    const v = r.review, b = r.blind;
    lines.push(`## ${r.league} · ${r.matchup} · ${r.pick || 'pick not parsed'}${v ? ` · ${v.final} · ${v.won ? 'WON' : 'LOST'} · ${v.verdict}` : ''}`);
    if (!v || !b) { lines.push(`Unreviewed: ${r.error || 'no JSON'}`, ''); continue; }
    lines.push(`Blind: ${b.read_sound === false ? 'unsound' : 'sound'}. ${b.summary || ''}`);
    const check = new Map((v.blind_checked || []).map((c) => [c.id, c.in_the_game]));
    for (const f of findings(b)) lines.push(`- ${f.id} ${f.kind}: ${f.text}${check.get(f.id) ? ` [${check.get(f.id)}]` : ''}`);
    lines.push(`Result: ${v.summary || ''}`);
    if (v.decided_by?.length) lines.push(`Decided by: ${v.decided_by.join(' | ')}`);
    for (const a of v.after_the_fact || []) lines.push(`- after the fact${a.knowable_pre && !a.in_data ? ' (knowable before kickoff, not in the data: verify)' : ' (hindsight)'}: ${a.what}`);
    lines.push('');
  }
  return lines.join('\n');
}

const todo = reads().filter((r) => !done.some((d) => d.file === r.file && d.review && d.blind));
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
