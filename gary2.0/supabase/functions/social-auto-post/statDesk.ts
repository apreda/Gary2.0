import { easternDateOffset } from '../_shared/dateKeys.js';
import { subscriptionModelFetch } from '../_shared/subscriptionModel.ts';
import { shortTeam, startWords } from './teamWords.ts';

// THE RESEARCH DESK (founder, Oct 29 2026: "Gary as the sports research desk ... make it real ... it should work
// day after day after day"). Beside the free pick, @BetwithGary posts three or four short posts a day, each the
// sharpest thing Gary's own research found about one of today's big games: an injury that changes a matchup, a
// number with a twist, a pattern hiding behind a record. Gary reads every game, so this is what no stat feed has.
//
// The first version (same day) posted box-score lines and per-game averages; Adam: "we just turned into ESPN ...
// that's just going to look like a stat bot." So the source is Gary's published research (winners_candidates
// pick_snapshot.rationale), the post may say what the observation means for the game, and it never says who Gary
// picked or who will win. The post is dropped unless every number in it is in that research.
// One post per run; each slot posts at most once a day inside its ET window, and only if something qualifies.

type Sb = any;
type Composed = { text: string; league: string; pickId: string; selection: Record<string, unknown> };
type Skip = { reason: string; retry?: boolean };
type Slot = { slot: string; from: number; to: number };

const etParts = (ms: number) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), minute: (Number(p.hour) % 24) * 60 + Number(p.minute) };
};

/** The day's slots in ET minutes: three on weekdays, four on weekends (one before the noon and 1 PM kickoffs). */
export function statSlots(dow: number): Slot[] {
  const weekend = dow === 0 || dow === 6;
  return [
    ...(weekend ? [{ slot: 'stat_today_0', from: 660, to: 750 }] : []),
    { slot: 'stat_today_1', from: 810, to: 900 },
    { slot: 'stat_today_2', from: 990, to: 1080 },
    { slot: 'stat_today_3', from: 1140, to: 1230 },
  ];
}

// ── Checks every post passes ──────────────────────────────────────────────────────────────────────────

const BETTING_WORDS = /\b(bets?|betting|bettors?|wagers?|odds|lines?|spreads?|covers?|covering|hook|lean|hammer|locks?|fade|sharps?|value|units?|parlays?|props?|picks?|sportsbooks?|moneyline|underdogs?|favou?rites?|ats|juice|vegas)\b/i;
const FOOTBALL_LINES = /\b(offensive|defensive) lines?\b/gi;
const MAX_BODY = 160;

/** Every number written as it reads: ".450" and "0.450" are the same number; "270-plus" is 270. */
export function numbersIn(text: string): string[] {
  return (String(text).match(/\.?\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
}

/** Why a written post can't go out ([] when it can). `names` are team names to ignore ("49ers"). */
export function statPostProblems(post: string, source: string, names: string[]): string[] {
  const problems: string[] = [];
  if (post.length < 20 || post.length > MAX_BODY) problems.push(`length ${post.length}`);
  if (post.split('\n').length > 2) problems.push('more than two lines');
  if (/[!?#]|…|\.\.\./.test(post)) problems.push('punctuation');
  if (/\p{Extended_Pictographic}/u.test(post)) problems.push('emoji');
  if (BETTING_WORDS.test(post.replace(FOOTBALL_LINES, ''))) problems.push('betting word');
  if (/\blast (season|year)\b|\b(19|20)\d\d\b/i.test(post)) problems.push('past season');
  if (/\bgary\b/i.test(post) || /\b(I|I'm|I'd|me|my)\b/.test(post)) problems.push('first person or Gary');
  let scrubbed = post;
  for (const n of names) if (n) scrubbed = scrubbed.split(n).join(' ');
  const allowed = new Set(numbersIn(source));
  for (const n of numbersIn(scrubbed)) if (!allowed.has(n)) problems.push(`number ${n} is not in the research`);
  return problems;
}

// ── The post ──────────────────────────────────────────────────────────────────────────────────────────

const LEAGUE_WEIGHT: Record<string, number> = { NFL: 30, NCAAF: 15, NBA: 12, MLB: 12, NHL: 5 };

const ANGLE_RULES = `You write one post for @BetwithGary on X. You get Gary's full research on one of today's games. Gary reads every game: injuries, matchups, form, schedule. The post shares the single sharpest thing in that research, the thing a smart fan didn't know and would repeat to a friend: an injury that changes a matchup, a number with a twist, a pattern hiding behind a record.

- One or two short sentences, under 140 characters. The observation first. No setup, no filler, no adjectives doing the work a number should do.
- Every name and number comes from the research. Never compute, round or combine a number.
- You may say what it means for today's game, the way an analyst would. Never say who Gary picked, who will win or by how much, and no betting words (bet, odds, line, spread, cover, hook, lean, lock, fade, sharp, value, units, parlay, prop, underdog, favorite).
- Third person. No "Gary", no "I", no exclamation marks, no questions, no emoji, no hashtags.`;

async function writeAngle(input: Record<string, unknown>, model: string, timeoutMs: number): Promise<string> {
  const response = await subscriptionModelFetch('subscription-model', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 1024, system: ANGLE_RULES,
      messages: [{ role: 'user', content: JSON.stringify(input) }],
      tools: [{ name: 'write_post', description: 'The post text.', input_schema: { type: 'object', properties: {
        post: { type: 'string', description: 'One or two short sentences, under 140 characters.' },
      }, required: ['post'], additionalProperties: false } }],
      tool_choice: { type: 'tool', name: 'write_post', disable_parallel_tool_use: true },
    }),
  }, 'cloud-content', { timeoutMs });
  if (!response.ok) throw new Error(`STAT_WRITER_FAILED: status=${response.status}`);
  const body = await response.json();
  const copy = (Array.isArray(body?.content) ? body.content : []).find((c: any) => c.type === 'tool_use')?.input;
  // The writer's own line breaks are kept (at most two lines, checked later); spaces are tidied.
  return String(copy?.post ?? '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

/** The post for one of today's games still to start: the biggest games first, the NFL ahead of the rest. */
async function todayPost(sb: Sb, today: string, nowMs: number, model: string, deadlineMs: number, usedGames: Set<string>): Promise<Composed | Skip> {
  const { data: rows, error } = await sb.from('winners_candidates')
    .select('id, league, game_id, commence_time, rationale:pick_snapshot->>rationale, home:pick_snapshot->>homeTeam, away:pick_snapshot->>awayTeam')
    .eq('game_date', today).eq('kind', 'game');
  if (error) throw error;
  const { data: big } = await sb.from('winners_big_games').select('league, game_id').eq('game_date', today);
  const bigKeys = new Set((big ?? []).map((b: any) => `${b.league}:${b.game_id}`));
  const seen = new Set<string>();
  const ranked = (rows ?? [])
    .filter((r: any) => {
      const key = `${r.league}:${r.game_id}`;
      const lead = new Date(r.commence_time).getTime() - nowMs;
      if (seen.has(key) || usedGames.has(key) || !r.home || !r.away || String(r.rationale ?? '').length < 400) return false;
      seen.add(key);
      return lead >= 40 * 60_000 && lead <= 12 * 3_600_000 && LEAGUE_WEIGHT[r.league] !== undefined;
    })
    .map((r: any) => ({ r, score: LEAGUE_WEIGHT[r.league] + (bigKeys.has(`${r.league}:${r.game_id}`) ? 40 : 0) }))
    .sort((a: any, b: any) => b.score - a.score || new Date(a.r.commence_time).getTime() - new Date(b.r.commence_time).getTime())
    .slice(0, 3);
  if (!ranked.length) return { reason: 'no game with Gary\'s research far enough ahead today' };

  const misses: string[] = [];
  for (const { r } of ranked) {
    // The writer runs through the Mac model queue; a run never waits past its budget, and a queue failure
    // leaves the slot open for the next run instead of skipping it.
    const budget = deadlineMs - Date.now();
    if (budget < 30_000) return { reason: 'out of time for the writer this run', retry: true };
    let post = '';
    try { post = await writeAngle({ league: r.league, matchup: `${r.away} @ ${r.home}`, research: r.rationale }, model, Math.min(budget, 60_000)); }
    catch (e) { return { reason: `writer unavailable: ${String(e).slice(0, 160)}`, retry: true }; }
    const names = [r.away, r.home, shortTeam(r.away, r.league), shortTeam(r.home, r.league)];
    const problems = statPostProblems(post, r.rationale, names);
    if (problems.length) { misses.push(`${r.league} ${r.game_id}: ${problems.join(', ')}`); continue; }
    const matchup = `${shortTeam(r.away, r.league)} @ ${shortTeam(r.home, r.league)} ${startWords(r.commence_time)}`;
    return {
      text: `${post}\n\n${matchup}`, league: r.league, pickId: String(r.id),
      selection: { source: 'research', candidate_id: r.id, league: r.league, game_id: String(r.game_id), headline: post },
    };
  }
  return { reason: `no written post passed the checks (${misses.join(' | ').slice(0, 400)})` };
}

// ── The slot runner ───────────────────────────────────────────────────────────────────────────────────

/** Posts the open slot's post, at most one per run. `force` (dry runs) composes a slot outside its window.
 *  A slot with nothing worth posting is logged as skipped (no tweet id), so later runs don't ask again. */
export async function runStatDesk(sb: Sb, today: string, nowMs: number, dryRun: boolean, deps: {
  model: string; postTweet: (text: string) => Promise<string>; force?: string | null; deadlineMs: number;
}): Promise<any[]> {
  const { dow, minute } = etParts(nowMs);
  const slots = statSlots(dow).filter((s) => deps.force ? s.slot === deps.force : minute >= s.from && minute < s.to);
  if (!slots.length) return [];
  const { data: done, error } = await sb.from('social_post_log').select('slot, audience_selection')
    .eq('thread_format', 'stat').eq('post_date', today);
  if (error) throw error;
  const usedGames = new Set<string>((done ?? []).map((r: any) => `${r.audience_selection?.league}:${r.audience_selection?.game_id}`));
  const out: any[] = [];
  for (const s of slots) {
    if (!dryRun && (done ?? []).some((r: any) => r.slot === s.slot)) continue;
    const claimKey = `STAT ${s.slot} ${today}`;
    let composed: Composed | Skip;
    try { composed = await todayPost(sb, today, nowMs, deps.model, deps.deadlineMs, usedGames); }
    catch (e) { composed = { reason: `data unavailable: ${String(e).slice(0, 160)}`, retry: true }; }
    if ('reason' in composed) {
      if (!dryRun && !composed.retry) {
        await sb.from('social_post_log').insert({
          post_date: today, slot: s.slot, pick_text: claimKey, thread_format: 'stat', audience_selection: { skipped: composed.reason.slice(0, 500) },
        });
      }
      out.push({ slot: s.slot, posted: false, reason: composed.reason });
      continue;
    }
    if (dryRun) { out.push({ slot: s.slot, posted: false, dry_run: true, text: composed.text, selection: composed.selection }); continue; }
    const { error: claimErr } = await sb.from('social_post_log').insert({
      post_date: today, slot: s.slot, league: composed.league, pick_text: claimKey, pick_id: composed.pickId,
      thread_format: 'stat', audience_selection: composed.selection,
    });
    if (claimErr) { out.push({ slot: s.slot, posted: false, reason: 'claimed by another run' }); continue; }
    try {
      const tweetId = await deps.postTweet(composed.text);
      await sb.from('social_post_log').update({
        hook_tweet_id: tweetId, thread_url: `https://x.com/BetwithGary/status/${tweetId}`, posted_at: new Date().toISOString(), post_text: composed.text,
      }).eq('post_date', today).eq('pick_text', claimKey);
      out.push({ slot: s.slot, posted: true, tweet: tweetId, text: composed.text });
    } catch (e) {
      await sb.from('social_post_log').delete().eq('post_date', today).eq('pick_text', claimKey);
      out.push({ slot: s.slot, posted: false, error: String(e) });
    }
    break;
  }
  return out;
}
