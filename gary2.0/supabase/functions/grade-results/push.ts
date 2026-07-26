// Settle pushes — "your book settled" notifications (Jul 26 2026).
//
// Fired by the settle sweeps the moment a user's tail/fade grades. FCM v1
// with the same minted service-account token notify-new-pick uses; tokens
// matched by push_tokens.identity_id = the auth user id (the register RPC's
// contract). Gracefully no-ops without FIREBASE_* secrets. Units always —
// the server never knows a user's dollar setting, and pushes must never
// misprice someone's money. NON-FATAL everywhere: a push failure can never
// stall grading.

// Lazy env reads: importing this module must not require env access (the
// pure settleMessage is unit-tested in a no-env sandbox).
function fbCreds(): { project: string; email: string; key: string } {
  try {
    return {
      project: Deno.env.get("FIREBASE_PROJECT_ID") ?? "",
      email: Deno.env.get("FIREBASE_CLIENT_EMAIL") ?? "",
      key: (Deno.env.get("FIREBASE_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n"),
    };
  } catch {
    return { project: "", email: "", key: "" };
  }
}

export type SettleEvent = {
  kind: string;                 // tail | fade
  status: string;               // won | lost | push | void
  units: number;
  streak_pick: boolean;
};

export type UserSettleBatch = {
  events: SettleEvent[];
  streakAfter: { current: number } | null;  // post-update state when a streak play settled
};

// ── FCM v1 (port of notify-new-pick's auth + send) ──────────────────────────
async function fcmAccessToken(creds: { email: string; key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: creds.email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })}`;
  const pem = creds.key.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "");
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

async function sendPush(project: string, access: string, deviceToken: string, title: string, body: string): Promise<boolean> {
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { token: deviceToken, notification: { title, body } } }),
  });
  return r.ok;
}

// ── copy (plain voice; units only; no emojis, no lingo) ─────────────────────
const fmtU = (u: number) => `${u >= 0 ? "+" : ""}${u.toFixed(2)}u`;

export function settleMessage(batch: UserSettleBatch): { title: string; body: string } | null {
  const decided = batch.events.filter((e) => e.status === "won" || e.status === "lost");
  if (!decided.length) return null;  // pushes/voids alone are not worth a buzz
  const net = batch.events.reduce((a, e) => a + (e.units || 0), 0);

  let body: string;
  if (decided.length === 1 && batch.events.length === 1) {
    const e = decided[0];
    const verb = e.kind === "fade" ? "fade" : "tail";
    body = e.status === "won"
      ? `Your ${verb} won: ${fmtU(e.units)}.`
      : `Your ${verb} lost: ${fmtU(e.units)}.`;
  } else {
    const w = decided.filter((e) => e.status === "won").length;
    const l = decided.filter((e) => e.status === "lost").length;
    body = `${batch.events.length} plays settled (${w}-${l}): ${fmtU(net)} on the night.`;
  }

  const streakEvent = batch.events.find((e) => e.streak_pick && (e.status === "won" || e.status === "lost"));
  if (streakEvent && batch.streakAfter) {
    body += streakEvent.status === "won"
      ? ` Day ${batch.streakAfter.current} of the streak.`
      : ` The streak is over.`;
  }
  return { title: "Your book settled", body };
}

/**
 * Send one push per device for each user's settled batch. Never throws;
 * returns counts for the run log.
 */
export async function notifySettles(
  sbBase: string, sbHeaders: Record<string, string>,
  byUser: Map<string, UserSettleBatch>,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 };
  if (!byUser.size) return out;
  const creds = fbCreds();
  if (!creds.project || !creds.email || !creds.key) { out.skipped = byUser.size; return out; }

  try {
    const ids = [...byUser.keys()];
    const res = await fetch(
      `${sbBase}/rest/v1/push_tokens?identity_id=in.(${ids.join(",")})` +
      `&active=eq.true&select=device_token,identity_id`,
      { headers: sbHeaders },
    );
    if (!res.ok) { out.failed = byUser.size; return out; }
    const tokens: Array<{ device_token: string; identity_id: string }> = await res.json();
    if (!tokens.length) { out.skipped = byUser.size; return out; }

    const access = await fcmAccessToken(creds);
    for (const [userId, batch] of byUser) {
      const msg = settleMessage(batch);
      if (!msg) { out.skipped++; continue; }
      const mine = tokens.filter((t) => t.identity_id === userId);
      if (!mine.length) { out.skipped++; continue; }
      let any = false;
      for (const t of mine) {
        if (await sendPush(creds.project, access, t.device_token, msg.title, msg.body)) any = true;
      }
      any ? out.sent++ : out.failed++;
    }
  } catch (e) {
    console.warn(`[SettlePush] non-fatal: ${(e as Error).message}`);
    out.failed++;
  }
  return out;
}
