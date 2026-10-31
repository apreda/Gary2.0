// Gary's voice: one Cartesia WebSocket per answer, one context, text sent sentence by sentence as he writes
// it (continuations keep the delivery whole across the pieces). Audio comes back as raw 16-bit PCM at
// 24 kHz in base64, with word timings for the captions; both are handed straight on without decoding.

export const VOICE_SAMPLE_RATE = 24000;
const CARTESIA_VERSION = "2026-08-14";

export interface VoiceEvents {
  audio(b64: string): void;
  words(words: string[], start: number[], end: number[]): void;
  done(): void;
  error(message: string): void;
}

export interface VoiceOptions {
  apiKey: string;
  voiceId: string;
  model: string;
  speed: number;
  events: VoiceEvents;
  socket?: (url: string) => WebSocket;
  /** PCM sample rate: 48 kHz for apps that play it, 24 kHz for builds that only know 24. */
  rate?: number;
  /** Respells his words the way he says them, one word for one word (the voice reads spelling). */
  accent?: ((text: string) => string) | null;
}

/** What the handler needs from a voice, whichever company speaks it. */
export interface Speaker {
  chars: number;
  say(text: string): Promise<void>;
  pause(): Promise<void>;
  finish(): Promise<void>;
  close(): void;
}

export class GaryVoice implements Speaker {
  private ws: WebSocket;
  private ready: Promise<void>;
  // One context per stretch of speech. A lookup pauses him for seconds, long enough for Cartesia to let a
  // context go, so the line before a lookup is finished and the answer after it starts a new one.
  private contextId = crypto.randomUUID();
  private spokeInContext = false;
  private open = new Set<string>();
  private offsets = new Map<string, number>();
  private seconds = 0;
  private ending = false;
  private finished = false;
  private closed = false;
  chars = 0;

  constructor(private opts: VoiceOptions) {
    const url = `wss://api.cartesia.ai/tts/websocket?api_key=${encodeURIComponent(opts.apiKey)}&cartesia_version=${CARTESIA_VERSION}`;
    this.ws = (opts.socket ?? ((u) => new WebSocket(u)))(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("voice connection failed"));
    });
    // A failed connection is reported when the first line is said, not as an unhandled rejection.
    this.ready.catch(() => {});
    this.ws.onmessage = (e) => this.receive(e.data);
    this.ws.onclose = () => {
      if (!this.closed && !this.finished) opts.events.error("voice connection closed");
      this.closed = true;
    };
  }

  private request(transcript: string, more: boolean) {
    if (more || this.spokeInContext) this.open.add(this.contextId);
    return JSON.stringify({
      model_id: this.opts.model,
      transcript,
      voice: { id: this.opts.voiceId },
      language: "en",
      context_id: this.contextId,
      output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: this.opts.rate ?? VOICE_SAMPLE_RATE },
      add_timestamps: true,
      continue: more,
      max_buffer_delay_ms: 400,
      generation_config: { speed: this.opts.speed },
    });
  }

  private receive(raw: unknown) {
    if (typeof raw !== "string") return;
    let m: any;
    try { m = JSON.parse(raw); } catch { return; }
    const ctx = String(m.context_id ?? this.contextId);
    // Each context's clock starts at zero; his audio is one line, so its words are placed after what came before.
    if (!this.offsets.has(ctx)) this.offsets.set(ctx, this.seconds);
    const offset = this.offsets.get(ctx)!;
    if (m.type === "chunk" && typeof m.data === "string") {
      this.seconds += (m.data.length * 3 / 4) / 2 / (this.opts.rate ?? VOICE_SAMPLE_RATE);
      this.opts.events.audio(m.data);
    } else if (m.type === "timestamps" && m.word_timestamps) {
      const w = m.word_timestamps;
      if (Array.isArray(w.words) && w.words.length) {
        this.opts.events.words(w.words, (w.start ?? []).map((t: number) => t + offset), (w.end ?? []).map((t: number) => t + offset));
      }
    } else if (m.type === "done") {
      this.open.delete(ctx);
      if (this.ending && this.open.size === 0) {
        this.finished = true;
        this.opts.events.done();
        this.close();
      }
    } else if (m.type === "error") {
      this.finished = true;
      this.opts.events.error(String(m.message ?? m.title ?? m.error ?? "voice error"));
      this.close();
    }
  }

  /** Say the next piece of the answer. */
  async say(text: string) {
    if (!text.trim() || this.closed) return;
    await this.ready;
    this.chars += text.length;
    this.ws.send(this.request(text, true));
    this.spokeInContext = true;
  }

  /** He's stopping to look something up: finish what he's said so far; what follows starts fresh. */
  async pause() {
    if (this.closed || !this.spokeInContext) return;
    await this.ready;
    this.ws.send(this.request("", false));
    this.contextId = crypto.randomUUID();
    this.spokeInContext = false;
  }

  /** No more text is coming: finish the line. */
  async finish() {
    if (this.closed) return;
    await this.ready;
    this.ending = true;
    if (this.spokeInContext) this.ws.send(this.request("", false));
    if (this.open.size === 0) {
      this.finished = true;
      this.opts.events.done();
      this.close();
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.ws.close(); } catch { /* already gone */ }
  }
}

// ElevenLabs Eleven v4 Turbo over the Text to Dialogue WebSocket: one voice, text streamed in as he writes
// it, 16-bit 24 kHz PCM back (the same audio the app already plays) with character timings per chunk.
// The server holds text until it has about 40 characters, so a short line before a lookup is flushed.
export class ElevenVoice implements Speaker {
  private ws: WebSocket;
  private ready: Promise<void>;
  private seconds = 0;
  private inWord = false;
  private keepAlive: ReturnType<typeof setInterval> | undefined;
  private finished = false;
  private closed = false;
  chars = 0;

  constructor(private opts: VoiceOptions) {
    const url = `wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input?model_id=${encodeURIComponent(opts.model)}` +
      `&output_format=pcm_${opts.rate ?? VOICE_SAMPLE_RATE}&sync_alignment=true`;
    this.ws = (opts.socket ?? ((u) => new WebSocket(u)))(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({ voices: [opts.voiceId], xi_api_key: opts.apiKey }));
        // A lookup can leave the socket quiet; the server drops it after 20 silent seconds.
        this.keepAlive = setInterval(() => this.send({ keep_alive: true }), 10_000);
        resolve();
      };
      this.ws.onerror = () => reject(new Error("voice connection failed"));
    });
    this.ready.catch(() => {});
    this.ws.onmessage = (e) => this.receive(e.data);
    this.ws.onclose = () => {
      clearInterval(this.keepAlive);
      if (!this.closed && !this.finished) opts.events.error("voice connection closed");
      this.closed = true;
    };
  }

  private send(o: unknown) {
    if (!this.closed && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o));
  }

  private receive(raw: unknown) {
    if (typeof raw !== "string") return;
    let m: any;
    try { m = JSON.parse(raw); } catch { return; }
    if (typeof m.audio === "string" && m.audio) {
      const start = this.seconds;
      this.seconds += (m.audio.length * 3 / 4) / 2 / (this.opts.rate ?? VOICE_SAMPLE_RATE);
      this.opts.events.audio(m.audio);
      const a = m.alignment;
      if (a && Array.isArray(a.chars)) {
        // Words begin where a letter follows a space; a word can straddle two chunks.
        const words: string[] = [], starts: number[] = [], ends: number[] = [];
        a.chars.forEach((c: string, i: number) => {
          if (/\s/.test(c)) { this.inWord = false; return; }
          if (!this.inWord) { words.push(c); starts.push(start + (a.char_start_times_ms?.[i] ?? 0) / 1000); ends.push(start); }
          else if (words.length) words[words.length - 1] += c;
          this.inWord = true;
        });
        if (words.length) this.opts.events.words(words, starts, ends);
      }
    } else if (m.is_final) {
      this.finished = true;
      this.opts.events.done();
      this.close();
    } else if (m.error) {
      this.finished = true;
      this.opts.events.error(String(m.message ?? m.error));
      this.close();
    }
  }

  async say(text: string) {
    if (!text.trim() || this.closed) return;
    await this.ready;
    this.chars += text.length;
    const said = this.opts.accent ? this.opts.accent(text) : text;
    this.send({ inputs: [{ text: said, voice_id: this.opts.voiceId, new_turn: false }] });
  }

  async pause() {
    if (this.closed) return;
    await this.ready;
    this.send({ flush: true });
  }

  async finish() {
    if (this.closed) return;
    await this.ready;
    this.send({ close_socket: true });
  }

  close() {
    clearInterval(this.keepAlive);
    if (this.closed) return;
    this.closed = true;
    try { this.ws.close(); } catch { /* already gone */ }
  }
}
