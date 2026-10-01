import { easternDateOffset } from '../_shared/dateKeys.js';
import { isSocialServiceRequest } from "../post-single-tweet/authorization.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { socialRunHealth } from "./health.js";

// social-auto-post — the scheduled @BetwithGary poster: the day's free pick, plus the metrics refresh.
//
// X is the brand's account, not a picks feed (founder, Sep 29 2026: "we are giving away way too many picks
// and it looks unprofessional"). The one automated post is the free pick the app already gives away, the
// day's streak pick, in the fact / bare pick / fact layout with one handoff reply. Everything else on the
// account (product posts, big-game posts, user updates) is written by hand and approved verbatim.
// Oct 1 2026: the free pick is one line (the game and the pick) on the Mac-rendered unveil video.
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

// The day's free pick (the streak pick), posted once as ONE LINE, the game and the pick (founder, Oct 1 2026:
// "just the Game and the Pick so people don't have to watch the video"), with the free pick video when the Mac has
// rendered it (free_pick_videos), then the link reply. The bet reads as Gary placed it, price included (founder,
// Oct 1 2026, "Braves ML -110 or whatever the bet is"). No model writes it. The poster waits for the video until
// VIDEO_WAIT_MIN before the start, then posts the line alone so the free pick is never missed. The log row is claimed
// before the send so overlapping runs can never post it twice; a failed send releases the claim.
const VIDEO_WAIT_MIN = 25;
const LINK_REPLY = "Free on iPhone: betwithgary.ai/c/xpick";

export function freePickLine(sp: any): string {
  const game = String(sp?.matchup ?? "").replace(/\s+@\s+/, " at ").trim();
  let bet = String(sp?.pick_text ?? "").trim();
  if (sp?.kind === "prop") {
    const [type, line] = String(sp?.prop ?? "").split(" ");
    const label = PROP_LABELS[type] ?? String(type ?? "").replace(/_/g, " ");
    const odds = sp?.odds == null ? "" : (Number(sp.odds) > 0 ? ` +${Number(sp.odds)}` : ` ${Number(sp.odds)}`);
    bet = type === "home_runs" ? `${sp.player} ${PROP_LABELS.home_runs}${odds}`
      : `${sp.player} ${String(sp?.bet ?? "").toLowerCase()} ${line} ${label}${odds}`;
  }
  // Founder, Oct 1 2026: "don't need to put 'Gary's free pick:' it's clear what it is." The game, then the bet.
  return game ? `${game}\n${bet}` : bet;
}

async function postFreePick(text: string, videoPath: string | null): Promise<string> {
  if (!videoPath) return postTweet(text);
  const r = await fetch(`${SB_URL}/functions/v1/post-tweet-media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, video_path: videoPath }),
  });
  const j = await r.json();
  if (!j.success || !j.tweetId) throw new Error(`post-tweet-media failed: ${JSON.stringify(j).slice(0, 300)}`);
  return j.tweetId as string;
}

async function runFreePickMode(today: string, nowMs: number, dryRun: boolean) {
  const { data: rows, error } = await sb.from("streak_picks")
    .select("candidate_id, league, kind, pick_text, odds, matchup, commence_time, player, prop, bet").eq("game_date", today).limit(1);
  if (error) throw error;
  const sp = rows?.[0];
  if (!sp) return { posted: false, reason: "today's free pick is not chosen yet" };
  const leadMin = Math.round((new Date(sp.commence_time).getTime() - nowMs) / 60_000);
  if (!dryRun && leadMin < LEAD_MIN_MIN) return { posted: false, reason: `free pick's game starts in ${leadMin} min; too late to post` };
  const claimKey = `FREE PICK ${today}`;
  const { data: already, error: logErr } = await sb.from("social_post_log")
    .select("id").eq("post_date", today).eq("pick_text", claimKey).limit(1);
  if (logErr) throw logErr;
  if (already?.length && !dryRun) return { posted: false, reason: "free pick already posted today" };

  const { data: vids, error: vidErr } = await sb.from("free_pick_videos")
    .select("candidate_id, status, storage_path").eq("game_date", today).limit(1);
  if (vidErr) throw vidErr;
  const v = vids?.[0];
  const video = v && v.status === "ready" && Number(v.candidate_id) === Number(sp.candidate_id) && v.storage_path ? v.storage_path as string : null;
  const text = freePickLine(sp);
  if (dryRun) return { posted: false, dry_run: true, pick: sp.pick_text, lead_min: leadMin, text, video, reply: LINK_REPLY };
  if (!video && v?.status !== "failed" && leadMin > VIDEO_WAIT_MIN) {
    return { posted: false, reason: `waiting for the free pick video (${leadMin} min to start)` };
  }

  const { error: claimErr } = await sb.from("social_post_log").insert({
    post_date: today, slot: "free_pick", league: sp.league, pick_text: claimKey,
    thread_format: video ? "free_pick_video" : "free_pick", post_text: text,
  });
  if (claimErr) return { posted: false, reason: "free pick claimed by another run" };
  let tweetId: string;
  try { tweetId = await postFreePick(text, video); }
  catch (e) {
    await sb.from("social_post_log").delete().eq("post_date", today).eq("pick_text", claimKey);
    return { posted: false, pick: sp.pick_text, error: String(e) };
  }
  const threadUrl = `https://x.com/BetwithGary/status/${tweetId}`;
  let replyId: string | null = null;
  try { replyId = await postTweet(LINK_REPLY, tweetId); } catch (e) { console.error("free pick link reply failed: " + String(e)); }
  const { error: upErr } = await sb.from("social_post_log").update({
    hook_tweet_id: tweetId, cta_tweet_id: replyId, thread_url: threadUrl, posted_at: new Date().toISOString(),
  }).eq("post_date", today).eq("pick_text", claimKey);
  if (upErr) return { posted: true, pick: sp.pick_text, thread_url: threadUrl, error: `POST_LOG_WRITE_FAILED: ${upErr.message}` };
  return { posted: true, pick: sp.pick_text, thread_url: threadUrl, video: !!video };
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
    return respond({ mode: "free_pick", metrics, results: [freePick] });
  } catch (e) {
    console.error(String(e));
    return respond({ error: String(e) }, { status: 500 });
  }
});
