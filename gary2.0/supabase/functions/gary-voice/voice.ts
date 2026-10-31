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
}

export class GaryVoice {
  private ws: WebSocket;
  private ready: Promise<void>;
  private contextId = crypto.randomUUID();
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
    return JSON.stringify({
      model_id: this.opts.model,
      transcript,
      voice: { id: this.opts.voiceId },
      language: "en",
      context_id: this.contextId,
      output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: VOICE_SAMPLE_RATE },
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
    if (m.type === "chunk" && typeof m.data === "string") this.opts.events.audio(m.data);
    else if (m.type === "timestamps" && m.word_timestamps) {
      const w = m.word_timestamps;
      if (Array.isArray(w.words) && w.words.length) this.opts.events.words(w.words, w.start ?? [], w.end ?? []);
    } else if (m.type === "done") {
      this.finished = true;
      this.opts.events.done();
      this.close();
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
  }

  /** No more text is coming: finish the line. */
  async finish() {
    if (this.closed) return;
    await this.ready;
    this.ws.send(this.request("", false));
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.ws.close(); } catch { /* already gone */ }
  }
}
