// Supabase Edge Function: live-scores
//
// Cloud port of scripts/poll-live-scores.js — so live scores stay fresh 24/7,
// independent of the laptop. Polls today's MLB / NFL / NCAAF BallDontLie slates and upserts
// one row per game into `live_scores`, exactly the shape the iOS app reads.
// Fired every ~1 minute by pg_cron during live windows.
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

import {
  addUtcDateDays,
  footballBdlRequest,
  normalizeFootballGames,
} from "../_shared/liveScoreFootball.js";
import {
  constrainLiveScoreGateToWindow,
  evaluateLiveScoreSourceResults,
  isAuthoritativeSlateFullyFinal,
  resolveLiveScoreSourceGate,
  selectLiveScoreSources,
} from "../_shared/liveScoreSourceGate.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BDL_KEY = Deno.env.get("BALLDONTLIE_API_KEY") ?? "";
const BDL_BASE = "https://api.balldontlie.io";
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

// A game's true ET SLATE date from its start datetime. BDL dates by UTC instant,
// so a 9:38pm ET game (= next UTC day) is returned by BOTH days' `dates:[]`
// fetches; stamping rows by the game's own ET date (not the poll's wall-clock
// date) keeps a late game on its real slate day instead of leaking onto the next
// day's board. Returns null on a missing/garbage datetime (caller falls back).
function etDateStr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
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
  // One ET slate spans two UTC dates. BDL accepts both dates in one request,
  // so late West Coast games stay visible without spending a second call.
  const games = await bdlGet("/mlb/v1/games", { dates: [date, addUtcDateDays(date)], per_page: "100" });
  return games.map((g: any): Game | null => {
    const gameDate = etDateStr(g.date);
    if (gameDate && gameDate !== date) return null;
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
        // Stamp by the game's true ET slate date (BDL `dates:[date]` returns a
        // 9:38pm-ET game under the NEXT UTC day — without this it leaks onto
        // tomorrow's board). g.date is the game's UTC start instant.
        date: gameDate ?? date, league: "MLB", game_id: String(g.id),
        away_abbr: g.away_team?.abbreviation ?? null,
        home_abbr: g.home_team?.abbreviation ?? null,
        away_score: num(g.away_team_data?.runs),
        home_score: num(g.home_team_data?.runs),
        status, detail, outs: null, bases: null, updated_at: now,
      },
    };
  }).filter((game: Game | null): game is Game => game !== null);
}

// Football games use an ISO start datetime. Ask BDL for both UTC dates that
// can contain one ET slate, then keep only games whose true ET start date is
// the requested date. NFL includes preseason explicitly; BDL's default omits
// it, which otherwise makes the entire August slate disappear.
async function footballGames(league: "NFL" | "NCAAF", date: string, now: string): Promise<Game[]> {
  const request = footballBdlRequest(league, date);
  const raw = await bdlGet(request.path, request.params);
  const normalized = normalizeFootballGames(raw, {
    league,
    targetDate: date,
    nowMs: Date.parse(now),
  });
  for (const issue of normalized.issues) {
    console.warn(`[live-scores] ${league} game ${issue.gameId ?? "?"} skipped: ${issue.message}`);
  }
  if (normalized.rows.length === 0 && normalized.issues.length > 0) {
    throw new Error(`${league} returned games but none had a usable live-score shape`);
  }

  return normalized.rows.map((item: any): Game => {
    const { _etDate, ...score } = item.row;
    return {
      startAt: item.startAt,
      row: { ...score, date: _etDate, updated_at: now } as Row,
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
async function storedScoreRows(date: string): Promise<Array<{ league: string; game_id: string; status: string }>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/live_scores?date=eq.${date}&select=league,game_id,status`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!res.ok) return []; // fail open — fall through to a normal BDL poll
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Exact-date, pre-BDL source gate. A populated daily_slate is authoritative;
// an unavailable, empty, or malformed read deliberately fails open so an early
// morning slate race cannot silently hide scheduled football.
async function dailySlateSourceGate(
  date: string,
  supportedLeagues: string[],
  storedRows: Array<{ league: string; game_id: string; status: string }>,
  nowMs: number,
) {
  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/daily_slate`);
    url.searchParams.set("date", `eq.${date}`);
    url.searchParams.set("select", "league,bdl_game_id,commence_time");
    const res = await fetch(url, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) throw new Error(`daily_slate read ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    const gate = resolveLiveScoreSourceGate({ rows, supportedLeagues });
    return {
      ...constrainLiveScoreGateToWindow(gate, { rows, storedRows, nowMs }),
      slateRows: Array.isArray(rows) ? rows : [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return resolveLiveScoreSourceGate({ error: message, supportedLeagues });
  }
}

Deno.serve(async () => {
  if (!BDL_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "BALLDONTLIE_API_KEY not set" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  const date = estDate();
  const stored = await storedScoreRows(date);
  const now = new Date().toISOString();
  const nowMs = Date.parse(now);
  // Providers stay behind closures: creating promises before the source gate
  // would spend the BDL request even for a league absent from daily_slate.
  const sourceCatalog = [
    { name: "MLB", load: () => mlbGames(date, now) },
    { name: "NFL", load: () => footballGames("NFL", date, now) },
    { name: "NCAAF", load: () => footballGames("NCAAF", date, now) },
  ];
  const sourceGate: any = await dailySlateSourceGate(
    date,
    sourceCatalog.map((source) => source.name),
    stored,
    nowMs,
  );

  // Do not infer that the whole ET slate is finished from stored rows alone.
  // On a mixed-source day, an early MLB window may be all-final before a later
  // NFL/NCAAF game has ever created a live_scores row. daily_slate is the exact
  // authoritative game list; only exact final coverage of that list earns the
  // cheap all-night exit.
  if (isAuthoritativeSlateFullyFinal({
    gate: sourceGate,
    slateRows: sourceGate.slateRows,
    storedRows: stored,
  })) {
    return new Response(
      JSON.stringify({ ok: true, date, skipped: "slate-final", games: stored.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const sources = selectLiveScoreSources(sourceGate, sourceCatalog);
  if (sourceGate.authoritative && sources.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, date, skipped: "outside-live-window", games: stored.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  if (sourceGate.authoritative) {
    console.log(`[live-scores] daily_slate source gate ${date}: ${sourceGate.leagues.join(", ")}`);
  } else {
    console.warn(`[live-scores] ${sourceGate.mode}; polling all sources (${sourceGate.reason})`);
  }

  const results = await Promise.allSettled(sources.map((source) => source.load()));
  const evaluated = evaluateLiveScoreSourceResults({ gate: sourceGate, sources, settled: results });
  const games: Game[] = evaluated.items;
  const errors: string[] = evaluated.failures.map((failure: any) => {
    console.error(`[live-scores] ${failure.name} source failed: ${failure.message}`);
    return `${failure.name}: ${failure.message}`;
  });

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
      JSON.stringify({ ok: errors.length === 0, date, skipped: "nothing-live", games: games.length, live, imminent, final, errors }),
      { status: errors.length ? 502 : 200, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    await upsertLiveScores(games.map((g) => g.row));
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e), date }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: errors.length === 0, date, games: games.length, live, imminent, final, errors }), {
    status: errors.length ? 502 : 200,
    headers: { "Content-Type": "application/json" },
  });
});
