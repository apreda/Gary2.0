import {
  fetchGameResultsForDate,
  fetchPropResultsForDate,
} from "@/lib/gary/results";
import { fetchDailySlate } from "@/lib/gary/board";
import { rest } from "@/lib/gary/supabase";
import { isArchiveDate } from "@/lib/gary/archive";
import type { LiveScoreRow } from "@/lib/gary/types";
/** Public score/grade data only. Uses the same anonymous reader as the public record. */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") || "";
  if (!isArchiveDate(date))
    return Response.json({ error: "Invalid date" }, { status: 400 });
  try {
    const [games, props, slate, live] = await Promise.all([
      fetchGameResultsForDate(date, 60),
      fetchPropResultsForDate(date, 60),
      fetchDailySlate(date, 60),
      rest<LiveScoreRow[]>(
        `live_scores?select=date,league,game_id,away_abbr,home_abbr,away_score,home_score,status,detail&date=eq.${date}`,
        { revalidate: 30 },
      ),
    ]);
    return Response.json(
      { date, games, props, slate, live },
      { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } },
    );
  } catch {
    return Response.json(
      { error: "Results are temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
