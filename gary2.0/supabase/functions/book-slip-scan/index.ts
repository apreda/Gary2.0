import { createScanHandler } from "./handler.ts";

// Reads a sportsbook slip screenshot into outside-bet form values. Never
// writes a bet. Anthropic only; model overridable per the other lanes.
Deno.serve(createScanHandler({
  supabaseURL: Deno.env.get("SUPABASE_URL")!,
  anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
  anthropicKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "",
  model: Deno.env.get("BOOK_SCAN_ANTHROPIC_MODEL") ?? "claude-opus-5",
}));
