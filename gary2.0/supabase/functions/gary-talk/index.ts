import { createTalkHandler } from "./handler.ts";

// Talk to Gary: answers the fan from what the desk stored for the board.
// Never a new ticket. Subscription worker; model overridable per the other lanes.
Deno.serve(createTalkHandler({
  supabaseURL: Deno.env.get("SUPABASE_URL")!,
  anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
  serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  model: Deno.env.get("GARY_TALK_MODEL") ?? "claude-opus-5",
}));
