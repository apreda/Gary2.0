import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { createCheckoutHandler } from "./handler.ts";
const owner = "10000000-0000-0000-0000-000000000001";
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const checkout = (plan: string) => new Request("https://db.invalid/functions/v1/create-checkout", { method: "POST", headers: { authorization: "Bearer caller", "Content-Type": "application/json" }, body: JSON.stringify({ plan, mode: "test" }) });

function fixture() {
  const sessions: any[] = [], subscriptions: any[] = [], tracked: any[] = [];
  const slots = new Map<boolean, any>();
  const pending = new Map<string, Promise<any>>();
  let hold: Promise<void> | null = null;
  let lostResponse = false;
  let completeDuringExpiration = false;
  let createdCount = 0;
  let entered: (() => void) | null = null;
  const request = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/auth/v1/user")) return response({ id: owner, email: "fixture@example.invalid" });
    if (url.pathname.includes("/account_deletion_requests")) return response([]);
    if (url.pathname.endsWith("/get_my_access")) return response({ preview: false, founding: false, sports: [] });
    if (url.pathname.includes("/user_entitlements")) return response([]);
    if (url.pathname.includes("/account_checkout_sessions")) {
      if (init?.method === "POST") { tracked.push(JSON.parse(String(init.body))); return new Response(null, { status: 201 }); }
      return response(tracked.map((row) => ({ customer_id: row.customer_id })));
    }
    if (url.pathname.includes("/rpc/")) {
      const body = JSON.parse(String(init?.body));
      const method = url.pathname.split("/").at(-1);
      const slot = slots.get(body.p_livemode);
      if (method === "acquire_checkout_reservation") {
        if (slot?.lease_token) return response(null);
        const acquired = { ...slot, lease_token: body.p_token };
        slots.set(body.p_livemode, acquired); return response(acquired);
      }
      if (method === "release_checkout_reservation") {
        if (slot?.lease_token === body.p_token) slot.lease_token = null;
        return response(null);
      }
      if (!slot || slot.lease_token !== body.p_token) return response({ message: "Checkout lease lost" }, 409);
      if (method === "touch_checkout_reservation") return response(slot);
      Object.assign(slot, { attempt_id: body.p_attempt_id, stripe_form: body.p_form, session_id: body.p_session_id });
      return response(slot);
    }
    if (url.pathname === "/v1/customers") return response({ id: "cus_fixture" });
    if (url.pathname === "/v1/subscriptions") return response({ data: subscriptions, has_more: false });
    if (url.pathname === "/v1/checkout/sessions" && init?.method === "POST") {
      const key = new Headers(init.headers).get("idempotency-key")!;
      let operation = pending.get(key);
      if (!operation) {
        const form = new URLSearchParams(String(init.body));
        operation = (async () => {
          const wait = hold; entered?.(); if (wait) await wait;
          const session = { id: `cs_${++createdCount}`, status: "open", url: `https://checkout.stripe.com/${createdCount}`, customer: "cus_fixture", client_reference_id: owner, livemode: false,
            metadata: { sports: form.get("metadata[sports]"), pass: form.get("metadata[pass]"), trial_days: form.get("metadata[trial_days]"), gary_attempt: form.get("metadata[gary_attempt]") } };
          sessions.unshift(session); return session;
        })();
        pending.set(key, operation);
      }
      const session = await operation;
      if (lostResponse) { lostResponse = false; throw new Error("connection interrupted after Stripe commit"); }
      return response(session);
    }
    if (url.pathname === "/v1/checkout/sessions") return response({ data: sessions.filter((session) => !url.searchParams.has("status") || session.status === url.searchParams.get("status")), has_more: false });
    if (url.pathname.startsWith("/v1/checkout/sessions/cs_")) {
      const id = url.pathname.split("/")[4], session = sessions.find((row) => row.id === id);
      if (!session) return response({}, 404);
      if (url.pathname.endsWith("/expire")) {
        if (completeDuringExpiration) { session.status = "complete"; session.subscription = "sub_race"; return response({}, 400); }
        session.status = "expired";
      }
      return response(session);
    }
    throw new Error(`Unexpected fixture request ${url.pathname}`);
  }) as typeof fetch;
  const handler = createCheckoutHandler({ supabaseURL: "https://db.invalid", anonKey: "anon", serviceKey: "service", stripeTestKey: "test" }, request);
  return { handler, sessions, subscriptions, slots, pending,
    interruptResponse() { lostResponse = true; },
    completeDuringExpiration() { completeDuringExpiration = true; },
    blockCreation() {
      let resume!: () => void; hold = new Promise<void>((resolve) => { resume = resolve; });
      const started = new Promise<void>((resolve) => { entered = resolve; });
      return { started, resume: () => { hold = null; resume(); } };
    },
  };
}

test("concurrent different plan requests admit only one Stripe checkout", async () => {
  const f = fixture(), block = f.blockCreation();
  const monthly = f.handler(checkout("ALL")); await block.started;
  const annual = await f.handler(checkout("ALL_ANNUAL"));
  strictEqual(annual.status, 409); strictEqual(f.pending.size, 1);
  block.resume(); strictEqual((await monthly).status, 200);
  strictEqual(f.sessions.filter((session) => session.status === "open").length, 1);
});

test("deliberate plan change expires previous session before opening replacement", async () => {
  const f = fixture(); strictEqual((await f.handler(checkout("ALL"))).status, 200);
  strictEqual((await f.handler(checkout("ALL_ANNUAL"))).status, 200);
  strictEqual(f.sessions.length, 2);
  strictEqual(f.sessions[0].status, "open"); strictEqual(f.sessions[0].metadata.pass, "annual");
  strictEqual(f.sessions[1].status, "expired");
});

test("same-plan retry returns original session without a second creation", async () => {
  const f = fixture(); const first = await (await f.handler(checkout("ALL"))).json();
  const repeated = await (await f.handler(checkout("ALL"))).json();
  strictEqual(first.url, repeated.url); strictEqual(f.sessions.length, 1);
});

test("lost Stripe response is recovered before a different plan can replace it", async () => {
  const f = fixture(); f.interruptResponse();
  strictEqual((await f.handler(checkout("ALL"))).status, 503);
  strictEqual(f.sessions.length, 1); strictEqual(f.slots.get(false).session_id, null);
  strictEqual((await f.handler(checkout("ALL_ANNUAL"))).status, 200);
  strictEqual(f.sessions.length, 2); strictEqual(f.sessions[1].status, "expired");
  strictEqual(f.sessions.filter((session) => session.status === "open").length, 1);
});

test("expired lease recovers the in-flight idempotent operation and rejects stale worker", async () => {
  const f = fixture(), block = f.blockCreation();
  const stale = f.handler(checkout("ALL")); await block.started;
  const attempt = f.slots.get(false).attempt_id;
  f.slots.get(false).lease_token = null; // Fixture simulates lease expiry.
  const replacement = f.handler(checkout("ALL_ANNUAL"));
  // Allow the replacement to reach recovery of the same Stripe request.
  await new Promise((resolve) => setTimeout(resolve, 10));
  strictEqual(f.slots.get(false).attempt_id, attempt); strictEqual(f.pending.size, 1);
  block.resume();
  strictEqual((await stale).status, 409); strictEqual((await replacement).status, 200);
  strictEqual(f.sessions.length, 2); strictEqual(f.sessions[1].status, "expired");
  strictEqual(f.sessions.filter((session) => session.status === "open").length, 1);
});

test("completed old checkout does not permanently block a canceled returning subscriber", async () => {
  const f = fixture(); strictEqual((await f.handler(checkout("ALL"))).status, 200);
  f.sessions[0].status = "complete"; f.sessions[0].subscription = "sub_old";
  f.subscriptions.push({ id: "sub_old", status: "canceled", metadata: { owner, sports: "ALL" } });
  const next = await f.handler(checkout("ALL_ANNUAL")); strictEqual(next.status, 200);
  strictEqual(f.sessions[0].metadata.trial_days, "0");
});

test("an active plan is detected before opening another overlapping plan", async () => {
  const f = fixture(); strictEqual((await f.handler(checkout("ALL"))).status, 200);
  f.sessions[0].status = "complete"; f.sessions[0].subscription = "sub_active";
  f.subscriptions.push({ id: "sub_active", status: "trialing", metadata: { owner, sports: "ALL" } });
  const next = await f.handler(checkout("ALL_ANNUAL")); strictEqual(next.status, 409);
  strictEqual(f.sessions.length, 1); ok(f.slots.get(false).lease_token === null);
});

test("payment completing during deliberate plan change prevents replacement checkout", async () => {
  const f = fixture(); strictEqual((await f.handler(checkout("ALL"))).status, 200);
  f.completeDuringExpiration();
  strictEqual((await f.handler(checkout("ALL_ANNUAL"))).status, 409);
  strictEqual(f.sessions.length, 1); strictEqual(f.sessions[0].status, "complete");
});
