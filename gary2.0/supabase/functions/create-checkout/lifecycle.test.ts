import { test } from "node:test";
import { deepStrictEqual as assertEquals, rejects } from "node:assert";
import { customerSubscriptions, checkoutAttempt, trialDays, closeOwnedSessions, cancelUnavailableOwnerSubscription } from "./lifecycle.ts";
const owner = "10000000-0000-0000-0000-000000000001";
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

test("returning subscribers never receive another seven-day trial", () => {
  assertEquals(trialDays(7, true), 0);
  assertEquals(trialDays(7, false), 7);
  assertEquals(trialDays(0, false), 0);
});
test("deletion paginates open sessions and expires only the caller's sessions", async () => {
  const expired: string[] = [];
  const request = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/cs_own/expire")) { expired.push("cs_own"); return response({ id: "cs_own", status: "expired" }); }
    if (url.includes("starting_after=")) return response({ data: [{ id: "cs_own", client_reference_id: owner, livemode: true, status: "open" }], has_more: false });
    return response({ data: [{ id: "cs_other", client_reference_id: "other", livemode: true, status: "open" }], has_more: true });
  }) as typeof fetch;
  assertEquals(await closeOwnedSessions(owner, true, "live", [], request), []);
  assertEquals(expired, ["cs_own"]);
});
test("payment completing during expiration is returned for subscription cancellation", async () => {
  const request = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/expire")) return response({}, 400);
    if (url.includes("/cs_race")) return response({ id: "cs_race", status: "complete", subscription: "sub_race", client_reference_id: owner, livemode: true });
    return response({ data: [{ id: "cs_race", client_reference_id: owner, livemode: true, status: "open" }], has_more: false });
  }) as typeof fetch;
  assertEquals(await closeOwnedSessions(owner, true, "live", [], request), ["sub_race"]);
});
test("completed tracked sessions recover subscriptions whose webhook has not arrived", async () => {
  const request = (async (input: string | URL | Request) => String(input).includes("/cs_saved")
    ? response({ id: "cs_saved", status: "complete", subscription: "sub_saved", client_reference_id: owner, livemode: false })
    : response({ data: [], has_more: false })) as typeof fetch;
  assertEquals(await closeOwnedSessions(owner, false, "test", ["cs_saved"], request), ["sub_saved"]);
});
test("deleted canonical owner cancels subscription in correct Stripe mode", async () => {
  const calls: string[] = [];
  const request = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(String(input));
    if (String(input).includes("/admin/users")) return response({}, 404);
    assertEquals(init?.method, "DELETE");
    assertEquals(new Headers(init?.headers).get("authorization"), "Bearer test-secret");
    return response({ id: "sub_orphan", status: "canceled", livemode: false, metadata: { owner } });
  }) as typeof fetch;
  const sub = { id: "sub_orphan", status: "trialing", metadata: { owner } };
  assertEquals((await cancelUnavailableOwnerSubscription(sub, "https://db.invalid", "service", "test-secret", request)).status, "canceled");
  assertEquals(calls.length, 2);
});
test("legacy installation reference alone never authorizes cancellation", async () => {
  const sub = { id: "sub_legacy", status: "active", client_reference_id: owner, metadata: {} };
  const request = (async () => { throw new Error("must not call any service"); }) as typeof fetch;
  assertEquals(await cancelUnavailableOwnerSubscription(sub, "https://db.invalid", "service", "key", request), sub);
});
test("pending deletion cancels a just-completed checkout subscription", async () => {
  const request = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/admin/users")) return response({ id: owner });
    if (url.includes("/account_deletion_requests")) return response([{ user_id: owner }]);
    return response({ id: "sub_new", status: "canceled", metadata: { owner } });
  }) as typeof fetch;
  assertEquals((await cancelUnavailableOwnerSubscription({ id: "sub_new", status: "active", metadata: { owner } }, "https://db.invalid", "service", "key", request)).status, "canceled");
});
test("transient owner lookup errors do not authorize subscription cancellation", async () => {
  const request = (async () => response({}, 503)) as typeof fetch;
  await rejects(() => cancelUnavailableOwnerSubscription({ id: "sub_new", status: "active", metadata: { owner } }, "https://db.invalid", "service", "key", request), /lookup unavailable/);
});

test("same-plan open checkout is reused across clock boundaries", async () => {
  const session = { id: "cs_reuse", status: "open", url: "https://checkout.stripe.com/reuse", client_reference_id: owner, livemode: false, metadata: { sports: "NBA,MLB", pass: "monthly" } };
  const request = (async () => response({ data: [session], has_more: false })) as typeof fetch;
  assertEquals(await checkoutAttempt("cus_own", owner, false, ["MLB", "NBA"], "monthly", "test", request), { session, previous: "cs_reuse" });
});
test("closed checkout provides stable generation and never reuses another owner's session", async () => {
  const request = (async () => response({ data: [
    { id: "cs_other", status: "open", client_reference_id: "other", livemode: false, metadata: { sports: "ALL", pass: "monthly" } },
    { id: "cs_previous", status: "expired", client_reference_id: owner, livemode: false, metadata: { sports: "ALL", pass: "monthly" } },
  ], has_more: false })) as typeof fetch;
  assertEquals(await checkoutAttempt("cus_own", owner, false, ["ALL"], "monthly", "test", request), { session: null, previous: "cs_previous" });
});

test("stale checkout lease cannot expire a newer session discovered during pagination", async () => {
  let expirations = 0;
  const request = (async (input: string | URL | Request) => {
    if (String(input).includes("/expire")) expirations++;
    return response({ data: [{ id: "cs_new", status: "open", client_reference_id: owner, livemode: false }], has_more: false });
  }) as typeof fetch;
  await rejects(() => closeOwnedSessions(owner, false, "test", [], request, undefined, async () => { throw new Error("Checkout lease lost"); }), /lease lost/);
  assertEquals(expirations, 0);
});
test("subscription lookup includes older active subscriptions beyond first page", async () => {
  const request = (async (input: string | URL | Request) => String(input).includes("starting_after=")
    ? response({ data: [{ id: "sub_old_active", status: "active" }], has_more: false })
    : response({ data: [{ id: "sub_recent_canceled", status: "canceled" }], has_more: true })) as typeof fetch;
  assertEquals((await customerSubscriptions("cus_own", "test", request)).map((sub) => sub.id), ["sub_recent_canceled", "sub_old_active"]);
});
