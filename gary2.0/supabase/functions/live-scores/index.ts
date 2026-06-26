// Supabase Edge Function: live-scores
//
// Cloud port of scripts/poll-live-scores.js — so live scores stay fresh 24/7,
// independent of the laptop. Polls today's MLB (BallDontLie) + World Cup (BDL
// FIFA) slate and upserts one row per game into `live_scores`, exactly the shape
// the iOS app reads. Fired every ~1 minute by pg_cron during live windows.
//
// Auth: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// BALLDONTLIE_API_KEY must be set as a function secret:
//   supabase secrets set BALLDONTLIE_API_KEY=<key>
//
// Status normalization: scheduled | live | final. `detail` is a short
// render-ready string ("INN 7", "67'", "FINAL") so the app stays dumb.
//
// Freshness: cron fires every minute, but the function only does the (cheap but
// non-zero) write when there is something worth refreshing — any game that is
// LIVE, or SCHEDULED and about to start (within IMMINENT_MIN), or that just went
// FINAL since the last write. When the whole day's slate is dead (overnight,
// pre-slate), it early-exits without touching the table, so we don't hammer BDL
// or churn the table all night. Every row written carries updated_at = now() so
// the table has a real freshness signal even through merge-duplicate upserts.
//
// Grading (grade-on-final) is a SEPARATE function/layer — this one only mirrors
// scores, which keeps it cheap and low-risk to run all day.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BDL_KEY = Deno.env.get("BALLDONTLIE_API_KEY") ?? "";
const BDL_BASE = "https://api.balldontlie.io";
const WC_SEASON = 2026;
// A scheduled game this many minutes (or fewer) from its start time counts as
// "imminent" — we keep polling so the scheduled→live flip is caught at 1-min
// freshness instead of being missed during the early-exit window.
const IMMINENT_MIN = 20;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function estDate(): string {
  // YYYY-MM-DD in America/New_York.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normStatus(raw: unknown): "scheduled" | "live" | "final" {
  const s = String(raw ?? "").toUpperCase();
  if (s.includes("FINAL")) return "final";
  if (s.includes("SCHEDULED") || s.includes("POSTPONED") || s.includes("DELAYED")) return "scheduled";
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(raw ?? ""))) return "scheduled"; // ISO datetime = not started
  if (!s) return "scheduled";
  return "live";
}

async function bdlGet(path: string, params: Record<string, string | string[]>): Promise<any[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(`${k}[]`, x));
    else qs.append(k, v);
  }
  const url = `${BDL_BASE}${path}?${qs.toString()}`;
  const res = await fetch(url, { headers: { Authorization: BDL_KEY } });
  if (!res.ok) throw new Error(`BDL ${path} ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}

// Persisted shape — exactly the columns the upsert writes. `updated_at` is set
// explicitly so merge-duplicate UPDATEs bump it (the column default only fires
// on INSERT, so without this the freshness signal would freeze on first insert).
type Row = {
  date: string;
  league: string;
  game_id: string;
  away_abbr: string | null;
  home_abbr: string | null;
  away_score: number | null;
  home_score: number | null;
  status: string;
  detail: string | null;
  outs: number | null;
  bases: string | null;
  updated_at: string;
};

// Internal: a Row plus its scheduled start time (ISO), used only to decide
// whether a scheduled game is imminent. `startAt` is never written to the table.
type Game = { row: Row; startAt: string | null };

function isImminent(startAt: string | null, nowMs: number): boolean {
  if (!startAt) return false;
  const t = Date.parse(startAt);
  if (!Number.isFinite(t)) return false;
  return t - nowMs <= IMMINENT_MIN * 60_000 && t - nowMs >= -5 * 60_000;
}

async function mlbGames(date: string, now: string): Promise<Game[]> {
  const games = await bdlGet("/mlb/v1/games", { dates: [date], per_page: "50" });
  return games.map((g: any): Game => {
    const status = normStatus(g.status);
    const detail = status === "live" && Number.isFinite(Number(g.period))
      ? `INN ${g.period}`
      : status === "final" ? "FINAL" : null;
    // When scheduled, BDL's status is the ISO start datetime.
    const startAt = status === "scheduled" && /^\d{4}-\d{2}-\d{2}T/.test(String(g.status ?? ""))
      ? String(g.status) : null;
    return {
      startAt,
      row: {
        date, league: "MLB", game_id: String(g.id),
        away_abbr: g.away_team?.abbreviation ?? null,
        home_abbr: g.home_team?.abbreviation ?? null,
        away_score: num(g.away_team_data?.runs),
        home_score: num(g.home_team_data?.runs),
        status, detail, outs: null, bases: null, updated_at: now,
      },
    };
  });
}

async function wcGames(date: string, now: string): Promise<Game[]> {
  const matches = await bdlGet("/fifa/worldcup/v1/matches", { seasons: [String(WC_SEASON)], per_page: "100" });
  return matches
    .filter((m: any) => String(m.datetime ?? "").slice(0, 10) === date)
    .map((m: any): Game => {
      const raw = String(m.status ?? "").toLowerCase();
      const status = raw === "completed" ? "final" : raw === "scheduled" ? "scheduled" : "live";
      const detail = status === "final" ? "FINAL"
        : status === "live" ? (String(m.clock_display ?? "").trim() || "LIVE")
        : null;
      const startAt = status === "scheduled" ? (String(m.datetime ?? "") || null) : null;
      return {
        startAt,
        row: {
          date, league: "WC", game_id: String(m.id),
          away_abbr: m.away_team?.abbreviation ?? null,
          home_abbr: m.home_team?.abbreviation ?? null,
          away_score: num(m.away_score),
          home_score: num(m.home_score),
          status, detail, outs: null, bases: null, updated_at: now,
        },
      };
    });
}

async function upsertLiveScores(rows: Row[]): Promise<void> {
  if (!rows.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/live_scores?on_conflict=date,league,game_id`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`live_scores upsert ${res.status}: ${await res.text()}`);
}

// Cheap pre-BDL gate: read today's stored rows (Supabase, not BDL). Returns the
// set of stored statuses so we can decide whether the slate is already settled.
async function storedStatuses(date: string): Promise<string[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/live_scores?date=eq.${date}&select=status`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!res.ok) return []; // fail open — fall through to a normal BDL poll
  const data = await res.json();
  return Array.isArray(data) ? data.map((r: any) => String(r.status)) : [];
}

Deno.serve(async () => {
  if (!BDL_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "BALLDONTLIE_API_KEY not set" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  const date = estDate();

  // CHEAP GATE (no BDL): if today's slate is already fully populated and every
  // game has gone FINAL, the day is done — skip the BDL fetch + upsert entirely.
  // This is what spares BDL all evening/overnight while the cron still fires
  // every minute. We only fall through (and pay for BDL) when there is at least
  // one game still scheduled/live, or no rows yet for today (first populate).
  const stored = await storedStatuses(date);
  if (stored.length > 0 && stored.every((s) => s === "final")) {
    return new Response(
      JSON.stringify({ ok: true, date, skipped: "slate-final", games: stored.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const now = new Date().toISOString();
  const nowMs = Date.parse(now);
  const results = await Promise.allSettled([mlbGames(date, now), wcGames(date, now)]);
  const games = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const errors = results.filter((r) => r.status === "rejected").map((r: any) => String(r.reason));

  const live = games.filter((g) => g.row.status === "live").length;
  const final = games.filter((g) => g.row.status === "final").length;
  const imminent = games.filter(
    (g) => g.row.status === "scheduled" && isImminent(g.startAt, nowMs),
  ).length;

  // Worth a write when something is in motion. We reach here only because the
  // cheap gate found the STORED slate is not yet all-final (or empty), so any
  // final games in the fresh data still need to be persisted — including the
  // last live→final flip, which is why `final > 0` must trigger a write here.
  // First populate (no stored rows yet, e.g. a fresh day) also writes so the app
  // gets today's scheduled slate. The one case we skip is a static pre-game slate
  // already on file (every game scheduled, none imminent, nothing live/final, and
  // rows already stored) — nothing to refresh, so don't churn the table or BDL.
  const firstPopulate = stored.length === 0 && games.length > 0;
  const worthWriting = live > 0 || imminent > 0 || final > 0 || firstPopulate;

  if (!worthWriting) {
    return new Response(
      JSON.stringify({ ok: true, date, skipped: "nothing-live", games: games.length, live, imminent, final, errors }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    await upsertLiveScores(games.map((g) => g.row));
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e), date }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, date, games: games.length, live, imminent, final, errors }), {
    headers: { "Content-Type": "application/json" },
  });
});
