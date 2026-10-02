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
// Oct 2 2026: the free pick posts as "Gary's free pick for tonight:", the pick and its start, two facts, with the
// app's card image; each morning a reply under yesterday's post says how it went.
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

// The day's free pick (the streak pick), posted once (founder, Oct 2 2026). The post is the format that drew
// 100 views in two minutes: "Gary's free pick for tonight:", the pick and its start, then two facts from Gary's
// published case (the Opus writer in gamePickHook.ts; code checks the line and side against the ticket). Under
// it rides the app's own card for the pick (the Mac's free_pick_videos row, a PNG since Oct 2: "post it as the
// product, not as text"); the link goes in the reply. The poster waits for the card until MEDIA_WAIT_MIN before
// the start, then posts the text alone so the free pick is never missed. The log row is claimed before the send
// so overlapping runs can never post it twice; a failed send releases the claim.
const MEDIA_WAIT_MIN = 25;
const LINK_REPLY = "The full breakdown is free in the app: betwithgary.ai/c/xpick";
const WRITER_MODEL = Deno.env.get("SOCIAL_ANTHROPIC_MODEL") ?? "claude-opus-5-5";

const lastWord = (team: string) => String(team ?? "").trim().split(/\s+/).pop() ?? "";

/** The ticket as it reads, without the price: "Virginia Tech Hokies -2.5 vs Pittsburgh Panthers". */
export function ticketWords(sp: any): string {
  if (sp?.kind === "prop") {
    const [type, line] = String(sp?.prop ?? "").split(" ");
    const label = PROP_LABELS[type] ?? String(type ?? "").replace(/_/g, " ");
    return type === "home_runs" ? `${sp.player} ${PROP_LABELS.home_runs}`
      : `${sp.player} ${String(sp?.bet ?? "").toLowerCase()} ${line} ${label}`;
  }
  const bet = String(sp?.pick_text ?? "").replace(/\s+[+-]\d{3,4}\s*$/, "").trim();
  const [away, home] = String(sp?.matchup ?? "").split(/\s+@\s+/);
  const picked = home && bet.startsWith(home) ? home : away && bet.startsWith(away) ? away : null;
  const opponent = picked === home ? away : picked === away ? home : null;
  return opponent ? `${bet} vs ${opponent}` : bet;
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

/** "7 PM ET", "7:05 PM ET". */
function startWords(iso: string): string {
  const s = new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  return `${s.replace(":00", "")} ET`;
}

async function freePickText(sp: any): Promise<{ text: string; writer: string }> {
  const hourEt = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date(sp.commence_time)));
  const head = `Gary's free pick for ${hourEt >= 17 ? "tonight" : "today"}:`;
  const fallback = ticketWords(sp);
  try {
    const { data } = await sb.from("winners_candidates").select("rationale:pick_snapshot->>rationale").eq("id", sp.candidate_id).limit(1);
    const rationale = String(data?.[0]?.rationale ?? "");
    const w = await composeFreePickPost({ rationale, pick: String(sp.pick_text ?? ""), matchup: String(sp.matchup ?? ""), league: String(sp.league ?? ""), model: WRITER_MODEL });
    const keys = ticketKey(sp);
    const words = keys.length && keys.every((k) => w.pickWords.includes(k)) ? w.pickWords : fallback;
    return { text: `${head}\n\n${words}, ${startWords(sp.commence_time)}\n\n${w.opening}\n${w.closing}`, writer: words === fallback ? "facts, ticket words" : "writer" };
  } catch (e) {
    console.error("free pick writer failed: " + String(e));
    return { text: `${head}\n\n${fallback}, ${startWords(sp.commence_time)}`, writer: `none (${String(e).slice(0, 120)})` };
  }
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function postFreePick(text: string, mediaPath: string | null): Promise<string> {
  if (!mediaPath) return postTweet(text);
  let body: Record<string, unknown>;
  if (mediaPath.endsWith(".png")) {
    const { data: blob, error } = await sb.storage.from("social-media").download(mediaPath);
    if (error || !blob) throw new Error(`card download failed: ${error?.message ?? "empty"}`);
    body = { text, images_base64: [base64(new Uint8Array(await blob.arrayBuffer()))] };
  } else {
    body = { text, video_path: mediaPath };
  }
  const r = await fetch(`${SB_URL}/functions/v1/post-tweet-media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

  const { data: media, error: mediaErr } = await sb.from("free_pick_videos")
    .select("candidate_id, status, storage_path").eq("game_date", today).limit(1);
  if (mediaErr) throw mediaErr;
  const m = media?.[0];
  const card = m && m.status === "ready" && Number(m.candidate_id) === Number(sp.candidate_id) && m.storage_path ? m.storage_path as string : null;
  if (dryRun) {
    const composed = await freePickText(sp);
    return { posted: false, dry_run: true, pick: sp.pick_text, lead_min: leadMin, ...composed, card, reply: LINK_REPLY };
  }
  if (!card && m?.status !== "failed" && leadMin > MEDIA_WAIT_MIN) {
    return { posted: false, reason: `waiting for the free pick card (${leadMin} min to start)` };
  }

  const { error: claimErr } = await sb.from("social_post_log").insert({
    post_date: today, slot: "free_pick", league: sp.league, pick_text: claimKey,
    thread_format: card ? (card.endsWith(".png") ? "free_pick_card" : "free_pick_video") : "free_pick",
  });
  if (claimErr) return { posted: false, reason: "free pick claimed by another run" };
  const { text, writer } = await freePickText(sp);
  let tweetId: string;
  try { tweetId = await postFreePick(text, card); }
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
  return { posted: true, pick: sp.pick_text, thread_url: threadUrl, card: !!card, writer };
}

// THE MORNING RESULT (founder, Oct 2 2026: "close the loop every morning ... win or lose"). From 8 AM ET, once
// yesterday's free pick is graded, one reply under yesterday's post. Losses stay up like wins.
const RESULT_WORDS: Record<string, string> = { won: "Won.", lost: "Lost.", push: "Push." };

async function runFreePickResult(nowMs: number, dryRun: boolean) {
  const hourEt = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date(nowMs)));
  if (hourEt < 8) return { replied: false, reason: "the result posts from 8 AM ET" };
  const yesterday = easternDateOffset(-1);
  const { data: rows, error } = await sb.from("social_post_log").select("id, hook_tweet_id, result_tweet_id")
    .eq("post_date", yesterday).eq("pick_text", `FREE PICK ${yesterday}`).limit(1);
  if (error) throw error;
  const row = rows?.[0];
  if (!row?.hook_tweet_id) return { replied: false, reason: "no free pick post yesterday" };
  if (row.result_tweet_id) return { replied: false, reason: "yesterday's result already posted" };
  const { data: day, error: dayErr } = await sb.rpc("streak_pick_day", { p_day: yesterday });
  if (dayErr) throw dayErr;
  const result = String(day?.result ?? "").toLowerCase();
  const words = RESULT_WORDS[result];
  if (!words) return { replied: false, reason: `yesterday's free pick is not graded yet (${result || "no result"})` };
  if (dryRun) return { replied: false, dry_run: true, result, words };
  const { data: claimed, error: claimErr } = await sb.from("social_post_log").update({ result_tweet_id: "pending", result })
    .eq("id", row.id).is("result_tweet_id", null).select("id");
  if (claimErr) throw claimErr;
  if (!claimed?.length) return { replied: false, reason: "result claimed by another run" };
  try {
    const id = await postTweet(words, row.hook_tweet_id);
    await sb.from("social_post_log").update({ result_tweet_id: id }).eq("id", row.id);
    return { replied: true, result, tweet: id };
  } catch (e) {
    await sb.from("social_post_log").update({ result_tweet_id: null, result: null }).eq("id", row.id);
    return { replied: false, result, error: String(e) };
  }
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
    const resultReply = await runFreePickResult(Date.now(), dryRun);
    if (resultReply.replied || resultReply.error) console.log(JSON.stringify({ mode: "free_pick_result", ...resultReply }).slice(0, 300));
    return respond({ mode: "free_pick", metrics, results: [freePick, resultReply] });
  } catch (e) {
    console.error(String(e));
    return respond({ error: String(e) }, { status: 500 });
  }
});
