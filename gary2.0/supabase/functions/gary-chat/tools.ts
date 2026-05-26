// Tool definitions for "Talk to Gary" + the execution router.
// Tools are intentionally simple lookups — Gary speaks the framing, tools just return data.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ─────────────────────────────────────────────────────────────────────────────
// TOOL SCHEMAS (Gemini function declarations)
// ─────────────────────────────────────────────────────────────────────────────

export const GARY_CHAT_TOOLS = [
  {
    name: "check_my_picks_today",
    description: "List Gary's picks for today with team, pick text, and a one-line rationale summary. Use when the user asks about today's slate or 'what are your picks today'.",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
  {
    name: "check_my_pick_context",
    description: "Get the full investigation context behind one of Gary's picks today: rationale, bilateral case (case for each side), research briefing, scout report excerpts. Use when the user asks deeper questions about why Gary picked a specific game.",
    parameters: {
      type: "OBJECT",
      properties: {
        team: {
          type: "STRING",
          description: "Team name (any team in the matchup) Gary picked. e.g., 'Yankees', 'Lakers', 'Reds'.",
        },
      },
      required: ["team"],
    },
  },
  {
    name: "check_today_games",
    description: "List today's games on the slate (regardless of whether Gary picked them). Use when the user asks 'what's on tonight' or about a specific matchup Gary may not have picked.",
    parameters: {
      type: "OBJECT",
      properties: {
        league: {
          type: "STRING",
          description: "Optional league filter: MLB, NBA, NHL, NFL, NCAAB, NCAAF.",
        },
      },
    },
  },
  {
    name: "check_my_record_recent",
    description: "Get Gary's pick record over the last 7 days (wins, losses, pushes). Use when the user asks 'how have you been doing' or about Gary's recent run.",
    parameters: {
      type: "OBJECT",
      properties: {
        league: {
          type: "STRING",
          description: "Optional league filter.",
        },
      },
    },
  },
  {
    name: "check_recent_stats",
    description: "Quick stat lookup for a team — last 10 games, recent form, key splits. Use when the user asks about a team's recent performance.",
    parameters: {
      type: "OBJECT",
      properties: {
        team: {
          type: "STRING",
          description: "Team name. e.g., 'Yankees', 'Lakers'.",
        },
        league: {
          type: "STRING",
          description: "League: MLB, NBA, NHL, NFL.",
        },
      },
      required: ["team", "league"],
    },
  },
  {
    name: "check_injuries",
    description: "Current injury report for a team. Use when the user asks about who's playing or who's out.",
    parameters: {
      type: "OBJECT",
      properties: {
        team: {
          type: "STRING",
          description: "Team name.",
        },
        league: {
          type: "STRING",
          description: "League: MLB, NBA, NHL, NFL.",
        },
      },
      required: ["team", "league"],
    },
  },
  {
    name: "check_odds",
    description: "Current betting odds for a game — spread, total, moneyline. Use when the user asks about the line on a specific game.",
    parameters: {
      type: "OBJECT",
      properties: {
        team: {
          type: "STRING",
          description: "A team in the game.",
        },
        league: {
          type: "STRING",
          description: "League: MLB, NBA, NHL, NFL.",
        },
      },
      required: ["team", "league"],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TOOL EXECUTION
// ─────────────────────────────────────────────────────────────────────────────

type ToolResult = { ok: true; data: any } | { ok: false; error: string };

function todayEstISODate(): string {
  // YYYY-MM-DD in America/New_York
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(now);
}

function nDaysAgoEstISO(n: number): string {
  const now = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(now);
}

function normalizeTeamMatch(needle: string, haystack: string): boolean {
  const n = (needle || "").toLowerCase().trim();
  const h = (haystack || "").toLowerCase().trim();
  if (!n || !h) return false;
  if (h.includes(n) || n.includes(h)) return true;
  const lastNeedle = n.split(/\s+/).pop() || "";
  if (lastNeedle.length >= 3 && h.includes(lastNeedle)) return true;
  return false;
}

export async function executeTool(
  name: string,
  args: any,
  ctx: { supabase: SupabaseClient; bdlKey?: string }
): Promise<ToolResult> {
  try {
    switch (name) {
      case "check_my_picks_today":
        return await execCheckMyPicksToday(ctx.supabase);
      case "check_my_pick_context":
        return await execCheckMyPickContext(ctx.supabase, args?.team);
      case "check_today_games":
        return await execCheckTodayGames(ctx.supabase, args?.league);
      case "check_my_record_recent":
        return await execCheckMyRecordRecent(ctx.supabase, args?.league);
      case "check_recent_stats":
        return await execCheckRecentStats(ctx.bdlKey, args?.team, args?.league);
      case "check_injuries":
        return await execCheckInjuries(ctx.bdlKey, args?.team, args?.league);
      case "check_odds":
        return await execCheckOdds(ctx.bdlKey, args?.team, args?.league);
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Picks from daily_picks JSONB column. Filter to today.
async function execCheckMyPicksToday(supabase: SupabaseClient): Promise<ToolResult> {
  const date = todayEstISODate();
  const { data, error } = await supabase
    .from("daily_picks")
    .select("date, picks")
    .eq("date", date)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  const picks = (data?.picks as any[]) || [];
  const summarized = picks.map((p: any) => ({
    pick_id: p.pick_id,
    league: p.league,
    matchup: `${p.awayTeam || ""} @ ${p.homeTeam || ""}`,
    pick: p.pick,
    odds: p.odds,
    confidence: p.confidence,
    rationale_short: typeof p.rationale === "string" ? p.rationale.slice(0, 280) : null,
  }));
  return { ok: true, data: { date, count: summarized.length, picks: summarized } };
}

// Full investigation context for a pick — looked up by team name in today's picks.
async function execCheckMyPickContext(supabase: SupabaseClient, teamArg: string): Promise<ToolResult> {
  if (!teamArg) return { ok: false, error: "team argument required" };
  const date = todayEstISODate();
  // Find pick_id by team from today's picks
  const { data: dayRow } = await supabase
    .from("daily_picks")
    .select("picks")
    .eq("date", date)
    .maybeSingle();
  const picks = (dayRow?.picks as any[]) || [];
  const match = picks.find(
    (p: any) =>
      normalizeTeamMatch(teamArg, p.homeTeam || "") ||
      normalizeTeamMatch(teamArg, p.awayTeam || "") ||
      normalizeTeamMatch(teamArg, p.pick || "")
  );
  if (!match) {
    return { ok: true, data: { found: false, note: `No pick today involving "${teamArg}". Gary may have passed on that game.` } };
  }
  // Load pick_context
  const { data: ctxRow, error: ctxErr } = await supabase
    .from("pick_context")
    .select("*")
    .eq("pick_id", match.pick_id)
    .maybeSingle();
  if (ctxErr) return { ok: false, error: ctxErr.message };
  if (!ctxRow) {
    return {
      ok: true,
      data: {
        found: true,
        matchup: `${match.awayTeam} @ ${match.homeTeam}`,
        pick: match.pick,
        rationale: match.rationale,
        note: "Detailed investigation context not stored for this pick yet (context-storage rolled out recently).",
      },
    };
  }
  return {
    ok: true,
    data: {
      found: true,
      pick_id: ctxRow.pick_id,
      matchup: `${ctxRow.away_team} @ ${ctxRow.home_team}`,
      pick: ctxRow.pick_text,
      rationale: ctxRow.rationale,
      bilateral_case: ctxRow.bilateral_case ? String(ctxRow.bilateral_case).slice(0, 4000) : null,
      research_briefing: ctxRow.research_briefing ? String(ctxRow.research_briefing).slice(0, 4000) : null,
      scout_report_excerpt: ctxRow.scout_report ? String(ctxRow.scout_report).slice(0, 3000) : null,
      tournament_context: ctxRow.tournament_context,
      spread: ctxRow.spread,
      moneyline_home: ctxRow.moneyline_home,
      moneyline_away: ctxRow.moneyline_away,
      total: ctxRow.total,
    },
  };
}

// Today's games — for V1 we surface from daily_picks (games Gary considered).
// In v2 we could call BDL for the full slate.
async function execCheckTodayGames(supabase: SupabaseClient, leagueFilter?: string): Promise<ToolResult> {
  const date = todayEstISODate();
  const { data, error } = await supabase
    .from("daily_picks")
    .select("date, picks")
    .eq("date", date)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  let picks = (data?.picks as any[]) || [];
  if (leagueFilter) {
    const lf = leagueFilter.toUpperCase();
    picks = picks.filter((p: any) => (p.league || "").toUpperCase() === lf);
  }
  const games = picks.map((p: any) => ({
    league: p.league,
    matchup: `${p.awayTeam} @ ${p.homeTeam}`,
    time: p.time,
    gary_picked: p.pick,
  }));
  return { ok: true, data: { date, count: games.length, games } };
}

// Record over the last 7 days from game_results table.
async function execCheckMyRecordRecent(supabase: SupabaseClient, leagueFilter?: string): Promise<ToolResult> {
  const since = nDaysAgoEstISO(7);
  let query = supabase
    .from("game_results")
    .select("league, result")
    .gte("date", since);
  if (leagueFilter) query = query.eq("league", leagueFilter.toUpperCase());
  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  let wins = 0, losses = 0, pushes = 0;
  for (const r of (data || []) as any[]) {
    const res = String(r.result || "").toUpperCase();
    if (res.includes("WIN") || res === "W") wins++;
    else if (res.includes("LOSS") || res === "L") losses++;
    else if (res.includes("PUSH") || res === "P") pushes++;
  }
  return {
    ok: true,
    data: {
      window: "last 7 days",
      league: leagueFilter || "all",
      wins,
      losses,
      pushes,
      total: wins + losses + pushes,
    },
  };
}

// BDL stat lookups — V1 uses simple endpoints, returns "no data" if BDL key missing.
async function execCheckRecentStats(bdlKey: string | undefined, team: string, league: string): Promise<ToolResult> {
  if (!bdlKey) {
    return { ok: true, data: { team, league, note: "Live stat lookup unavailable in this session — Gary should speak from general knowledge or his stored pick context." } };
  }
  return { ok: true, data: { team, league, note: "Recent-stats live tool is stubbed in V1. Wire BDL endpoint in a follow-up — Gary should fall back to pick context / general knowledge." } };
}

async function execCheckInjuries(_bdlKey: string | undefined, team: string, league: string): Promise<ToolResult> {
  return { ok: true, data: { team, league, note: "Injury lookup live tool is stubbed in V1. Gary should reference any injuries from his stored pick context or say plainly that he doesn't have real-time injury data for this game." } };
}

async function execCheckOdds(_bdlKey: string | undefined, team: string, league: string): Promise<ToolResult> {
  return { ok: true, data: { team, league, note: "Live odds lookup is stubbed in V1. Gary should reference odds from his stored pick context — the spread/ML/total on the pick row." } };
}
