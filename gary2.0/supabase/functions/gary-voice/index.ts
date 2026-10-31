import { createVoiceHandler } from "./handler.ts";

// Gary answers out loud on Home. Secrets: GARY_VOICE_ANTHROPIC_KEY (the metered API key; Gary is Opus 5.5)
// and CARTESIA_API_KEY (his voice). The voice id, speed and caps live in public.gary_voice_config.
Deno.serve(createVoiceHandler({
  supabaseURL: Deno.env.get("SUPABASE_URL")!,
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
  anthropicKey: Deno.env.get("GARY_VOICE_ANTHROPIC_KEY") ?? "",
  cartesiaKey: Deno.env.get("CARTESIA_API_KEY") ?? "",
  fallbackVoiceId: Deno.env.get("GARY_VOICE_ID") ?? undefined,
}));
