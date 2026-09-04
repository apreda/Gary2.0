import { closeOwnedSessions } from "../create-checkout/lifecycle.ts";
type Configuration = {
  supabaseURL: string;
  anonKey: string;
  serviceKey: string;
  stripeLiveKey?: string;
  stripeTestKey?: string;
};
type SubscriptionRow = { stripe_subscription_id: string | null; livemode: boolean };
const origins = new Set(["https://www.betwithgary.ai", "https://betwithgary.ai"]);

export function createDeleteAccountHandler(config: Configuration, request: typeof fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin");
    const cors: Record<string, string> = {
      "Access-Control-Allow-Origin": origin && origins.has(origin) ? origin : "https://www.betwithgary.ai",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
    };
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const authorization = req.headers.get("authorization") ?? "";
    if (!/^Bearer\s+\S+/i.test(authorization)) return json({ error: "Sign in before deleting your account." }, 401);
    const adminHeaders = { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, "Content-Type": "application/json" };
    let userID: string | null = null;
    let deletionMarked = false;
    let signedOut = false;
    let canceled = 0;
    try {
      // The body is never consulted for an owner, subscription id or Stripe mode.
      const who = await request(`${config.supabaseURL}/auth/v1/user`, {
        headers: { apikey: config.anonKey, Authorization: authorization },
      });
      if (!who.ok) return json({ error: "Your session expired. Sign in to delete your account." }, 401);
      const user = await who.json();
      if (typeof user.id !== "string" || !/^[0-9a-f-]{36}$/i.test(user.id)) return json({ error: "Invalid account." }, 401);
      userID = user.id;
      const owner = encodeURIComponent(userID!);
      const mark = await request(`${config.supabaseURL}/rest/v1/account_deletion_requests?on_conflict=user_id`, {
        method: "POST", headers: { ...adminHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: userID, requested_at: new Date().toISOString() }),
      });
      if (!mark.ok) throw new Error("could not mark deletion request");
      deletionMarked = true;
      const subscriptions = new Map<string, SubscriptionRow>();
      for (let offset = 0; ; offset += 500) {
        const response = await request(`${config.supabaseURL}/rest/v1/user_entitlements?installation_id=eq.${owner}` +
          `&select=id,stripe_subscription_id,livemode&order=id.asc&limit=500&offset=${offset}`, { headers: adminHeaders });
        if (!response.ok) throw new Error("could not verify account subscriptions");
        const rows: SubscriptionRow[] = await response.json();
        for (const row of rows) if (row.stripe_subscription_id) subscriptions.set(`${row.livemode}:${row.stripe_subscription_id}`, row);
        if (rows.length < 500) break;
      }
      const checkoutRows: { session_id: string; livemode: boolean }[] = [];
      for (let offset = 0; ; offset += 500) {
        const response = await request(`${config.supabaseURL}/rest/v1/account_checkout_sessions?user_id=eq.${owner}&select=session_id,livemode&order=session_id.asc&limit=500&offset=${offset}`, { headers: adminHeaders });
        if (!response.ok) throw new Error("could not verify open checkout sessions");
        const page = await response.json(); checkoutRows.push(...page);
        if (page.length < 500) break;
      }
      for (const live of [true, false]) {
        const tracked = checkoutRows.filter((row) => row.livemode === live).map((row) => row.session_id);
        const key = live ? config.stripeLiveKey : config.stripeTestKey;
        if (!key) { if (tracked.length) throw new Error("checkout closure unavailable"); continue; }
        for (const subscription of await closeOwnedSessions(userID!, live, key, tracked, request)) {
          subscriptions.set(`${live}:${subscription}`, { stripe_subscription_id: subscription, livemode: live });
        }
      }
      for (const row of subscriptions.values()) {
        const id = row.stripe_subscription_id!;
        if (!/^sub_[a-zA-Z0-9]+$/.test(id) || typeof row.livemode !== "boolean") throw new Error("invalid stored subscription");
        const key = row.livemode ? config.stripeLiveKey : config.stripeTestKey;
        if (!key) throw new Error("subscription cancellation unavailable");
        const url = `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(id)}`;
        const headers = { Authorization: `Bearer ${key}` };
        const existing = await request(url, { headers });
        if (!existing.ok) throw new Error("could not verify subscription cancellation");
        const subscription = await existing.json();
        if (subscription.livemode !== row.livemode || (subscription.metadata?.owner && subscription.metadata.owner !== userID)) {
          throw new Error("subscription ownership mismatch");
        }
        if (["canceled", "incomplete_expired"].includes(subscription.status)) continue;
        const cancel = await request(`${url}?invoice_now=false&prorate=false`, { method: "DELETE", headers });
        if (!cancel.ok) {
          // Another simultaneous request may have completed the same cancellation.
          const check = await request(url, { headers });
          if (!check.ok || (await check.json()).status !== "canceled") throw new Error("subscription cancellation failed");
        } else if ((await cancel.json()).status !== "canceled") throw new Error("subscription cancellation unconfirmed");
        canceled++;
      }
      // Legacy iOS product events are keyed by account UUID rather than an
      // auth foreign key. Delete only this authenticated owner's events;
      // never accept an installation identifier or account id from the body.
      const analytics = await request(`${config.supabaseURL}/rest/v1/app_events?identity=eq.${owner}`, {
        method: "DELETE", headers: adminHeaders,
      });
      if (!analytics.ok) throw new Error("could not remove account analytics");
      // Revoke refresh sessions globally before deleting their underlying user.
      // Existing JWTs expire naturally; the auth/user lookup and user FKs also
      // prevent a deleted account from opening checkout or creating user rows.
      const logout = await request(`${config.supabaseURL}/auth/v1/logout?scope=global`, {
        method: "POST", headers: { apikey: config.serviceKey, Authorization: authorization },
      });
      if (!logout.ok) throw new Error("could not revoke account sessions");
      signedOut = true;
      const deleted = await request(`${config.supabaseURL}/auth/v1/admin/users/${owner}`, { method: "DELETE", headers: adminHeaders });
      if (!deleted.ok) throw new Error("account deletion failed");
      // Native id-token sign-in never retained Apple refresh/access tokens.
      // TN3194 requires deletion to proceed and users to be directed to remove
      // Apple's remaining authorization manually in this existing-account case.
      const appleIdentity = Array.isArray(user.identities) && user.identities.some((identity: { provider?: string }) => identity.provider === "apple");
      return json({ ok: true, deleted: userID, canceled_subscriptions: canceled,
        apple_revocation_required: appleIdentity,
        ...(appleIdentity ? { apple_revocation_url: "https://support.apple.com/en-us/102571" } : {}),
      });
    } catch (error) {
      // Public rows are removed only by the auth deletion's transaction. A
      // failed cancellation preserves the account and can be retried. Optional
      // analytics may already be removed if a later auth operation fails.
      if (deletionMarked && userID) {
        try {
          await request(`${config.supabaseURL}/rest/v1/account_deletion_requests?user_id=eq.${encodeURIComponent(userID)}`, {
            method: "DELETE", headers: adminHeaders,
          });
        } catch { /* A retry can resume an existing deletion marker. */ }
      }
      console.error("account deletion incomplete", (error as Error).message);
      const message = signedOut
        ? "Your account could not be deleted. Sign in again and retry. Any subscriptions already canceled will stay canceled."
        : canceled > 0
        ? "Some subscriptions were canceled, but account deletion could not finish. Your account data is still here. Please retry."
        : "Account deletion could not finish. Your account data is still here. Please retry when subscription verification is available.";
      return json({ error: message, signed_out: signedOut }, 503);
    }
  };
}
