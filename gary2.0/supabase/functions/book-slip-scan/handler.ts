// book-slip-scan — reads a screenshot of a sportsbook slip and returns the
// wagers on it as data, so the outside-bet form can be prefilled. It NEVER
// writes a bet: the user reviews and taps Add. Anthropic only (ANTHROPIC_API_KEY).

export interface ScanConfig {
  supabaseURL: string;
  anonKey: string;
  anthropicKey: string;
  model: string;
  fetch?: typeof fetch;
}

export interface ScannedBet {
  description: string;
  league: string;
  market: string | null;
  odds_american: number | null;
  stake_dollars: number | null;
  game_date: string | null;
  result: string | null;
  legs: string[];
}

export interface ScanResult {
  ok: true;
  bets: ScannedBet[];
  sportsbook: string | null;
  notes: string;
  used: number;
  limit: number;
}

const LEAGUES = new Set(["MLB", "NFL", "NBA", "NCAAF", "NHL", "NCAAB", "SOCCER", "OTHER"]);
const MARKETS = new Set(["moneyline", "spread", "total", "prop", "parlay", "other"]);
const RESULTS = new Set(["pending", "won", "lost", "push", "void"]);
const MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_BETS = 12;

export const SCAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bets", "sportsbook", "notes"],
  properties: {
    sportsbook: { type: ["string", "null"], description: "The sportsbook name printed on the slip, or null." },
    notes: { type: "string", description: "One short sentence on anything that could not be read. Empty when everything was legible." },
    bets: {
      type: "array",
      maxItems: MAX_BETS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "league", "market", "odds_american", "stake_dollars", "game_date", "result", "legs"],
        properties: {
          description: { type: "string", description: "The selection as a bettor would say it: team or player, line, and side. Example: 'Chiefs -3.5', 'Aaron Judge over 1.5 total bases', '3-leg parlay'." },
          league: { type: "string", enum: [...LEAGUES] },
          market: { type: ["string", "null"], enum: [...MARKETS, null] },
          odds_american: { type: ["integer", "null"], description: "American odds as an integer: -110, 145 (for +145). Null when not shown." },
          stake_dollars: { type: ["number", "null"], description: "The risk amount in dollars, not the payout. Null when not shown." },
          game_date: { type: ["string", "null"], description: "YYYY-MM-DD when the slip shows the game date. Null otherwise." },
          result: { type: ["string", "null"], enum: [...RESULTS, null], description: "Only when the slip shows the bet settled." },
          legs: { type: "array", items: { type: "string" }, description: "Each leg of a parlay, in order. Empty for a straight bet." },
        },
      },
    },
  },
} as const;

export const SCAN_SYSTEM = [
  "You transcribe screenshots of sports betting slips and receipts into data.",
  "Report only what is visible; when a value is not on the slip, use null. Never invent odds, stakes or dates.",
  "Odds are American integers. Stake is the amount risked, not the potential payout.",
  "A parlay or same-game parlay is one bet with market 'parlay', its total odds and stake, and every leg listed in 'legs'.",
  "Straight bets each get their own entry. Team totals, player props and alternate lines are 'prop' or 'total' as appropriate.",
  "Dates are YYYY-MM-DD only when the slip shows the game date. Results only when the slip shows the bet settled.",
].join(" ");

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const month = Number(m[2]), day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return m[0];
}

function cleanOdds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  return Math.abs(n) >= 100 && Math.abs(n) <= 100000 ? n : null;
}

function cleanStake(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000_000) return null;
  return Math.round(value * 100) / 100;
}

/** Everything the model returns passes through here before it reaches a client. */
export function normalizeScan(raw: unknown): { bets: ScannedBet[]; sportsbook: string | null; notes: string } {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(obj.bets) ? obj.bets : [];
  const bets: ScannedBet[] = [];
  for (const item of list.slice(0, MAX_BETS)) {
    const b = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const description = cleanText(b.description, 300);
    if (!description) continue;
    const league = cleanText(b.league, 12).toUpperCase();
    const market = cleanText(b.market, 12).toLowerCase();
    const result = cleanText(b.result, 12).toLowerCase();
    const legs = Array.isArray(b.legs) ? b.legs.map((l) => cleanText(l, 200)).filter(Boolean).slice(0, 20) : [];
    bets.push({
      description,
      league: LEAGUES.has(league) ? league : "OTHER",
      market: MARKETS.has(market) ? market : (legs.length > 1 ? "parlay" : null),
      odds_american: cleanOdds(b.odds_american),
      stake_dollars: cleanStake(b.stake_dollars),
      game_date: cleanDate(b.game_date),
      result: RESULTS.has(result) ? result : null,
      legs,
    });
  }
  const sportsbook = cleanText(obj.sportsbook, 80);
  return { bets, sportsbook: sportsbook || null, notes: cleanText(obj.notes, 300) };
}

/** Pulls the JSON object out of the model's text, tolerating stray prose. */
export function parseModelJSON(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const start = trimmed.indexOf("{"), end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* fall through */ }
  }
  throw new Error("The reader returned something that was not a slip.");
}

export function createScanHandler(config: ScanConfig) {
  const doFetch = config.fetch ?? fetch;
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const authorization = req.headers.get("authorization") ?? "";
    if (!/^Bearer\s+\S+/i.test(authorization)) return json({ error: "Sign in to scan a slip." }, 401);
    if (!config.anthropicKey) return json({ error: "The slip reader is not configured." }, 503);

    // 1. Who is asking — the session must be live, not just present.
    const who = await doFetch(`${config.supabaseURL}/auth/v1/user`, {
      headers: { apikey: config.anonKey, Authorization: authorization },
    });
    if (!who.ok) return json({ error: "Your session expired. Sign in again to scan a slip." }, 401);
    const user = await who.json().catch(() => ({}));
    if (typeof user?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(user.id)) return json({ error: "Invalid account." }, 401);

    // 2. The image.
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: "Send the slip as JSON: { image_base64, media_type }." }, 400); }
    const mediaType = typeof body.media_type === "string" ? body.media_type.toLowerCase() : "";
    const image = typeof body.image_base64 === "string" ? body.image_base64.replace(/\s+/g, "") : "";
    if (!MEDIA.has(mediaType)) return json({ error: "Send a JPEG, PNG, WebP or GIF screenshot." }, 400);
    if (!image || !/^[A-Za-z0-9+/=]+$/.test(image)) return json({ error: "The image could not be read." }, 400);
    if (image.length * 0.75 > MAX_IMAGE_BYTES) return json({ error: "That screenshot is too large. Crop it to the slip and try again." }, 413);

    // 3. Count it against today's allowance, as the user (the RPC reads auth.uid()).
    const counted = await doFetch(`${config.supabaseURL}/rest/v1/rpc/record_slip_scan`, {
      method: "POST",
      headers: { apikey: config.anonKey, Authorization: authorization, "Content-Type": "application/json" },
      body: "{}",
    });
    const usage = await counted.json().catch(() => ({}));
    if (!counted.ok) {
      const message = String(usage?.message ?? "");
      if (/limit/i.test(message)) return json({ error: "You have used today's 40 slip scans. The counter resets at midnight Eastern." }, 429);
      return json({ error: "The scanner could not start. Please try again." }, 502);
    }

    // 4. Read the slip.
    const request = {
      model: config.model,
      max_tokens: 4000,
      system: SCAN_SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCAN_SCHEMA } },
      fallbacks: "default",
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text", text: "Transcribe every wager on this slip." },
        ],
      }],
    };
    const r = await doFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.anthropicKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });
    const reply = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("book-slip-scan anthropic", r.status, JSON.stringify(reply).slice(0, 300));
      return json({ error: "The slip reader is unavailable right now. Enter the bet by hand or try again shortly." }, 502);
    }
    if (reply?.stop_reason === "refusal") return json({ error: "That image could not be read as a betting slip." }, 422);
    const text = (reply?.content ?? []).filter((c: { type?: string }) => c?.type === "text").map((c: { text?: string }) => c.text ?? "").join("");
    let parsed: ReturnType<typeof normalizeScan>;
    try { parsed = normalizeScan(parseModelJSON(text)); }
    catch { return json({ error: "That image could not be read as a betting slip." }, 422); }
    if (parsed.bets.length === 0) return json({ error: "No wagers were found on that image. Make sure the slip fills the screenshot." , notes: parsed.notes }, 422);

    const result: ScanResult = { ok: true, ...parsed, used: Number(usage?.used ?? 0), limit: Number(usage?.limit ?? 40) };
    return json(result);
  };
}
