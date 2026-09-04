export const SPORTS = ["MLB", "NBA", "NFL", "NCAAF"];
export const AMOUNT_CENTS: Record<number, number> = { 1: 999, 2: 1799, 3: 2499 };

export function checkoutPlan(payload: { leagues?: unknown; plan?: unknown }) {
  if (payload.plan === "ALL" || payload.plan === "ALL_ANNUAL") {
    const annual = payload.plan === "ALL_ANNUAL";
    return { sports: ["ALL"], amount: annual ? 17900 : 2999, interval: annual ? "year" : "month", pass: annual ? "annual" : "monthly", trial: 7, name: "Gary All-Access Winners Pass" };
  }
  if (!Array.isArray(payload.leagues) || payload.leagues.some((s) => typeof s !== "string")) throw new Error("Choose one to three sports.");
  const sports = [...new Set(payload.leagues.map((s: string) => s.toUpperCase()))].sort();
  if (sports.length < 1 || sports.length > 3 || sports.some((s) => !SPORTS.includes(s))) throw new Error("Choose one to three supported sports.");
  return { sports, amount: AMOUNT_CENTS[sports.length], interval: "month", pass: "monthly", trial: 0, name: `Gary ${sports.join(" + ")} Winners Pass` };
}

export function subscriptionState(sub: Record<string, any>) {
  const periods = (sub.items?.data ?? []).map((item: any) => item.current_period_end).filter((n: unknown) => typeof n === "number" && Number.isFinite(n));
  const end = sub.current_period_end ?? (periods.length ? Math.min(...periods) : sub.trial_end);
  return {
    status: ["active", "trialing"].includes(sub.status) ? "active" : sub.status === "canceled" ? "canceled" : "inactive",
    expires_at: typeof end === "number" && Number.isFinite(end) ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end === true,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
  };
}

export async function verifyStripeSignature(body: string, header: string | null, secrets: string[], now = Date.now() / 1000): Promise<boolean> {
  if (!header || secrets.length === 0) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!t || !/^\d+$/.test(t) || Math.abs(now - Number(t)) > 300 || !signatures.length) return false;
  const enc = new TextEncoder();
  for (const secret of secrets) {
    if (!secret) continue;
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    for (const signature of signatures) {
      if (!/^[a-f0-9]{64}$/.test(signature)) continue;
      const bytes = new Uint8Array(signature.match(/../g)!.map((s) => parseInt(s, 16)));
      if (await crypto.subtle.verify("HMAC", key, bytes, enc.encode(`${t}.${body}`))) return true;
    }
  }
  return false;
}
