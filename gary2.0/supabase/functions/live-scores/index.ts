// Supabase Edge Function: live-scores
//
// Cloud port of scripts/poll-live-scores.js — so live scores stay fresh 24/7,
// independent of the laptop. Polls today's MLB (BallDontLie) + World Cup (BDL
// FIFA) slate and upserts one row per game into `live_scores`, exactly the shape
// the iOS app reads. Designed to be fired every ~2 minutes by pg_cron.
//
// Auth: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// BALLDONTLIE_API_KEY must be set as a function secret:
//   supabase secrets set BALLDONTLIE_API_KEY=<key>
//
// Status normalization: scheduled | live | final. `detail` is a short
// render-ready string ("INN 7", "67'", "FINAL") so the app stays dumb.
//
// Grading (grade-on-final) is a SEPARATE function/layer — this one only mirrors
// scores, which keeps it cheap and low-risk to run all day.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BDL_KEY = Deno.env.get("BALLDONTLIE_API_KEY") ?? "";
const BDL_BASE = "https://api.balldontlie.io";
const WC_SEASON = 2026;

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
};

async function mlbRows(date: string): Promise<Row[]> {
  const games = await bdlGet("/mlb/v1/games", { dates: [date], per_page: "50" });
  return games.map((g: any): Row => {
    const status = normStatus(g.status);
    const detail = status === "live" && Number.isFinite(Number(g.period))
      ? `INN ${g.period}`
      : status === "final" ? "FINAL" : null;
    return {
      date, league: "MLB", game_id: String(g.id),
      away_abbr: g.away_team?.abbreviation ?? null,
      home_abbr: g.home_team?.abbreviation ?? null,
      away_score: num(g.away_team_data?.runs),
      home_score: num(g.home_team_data?.runs),
      status, detail, outs: null, bases: null,
    };
  });
}

async function wcRows(date: string): Promise<Row[]> {
  const matches = await bdlGet("/fifa/worldcup/v1/matches", { seasons: [String(WC_SEASON)], per_page: "100" });
  return matches
    .filter((m: any) => String(m.datetime ?? "").slice(0, 10) === date)
    .map((m: any): Row => {
      const raw = String(m.status ?? "").toLowerCase();
      const status = raw === "completed" ? "final" : raw === "scheduled" ? "scheduled" : "live";
      const detail = status === "final" ? "FINAL"
        : status === "live" ? (String(m.clock_display ?? "").trim() || "LIVE")
        : null;
      return {
        date, league: "WC", game_id: String(m.id),
        away_abbr: m.away_team?.abbreviation ?? null,
        home_abbr: m.home_team?.abbreviation ?? null,
        away_score: num(m.away_score),
        home_score: num(m.home_score),
        status, detail, outs: null, bases: null,
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

Deno.serve(async () => {
  if (!BDL_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "BALLDONTLIE_API_KEY not set" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  const date = estDate();
  const results = await Promise.allSettled([mlbRows(date), wcRows(date)]);
  const rows = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const errors = results.filter((r) => r.status === "rejected").map((r: any) => String(r.reason));

  try {
    await upsertLiveScores(rows);
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e), date }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  const live = rows.filter((r) => r.status === "live").length;
  const final = rows.filter((r) => r.status === "final").length;
  return new Response(JSON.stringify({ ok: true, date, games: rows.length, live, final, errors }), {
    headers: { "Content-Type": "application/json" },
  });
});
