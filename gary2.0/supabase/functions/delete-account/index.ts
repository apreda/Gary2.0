import { createDeleteAccountHandler } from "./handler.ts";

Deno.serve(createDeleteAccountHandler({
  supabaseURL: Deno.env.get("SUPABASE_URL")!,
  anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  stripeLiveKey: Deno.env.get("STRIPE_SECRET_KEY_LIVE"),
  stripeTestKey: Deno.env.get("STRIPE_SECRET_KEY_TEST"),
}));
