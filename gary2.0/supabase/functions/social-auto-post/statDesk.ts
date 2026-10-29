import { easternDateOffset } from '../_shared/dateKeys.js';
import { subscriptionModelFetch } from '../_shared/subscriptionModel.ts';
import { shortTeam, startWords } from './teamWords.ts';

// THE STAT DESK (founder, Oct 29 2026: "Gary as the sports research desk ... go ahead and implement it. Make
// it real ... it should work day after day after day"). Pick posts get single-digit likes even on accounts
// with 100k+ followers; StatMuse (882k) and Opta Analyst (283k) grew on numbers fans want to read. So beside
// the free pick, @BetwithGary posts three or four stat posts a day that are not picks:
//   - Last night's best line, from the BDL box scores (NFL the morning after a game day, else NBA). The post
//     is a template over the box score, so every number is the box score's.
//   - Facts about today's games, from the app's own insights (insight_connections, computed from the stats
//     data). The writer phrases one insight; the post is dropped unless every number in it is in that insight.
// No pick, no betting words, no link, this season only (founder, Oct 23 2026: "last season is old news").
// One post per run; each slot posts at most once a day inside its ET window, and only if something qualifies.

type Sb = any;
type Composed = { text: string; league: string; pickId: string; selection: Record<string, unknown> };
type Slot = { slot: string; kind: 'last_night' | 'today'; from: number; to: number };

const BDL = 'https://api.balldontlie.io';
const BDL_KEY = () => (globalThis as any).Deno?.env.get('BALLDONTLIE_API_KEY') ?? '';

const etParts = (ms: number) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), minute: (Number(p.hour) % 24) * 60 + Number(p.minute) };
};

/** The day's slots in ET minutes. Weekends start earlier so a fact lands before the noon and 1 PM kickoffs. */
export function statSlots(dow: number): Slot[] {
  const weekend = dow === 0 || dow === 6;
  return [
    { slot: 'stat_last_night', kind: 'last_night', from: weekend ? 570 : 630, to: weekend ? 645 : 720 },
    { slot: 'stat_today_1', kind: 'today', from: weekend ? 660 : 810, to: weekend ? 750 : 900 },
    { slot: 'stat_today_2', kind: 'today', from: 990, to: 1080 },
    { slot: 'stat_today_3', kind: 'today', from: 1140, to: 1230 },
  ];
}

// ── Checks every stat post passes ──────────────────────────────────────────────────────────────────────

const BETTING_WORDS = /\b(bets?|betting|bettors?|wagers?|odds|lines?|spreads?|covers?|covering|locks?|fade|sharps?|value|units?|parlays?|props?|picks?|sportsbooks?|moneyline|underdogs?|favorites?|ats|juice|vegas)\b/i;
const FOOTBALL_LINES = /\b(offensive|defensive) lines?\b/gi;

/** Every number written as it reads: ".450" and "0.450" are the same number. */
export function numbersIn(text: string): string[] {
  return (String(text).match(/\.?\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
}

/** Why a written stat post can't go out ([] when it can). `names` are team names to ignore ("49ers"). */
export function statPostProblems(post: string, source: string, names: string[], abbreviations: string[] = []): string[] {
  const problems: string[] = [];
  if (post.length < 20 || post.length > 220) problems.push(`length ${post.length}`);
  if (/[!?#]|…|\.\.\./.test(post)) problems.push('punctuation');
  if (/\p{Extended_Pictographic}/u.test(post)) problems.push('emoji');
  if (BETTING_WORDS.test(post.replace(FOOTBALL_LINES, ''))) problems.push('betting word');
  if (/\blast (season|year)\b|\b(19|20)\d\d\b/i.test(post)) problems.push('past season');
  if (/\bgary\b/i.test(post)) problems.push('names Gary');
  for (const a of abbreviations) if (a && new RegExp(`\\b${a}\\b`).test(post)) problems.push(`abbreviation ${a}`);
  let scrubbed = post;
  for (const n of names) if (n) scrubbed = scrubbed.split(n).join(' ');
  const allowed = new Set(numbersIn(source));
  for (const n of numbersIn(scrubbed)) if (!allowed.has(n)) problems.push(`number ${n} is not in the facts`);
  return problems;
}

// ── Last night's best line (template over the box score) ───────────────────────────────────────────────

async function bdlRows(path: string, gameIds: string[]): Promise<any[]> {
  const rows: any[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 15; page++) {
    const qs = new URLSearchParams({ per_page: '100' });
    for (const id of gameIds) qs.append('game_ids[]', id);
    if (cursor) qs.set('cursor', cursor);
    const r = await fetch(`${BDL}${path}?${qs}`, { headers: { Authorization: BDL_KEY() } });
    if (!r.ok) throw new Error(`BDL ${path} HTTP ${r.status}`);
    const j = await r.json();
    rows.push(...(j.data ?? []));
    cursor = j.meta?.next_cursor ? String(j.meta.next_cursor) : null;
    if (!cursor) break;
  }
  return rows;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The result line: "The Hornets won 129-117." (winner's score first). */
function resultLine(teamName: string, own: number, opp: number): string | null {
  if (!Number.isFinite(own) || !Number.isFinite(opp) || own === opp) return null;
  return own > opp ? `The ${teamName} won ${own}-${opp}.` : `The ${teamName} lost ${opp}-${own}.`;
}

export function nbaLastNight(rows: any[]): Composed | null {
  const names: Record<string, string> = {};
  for (const r of rows) if (r?.team?.id) names[r.team.id] = r.team.name;
  const n = (v: any) => Number(v ?? 0);
  const best = rows
    .filter((r) => r?.game?.status === 'Final' && r?.player?.last_name)
    .map((r) => ({ r, score: n(r.pts) + 1.2 * n(r.reb) + 1.5 * n(r.ast) + 3 * (n(r.stl) + n(r.blk)) + n(r.fg3m) }))
    .sort((a, b) => b.score - a.score)[0]?.r;
  if (!best) return null;
  const [pts, reb, ast, stl, blk, threes, fgm, fga] = [best.pts, best.reb, best.ast, best.stl, best.blk, best.fg3m, best.fgm, best.fga].map(n);
  const notable = pts >= 30 || (pts >= 10 && reb >= 10 && ast >= 10) || reb >= 18 || ast >= 14 || (pts >= 25 && reb >= 12);
  if (!notable) return null;
  const lines = [plural(pts, 'point', 'points')];
  if (reb >= 8) lines.push(plural(reb, 'rebound', 'rebounds'));
  if (ast >= 7) lines.push(plural(ast, 'assist', 'assists'));
  if (stl >= 3) lines.push(`${stl} steals`);
  if (blk >= 3) lines.push(`${blk} blocks`);
  if (threes >= 5) lines.push(`${threes} threes`);
  if (fga >= 15 && fgm / fga >= 0.6) lines.push(`${fgm} of ${fga} shooting`);
  const g = best.game;
  const home = g.home_team_id === best.team.id;
  const oppId = home ? g.visitor_team_id : g.home_team_id;
  const opp = names[oppId];
  const result = resultLine(best.team.name, n(home ? g.home_team_score : g.visitor_team_score), n(home ? g.visitor_team_score : g.home_team_score));
  if (!opp || !result) return null;
  const player = `${best.player.first_name} ${best.player.last_name}`;
  return {
    text: `${player} vs. the ${opp}:\n\n${lines.slice(0, 4).join('\n')}\n\n${result}`,
    league: 'NBA', pickId: `NBA:${g.id}:${best.player.id}`,
    selection: { source: 'box_score', league: 'NBA', game_id: String(g.id), player, headline: `${player} ${pts} points` },
  };
}

export function nflLastNight(rows: any[]): Composed | null {
  const n = (v: any) => Number(v ?? 0);
  const fantasy = (r: any) => n(r.passing_yards) / 25 + 4 * n(r.passing_touchdowns) - 2 * n(r.passing_interceptions)
    + n(r.rushing_yards) / 10 + 6 * n(r.rushing_touchdowns) + n(r.receiving_yards) / 10 + 6 * n(r.receiving_touchdowns) + 0.5 * n(r.receptions);
  const best = rows.filter((r) => r?.game?.status === 'Final' && r?.player?.last_name)
    .sort((a, b) => fantasy(b) - fantasy(a))[0];
  if (!best || fantasy(best) < 24) return null;
  const lines: string[] = [];
  if (n(best.passing_attempts) >= 15) {
    lines.push(`${n(best.passing_completions)} of ${n(best.passing_attempts)} passing`, `${n(best.passing_yards)} passing yards`);
    if (n(best.passing_touchdowns)) lines.push(plural(n(best.passing_touchdowns), 'touchdown pass', 'touchdown passes'));
    if (n(best.rushing_yards) >= 40) lines.push(`${n(best.rushing_yards)} rushing yards`);
    if (n(best.rushing_touchdowns)) lines.push(plural(n(best.rushing_touchdowns), 'rushing touchdown', 'rushing touchdowns'));
  } else if (n(best.rushing_attempts) >= 10 && n(best.rushing_yards) >= n(best.receiving_yards)) {
    lines.push(`${n(best.rushing_attempts)} carries`, `${n(best.rushing_yards)} rushing yards`);
    if (n(best.rushing_touchdowns)) lines.push(plural(n(best.rushing_touchdowns), 'rushing touchdown', 'rushing touchdowns'));
    if (n(best.receiving_yards) >= 40) lines.push(`${n(best.receiving_yards)} receiving yards`);
    if (n(best.receiving_touchdowns)) lines.push(plural(n(best.receiving_touchdowns), 'receiving touchdown', 'receiving touchdowns'));
  } else {
    lines.push(plural(n(best.receptions), 'catch', 'catches'), `${n(best.receiving_yards)} receiving yards`);
    if (n(best.receiving_touchdowns)) lines.push(plural(n(best.receiving_touchdowns), 'touchdown', 'touchdowns'));
  }
  const g = best.game;
  const home = g.home_team?.id === best.team.id;
  const opp = home ? g.visitor_team?.name : g.home_team?.name;
  const result = resultLine(best.team.name, n(home ? g.home_team_score : g.visitor_team_score), n(home ? g.visitor_team_score : g.home_team_score));
  if (!opp || !result) return null;
  const player = `${best.player.first_name} ${best.player.last_name}`;
  return {
    text: `${player} vs. the ${opp}:\n\n${lines.slice(0, 4).join('\n')}\n\n${result}`,
    league: 'NFL', pickId: `NFL:${g.id}:${best.player.id}`,
    selection: { source: 'box_score', league: 'NFL', game_id: String(g.id), player, headline: `${player} ${lines[1] ?? lines[0]}` },
  };
}

/** NFL the morning after an NFL day; otherwise NBA. Null when no line is big enough to post. */
async function lastNightPost(sb: Sb, today: string): Promise<Composed | null> {
  const yesterday = easternDateOffset(-1, new Date(`${today}T16:00:00Z`));
  const { data, error } = await sb.from('daily_slate').select('league, bdl_game_id')
    .eq('date', yesterday).in('league', ['NFL', 'NBA']).not('bdl_game_id', 'is', null);
  if (error) throw error;
  const ids = (league: string) => [...new Set((data ?? []).filter((g: any) => g.league === league).map((g: any) => String(g.bdl_game_id)))] as string[];
  const nfl = ids('NFL');
  if (nfl.length) {
    const post = nflLastNight(await bdlRows('/nfl/v1/stats', nfl));
    if (post) return post;
  }
  const nba = ids('NBA');
  return nba.length ? nbaLastNight(await bdlRows('/v1/stats', nba)) : null;
}

// ── Facts about today's games (the app's insights, phrased by the writer) ─────────────────────────────

const CATEGORY_WEIGHT: Record<string, number> = {
  streak: 12, streaking: 12, starter_team_record: 12, team_record: 10, regression_watch: 10, mismatch: 10, red_zone: 10,
  pass_rush: 10, pace_script: 10, explosive_play: 10, trenches: 8, turnover_edge: 8, situational: 6, bullpen_fatigue: 6,
  nba_tape: 6, heat_check: 4, cooling_off: 4, rest: 2,
};
const LEAGUE_WEIGHT: Record<string, number> = { NFL: 25, MLB: 15, NCAAF: 12, NBA: 10 };
const PAST_OR_MARKET = /last season|prior season|last year|\b(19|20)(0\d|1\d|2[0-5])\b|\blines?\b|odds|spread|market|\bbooks?\b|props?\b|implied|price/i;

/** The insight's data sentences, this season only, with any market talk removed. */
export function factSheet(ins: any): string {
  const raw = [ins?.meta?.computed_detail, ins?.meta?.evidence].filter(Boolean).join(' ');
  return raw.split(/(?<=[.;])\s+/).filter((s) => s.trim() && !PAST_OR_MARKET.test(s)).join(' ').trim();
}

const STAT_RULES = `You write one post for @BetwithGary on X. The account is a sports research desk: it posts the numbers fans find interesting about today's games, the way StatMuse or Opta Analyst would. You get one fact sheet about one game, written from the stats data.

Write the post:
- One to three short sentences, each on its own line. At most 200 characters in total.
- Lead with the number that stands out most, usually the most extreme one (the highest, the lowest, the unbeaten or winless record).
- Use only numbers that are in the fact sheet, written as digits exactly as the sheet writes them. Never compute, round, combine or add a number.
- When a number is a per-game rate or a record over a short stretch, say how many games it covers.
- Name teams the way fans do: the city or the nickname for a pro team, the school's common name in college. Never an abbreviation like "MIN" or "DET".
- Plain and confident. No pick, no prediction of who will win, no advice, no betting words (bet, odds, line, spread, cover, lock, fade, sharp, value, units, parlay, prop), no "Gary", no exclamation marks, no questions, no emoji, no hashtags.
- This season only. Never mention a past season.`;

async function writeStatPost(fact: Record<string, unknown>, model: string, timeoutMs: number): Promise<string> {
  const response = await subscriptionModelFetch('subscription-model', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 1024, system: STAT_RULES,
      messages: [{ role: 'user', content: JSON.stringify(fact) }],
      tools: [{ name: 'write_stat_post', description: 'The post text.', input_schema: { type: 'object', properties: {
        post: { type: 'string', description: 'The post, one sentence per line, at most 200 characters.' },
      }, required: ['post'], additionalProperties: false } }],
      tool_choice: { type: 'tool', name: 'write_stat_post', disable_parallel_tool_use: true },
    }),
  }, 'cloud-content', { timeoutMs });
  if (!response.ok) throw new Error(`STAT_WRITER_FAILED: status=${response.status}`);
  const body = await response.json();
  const input = (Array.isArray(body?.content) ? body.content : []).find((c: any) => c.type === 'tool_use')?.input;
  return String(input?.post ?? '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

type Skip = { reason: string; retry?: boolean };

async function todayPost(sb: Sb, today: string, nowMs: number, model: string, deadlineMs: number, used: { games: Set<string>; headlines: Set<string>; categories: Set<string> }): Promise<Composed | Skip> {
  const { data: games, error } = await sb.from('daily_slate').select('league, away_team, home_team, commence_time, bdl_game_id')
    .eq('date', today).in('league', Object.keys(LEAGUE_WEIGHT)).not('bdl_game_id', 'is', null);
  if (error) throw error;
  const ahead = (games ?? []).filter((g: any) => {
    const lead = new Date(g.commence_time).getTime() - nowMs;
    return lead >= 40 * 60_000 && lead <= 12 * 3_600_000 && !used.games.has(`${g.league}:${g.bdl_game_id}`);
  });
  if (!ahead.length) return { reason: 'no game far enough ahead today' };
  const byKey = new Map(ahead.map((g: any) => [`${g.league}:${g.bdl_game_id}`, g]));
  const { data: insights, error: insErr } = await sb.from('insight_connections')
    .select('id, league, category, game, game_id, headline, value, relevance_score, meta')
    .eq('date', today).in('game_id', ahead.map((g: any) => String(g.bdl_game_id))).in('category', Object.keys(CATEGORY_WEIGHT));
  if (insErr) throw insErr;
  const { data: big } = await sb.from('winners_big_games').select('league, game_id').eq('game_date', today);
  const bigKeys = new Set((big ?? []).map((b: any) => `${b.league}:${b.game_id}`));

  const best = new Map<string, any>();
  for (const ins of insights ?? []) {
    const key = `${ins.league}:${ins.game_id}`;
    const game = byKey.get(key);
    const sheet = factSheet(ins);
    if (!game || sheet.length < 40 || PAST_OR_MARKET.test(ins.headline) || ins.meta?.scope === 'last season') continue;
    if (used.headlines.has(String(ins.headline))) continue;
    const score = Number(ins.relevance_score ?? 50) + (CATEGORY_WEIGHT[ins.category] ?? 0) + (LEAGUE_WEIGHT[ins.league] ?? 0)
      + (bigKeys.has(key) ? 30 : 0) - (used.categories.has(ins.category) ? 15 : 0);
    if (!best.has(key) || best.get(key).score < score) best.set(key, { ins, game, sheet, score });
  }
  const ranked = [...best.values()].sort((a, b) => b.score - a.score).slice(0, 3);
  if (!ranked.length) return { reason: 'no usable fact for the games ahead' };

  const misses: string[] = [];
  for (const { ins, game, sheet } of ranked) {
    const [awayAbbr, homeAbbr] = String(ins.game ?? '').split(/\s+@\s+/);
    const names = [game.away_team, game.home_team, shortTeam(game.away_team, game.league), shortTeam(game.home_team, game.league)];
    const fact = {
      league: game.league, matchup: `${game.away_team} @ ${game.home_team}`,
      teams: { [awayAbbr ?? 'away']: game.away_team, [homeAbbr ?? 'home']: game.home_team },
      fact_headline: ins.headline, fact_sheet: sheet,
    };
    // The writer runs through the Mac model queue; a run never waits past its budget, and a queue failure
    // leaves the slot open for the next run instead of skipping it.
    const budget = deadlineMs - Date.now();
    if (budget < 30_000) return { reason: 'out of time for the writer this run', retry: true };
    let post = '';
    try { post = await writeStatPost(fact, model, Math.min(budget, 60_000)); }
    catch (e) { return { reason: `writer unavailable: ${String(e).slice(0, 160)}`, retry: true }; }
    const problems = statPostProblems(post, `${sheet} ${ins.headline} ${ins.value ?? ''}`, names, [awayAbbr, homeAbbr]);
    if (problems.length) { misses.push(`${ins.category}: ${problems.join(', ')}`); continue; }
    const matchup = `${shortTeam(game.away_team, game.league)} @ ${shortTeam(game.home_team, game.league)} ${startWords(game.commence_time)}`;
    return {
      text: `${post}\n\n${matchup}`, league: game.league, pickId: `${game.league}:${game.bdl_game_id}`,
      selection: { source: 'insight', insight_id: ins.id, category: ins.category, league: game.league, game_id: String(game.bdl_game_id), headline: ins.headline },
    };
  }
  return { reason: `no written fact passed the checks (${misses.join(' | ').slice(0, 400)})` };
}

// ── The slot runner ───────────────────────────────────────────────────────────────────────────────────

/** Posts the open slot's stat post, at most one per run. `force` (dry runs) composes a slot outside its window.
 *  A slot with nothing worth posting is logged as skipped (no tweet id), so later runs don't ask again. */
export async function runStatDesk(sb: Sb, today: string, nowMs: number, dryRun: boolean, deps: {
  model: string; postTweet: (text: string) => Promise<string>; force?: string | null; deadlineMs: number;
}): Promise<any[]> {
  const { dow, minute } = etParts(nowMs);
  const slots = statSlots(dow).filter((s) => deps.force ? s.slot === deps.force : minute >= s.from && minute < s.to);
  if (!slots.length) return [];
  const { data: done, error } = await sb.from('social_post_log').select('slot, audience_selection, post_date')
    .eq('thread_format', 'stat').gte('post_date', easternDateOffset(-6, new Date(nowMs)));
  if (error) throw error;
  const todays = (done ?? []).filter((r: any) => r.post_date === today);
  const used = {
    games: new Set<string>(todays.map((r: any) => `${r.audience_selection?.league}:${r.audience_selection?.game_id}`)),
    categories: new Set<string>(todays.map((r: any) => String(r.audience_selection?.category ?? ''))),
    headlines: new Set<string>((done ?? []).map((r: any) => String(r.audience_selection?.headline ?? ''))),
  };
  const out: any[] = [];
  for (const s of slots) {
    if (!dryRun && todays.some((r: any) => r.slot === s.slot)) continue;
    const claimKey = `STAT ${s.slot} ${today}`;
    let composed: Composed | Skip | null;
    try {
      composed = s.kind === 'last_night'
        ? await lastNightPost(sb, today) : await todayPost(sb, today, nowMs, deps.model, deps.deadlineMs, used);
    } catch (e) {
      // A data read that fails (BDL, the slate) leaves the slot open for the next run.
      composed = { reason: `data unavailable: ${String(e).slice(0, 160)}`, retry: true };
    }
    if (!composed || 'reason' in composed) {
      const skip: Skip = composed ?? { reason: 'no line big enough to post' };
      if (!dryRun && !skip.retry) {
        await sb.from('social_post_log').insert({
          post_date: today, slot: s.slot, pick_text: claimKey, thread_format: 'stat', audience_selection: { skipped: skip.reason.slice(0, 500) },
        });
      }
      out.push({ slot: s.slot, posted: false, reason: skip.reason });
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
