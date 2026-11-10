import { easternDateOffset } from '../_shared/dateKeys.js';
import { isSocialServiceRequest } from "../post-single-tweet/authorization.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { socialRunHealth } from "./health.js";
import { composeFreePickPost } from "./gamePickHook.ts";
import { shortTeam, startWords } from "./teamWords.ts";
import { runStatDesk } from "./statDesk.ts";
import { noDashes } from "../_shared/noDashes.js";

// social-auto-post — the scheduled @BetwithGary poster: the day's free pick, plus the metrics refresh.
//
// X is the brand's account, not a picks feed (founder, Sep 29 2026: "we are giving away way too many picks
// and it looks unprofessional"). The one automated post is the free pick the app already gives away, the
// day's streak pick, in the fact / bare pick / fact layout with one handoff reply. Everything else on the
// account (product posts, big-game posts, user updates) is written by hand and approved verbatim.
// Oct 4 2026: the free pick posts as text: "Gary's Free Pick: White Sox @ Guardians 5pm EST." (Oct 6), the
// bet on its own line, two facts a blank line apart, then the app line. Oct 10 2026: one fact, a blank line,
// the bet alone, a blank line, then the matchup and start ("have it spaced out for the pick"). Each morning a reply under
// yesterday's post says how it went. On a Sunday the NFL's morning game and Sunday Night Football post as
// free picks of their own, beside the day's free pick.
// Nov 9 2026 (the social reset): the post opens with Gary's own line on the pick from the app, with no label
// line; a clip of Gary saying it is attached when the Mac job has made one; the result is a quote post at the
// final ("Won. Bears 27, Buccaneers 24."), not a reply the next morning; the stat desk is off.
// The every-game pick threads, prop replies, recaps, verdict quote-tweets, week tape, arc updates and the
// personality post were removed on Sep 29 2026; git history keeps them.
//
// Oct 29 2026: the stat desk (statDesk.ts) adds three or four posts a day that are not picks: last night's best
// box-score line and facts about today's games from the app's insights.
//
// Cron: every 5 min (gary_ops.enqueue_social). Query params: ?dry_run=1 (compose, don't post or log),
// ?stat_slot=<slot> (with dry_run: compose that stat slot now), ?metrics_only=1. The response keeps the service/health contract gary_ops' failure monitor reads.

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SB_URL, SERVICE_KEY);

// A pick is never posted inside the last five minutes before its start, or after it.
const LEAD_MIN_MIN = 5;

function etDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

async function postTweet(text: string, replyToId?: string): Promise<string> {
  const fn = replyToId ? "post-reply-tweet" : "post-single-tweet";
  const body: Record<string, string> = { text };
  if (replyToId) body.replyToId = replyToId;
  const r = await fetch(`${SB_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.success || !j.tweetId) throw new Error(`${fn} failed: ${JSON.stringify(j).slice(0, 300)}`);
  return j.tweetId as string;
}

// ── Metrics ─────────────────────────────────────────────────────────────────────
// Impressions, likes, replies, retweets, bookmarks, profile and link clicks for the last six days of posts.
// Each row's numbers are the SUM across its tweets (root + reply). Throttled to once a day off the stored
// timestamp, so it holds at any cron cadence without extra X reads (founder, Nov 5 2026: X reads cost money,
// and nothing reads these numbers more often than daily).

const METRICS_MIN_INTERVAL_MIN = 24 * 60;

async function fetchMetricsBatch(ids: string[]): Promise<Record<string, any>> {
  const byId: Record<string, any> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    if (!chunk.length) continue;
    const r = await fetch(`${SB_URL}/functions/v1/get-tweet-metrics`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tweetIds: chunk }),
    });
    const j = await r.json();
    if (!r.ok || !j.success) throw new Error(`X metrics read failed: ${JSON.stringify(j).slice(0, 300)}`);
    if (Array.isArray(j.tweets)) for (const t of j.tweets) byId[t.id] = t;
  }
  return byId;
}

async function metricsRefreshedRecently(): Promise<boolean> {
  const { data, error } = await sb.from("social_post_log").select("metrics_updated_at")
    .not("metrics_updated_at", "is", null).order("metrics_updated_at", { ascending: false }).limit(1);
  if (error) throw new Error(`METRICS_READ_FAILED: ${error.code}`);
  const last = data?.[0]?.metrics_updated_at;
  return !!last && (Date.now() - new Date(last).getTime()) < METRICS_MIN_INTERVAL_MIN * 60_000;
}

async function refreshMetrics(): Promise<{ updated: number; checked: number }> {
  const since = easternDateOffset(-6);
  const { data: rows, error } = await sb.from("social_post_log").select("id, hook_tweet_id, reasoning_tweet_id, cta_tweet_id").gte("post_date", since).not("hook_tweet_id", "is", null);
  if (error) throw new Error(`METRICS_READ_FAILED: ${error.code}`);
  if (!rows?.length) return { updated: 0, checked: 0 };
  const allIds = new Set<string>();
  for (const row of rows) for (const id of [row.hook_tweet_id, row.reasoning_tweet_id, row.cta_tweet_id]) if (id) allIds.add(id);
  const byId = await fetchMetricsBatch([...allIds]);
  if (!Object.keys(byId).length) return { updated: 0, checked: rows.length };
  const nowIso = new Date().toISOString();
  let updated = 0;
  for (const row of rows) {
    const parts = [row.hook_tweet_id, row.reasoning_tweet_id, row.cta_tweet_id].filter(Boolean).map((id) => byId[id]).filter(Boolean);
    if (!parts.length) continue;
    const sum = (k: string) => parts.reduce((s: number, t: any) => s + (t[k] || 0), 0);
    // url_link_clicks is organic-only and can legitimately be null: 0 clicks and "X did not report" differ.
    const anyLinkClicks = parts.some((t: any) => t.url_link_clicks !== null && t.url_link_clicks !== undefined);
    const { error: upErr } = await sb.from("social_post_log").update({
      impressions: sum("impressions"), likes: sum("likes"), replies: sum("replies"), retweets: sum("retweets"),
      bookmarks: sum("bookmarks"), profile_clicks: sum("user_profile_clicks"),
      link_clicks: anyLinkClicks ? sum("url_link_clicks") : null, metrics_updated_at: nowIso,
    }).eq("id", row.id);
    if (upErr) throw new Error(`METRICS_WRITE_FAILED: ${upErr.code}`);
    updated++;
  }
  return { updated, checked: rows.length };
}

// ── The free pick ───────────────────────────────────────────────────────────────

const PROP_LABELS: Record<string, string> = {
  home_runs: "to homer",
  total_bases: "total bases",
  hits: "hits",
  hits_runs_rbis: "H+R+RBI",
  rbi: "RBI",
  rbis: "RBI",
  runs: "runs",
  walks: "walks",
  stolen_bases: "stolen bases",
  pitcher_strikeouts: "strikeouts",
  pitcher_outs: "outs recorded",
  pitcher_earned_runs: "earned runs",
  pitcher_walks: "walks allowed",
  pitcher_hits_allowed: "hits allowed",
};

// The day's free pick (the streak pick), posted once, as text. THE GAME PICK LAYOUT (founder, Oct 9 2026: "go back
// to the Game pick format that got us the most views ... only one line of reasoning. you decide"): one fact from
// Gary's published case (the Opus writer in gamePickHook.ts), a blank line, the bet alone (code checks the line
// and side against the ticket), then the matchup and start on the line under it. The most-viewed pick posts the
// account ever made (3,000+ views, Aug-Sep) led with a fact before the bare pick; the "Gary's Free Pick: ..."
// header layout of Oct 6-8 averaged about 300. Images stay off X (image posts drew 138-245 views). The link
// goes in the reply. The log row is claimed before the send so overlapping runs can never post it twice; a
// failed send releases the claim.
const LINK_REPLY = "The full breakdown is free in the app: betwithgary.ai/c/xpick";
const WRITER_MODEL = Deno.env.get("SOCIAL_ANTHROPIC_MODEL") ?? "claude-opus-5-5";

const lastWord = (team: string) => String(team ?? "").trim().split(/\s+/).pop() ?? "";

/** The ticket as it reads, without the price: "Virginia Tech Hokies -2.5". */
export function ticketWords(sp: any): string {
  if (sp?.kind === "prop") {
    const [type, line] = String(sp?.prop ?? "").split(" ");
    const label = PROP_LABELS[type] ?? String(type ?? "").replace(/_/g, " ");
    return type === "home_runs" ? `${sp.player} ${PROP_LABELS.home_runs}`
      : `${sp.player} ${String(sp?.bet ?? "").toLowerCase()} ${line} ${label}`;
  }
  return String(sp?.pick_text ?? "").replace(/\s+[+-]\d{3,4}\s*$/, "").trim();
}

/** "White Sox @ Guardians": the writer's words when each side names its team, else the nicknames. */
function matchupWords(sp: any, written: string): string {
  const [away, home] = String(sp?.matchup ?? "").split(/\s+@\s+/);
  if (!away || !home) return String(sp?.matchup ?? "");
  const [wa, wh] = written.split(/\s+@\s+/);
  const names = (short: string | undefined, full: string) => !!short && full.toLowerCase().includes(short.toLowerCase());
  return names(wa, away) && names(wh, home) ? `${wa} @ ${wh}` : `${shortTeam(away, sp?.league)} @ ${shortTeam(home, sp?.league)}`;
}

/** The part of the ticket the writer's words must keep: "-2.5", "ML", or a prop's side and line. */
function ticketKey(sp: any): string[] {
  if (sp?.kind === "prop") {
    const line = String(sp?.prop ?? "").split(" ")[1];
    return sp?.prop?.startsWith("home_runs") ? ["homer"] : [String(sp?.bet ?? "").toLowerCase(), line].filter(Boolean);
  }
  const t = String(sp?.pick_text ?? "");
  if (/\bML\b/i.test(t)) return ["ML", lastWord(t.replace(/\s+ML.*$/i, ""))];
  const spread = t.match(/\s([+-]\d+(?:\.\d+)?)\s+[+-]\d{3,4}\s*$/);
  return spread ? [spread[1]] : [];
}

// THE CALL IN GARY'S OWN WORDS (founder, Nov 9 2026: "throw it all out ... be the CMO ... own this"). The post
// opens with the line Gary wrote about his own pick in the app (pick_snapshot.brief.summary), then the bet alone,
// then the matchup and start. Nothing is written for X. A year of stat lines under a label never drew more than
// 5 likes; the "Gary's Free Pick of the Day" first line is gone. A pick with no line of its own (props) keeps
// the writer's one fact.
const X_LIMIT = 280;

/** The bet with the team's short name: "Tampa Bay Buccaneers +6.5 -120" reads "Buccaneers +6.5". */
export function betWords(sp: any): string {
  const words = ticketWords(sp);
  if (sp?.kind === "prop") return words;
  for (const team of String(sp?.matchup ?? "").split(/\s+@\s+/)) {
    if (team && words.startsWith(team + " ")) return `${shortTeam(team, sp?.league)}${words.slice(team.length)}`;
  }
  return words;
}

/** Gary's line fitted to one post: the whole line, else its first sentence, else nothing. */
export function garyLineFor(summary: string, rest: string): string {
  const whole = noDashes(String(summary ?? "").replace(/\s+/g, " ").trim());
  if (!whole) return "";
  const first = (whole.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? whole).trim();
  return [whole, first].find((line) => `${line}\n\n${rest}`.length <= X_LIMIT) ?? "";
}

async function freePickText(sp: any): Promise<{ text: string; writer: string }> {
  const game = (matchup: string) => `${matchup} ${startWords(sp.commence_time)}`;
  const fallback = ticketWords(sp);
  try {
    const { data } = await sb.from("winners_candidates")
      .select("summary:pick_snapshot->brief->>summary, rationale:pick_snapshot->>rationale").eq("id", sp.candidate_id).limit(1);
    const rest = `${betWords(sp)}\n\n${game(matchupWords(sp, ""))}`;
    const line = garyLineFor(String(data?.[0]?.summary ?? ""), rest);
    if (line) return { text: `${line}\n\n${rest}`, writer: "gary's line" };
    const rationale = String(data?.[0]?.rationale ?? "");
    const w = await composeFreePickPost({ rationale, pick: String(sp.pick_text ?? ""), matchup: String(sp.matchup ?? ""), league: String(sp.league ?? ""), model: WRITER_MODEL });
    const keys = ticketKey(sp);
    const words = keys.length && keys.every((k) => w.pickWords.includes(k)) ? w.pickWords : fallback;
    return { text: `${w.opening}\n\n${words}\n\n${game(matchupWords(sp, w.matchupWords))}`, writer: words === fallback ? "fact, ticket words" : "writer" };
  } catch (e) {
    console.error("free pick text failed: " + String(e));
    return { text: `${betWords(sp)}\n\n${game(matchupWords(sp, ""))}`, writer: `none (${String(e).slice(0, 120)})` };
  }
}

// GARY'S CLIP (Nov 9 2026). The Mac job GaryMarketing/gary-call/run.mjs renders a short clip of Gary saying his
// line and puts it in the social-media bucket at gary-call/<date>-<candidate>-x.mp4. The post waits up to 15
// minutes from the pick for it (never inside 30 minutes of the start), then goes out as text. A failed video
// post falls back to text, so a pick is never lost to the clip.
const CLIP_WAIT_MIN = 15;
const CLIP_MIN_LEAD_MIN = 30;
const clipName = (today: string, sp: any) => `${today}-${sp.candidate_id}-x.mp4`;

async function clipReady(name: string): Promise<boolean> {
  try {
    const { data } = await sb.storage.from("social-media").list("gary-call", { search: name, limit: 5 });
    return !!data?.some((f: any) => f.name === name);
  } catch (_e) { return false; }
}

async function pickedAtMs(sp: any): Promise<number> {
  if (sp?.chosen_at) return new Date(sp.chosen_at).getTime();
  try {
    const { data } = await sb.from("winners_candidates").select("created_at").eq("id", sp.candidate_id).limit(1);
    return data?.[0]?.created_at ? new Date(data[0].created_at).getTime() : 0;
  } catch (_e) { return 0; }
}

async function postTweetWithClip(text: string, videoPath: string): Promise<string> {
  const r = await fetch(`${SB_URL}/functions/v1/post-tweet-media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, video_path: videoPath }),
  });
  const j = await r.json();
  if (!j.success || !j.tweetId) throw new Error(`post-tweet-media failed: ${JSON.stringify(j).slice(0, 300)}`);
  return j.tweetId as string;
}

/** One pick post: the claim, the text, the post, the link reply. `claimKey` is the log row's pick_text. */
async function postFreePick(sp: any, claimKey: string, today: string, nowMs: number, dryRun: boolean, opts: { slot?: string; reply?: string } = {}) {
  const slot = opts.slot ?? "free_pick";
  const linkReply = opts.reply ?? LINK_REPLY;
  const leadMin = Math.round((new Date(sp.commence_time).getTime() - nowMs) / 60_000);
  if (!dryRun && leadMin < LEAD_MIN_MIN) return { posted: false, reason: `free pick's game starts in ${leadMin} min; too late to post` };
  const { data: already, error: logErr } = await sb.from("social_post_log")
    .select("id").eq("post_date", today).eq("pick_text", claimKey).limit(1);
  if (logErr) throw logErr;
  if (already?.length && !dryRun) return { posted: false, reason: "free pick already posted today" };
  // One pick, one post: the day's free pick is also one of the game picks, whichever lane reaches it first.
  if (!dryRun && sp.candidate_id != null) {
    const { data: same, error: sameErr } = await sb.from("social_post_log")
      .select("id").eq("post_date", today).eq("pick_id", String(sp.candidate_id)).limit(1);
    if (sameErr) throw sameErr;
    if (same?.length) return { posted: false, reason: "this pick is already posted today" };
  }

  // Nov 9 2026, founder on the first clip: "decent for instagram but not X". The clip stays on Instagram; on X it
  // is attached only with GARY_CLIP_ON_X=1, so the call posts as text and never waits.
  const clip = clipName(today, sp);
  const hasClip = Deno.env.get("GARY_CLIP_ON_X") === "1" && await clipReady(clip);
  if (!dryRun && !hasClip && Deno.env.get("GARY_CLIP_ON_X") === "1" && leadMin > CLIP_MIN_LEAD_MIN) {
    const waitedMin = (nowMs - await pickedAtMs(sp)) / 60_000;
    if (waitedMin >= 0 && waitedMin < CLIP_WAIT_MIN) return { posted: false, reason: `waiting for Gary's clip (${Math.round(waitedMin)} of ${CLIP_WAIT_MIN} min)` };
  }

  if (dryRun) {
    const composed = await freePickText(sp);
    return { posted: false, dry_run: true, pick: sp.pick_text, lead_min: leadMin, ...composed, clip: hasClip ? clip : null, reply: linkReply };
  }

  const { error: claimErr } = await sb.from("social_post_log").insert({
    post_date: today, slot, league: sp.league, pick_text: claimKey, pick_id: String(sp.candidate_id ?? ""),
    commence_time: sp.commence_time, thread_format: slot,
  });
  if (claimErr) return { posted: false, reason: "free pick claimed by another run" };
  const { text, writer } = await freePickText(sp);
  let tweetId = "";
  let withClip = false;
  if (hasClip) {
    try { tweetId = await postTweetWithClip(text, `gary-call/${clip}`); withClip = true; }
    catch (e) { console.error("free pick clip post failed, posting text: " + String(e)); }
  }
  if (!tweetId) {
    try { tweetId = await postTweet(text); }
    catch (e) {
      await sb.from("social_post_log").delete().eq("post_date", today).eq("pick_text", claimKey);
      return { posted: false, pick: sp.pick_text, error: String(e) };
    }
  }
  const threadUrl = `https://x.com/BetwithGary/status/${tweetId}`;
  let replyId: string | null = null;
  try { replyId = await postTweet(linkReply, tweetId); } catch (e) { console.error("free pick link reply failed: " + String(e)); }
  const { error: upErr } = await sb.from("social_post_log").update({
    hook_tweet_id: tweetId, cta_tweet_id: replyId, thread_url: threadUrl, posted_at: new Date().toISOString(), post_text: text,
    audience_selection: { format: "gary_call_v1", writer, clip: withClip ? `gary-call/${clip}` : null },
  }).eq("post_date", today).eq("pick_text", claimKey);
  if (upErr) return { posted: true, pick: sp.pick_text, thread_url: threadUrl, error: `POST_LOG_WRITE_FAILED: ${upErr.message}` };
  return { posted: true, pick: sp.pick_text, thread_url: threadUrl, writer, clip: withClip };
}

async function runFreePickMode(today: string, nowMs: number, dryRun: boolean) {
  const { data: rows, error } = await sb.from("streak_picks")
    .select("candidate_id, league, kind, pick_text, odds, matchup, commence_time, player, prop, bet, chosen_at").eq("game_date", today).limit(1);
  if (error) throw error;
  const sp = rows?.[0];
  if (!sp) return { posted: false, reason: "today's free pick is not chosen yet" };
  return postFreePick(sp, `FREE PICK ${today}`, today, nowMs, dryRun);
}

// SUNDAY'S THREE (founder, Oct 4 2026: "always pick the morning NFL game, the SNF game and then a normal free
// pick of the day"). free_pick_extras returns Gary's published game pick on the Sunday NFL game that kicks off
// before noon ET and on Sunday Night Football; each posts once it exists, in the free pick layout, logged under
// its own ticket. select_streak_pick leaves those two games out, so the day's free pick is a third pick.
async function runSundayFreePicks(today: string, nowMs: number, dryRun: boolean): Promise<any[]> {
  const { data, error } = await sb.rpc("free_pick_extras", { p_date: today });
  if (error) throw error;
  const out: any[] = [];
  for (const sp of (Array.isArray(data) ? data : [])) {
    if (new Date(sp.commence_time).getTime() <= nowMs) continue;
    out.push(await postFreePick(sp, String(sp.pick_text), today, nowMs, dryRun));
  }
  return out;
}

// EVERY GAME, AS TEXT (Nov 10 2026). The founder, on a 28-view image post: "we used to get 1k or 600 on tweets so
// what happened? ... look back at the old tweets that used to get the most views like months and months ago."
// The log's answer: July to September every game pick got its own text post (fact / pick / fact) and a verdict
// after the final. 250 to 380 posts a month at about 560 to 600 views each (best 3,462), 150K to 210K views and
// about 1,000 profile visits a month. On Sep 29 the account went to one free pick a day and monthly views fell to
// 18K. So every published game pick posts again, in the free pick layout: Gary's own line from the app, the bet,
// the matchup and start. No writer model, no image. It posts inside the two hours before the start, one post a
// run and at least GAME_GAP_MIN apart, GAME_DAILY_CAP a day. College leagues post the games with a ranked team
// (a Saturday is 31 college picks). GAME_PICKS_ON_X=0 turns the lane off.
const GAME_LEAD_MAX_MIN = 120;
const GAME_GAP_MIN = 6;
const GAME_DAILY_CAP = 24;
const RANKED_ONLY = ["NCAAF", "NCAAB"];

async function runGamePicks(today: string, nowMs: number, dryRun: boolean, previewAll = false): Promise<any[]> {
  // OFF (founder, Nov 10 2026, the same day: "we dont need to do a pick for every game that had nothing to do with
  // the views"). He is right on the per-post number: one free pick a day drew 340 to 2,052 views from Oct 9 to 18.
  // The lane runs only with GAME_PICKS_ON_X=1; a dry run still previews it.
  if (!dryRun && Deno.env.get("GAME_PICKS_ON_X") !== "1") return [];
  const { data: cands, error } = await sb.from("winners_candidates")
    .select("id, league, pick_text, odds, commence_time, away:pick_snapshot->>awayTeam, home:pick_snapshot->>homeTeam, summary:pick_snapshot->brief->>summary")
    .eq("game_date", today).eq("kind", "game").order("commence_time").order("id");
  if (error) throw error;
  if (!cands?.length) return [];
  const { data: log, error: logErr } = await sb.from("social_post_log").select("pick_text, pick_id, slot, posted_at").eq("post_date", today);
  if (logErr) throw logErr;
  const postedIds = new Set((log ?? []).map((r: any) => String(r.pick_id ?? "")));
  const postedTexts = new Set((log ?? []).map((r: any) => String(r.pick_text ?? "")));
  const gameRows = (log ?? []).filter((r: any) => r.slot === "game_pick");
  if (!previewAll && !dryRun) {
    if (gameRows.length >= GAME_DAILY_CAP) return [];
    const lastMs = Math.max(0, ...gameRows.filter((r: any) => r.posted_at).map((r: any) => new Date(r.posted_at).getTime()));
    if (nowMs - lastMs < GAME_GAP_MIN * 60_000) return [];
  }
  // A college league with ranked teams on today's slate posts only those games; with none ranked, all of them.
  const gameKey = (league: any, away: any, home: any) => `${league}|${away}|${home}`.toLowerCase();
  const ranked = new Set<string>();
  const rankedLeagues = new Set<string>();
  if (cands.some((c: any) => RANKED_ONLY.includes(String(c.league ?? "").toUpperCase()))) {
    const { data: slate, error: slateErr } = await sb.from("daily_slate")
      .select("league, away_team, home_team, away_ranking, home_ranking").eq("date", today).in("league", RANKED_ONLY);
    if (slateErr) throw slateErr;
    for (const s of (slate ?? [])) {
      if (s.away_ranking == null && s.home_ranking == null) continue;
      ranked.add(gameKey(s.league, s.away_team, s.home_team));
      rankedLeagues.add(String(s.league ?? "").toUpperCase());
    }
  }
  const out: any[] = [];
  for (const c of cands) {
    const league = String(c.league ?? "").toUpperCase();
    if (!c.summary || !c.away || !c.home || !c.commence_time || !c.pick_text) continue;
    if (rankedLeagues.has(league) && !ranked.has(gameKey(c.league, c.away, c.home))) continue;
    const sp = { candidate_id: c.id, league: c.league, kind: "game", pick_text: c.pick_text, odds: c.odds, matchup: `${c.away} @ ${c.home}`, commence_time: c.commence_time };
    const opts = { slot: "game_pick", reply: `The full breakdown on ${matchupWords(sp, "")} is free in the app: betwithgary.ai/c/xgame` };
    if (previewAll) { out.push(await postFreePick(sp, String(c.pick_text), today, nowMs, true, opts)); continue; }
    const leadMin = (new Date(c.commence_time).getTime() - nowMs) / 60_000;
    if (leadMin > GAME_LEAD_MAX_MIN || leadMin < LEAD_MIN_MIN) continue;
    if (postedIds.has(String(c.id)) || postedTexts.has(String(c.pick_text))) continue;
    out.push(await postFreePick(sp, String(c.pick_text), today, nowMs, dryRun, opts));
    if (!dryRun) break;                                           // one post a run; the gap rule spaces the rest
  }
  return out;
}

// THE VERDICT (Nov 9 2026; from Oct 2 it was a "Won." reply the next morning). As soon as a free pick is graded,
// a post quoting the call says how it went and the final score: "Won. Bears 27, Buccaneers 24." Wins and losses
// both, at the final, while people are still on the game. A prop has no score line. A second free pick posted by
// hand (logged in slot free_pick under its own ticket, as on Oct 4 2026) gets the same post.
const RESULT_WORDS: Record<string, string> = { won: "Won.", lost: "Lost.", push: "Push." };
const VERDICTS_PER_RUN = 3;

async function postQuote(text: string, quoteTweetId: string): Promise<string> {
  const r = await fetch(`${SB_URL}/functions/v1/post-quote-tweet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, quoteTweetId }),
  });
  const j = await r.json();
  if (!j.success || !j.tweetId) throw new Error(`post-quote-tweet failed: ${JSON.stringify(j).slice(0, 300)}`);
  return j.tweetId as string;
}

/** How a logged pick went: the day's streak pick, or a game pick logged under its own ticket. `gradedByDay` holds each day's graded games for the run. */
async function freePickOutcome(row: any, day: string, gradedByDay: Record<string, any[]> = {}): Promise<{ result: string; league: string; kind: string; pickText: string }> {
  if (row.pick_text === `FREE PICK ${day}`) {
    const { data, error } = await sb.rpc("streak_pick_day", { p_day: day });
    if (error) throw error;
    return { result: String(data?.result ?? "").toLowerCase(), league: String(data?.league ?? row.league ?? ""), kind: String(data?.kind ?? "game"), pickText: String(data?.pick_text ?? "") };
  }
  if (!gradedByDay[day]) {
    const { data, error } = await sb.rpc("gary_graded_games", { p_from: day, p_to: day });
    if (error) throw error;
    gradedByDay[day] = data ?? [];
  }
  const graded = gradedByDay[day].find((g: any) => g.pick_text === row.pick_text && g.league === row.league);
  return { result: String(graded?.result ?? "").toLowerCase(), league: String(row.league ?? ""), kind: "game", pickText: String(row.pick_text ?? "") };
}

/** "Bears 27, Buccaneers 24." The graded row's final_score reads away-home beside its "Away @ Home" matchup. */
export function scoreWords(finalScore: string, matchup: string, league: string): string {
  const m = String(finalScore ?? "").trim().match(/^(\d+)\s*-\s*(\d+)$/);
  const [away, home] = String(matchup ?? "").split(/\s+@\s+/);
  if (!m || !away || !home) return "";
  const a = { name: shortTeam(away, league), pts: Number(m[1]) }, h = { name: shortTeam(home, league), pts: Number(m[2]) };
  const [top, bottom] = a.pts >= h.pts ? [a, h] : [h, a];
  return `${top.name} ${top.pts}, ${bottom.name} ${bottom.pts}.`;
}

async function finalScoreWords(league: string, day: string, pickText: string): Promise<string> {
  try {
    const nfl = league.toUpperCase() === "NFL";
    const q = sb.from(nfl ? "nfl_results" : "game_results").select("final_score, matchup").eq("game_date", day).eq("pick_text", pickText);
    const { data } = await (nfl ? q : q.ilike("league", league)).limit(1);
    return scoreWords(String(data?.[0]?.final_score ?? ""), String(data?.[0]?.matchup ?? ""), league);
  } catch (_e) { return ""; }
}

async function runFreePickResult(nowMs: number, dryRun: boolean): Promise<any[]> {
  const days = [etDate(new Date(nowMs)), easternDateOffset(-1, new Date(nowMs))];
  const { data: rows, error } = await sb.from("social_post_log").select("id, post_date, league, pick_text, hook_tweet_id")
    .in("post_date", days).in("slot", ["free_pick", "game_pick"]).not("hook_tweet_id", "is", null).is("result_tweet_id", null);
  if (error) throw error;
  if (!rows?.length) return [{ replied: false, reason: "no free pick result to post" }];
  const out: any[] = [];
  const gradedByDay: Record<string, any[]> = {};
  for (const row of rows) {
    if (out.filter((r) => r.replied).length >= VERDICTS_PER_RUN) break;   // a slate ending together spreads over a few runs
    const o = await freePickOutcome(row, row.post_date, gradedByDay);
    const words = RESULT_WORDS[o.result];
    if (!words) { out.push({ replied: false, reason: `free pick of ${row.post_date} is not graded yet (${o.result || "no result"})` }); continue; }
    const score = o.kind === "game" && o.pickText ? await finalScoreWords(o.league, row.post_date, o.pickText) : "";
    const text = score ? `${words} ${score}` : words;
    if (dryRun) { out.push({ replied: false, dry_run: true, result: o.result, words: text }); continue; }
    const { data: claimed, error: claimErr } = await sb.from("social_post_log").update({ result_tweet_id: "pending", result: o.result })
      .eq("id", row.id).is("result_tweet_id", null).select("id");
    if (claimErr) throw claimErr;
    if (!claimed?.length) { out.push({ replied: false, reason: "result claimed by another run" }); continue; }
    try {
      const id = await postQuote(text, row.hook_tweet_id);
      await sb.from("social_post_log").update({ result_tweet_id: id }).eq("id", row.id);
      out.push({ replied: true, result: o.result, words: text, tweet: id });
    } catch (e) {
      await sb.from("social_post_log").update({ result_tweet_id: null, result: null }).eq("id", row.id);
      out.push({ replied: false, result: o.result, error: String(e) });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (!isSocialServiceRequest(req, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))) {
    return Response.json({ ok: false, error: "Service authorization required" }, { status: 403 });
  }
  const startedAt = Date.now();
  let dryRun = false;
  let runKind = "scheduled";
  // pg_cron success means the HTTP request was enqueued, not that X accepted it. gary_ops reads this
  // retained response; a degraded run is HTTP 503.
  const respond = (body: any, init?: ResponseInit) => {
    const health = socialRunHealth(body);
    return Response.json({
      ...body, service: "social-auto-post", posting_policy: "free-pick-v1", checked_at: new Date().toISOString(),
      dry_run: dryRun, run_kind: runKind, health,
    }, { ...init, status: init?.status ?? (health.status === "ok" ? 200 : 503) });
  };
  try {
    const url = new URL(req.url);
    dryRun = url.searchParams.get("dry_run") === "1";
    const metricsOnly = url.searchParams.get("metrics_only") === "1";
    runKind = dryRun ? "manual" : metricsOnly ? "metrics" : "scheduled";

    let metrics: any = { updated: 0, checked: 0 };
    if (!dryRun) {
      try {
        metrics = (!metricsOnly && await metricsRefreshedRecently())
          ? { skipped: `refreshed within the last ${METRICS_MIN_INTERVAL_MIN}min` }
          : await refreshMetrics();
      } catch (e) { console.error("metrics refresh failed: " + String(e)); metrics = { error: String(e) }; }
    }
    if (metricsOnly) return respond({ metrics_only: true, metrics });

    const freePick = await runFreePickMode(etDate(), Date.now(), dryRun);
    console.log(JSON.stringify({ mode: "free_pick", ...freePick }).slice(0, 500));
    const sundayPicks = await runSundayFreePicks(etDate(), Date.now(), dryRun);
    for (const r of sundayPicks) console.log(JSON.stringify({ mode: "sunday_free_pick", ...r }).slice(0, 500));
    // ?dry_run=1&game_picks=all[&day=YYYY-MM-DD] composes every game post of that day and posts nothing.
    const previewAll = dryRun && url.searchParams.get("game_picks") === "all";
    const gameDay = (previewAll && url.searchParams.get("day")) || etDate();
    const gamePicks = await runGamePicks(gameDay, Date.now(), dryRun, previewAll);
    for (const r of gamePicks) console.log(JSON.stringify({ mode: "game_pick", ...r }).slice(0, 500));
    const resultReplies = await runFreePickResult(Date.now(), dryRun);
    for (const r of resultReplies) if (r.replied || r.error) console.log(JSON.stringify({ mode: "free_pick_result", ...r }).slice(0, 300));
    // The stat desk (statDesk.ts) is OFF since Nov 9 2026 (27 posts, about 107 views each, 1 like). It runs only
    // with STAT_DESK_ENABLED=1, or as a dry-run preview of one slot (?dry_run=1&stat_slot=<slot>).
    const statSlot = url.searchParams.get("stat_slot");
    const statDeskOn = Deno.env.get("STAT_DESK_ENABLED") === "1" || (dryRun && !!statSlot);
    const statPosts = !statDeskOn ? [] : await runStatDesk(sb, etDate(), Date.now(), dryRun, {
      model: WRITER_MODEL, postTweet: (text) => postTweet(text), force: statSlot, deadlineMs: startedAt + 110_000,
    });
    for (const r of statPosts) console.log(JSON.stringify({ mode: "stat_desk", ...r }).slice(0, 500));
    return respond({ mode: "free_pick", metrics, results: [freePick, ...sundayPicks, ...gamePicks, ...resultReplies, ...statPosts] });
  } catch (e) {
    console.error(String(e));
    return respond({ error: String(e) }, { status: 500 });
  }
});
