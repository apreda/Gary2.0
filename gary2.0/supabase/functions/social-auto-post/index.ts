import { easternDateOffset } from '../_shared/dateKeys.js';
import { isSocialServiceRequest } from "../post-single-tweet/authorization.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { composeGamePickHook } from "./gamePickHook.ts";
import { socialRunHealth } from "./health.js";
import { mergeSocialPickSources } from "./pickSources.js";
import { barePick } from "./barepick.ts";

// social-auto-post — the scheduled @BetwithGary poster: the day's free pick, plus the metrics refresh.
//
// X is the brand's account, not a picks feed (founder, Sep 29 2026: "we are giving away way too many picks
// and it looks unprofessional"). The one automated post is the free pick the app already gives away, the
// day's streak pick, in the fact / bare pick / fact layout with one handoff reply. Everything else on the
// account (product posts, big-game posts, user updates) is written by hand and approved verbatim.
// The every-game pick threads, prop replies, recaps, verdict quote-tweets, week tape, arc updates and the
// personality post were removed on Sep 29 2026; git history keeps them.
//
// Cron: every 5 min (gary_ops.enqueue_social). Query params: ?dry_run=1 (compose, don't post or log),
// ?metrics_only=1. The response keeps the service/health contract gary_ops' failure monitor reads.
// LLM: the private subscription worker, SOCIAL_ANTHROPIC_MODEL (claude-opus-5-5: users read it, Oct 1 2026).

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_MODEL = Deno.env.get("SOCIAL_ANTHROPIC_MODEL") ?? "claude-opus-5-5";
const sb = createClient(SB_URL, SERVICE_KEY);

// A pick is never posted inside the last five minutes before its start, or after it.
const LEAD_MIN_MIN = 5;
// The reply under the free pick. No URL on purpose: the install path lives in the bio.
const APP_HANDOFF = "The full read, and the rest of today's card, are in the app. Link in bio.";

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

// "Clay Holmes OVER 1.5 earned runs". No price (founder, Aug 26 2026: the bet, never the price).
function propPickLine(p: any): string {
  const type = String(p?.prop ?? "").split(" ")[0];
  if (type === "home_runs") return `${p.player} ${PROP_LABELS.home_runs}`;
  const label = PROP_LABELS[type] ?? type.replace(/_/g, " ");
  return `${p.player} ${String(p?.bet ?? "").toUpperCase()} ${p.line} ${label}`;
}

// The day's streak pick, written from Gary's published rationale: fact / bare pick / fact, then the handoff
// reply. It posts once the pick is chosen and at least LEAD_MIN_MIN before its start. The log row is claimed
// before the send so overlapping runs can never post it twice; a failed send releases the claim.
async function runFreePickMode(today: string, nowMs: number, dryRun: boolean) {
  const { data: rows, error } = await sb.from("streak_picks")
    .select("league, kind, pick_text, matchup, commence_time, player").eq("game_date", today).limit(1);
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

  let rationale = "";
  let pickLine = "";
  if (sp.kind === "prop") {
    const { data: pp, error: ppErr } = await sb.from("prop_picks").select("picks").eq("date", today);
    if (ppErr) throw ppErr;
    const prop = (pp ?? []).flatMap((r: any) => r.picks ?? [])
      .find((p: any) => String(p?.player ?? "").toLowerCase() === String(sp.player ?? "").toLowerCase()
        && String(p?.matchup ?? "") === String(sp.matchup ?? ""));
    if (!prop) return { posted: false, reason: `free pick prop not found in prop_picks: ${sp.pick_text}` };
    rationale = String(prop.rationale ?? "");
    pickLine = propPickLine(prop);
  } else {
    const [{ data: dp, error: dpErr }, { data: weekly, error: wkErr }] = await Promise.all([
      sb.from("daily_picks").select("picks").eq("date", today),
      sb.from("weekly_nfl_picks").select("week_start,picks").lte("week_start", today).order("week_start", { ascending: false }).limit(1),
    ]);
    if (dpErr) throw dpErr;
    if (wkErr) throw wkErr;
    const picks = mergeSocialPickSources((dp ?? []).flatMap((r: any) => r.picks ?? []), weekly?.[0], today);
    const want = barePick(String(sp.pick_text));
    const game = picks.find((p: any) => barePick(String(p.pick ?? "")) === want
      && String(sp.matchup ?? "").includes(String(p.homeTeam ?? "\u0000")));
    if (!game) return { posted: false, reason: `free pick not found in today's picks: ${sp.pick_text}` };
    rationale = String(game.rationale ?? "");
    pickLine = want;
  }

  let hook: string;
  try {
    hook = await composeGamePickHook({ rationale, pickLine, matchup: String(sp.matchup ?? ""), league: String(sp.league ?? ""), model: ANTHROPIC_MODEL });
  } catch (e) {
    // Reported through health (HOOK_* codes); the next run tries again until the deadline.
    return { posted: false, pick: sp.pick_text, error: String(e) };
  }
  if (dryRun) return { posted: false, dry_run: true, pick: sp.pick_text, lead_min: leadMin, hook, handoff: APP_HANDOFF };

  const { error: claimErr } = await sb.from("social_post_log").insert({
    post_date: today, slot: "free_pick", league: sp.league, pick_text: claimKey,
    thread_format: "free_pick", post_text: hook,
  });
  if (claimErr) return { posted: false, reason: "free pick claimed by another run" };
  let tweetId: string;
  try { tweetId = await postTweet(hook); }
  catch (e) {
    await sb.from("social_post_log").delete().eq("post_date", today).eq("pick_text", claimKey);
    return { posted: false, pick: sp.pick_text, error: String(e) };
  }
  const threadUrl = `https://x.com/BetwithGary/status/${tweetId}`;
  let replyId: string | null = null;
  try { replyId = await postTweet(APP_HANDOFF, tweetId); } catch (e) { console.error("free pick handoff reply failed: " + String(e)); }
  const { error: upErr } = await sb.from("social_post_log").update({
    hook_tweet_id: tweetId, cta_tweet_id: replyId, thread_url: threadUrl, posted_at: new Date().toISOString(),
  }).eq("post_date", today).eq("pick_text", claimKey);
  if (upErr) return { posted: true, pick: sp.pick_text, thread_url: threadUrl, error: `POST_LOG_WRITE_FAILED: ${upErr.message}` };
  return { posted: true, pick: sp.pick_text, thread_url: threadUrl };
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
