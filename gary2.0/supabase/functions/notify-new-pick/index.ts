// notify-new-pick — pick-by-pick unlock pushes (Jul 2 2026).
// pg_cron every 5 min. Diffs today's daily_picks against pick_notify_state;
// for each pick not yet announced, sends ONE push per device via FCM v1:
//   - PAYERS (identity entitled to the pick's league or ALL): the pick itself.
//   - FREE users: the tease ("Gary just posted his MLB play...").
// Gracefully no-ops (ok:false reason) until FIREBASE_* secrets are set — same
// service-account values scripts/send-scheduled-push.js uses locally.
// ?dry=1 previews who would get what without sending or watermarking.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FB_PROJECT = Deno.env.get("FIREBASE_PROJECT_ID") ?? "";
const FB_EMAIL = Deno.env.get("FIREBASE_CLIENT_EMAIL") ?? "";
const FB_KEY = (Deno.env.get("FIREBASE_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");
const sb = createClient(SB_URL, SERVICE_KEY);

const MAX_PICKS_PER_RUN = 4; // a burst of T-90 picks still paces out

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
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error("FCM token: " + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

async function sendPush(access: string, deviceToken: string, title: string, body: string): Promise<boolean> {
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${FB_PROJECT}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: {
      token: deviceToken,
      notification: { title, body },
      apns: { payload: { aps: { sound: "default" } } },
    }}),
  });
  if (r.status === 404 || r.status === 410) { // dead token — deactivate quietly
    await sb.from("push_tokens").delete().eq("device_token", deviceToken);
    return false;
  }
  return r.ok;
}

Deno.serve(async (req) => {
  try {
    const dry = new URL(req.url).searchParams.get("dry") === "1";
    const today = etToday();

    const { data: dp } = await sb.from("daily_picks").select("picks").eq("date", today);
    const picks: any[] = (dp?.[0]?.picks ?? []).filter((p: any) => p?.pick && !(p.type === "prop" || p.pickType === "prop"));
    if (!picks.length) return Response.json({ ok: true, reason: "no picks yet", today });

    const keyOf = (p: any) => `${today}|${(p.league ?? "?")}|${p.awayTeam ?? ""}@${p.homeTeam ?? ""}|${p.pick}`;
    const { data: seen } = await sb.from("pick_notify_state").select("pick_key").gte("notified_at", today);
    const seenKeys = new Set((seen ?? []).map((r) => r.pick_key));
    // Only announce picks for games that haven't started (a T-15 retry pick for
    // an already-underway game would push "new pick" mid-game).
    const fresh = picks.filter((p) => !seenKeys.has(keyOf(p)) &&
      (!p.commence_time || new Date(p.commence_time).getTime() > Date.now() - 5 * 60_000)).slice(0, MAX_PICKS_PER_RUN);
    if (!fresh.length) return Response.json({ ok: true, reason: "nothing new", today, picks: picks.length });

    const [{ data: tokens }, { data: ents }] = await Promise.all([
      sb.from("push_tokens").select("device_token, identity_id"),
      sb.from("user_entitlements").select("installation_id, product_key").eq("status", "active"),
    ]);
    const entitled = new Map<string, Set<string>>();
    for (const e of ents ?? []) {
      (entitled.get(e.installation_id) ?? entitled.set(e.installation_id, new Set()).get(e.installation_id)!).add(e.product_key);
    }
    const isPayer = (identity: string | null, league: string) => {
      if (!identity) return false;
      const ks = entitled.get(identity);
      return !!ks && (ks.has("ALL") || ks.has(league));
    };

    const plan = fresh.map((p) => {
      const league = String(p.league ?? "").toUpperCase();
      const matchup = `${p.awayTeam ?? "?"} @ ${p.homeTeam ?? "?"}`;
      return {
        key: keyOf(p), league, matchup,
        // Odds only when the pick text doesn't already end with them.
        payer: { title: `${league} Winner just dropped`, body: `${p.pick}${p.odds && !String(p.pick).includes(String(p.odds)) ? ` (${p.odds})` : ""} — ${matchup}` },
        free: { title: "Gary just posted a play", body: `His ${league} read on ${matchup} is live. About 90 minutes to ${league === "WC" ? "kickoff" : "first pitch"}.` },
      };
    });

    if (dry) return Response.json({ ok: true, dry, plan, devices: (tokens ?? []).length });
    if (!FB_PROJECT || !FB_EMAIL || !FB_KEY) {
      return Response.json({ ok: false, reason: "FIREBASE_* secrets not set — pushes skipped (plan computed)", plan: plan.map((p) => p.key) });
    }

    const access = await fcmAccessToken();
    let sent = 0;
    for (const item of plan) {
      for (const t of tokens ?? []) {
        const msg = isPayer(t.identity_id, item.league) ? item.payer : item.free;
        if (await sendPush(access, t.device_token, msg.title, msg.body)) sent++;
      }
      await sb.from("pick_notify_state").upsert({ pick_key: item.key });
    }
    return Response.json({ ok: true, announced: plan.length, sent });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
