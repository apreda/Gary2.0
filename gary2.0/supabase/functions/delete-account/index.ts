// Supabase Edge Function: delete-account
//
// In-app account deletion (App Store Guideline 5.1.1(v) — REQUIRED for any app
// that supports account creation). The iOS client POSTs here with the signed-in
// user's access token in the Authorization header. We:
//   1. verify the caller from their JWT (never trust a client-supplied user id),
//   2. delete their user-scoped rows (bankroll, user_picks),
//   3. hard-delete the auth user via the admin API.
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are injected.
// verify_jwt is left ON, so the platform also rejects an unauthenticated call.

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "missing access token" }, 401);

  // Resolve the caller from THEIR token — the only id we trust.
  const asUser = createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error: who } = await asUser.auth.getUser();
  if (who || !user) return json({ error: "invalid or expired session" }, 401);

  const admin = createClient(URL, SERVICE_KEY);

  // 1. User-scoped data first (best-effort — a failure here shouldn't block the
  //    account deletion, but we surface it so it can be investigated).
  const dataErrors: string[] = [];
  for (const table of ["bankroll", "user_picks"]) {
    const { error } = await admin.from(table).delete().eq("user_id", user.id);
    if (error) dataErrors.push(`${table}: ${error.message}`);
  }

  // 2. The auth user (the PII that makes this a real deletion).
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    return json({ error: `account delete failed: ${delErr.message}`, dataErrors }, 500);
  }

  return json({ ok: true, deleted: user.id, dataErrors }, 200);
});
