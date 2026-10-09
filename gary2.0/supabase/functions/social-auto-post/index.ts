import { easternDateOffset } from '../_shared/dateKeys.js';
import { isSocialServiceRequest } from "../post-single-tweet/authorization.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { socialRunHealth } from "./health.js";
import { composeFreePickPost } from "./gamePickHook.ts";

// social-auto-post — the scheduled @BetwithGary poster: the day's free pick, plus the metrics refresh.
//
// X is the brand's account, not a picks feed (founder, Sep 29 2026: "we are giving away way too many picks
// and it looks unprofessional"). The one automated post is the free pick the app already gives away, the
// day's streak pick, in the fact / bare pick / fact layout with one handoff reply. Everything else on the
// account (product posts, big-game posts, user updates) is written by hand and approved verbatim.
// Oct 4 2026: the free pick posts as text: "Gary's Free Pick: White Sox @ Guardians 5pm EST." (Oct 6), the
// bet on its own line, two facts a blank line apart, then the app line. Each morning a reply under
// yesterday's post says how it went. On a Sunday the NFL's morning game and Sunday Night Football post as
// free picks of their own, beside the day's free pick.
// The every-game pick threads, prop replies, recaps, verdict quote-tweets, week tape, arc updates and the
// personality post were removed on Sep 29 2026; git history keeps them.
//
// Cron: every 5 min (gary_ops.enqueue_social). Query params: ?dry_run=1 (compose, don't post or log),
// ?metrics_only=1. The response keeps the service/health contract gary_ops' failure monitor reads.

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
// Each row's numbers are the SUM across its tweets (root + reply). Throttled to once per 45 minutes off the
// stored timestamp, so it holds at any cron cadence without extra X reads.

const METRICS_MIN_INTERVAL_MIN = 45;

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

// Two-word nicknames; every other pro nickname is the team name's last word.
const TWO_WORD_NAMES = new Set(["white sox", "red sox", "blue jays", "trail blazers", "maple leafs", "golden knights", "blue jackets", "red wings"]);

/** A pro team's nickname ("Chicago White Sox" -> "White Sox"); a college team keeps its full name. */
function shortTeam(team: string, league: string): string {
  const words = String(team ?? "").trim().split(/\s+/);
  if (/NCAA/i.test(league) || words.length < 2) return words.join(" ");
  const two = words.slice(-2).join(" ");
  return TWO_WORD_NAMES.has(two.toLowerCase()) ? two : words[words.length - 1];
}

/** "White Sox @ Guardians": the writer's words when each side names its team, else the nicknames. */
function matchupWords(sp: any, written: string): string {
  const [away, home] = String(sp?.matchup ?? "").split(/\s+@\s+/);
  if (!away || !home) return String(sp?.matchup ?? "");
  const [wa, wh] = written.split(/\s+@\s+/);
  const names = (short: string | undefined, full: string) => !!short && full.toLowerCase().includes(short.toLowerCase());
  return names(wa, away) && names(wh, home) ? `${wa} @ ${wh}` : `${shortTeam(away, sp?.league)} @ ${shortTeam(home, sp?.league)}`;
}

/** "5pm EST", "7:05pm EST" (founder's words, Oct 6 2026). */
function startWords(iso: string): string {
  const s = new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  return `${s.replace(":00", "").replace(/\s*([AP])M$/, (_m, h) => `${h.toLowerCase()}m`)} EST`;
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

async function freePickText(sp: any): Promise<{ text: string; writer: string }> {
  const game = (matchup: string) => `${matchup} ${startWords(sp.commence_time)}`;
  const fallback = ticketWords(sp);
  try {
    const { data } = await sb.from("winners_candidates").select("rationale:pick_snapshot->>rationale").eq("id", sp.candidate_id).limit(1);
    const rationale = String(data?.[0]?.rationale ?? "");
    const w = await composeFreePickPost({ rationale, pick: String(sp.pick_text ?? ""), matchup: String(sp.matchup ?? ""), league: String(sp.league ?? ""), model: WRITER_MODEL });
    const keys = ticketKey(sp);
    const words = keys.length && keys.every((k) => w.pickWords.includes(k)) ? w.pickWords : fallback;
    return { text: `${w.opening}\n\n${words}\n${game(matchupWords(sp, w.matchupWords))}`, writer: words === fallback ? "fact, ticket words" : "writer" };
  } catch (e) {
    console.error("free pick writer failed: " + String(e));
    return { text: `${fallback}\n${game(matchupWords(sp, ""))}`, writer: `none (${String(e).slice(0, 120)})` };
  }
}

/** One free pick post: the claim, the text, the post, the link reply. `claimKey` is the log row's pick_text. */
async function postFreePick(sp: any, claimKey: string, today: string, nowMs: number, dryRun: boolean) {
  const leadMin = Math.round((new Date(sp.commence_time).getTime() - nowMs) / 60_000);
  if (!dryRun && leadMin < LEAD_MIN_MIN) return { posted: false, reason: `free pick's game starts in ${leadMin} min; too late to post` };
  const { data: already, error: logErr } = await sb.from("social_post_log")
    .select("id").eq("post_date", today).eq("pick_text", claimKey).limit(1);
  if (logErr) throw logErr;
  if (already?.length && !dryRun) return { posted: false, reason: "free pick already posted today" };

  if (dryRun) {
    const composed = await freePickText(sp);
    return { posted: false, dry_run: true, pick: sp.pick_text, lead_min: leadMin, ...composed, reply: LINK_REPLY };
  }

  const { error: claimErr } = await sb.from("social_post_log").insert({
    post_date: today, slot: "free_pick", league: sp.league, pick_text: claimKey, pick_id: String(sp.candidate_id ?? ""),
    commence_time: sp.commence_time, thread_format: "free_pick",
  });
  if (claimErr) return { posted: false, reason: "free pick claimed by another run" };
  const { text, writer } = await freePickText(sp);
  let tweetId: string;
  try { tweetId = await postTweet(text); }
  catch (e) {
    await sb.from("social_post_log").delete().eq("post_date", today).eq("pick_text", claimKey);
    return { posted: false, pick: sp.pick_text, error: String(e) };
  }
  const threadUrl = `https://x.com/BetwithGary/status/${tweetId}`;
  let replyId: string | null = null;
  try { replyId = await postTweet(LINK_REPLY, tweetId); } catch (e) { console.error("free pick link reply failed: " + String(e)); }
  const { error: upErr } = await sb.from("social_post_log").update({
    hook_tweet_id: tweetId, cta_tweet_id: replyId, thread_url: threadUrl, posted_at: new Date().toISOString(), post_text: text,
  }).eq("post_date", today).eq("pick_text", claimKey);
  if (upErr) return { posted: true, pick: sp.pick_text, thread_url: threadUrl, error: `POST_LOG_WRITE_FAILED: ${upErr.message}` };
  return { posted: true, pick: sp.pick_text, thread_url: threadUrl, writer };
}

async function runFreePickMode(today: string, nowMs: number, dryRun: boolean) {
  const { data: rows, error } = await sb.from("streak_picks")
    .select("candidate_id, league, kind, pick_text, odds, matchup, commence_time, player, prop, bet").eq("game_date", today).limit(1);
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

// THE MORNING RESULT (founder, Oct 2 2026: "close the loop every morning ... win or lose"). From 8 AM ET, once
// yesterday's free pick is graded, one reply under yesterday's post. Losses stay up like wins. A second free
// pick posted by hand (logged in slot free_pick under its own ticket, as on Oct 4 2026) gets the same reply.
const RESULT_WORDS: Record<string, string> = { won: "Won.", lost: "Lost.", push: "Push." };

/** How one of yesterday's free pick posts went: the day's streak pick, or a hand-posted game pick by its ticket. */
async function freePickResult(row: any, day: string): Promise<string> {
  if (row.pick_text === `FREE PICK ${day}`) {
    const { data, error } = await sb.rpc("streak_pick_day", { p_day: day });
    if (error) throw error;
    return String(data?.result ?? "").toLowerCase();
  }
  const { data, error } = await sb.rpc("gary_graded_games", { p_from: day, p_to: day });
  if (error) throw error;
  const graded = (data ?? []).find((g: any) => g.pick_text === row.pick_text && g.league === row.league);
  return String(graded?.result ?? "").toLowerCase();
}

async function runFreePickResult(nowMs: number, dryRun: boolean): Promise<any[]> {
  const hourEt = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date(nowMs)));
  if (hourEt < 8) return [{ replied: false, reason: "the result posts from 8 AM ET" }];
  const yesterday = easternDateOffset(-1);
  const { data: rows, error } = await sb.from("social_post_log").select("id, league, pick_text, hook_tweet_id")
    .eq("post_date", yesterday).eq("slot", "free_pick").not("hook_tweet_id", "is", null).is("result_tweet_id", null);
  if (error) throw error;
  if (!rows?.length) return [{ replied: false, reason: "no free pick result to post" }];
  const out: any[] = [];
  for (const row of rows) {
    const result = await freePickResult(row, yesterday);
    const words = RESULT_WORDS[result];
    if (!words) { out.push({ replied: false, reason: `yesterday's free pick is not graded yet (${result || "no result"})` }); continue; }
    if (dryRun) { out.push({ replied: false, dry_run: true, result, words }); continue; }
    const { data: claimed, error: claimErr } = await sb.from("social_post_log").update({ result_tweet_id: "pending", result })
      .eq("id", row.id).is("result_tweet_id", null).select("id");
    if (claimErr) throw claimErr;
    if (!claimed?.length) { out.push({ replied: false, reason: "result claimed by another run" }); continue; }
    try {
      const id = await postTweet(words, row.hook_tweet_id);
      await sb.from("social_post_log").update({ result_tweet_id: id }).eq("id", row.id);
      out.push({ replied: true, result, tweet: id });
    } catch (e) {
      await sb.from("social_post_log").update({ result_tweet_id: null, result: null }).eq("id", row.id);
      out.push({ replied: false, result, error: String(e) });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (!isSocialServiceRequest(req, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))) {
    return Response.json({ ok: false, error: "Service authorization required" }, { status: 403 });
  }
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
    const resultReplies = await runFreePickResult(Date.now(), dryRun);
    for (const r of resultReplies) if (r.replied || r.error) console.log(JSON.stringify({ mode: "free_pick_result", ...r }).slice(0, 300));
    return respond({ mode: "free_pick", metrics, results: [freePick, ...sundayPicks, ...resultReplies] });
  } catch (e) {
    console.error(String(e));
    return respond({ error: String(e) }, { status: 500 });
  }
});
