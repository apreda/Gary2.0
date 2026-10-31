// gary-voice: someone asks Gary a question out loud on Home; he answers in his own voice.
//
// POST { question, history?, date?, install? }  ->  NDJSON stream, one event per line:
//   {"t":"start","rate":24000}            raw 16-bit mono PCM follows at this rate
//   {"t":"text","s":"..."}                his words as he writes them
//   {"t":"audio","b":"<base64 pcm>"}      his voice, in order
//   {"t":"words","w":[...],"s":[...],"e":[...]}  word timings (seconds from the start of his audio)
//   {"t":"end"} | {"t":"error","m":"..."}
// POST { prime: true, date? }  ->  JSON { enabled, questions, names }: what to offer and what to listen for.
//
// Signed in, the listener is their account; signed out, their install id. Each question is admitted against
// gary_voice_config (on/off, per-person and per-day dollar caps) before any model is called.
import { ask, boardFor, costUSD, type Turn } from "./brain.ts";
import { makeDb, readScoreboard, slateDate } from "./notebook.ts";
import { SpeechChunker } from "./speech.ts";
import { GaryVoice, VOICE_SAMPLE_RATE } from "./voice.ts";

export interface VoiceConfig {
  supabaseURL: string;
  serviceKey: string;
  anonKey: string;
  anthropicKey: string;
  cartesiaKey: string;
  fallbackVoiceId?: string;
  fetch?: typeof fetch;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const boards = new Map();

// Said in his voice when he can't answer, so the room never goes silent.
const LINES: Record<string, string> = {
  limit: "That's all I've got in me today. Come find me tomorrow.",
  budget: "I'm done talking for tonight. Catch me tomorrow.",
  failed: "I lost my train of thought there. Ask me that one more time.",
  refused: "That one's not for me. Ask me about the games.",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function listener(cfg: VoiceConfig, bearer: string | null, install: unknown) {
  const f = cfg.fetch ?? fetch;
  if (bearer && bearer !== cfg.anonKey) {
    const r = await f(`${cfg.supabaseURL}/auth/v1/user`, { headers: { apikey: cfg.anonKey, Authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const u = await r.json();
      if (u?.id) return { who: String(u.id), signedIn: !u.is_anonymous, bearer };
    }
  }
  if (typeof install === "string" && UUID.test(install)) return { who: `install:${install.toLowerCase()}`, signedIn: false, bearer: null };
  return null;
}

export function createVoiceHandler(cfg: VoiceConfig) {
  const f = cfg.fetch ?? fetch;
  const service = (path: string, body: unknown) => f(`${cfg.supabaseURL}/rest/v1/${path}`, {
    method: "POST",
    headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6000),
  });

  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;
    const date = typeof body.date === "string" && YMD.test(body.date) ? body.date : slateDate();

    if (body.prime) {
      const db = makeDb(cfg.supabaseURL, cfg.serviceKey, cfg.anonKey, null, f);
      const board = await boardFor(db, date, boards).catch(() => null);
      const conf = await f(`${cfg.supabaseURL}/rest/v1/gary_voice_config?id=eq.1&select=enabled`, {
        headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}` },
      }).then((r) => r.json()).catch(() => null);
      const ready = conf?.[0]?.enabled !== false && !!cfg.anthropicKey && !!cfg.cartesiaKey;
      return json({ enabled: ready, questions: board?.questions ?? [], names: board?.names ?? [] });
    }

    const question = typeof body.question === "string" ? body.question.replace(/\s+/g, " ").trim().slice(0, 500) : "";
    if (!question) return json({ error: "no question" }, 400);
    const history: Turn[] = (Array.isArray(body.history) ? body.history : [])
      .filter((t: any) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string" && t.text.trim())
      .slice(-8).map((t: any) => ({ role: t.role, text: t.text.slice(0, 1500) }));

    if (!cfg.anthropicKey || !cfg.cartesiaKey) return json({ error: "off" }, 503);
    const who = await listener(cfg, bearer, body.install).catch(() => null);
    if (!who) return json({ error: "who" }, 401);
    const admitted = await f(`${cfg.supabaseURL}/rest/v1/rpc/gary_voice_admit`, {
      method: "POST",
      headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_who: who.who, p_signed_in: who.signedIn }),
    }).then((r) => r.json()).catch(() => null);
    if (!admitted || admitted.reason === "off") return json({ error: "off" }, 503);
    const voiceId = admitted.voice_id || cfg.fallbackVoiceId;
    if (!voiceId) return json({ error: "no voice" }, 503);

    const started = Date.now();
    const enc = new TextEncoder();
    let firstAudio = 0;
    // The listener hanging up stops Gary mid-answer.
    const gone = new AbortController();
    const stream = new ReadableStream({
      cancel: () => gone.abort(),
      start: async (controller) => {
        let open = true;
        const send = (o: unknown) => { if (open) { try { controller.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { open = false; } } };
        let voiceDone!: () => void;
        const voiceFinished = new Promise<void>((r) => (voiceDone = r));
        const voice = new GaryVoice({
          apiKey: cfg.cartesiaKey, voiceId, model: admitted.tts_model || "sonic-3.6", speed: Number(admitted.speed) || 1,
          events: {
            audio: (b) => { if (!firstAudio) firstAudio = Date.now() - started; send({ t: "audio", b }); },
            words: (w, s, e) => send({ t: "words", w, s, e }),
            done: () => voiceDone(),
            error: (m) => { send({ t: "voice_error", m }); voiceDone(); },
          },
        });
        send({ t: "start", rate: VOICE_SAMPLE_RATE });

        let answer = "", error: string | null = null, tools: string[] = [];
        let usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
        try {
          if (!admitted.ok) {
            answer = LINES[admitted.reason] ?? LINES.limit;
            send({ t: "text", s: answer });
            await voice.say(answer);
          } else {
            const db = makeDb(cfg.supabaseURL, cfg.serviceKey, cfg.anonKey, who.bearer, f);
            const [board, scoreboard] = await Promise.all([boardFor(db, date, boards), readScoreboard(db, date)]);
            const chunker = new SpeechChunker();
            const said = (pieces: string[]) => pieces.forEach((p) => voice.say(p).catch(() => {}));
            const result = await ask({
              apiKey: cfg.anthropicKey, db, slate: date, board, scoreboard, history, question,
              onText: (d) => { send({ t: "text", s: d }); said(chunker.push(d)); },
              signal: gone.signal,
            });
            usage = result.usage; tools = result.tools; answer = result.answer;
            const rest = chunker.flush();
            if (rest) await voice.say(rest);
            if (result.refused || !answer) {
              answer = result.refused ? LINES.refused : LINES.failed;
              send({ t: "text", s: answer });
              await voice.say(answer);
            }
          }
        } catch (e) {
          error = (e as Error).message ?? String(e);
          console.error("[gary-voice]", error);
          if (!answer) {
            answer = LINES.failed;
            send({ t: "text", s: answer });
            await voice.say(answer).catch(() => {});
          }
        }
        try {
          await voice.finish();
          await Promise.race([voiceFinished, new Promise((r) => setTimeout(r, 45_000))]);
        } catch (e) {
          send({ t: "voice_error", m: (e as Error).message });
        }
        voice.close();
        send(error && !answer ? { t: "error", m: "failed" } : { t: "end" });
        open = false;
        try { controller.close(); } catch { /* client left */ }

        const cost = costUSD(usage, voice.chars);
        await Promise.allSettled([
          service("rpc/gary_voice_spend", { p_who: who.who, p_cost: cost }),
          service("gary_voice_log", {
            who: who.who, question, answer, tools, input_tokens: usage.input, cache_read_tokens: usage.cacheRead,
            cache_write_tokens: usage.cacheWrite, output_tokens: usage.output, tts_chars: voice.chars, cost_usd: Number(cost.toFixed(5)),
            first_audio_ms: firstAudio || null, total_ms: Date.now() - started, error,
          }),
        ]);
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
  };
}
