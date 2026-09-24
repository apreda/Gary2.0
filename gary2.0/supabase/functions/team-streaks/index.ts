import { easternDateOffset as estDate, shiftDateKey } from "../_shared/dateKeys.js";
import { isCacheServiceRequest } from "../live-scores/authorization.ts";
// Supabase Edge Function: team-streaks
//
// Every club's current win or loss run, live, around the clock (founder, Sep 24
// 2026: "update that in real time as the teams win and lose throughout the
// day... work 24/7 for the truth of what's happening in the real world").
// pg_cron calls it every five minutes. A run shows at two games; a one-game
// run is not a streak.
//
//   MLB  the MLB Stats API schedule, the last 60 days: every final, regular
//        season and postseason, newest first. A game counts the moment it is
//        final, so a win at 4:10 PM moves the map before the night games start.
//   NFL  nflverse's schedule (regular season, this season and last, so a run
//        carries across the offseason the way the nightly builder always
//        did) plus ESPN's scoreboard for this week, so a game that just ended
//        counts before nflverse records it.
//
// Rows land in `streaks` (kinds win / loss) for today's ET date through
// `replace_team_runs`, one transaction per league, which also carries the
// day's other streaks forward until the nightly builder writes them. A source
// that fails leaves that league's rows as they were.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STATSAPI = "https://statsapi.mlb.com/api/v1";
const NFLVERSE_GAMES = "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv.gz";
const ESPN_NFL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

const MIN_RUN = 2;
const MLB_WINDOW_DAYS = 60;

type Row = {
  league: string; subject_type: "team"; subject: string; team: string;
  kind: "win" | "loss"; length: number; detail: string; next_game: string | null;
};
/** won is null on a tie, which ends a run either way. */
type Result = { won: boolean | null; mine: number; theirs: number };

const ET_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function getJson(url: string, ms = 20_000): Promise<any> {
  // ESPN answers 403 to a request without a browser-style agent.
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { "User-Agent": "Mozilla/5.0 (Gary team-streaks)", Accept: "application/json" } });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return await res.json();
}

/** "7:10 PM" in ET for an ISO start. */
function clockET(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
}
function etDateOf(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
function weekdayET(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" });
}

/** A club's current run from its results, newest first. */
function runRow(league: string, team: string, results: Result[], next: string | null): Row | null {
  if (!results.length || results[0].won === null) return null;
  const won = results[0].won;
  let n = 0, mine = 0, theirs = 0;
  for (const r of results) {
    if (r.won !== won) break;
    n++; mine += r.mine; theirs += r.theirs;
  }
  if (n < MIN_RUN) return null;
  return {
    league, subject_type: "team", subject: team, team,
    kind: won ? "win" : "loss", length: n,
    detail: won ? `W${n} — outscored foes ${mine}-${theirs}` : `L${n} — outscored ${theirs}-${mine} in the skid`,
    next_game: next,
  };
}

// ── MLB ────────────────────────────────────────────────────────────────────

async function mlbRuns(today: string): Promise<{ rows: Row[]; finals: number }> {
  const start = shiftDateKey(today, -(MLB_WINDOW_DAYS - 1));
  const end = shiftDateKey(today, 3);
  const fields = "dates,date,games,gamePk,gameType,gameDate,officialDate,status,abstractGameState,detailedState," +
    "teams,away,home,team,id,name,teamName,score,isWinner,gameNumber";
  const json = await getJson(`${STATSAPI}/schedule?sportId=1&startDate=${start}&endDate=${end}` +
    `&gameType=R,F,D,L,W&hydrate=team&fields=${fields}`);
  const games: any[] = (json?.dates ?? []).flatMap((d: any) => d?.games ?? []);

  const finals = games
    .filter((g) => g?.status?.abstractGameState === "Final" && typeof g?.teams?.home?.isWinner === "boolean")
    .sort((a, b) => `${b.gameDate}|${b.gameNumber ?? 1}`.localeCompare(`${a.gameDate}|${a.gameNumber ?? 1}`));
  const byTeam = new Map<string, Result[]>();
  for (const g of finals) {
    for (const side of ["home", "away"] as const) {
      const me = g.teams[side], them = g.teams[side === "home" ? "away" : "home"];
      const name = me?.team?.name;
      if (!name) continue;
      if (!byTeam.has(name)) byTeam.set(name, []);
      byTeam.get(name)!.push({ won: me.isWinner === true, mine: Number(me.score ?? 0), theirs: Number(them?.score ?? 0) });
    }
  }

  // Next game: the club's earliest game still to finish, today's by its
  // clock, a later day's with the day ("vs Brewers · 7:10 PM ET",
  // "at Cubs · Fri 2:20 PM ET").
  const upcoming = games
    .filter((g) => g?.status?.abstractGameState !== "Final" && !/postponed|cancel/i.test(g?.status?.detailedState ?? ""))
    .sort((a, b) => String(a.gameDate).localeCompare(String(b.gameDate)));
  const next = new Map<string, string>();
  for (const g of upcoming) {
    const home = g?.teams?.home?.team, away = g?.teams?.away?.team;
    if (!home?.name || !away?.name || !g.gameDate) continue;
    const day = (g.officialDate ?? etDateOf(g.gameDate)) === today ? "" : `${weekdayET(g.gameDate)} `;
    const when = `${day}${clockET(g.gameDate)} ET`;
    if (!next.has(home.name)) next.set(home.name, `vs ${away.teamName ?? away.name} · ${when}`);
    if (!next.has(away.name)) next.set(away.name, `at ${home.teamName ?? home.name} · ${when}`);
  }

  const rows: Row[] = [];
  for (const [team, results] of byTeam) {
    const row = runRow("MLB", team, results, next.get(team) ?? null);
    if (row) rows.push(row);
  }
  return { rows, finals: finals.length };
}

// ── NFL ────────────────────────────────────────────────────────────────────

const NFL_NAMES: Record<string, string> = {
  ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens", BUF: "Buffalo Bills",
  CAR: "Carolina Panthers", CHI: "Chicago Bears", CIN: "Cincinnati Bengals", CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys", DEN: "Denver Broncos", DET: "Detroit Lions", GB: "Green Bay Packers",
  HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars", KC: "Kansas City Chiefs",
  LA: "Los Angeles Rams", LAC: "Los Angeles Chargers", LV: "Las Vegas Raiders", MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings", NE: "New England Patriots", NO: "New Orleans Saints", NYG: "New York Giants",
  NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers", SEA: "Seattle Seahawks",
  SF: "San Francisco 49ers", TB: "Tampa Bay Buccaneers", TEN: "Tennessee Titans", WAS: "Washington Commanders",
};
const nflNickname = (abbr: string) => (NFL_NAMES[abbr] ?? abbr).split(" ").slice(-1)[0];

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return [];
  const split = (line: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === "," && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => { const v = split(l); const o: Record<string, string> = {}; head.forEach((h, i) => { o[h] = v[i] ?? ""; }); return o; });
}

async function nflverseGames(): Promise<Record<string, string>[]> {
  const res = await fetch(NFLVERSE_GAMES, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok || !res.body) throw new Error(`nflverse ${res.status}`);
  const text = await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text();
  return parseCsv(text);
}

/** `start` is nflverse's ET wall clock, "2026-09-27T13:00", so it sorts and reads as written. */
type NflGame = { key: string; start: string; home: string; away: string; hs: number | null; as: number | null };

/** "Sun 4:25 PM ET" from an ET wall clock. */
function nflWhen(start: string): string {
  const [day, time] = start.split("T");
  const weekday = ET_DAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
  const [h, m] = time.split(":").map(Number);
  return `${weekday} ${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} ET`;
}

async function nflRuns(today: string): Promise<{ rows: Row[]; finals: number }> {
  // The NFL season a date belongs to: September through February.
  const [y, m] = today.split("-").map(Number);
  const season = m <= 2 ? y - 1 : y;
  const csv = (await nflverseGames()).filter((g) => g.game_type === "REG" && [season - 1, season].includes(Number(g.season)));
  if (!csv.length) throw new Error("nflverse schedule came back empty");

  const byEspn = new Map<string, NflGame>();
  const games: NflGame[] = csv.map((g) => {
    const time = /^\d{2}:\d{2}$/.test(g.gametime) ? g.gametime : "13:00";
    const game: NflGame = {
      key: g.game_id, start: `${g.gameday}T${time}`, home: g.home_team, away: g.away_team,
      hs: g.home_score === "" ? null : Number(g.home_score), as: g.away_score === "" ? null : Number(g.away_score),
    };
    if (g.espn) byEspn.set(g.espn, game);
    return game;
  });

  // This week's scoreboard: a game ESPN calls complete counts now, even
  // before nflverse has its score. A failed read only loses that head start.
  try {
    const board = await getJson(ESPN_NFL, 15_000);
    for (const e of board?.events ?? []) {
      if (e?.season?.type !== 2 || e?.status?.type?.completed !== true) continue;
      const game = byEspn.get(String(e.id));
      if (!game || game.hs != null) continue;
      const comps = e?.competitions?.[0]?.competitors ?? [];
      const home = comps.find((c: any) => c.homeAway === "home"), away = comps.find((c: any) => c.homeAway === "away");
      if (home?.score == null || away?.score == null) continue;
      game.hs = Number(home.score); game.as = Number(away.score);
    }
  } catch (e) {
    console.warn(`[team-streaks] ESPN scoreboard skipped: ${String(e)}`);
  }

  const played = games.filter((g) => g.hs != null && g.as != null && Number.isFinite(g.hs) && Number.isFinite(g.as))
    .sort((a, b) => b.start.localeCompare(a.start));
  const byTeam = new Map<string, Result[]>();
  for (const g of played) {
    for (const [team, mine, theirs] of [[g.home, g.hs!, g.as!], [g.away, g.as!, g.hs!]] as const) {
      if (!byTeam.has(team)) byTeam.set(team, []);
      byTeam.get(team)!.push({ won: mine === theirs ? null : mine > theirs, mine, theirs });
    }
  }

  const upcoming = games.filter((g) => g.hs == null && g.start.slice(0, 10) >= today)
    .sort((a, b) => a.start.localeCompare(b.start));
  const next = new Map<string, string>();
  for (const g of upcoming) {
    const when = nflWhen(g.start);
    if (!next.has(g.home)) next.set(g.home, `vs ${nflNickname(g.away)} · ${when}`);
    if (!next.has(g.away)) next.set(g.away, `at ${nflNickname(g.home)} · ${when}`);
  }

  const rows: Row[] = [];
  for (const [abbr, results] of byTeam) {
    const name = NFL_NAMES[abbr] ?? abbr;
    const row = runRow("NFL", name, results, next.get(abbr) ?? null);
    if (row) rows.push(row);
  }
  return { rows, finals: played.length };
}

// ── Write ──────────────────────────────────────────────────────────────────

async function replace(date: string, league: string, rows: Row[]): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/replace_team_runs`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_date: date, p_league: league, p_rows: rows }),
  });
  if (!res.ok) throw new Error(`replace_team_runs ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (!isCacheServiceRequest(req, SERVICE_KEY)) {
    return Response.json({ ok: false, error: "Service authorization required" }, { status: 403 });
  }
  const url = new URL(req.url);
  const today = url.searchParams.get("date") || estDate();
  const leagues = (url.searchParams.get("league") || "MLB,NFL").split(",").map((s) => s.trim().toUpperCase());
  const out: Record<string, unknown> = {};

  for (const league of leagues) {
    try {
      const { rows, finals } = league === "MLB" ? await mlbRuns(today) : league === "NFL" ? await nflRuns(today) : { rows: [], finals: 0 };
      // No finals in the window (the offseason) is not a reason to erase the
      // last runs the league ended on.
      if (!finals) { out[league] = { skipped: "no finals in the window" }; continue; }
      await replace(today, league, rows);
      out[league] = { finals, runs: rows.length, win: rows.filter((r) => r.kind === "win").length, loss: rows.filter((r) => r.kind === "loss").length };
    } catch (e) {
      out[league] = { error: String(e) };
    }
  }
  const failed = Object.values(out).some((v: any) => v?.error);
  return Response.json({ ok: !failed, date: today, ...out }, { status: failed ? 500 : 200 });
});
