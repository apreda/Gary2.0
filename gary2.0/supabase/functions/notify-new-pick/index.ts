// Public game-pick alerts, paced by the existing five-minute cron.
// Per-device receipts protect partial retries and concurrent invocations.
// Service authorization is required even for previews; previews never send.
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizedPushRequest, deliverPickAlert, deviceKey, mergeAlertSources, nflWeek, pickAlerts, terminalPushState } from "./delivery.ts";
import { ncaafSlateDateForInstant } from "../_shared/ncaafKickoff.js";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FB_PROJECT = Deno.env.get("FIREBASE_PROJECT_ID") ?? "";
const FB_EMAIL = Deno.env.get("FIREBASE_CLIENT_EMAIL") ?? "";
const FB_KEY = (Deno.env.get("FIREBASE_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");
const sb = createClient(SB_URL, SERVICE_KEY);

const MAX_PICKS_PER_RUN = 4; // a burst of T-90 picks still paces out

async function activeDevices(): Promise<Array<{ device_token: string }>> {
  const result: Array<{ device_token: string }> = [];
  const pageSize = 500;
  let cursor: string | null = null;
  for (let page = 0; page < 200; page++) {
    let query = sb.from("push_tokens").select("device_token").eq("active", true).order("device_token").limit(pageSize);
    if (cursor !== null) query = query.gt("device_token", cursor);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error("Device registration source unavailable");
    result.push(...data);
    if (data.length < pageSize) return result;
    const next = data[data.length - 1]?.device_token;
    if (typeof next !== "string" || (cursor !== null && next <= cursor)) throw new Error("Device pagination did not advance");
    cursor = next;
  }
  throw new Error("Device registration source incomplete");
}

function etToday(): string {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}

// FCM HTTP v1 auth: mint a service-account OAuth token (RS256 JWT -> token endpoint).
async function fcmAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: FB_EMAIL, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })}`;
  const pem = FB_KEY.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const jwt = `${unsigned}.${btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`FCM authorization unavailable (${r.status})`);
  return j.access_token;
}

Deno.serve(async (req) => {
  // The public anon JWT is not authorization to send device notifications.
  if (!authorizedPushRequest(req, SERVICE_KEY)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  if (req.method !== "POST" && !(req.method === "GET" && dry)) {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  try {
    const today = etToday();
    const slateDates = [...new Set([today, ncaafSlateDateForInstant(Date.now())!])];
    const { weekStart, season } = nflWeek(today);
    const [{ data: dp, error: pickError }, { data: weekly, error: weeklyError }] = await Promise.all([
      sb.from("daily_picks").select("date,picks").in("date", slateDates),
      sb.from("weekly_nfl_picks").select("picks").eq("week_start", weekStart).eq("season", season).limit(1),
    ]);
    if (pickError || weeklyError) throw new Error("Pick source unavailable");
    const picks: unknown[] = [];
    for (const row of dp ?? []) {
      if (!slateDates.includes(row.date) || !Array.isArray(row.picks)) throw new Error("Invalid pick source");
      for (const pick of row.picks) {
        if (pick && typeof pick === "object" && (row.date === today || pick.league === "NCAAF")) {
          picks.push({ ...pick, _alertDate: row.date });
        }
      }
    }
    const nflPicks = weekly?.[0]?.picks;
    if ((picks != null && !Array.isArray(picks)) || (nflPicks != null && !Array.isArray(nflPicks))) throw new Error("Invalid pick source");
    const { data: seen, error: seenError } = await sb.from("pick_notify_state").select("pick_key").gte("notified_at", [...slateDates].sort()[0]);
    if (seenError) throw new Error("Notification history unavailable");
    const seenKeys = new Set((seen ?? []).map((row) => row.pick_key));
    const plan = pickAlerts(mergeAlertSources(picks ?? [], nflPicks ?? []), today, Date.now())
      .filter(item => !seenKeys.has(item.key) && !seenKeys.has(item.legacyKey))
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)).slice(0, MAX_PICKS_PER_RUN);
    if (!plan.length) return Response.json({ ok: true, reason: "No new pregame picks", today });
    const tokens = await activeDevices();
    if (dry) return Response.json({ ok: true, dry, plan, devices: tokens?.length ?? 0 });
    if (!FB_PROJECT || !FB_EMAIL || !FB_KEY) {
      return Response.json({ ok: false, error: "Push delivery is not configured" }, { status: 503 });
    }
    const access = tokens?.length ? await fcmAccessToken() : "";
    const totals = { accepted: 0, failed: 0, unknown: 0, dead: 0, expired: 0, recorded: 0, deferred: 0 };
    // Bound each invocation. Remaining devices/picks stay retryable next cron.
    const deadline = Date.now() + 60_000;
    for (const item of plan) {
      let cursor = 0;
      let allTerminal = true;
      const devices = tokens ?? [];
      const workers = Array.from({ length: Math.min(8, devices.length) }, async () => {
        while (cursor < devices.length) {
          if (Date.now() >= deadline) { allTerminal = false; totals.deferred++; break; }
          const { device_token: token } = devices[cursor++];
          const key = await deviceKey(token);
          const { data: claim, error: claimError } = await sb.rpc("claim_pick_push", {
            p_pick_key: item.key, p_device_key: key, p_expires_at: item.expiresAt,
          });
          if (claimError || !claim) throw new Error("Notification delivery claim unavailable");
          if (!claim.claimed) {
            if (!terminalPushState(claim.status)) allTerminal = false;
            continue;
          }
          const outcome = await deliverPickAlert(FB_PROJECT, access, token, item);
          const { data: finished, error: finishError } = await sb.rpc("finish_pick_push", {
            p_pick_key: item.key, p_device_key: key, p_attempt_id: claim.attempt_id,
            p_status: outcome.status, p_http_status: outcome.httpStatus,
          });
          if (finishError || finished !== true) throw new Error("Notification outcome needs reconciliation");
          if (outcome.status === "sent") totals.accepted++;
          else totals[outcome.status]++;
          if (!terminalPushState(outcome.status)) allTerminal = false;
          if (outcome.status === "dead") {
            const { error } = await sb.from("push_tokens").update({ active: false }).eq("device_token", token);
            if (error) throw new Error("Expired device could not be deactivated");
          }
        }
      });
      const outcomes = await Promise.allSettled(workers);
      if (outcomes.some(result => result.status === "rejected")) throw new Error("Notification run needs reconciliation");
      if (allTerminal) {
        const { error } = await sb.from("pick_notify_state").upsert({ pick_key: item.key });
        if (error) throw new Error("Notification history could not be saved");
        totals.recorded++;
      }
      if (Date.now() >= deadline) break;
    }
    // Receipts have no raw token and need only a short operational retention.
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { error: cleanupError } = await sb.from("pick_push_deliveries").delete().lt("expires_at", cutoff);
    return Response.json({ ok: true, ...totals, cleanupPending: !!cleanupError });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Notification run failed" }, { status: 500 });
  }
});
