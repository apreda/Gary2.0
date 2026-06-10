// Stripe webhook -> user_entitlements.
// Auth: Stripe signature verification (HMAC-SHA256 of `${t}.${body}`) against
// the TEST or LIVE signing secret — both endpoints point here. verify_jwt is
// off because Stripe calls us directly.
//
// Lifecycle:
//   checkout.session.completed    -> grant (bundle sessions carry metadata.sports
//                                    and grant one row per sport; payment-link
//                                    sessions resolve through LINK_MAP)
//   customer.subscription.deleted -> revoke (status = canceled)
//
// v10 (Jun 9 2026): June price flip links added — All-Access $29.99/mo and
// $179/yr (7-day card-required trials), test + live. Old $34.99 links stay
// mapped: the shipped App Store build still sells through them until the
// next release, and existing subscribers renew on them indefinitely.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SECRETS = [
  Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "",      // test endpoint
  Deno.env.get("STRIPE_WEBHOOK_SECRET_LIVE") ?? "", // live endpoint
].filter(Boolean);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Payment link -> entitlement.
const LINK_MAP: Record<string, { key: string; pass: string }> = {
  // LIVE — monthly subscriptions + WC one-time ($9.99 since Jun 5 PM)
  plink_1Tf2dILqUC52RoAIqzzuHrlK: { key: "MLB", pass: "monthly" },
  plink_1Tf2dJLqUC52RoAI7X7eTr4m: { key: "NBA", pass: "monthly" },
  plink_1Tf2dJLqUC52RoAI0LX8MIuy: { key: "NHL", pass: "monthly" },
  plink_1Tf2dKLqUC52RoAIsuBVEr9i: { key: "NFL", pass: "monthly" },
  plink_1Tf2dLLqUC52RoAINXPAjtbY: { key: "NCAAF", pass: "monthly" },
  plink_1Tf2dLLqUC52RoAIufwGQEgq: { key: "NCAAB", pass: "monthly" },
  plink_1Tf2dNLqUC52RoAIgKbKkpbK: { key: "ALL", pass: "monthly" },   // $34.99/3-day — shipped build
  plink_1Tf3upLqUC52RoAIHwpHv2jy: { key: "WC", pass: "tournament" },
  plink_1Tf2dMLqUC52RoAIzi1QNq9Y: { key: "WC", pass: "tournament" }, // retired $14.99 link
  // LIVE — June 9 2026 flip: $29.99/mo + $179/yr, 7-day card-required trials
  plink_1TgbaKLqUC52RoAIvLEooj2r: { key: "ALL", pass: "monthly" },
  plink_1TgbaKLqUC52RoAINLm0QilG: { key: "ALL", pass: "annual" },
  // TEST — monthly subscriptions + WC one-time ($9.99 since Jun 5 PM)
  plink_1Tf2JNLJVzRZvO5HTgHm6Nv9: { key: "MLB", pass: "monthly" },
  plink_1Tf2JQLJVzRZvO5HOqgKnyzy: { key: "NBA", pass: "monthly" },
  plink_1Tf2JSLJVzRZvO5HFuRqFaGd: { key: "NHL", pass: "monthly" },
  plink_1Tf2JnLJVzRZvO5H7oYqfBBy: { key: "NFL", pass: "monthly" },
  plink_1Tf2JqLJVzRZvO5HN4oNSrQ1: { key: "NCAAF", pass: "monthly" },
  plink_1Tf2JuLJVzRZvO5H3oNKGDI7: { key: "NCAAB", pass: "monthly" },
  plink_1Tf2LILJVzRZvO5HtecD92Si: { key: "ALL", pass: "monthly" },
  plink_1Tf3w4LJVzRZvO5HuHtY0o8e: { key: "WC", pass: "tournament" },
  plink_1Tf0K4LJVzRZvO5Hxz7EmaOE: { key: "WC", pass: "tournament" }, // retired $14.99 link
  // TEST — June 9 2026 flip: $29.99/mo + $179/yr, 7-day card-required trials
  plink_1TgbEsLJVzRZvO5HmNa1JmJM: { key: "ALL", pass: "monthly" },
  plink_1TgbEtLJVzRZvO5HUsg5w60B: { key: "ALL", pass: "annual" },
  // TEST — legacy one-time season links (an old open tab still grants)
  plink_1TezsGLJVzRZvO5HNnoZr1qr: { key: "MLB", pass: "season" },
  plink_1TezsVLJVzRZvO5HgoNprUfZ: { key: "NBA", pass: "season" },
  plink_1TezsfLJVzRZvO5HJSHRhGOo: { key: "NHL", pass: "season" },
  plink_1TezsoLJVzRZvO5HP41HdNLm: { key: "NFL", pass: "season" },
  plink_1TezszLJVzRZvO5HchuFUkWe: { key: "NCAAF", pass: "season" },
  plink_1Tezt8LJVzRZvO5HwzVXIsGl: { key: "NCAAB", pass: "season" },
  plink_1TeztHLJVzRZvO5HH6WHQHxI: { key: "ALL", pass: "all" },
};

async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function validSignature(body: string, header: string | null): Promise<boolean> {
  if (!header || SECRETS.length === 0) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  // Reject stale events (replay defense, 5 min tolerance).
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  for (const secret of SECRETS) {
    if ((await hmacHex(secret, `${t}.${body}`)) === v1) return true;
  }
  return false;
}

async function rest(path: string, method: string, body: unknown, prefer?: string): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const body = await req.text();

  if (!(await validSignature(body, req.headers.get("stripe-signature")))) {
    return new Response("bad signature", { status: 401 });
  }

  const event = JSON.parse(body);

  // --- Cancellation: revoke the entitlement(s) tied to this subscription. ---
  if (event.type === "customer.subscription.deleted") {
    const subId: string | null = event.data?.object?.id ?? null;
    if (!subId) return new Response(JSON.stringify({ ignored: "no sub id" }), { status: 200 });
    const res = await rest(
      `user_entitlements?stripe_subscription_id=eq.${subId}`,
      "PATCH",
      { status: "canceled" },
      "return=minimal",
    );
    if (!res.ok) {
      console.error("revoke failed", res.status, await res.text());
      return new Response("revoke failed", { status: 500 }); // Stripe retries
    }
    return new Response(JSON.stringify({ revoked: subId }), { status: 200 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ ignored: event.type }), { status: 200 });
  }

  // --- Purchase: grant. ---
  const session = event.data?.object ?? {};
  const installationId: string | null = session.client_reference_id ?? null;
  const linkId: string | null = session.payment_link ?? null;

  // Bundle / server-created sessions name their sports in metadata.
  const metaSports: string[] = (session.metadata?.sports ?? "")
    .split(",").map((s: string) => s.trim()).filter(Boolean);
  const mapped = linkId ? LINK_MAP[linkId] : null;
  const grants: { key: string; pass: string }[] = metaSports.length
    ? metaSports.map((s) => ({ key: s, pass: session.metadata?.pass ?? "monthly" }))
    : mapped ? [mapped] : [];

  if (!installationId || grants.length === 0) {
    console.error("unmapped checkout", { installationId, linkId, session: session.id });
    // 200 so Stripe doesn't retry forever; the session id is logged for manual grant.
    return new Response(JSON.stringify({ unmapped: true }), { status: 200 });
  }

  // One row per sport; bundle rows suffix the session id so the
  // stripe_session_id uniqueness stays per-grant idempotent.
  const rows = grants.map((g, i) => ({
    installation_id: installationId,
    product_key: g.key,
    pass_type: g.pass,
    status: "active",
    stripe_session_id: grants.length === 1 ? session.id : `${session.id}:${g.key}`,
    stripe_payment_link: linkId,
    stripe_subscription_id: session.subscription ?? null,
    amount_cents: i === 0 ? (session.amount_total ?? null) : null,
  }));

  const res = await rest(
    "user_entitlements?on_conflict=stripe_session_id",
    "POST",
    rows,
    "resolution=ignore-duplicates,return=minimal",
  );

  if (!res.ok) {
    console.error("entitlement write failed", res.status, await res.text());
    return new Response("write failed", { status: 500 }); // Stripe will retry
  }

  return new Response(JSON.stringify({ granted: grants.map((g) => g.key) }), { status: 200 });
});
