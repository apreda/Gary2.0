import labels from "./native-team-labels.json";
import { normalizeLeague } from "@/lib/gary/leagues";
import type { GameResultRow, NflResultRow } from "@/lib/gary/types";
// Same keyword tables and verified college labels as PicksTab / NCAAFTeams.
const colleges: Record<string, string[]> = labels.college;
const leagues: Record<string, Record<string, string[]>> = labels.leagues;
const collegeKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9&() ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
export function nativeTeamLabel(name: string, league: string) {
  if (league === "NCAAF") {
    const entry = colleges[collegeKey(name)];
    return entry?.[1] || entry?.[0].toUpperCase() || name.toUpperCase();
  }
  const map = leagues[league] || {},
    lower = name.toLowerCase();
  if (map[name.toUpperCase()]) return name.toUpperCase();
  return (
    Object.entries(map).find(([, keys]) =>
      keys.some((k) => lower.includes(k)),
    )?.[0] ||
    name.split(/\s+/).at(-1)?.slice(0, 3).toUpperCase() ||
    name
  );
}
/** Card feeds come from the reviewed game_results reader or authoritative NFL reader.
 * game_results text is away-home. Legacy NFL text has no consistent order:
 * label only its named numeric columns, exactly as native GameResult.teamScores.
 */
export function nativeFinalScore(row: GameResultRow): string {
  const league = normalizeLeague(row.league) || "";
  const numeric = row as Partial<NflResultRow>;
  let away = numeric.away_score,
    home = numeric.home_score;
  if (away == null && home == null && league && league !== "NFL") {
    const score = row.final_score?.match(/^\s*(\d+)\s*[-–]\s*(\d+)\s*$/);
    if (score) {
      away = Number(score[1]);
      home = Number(score[2]);
    }
  }
  if (away == null || home == null || away < 0 || home < 0)
    return row.final_score || "";
  const teams = row.matchup?.split(/\s+(?:@|at|vs\.?|versus)\s+/i) || [];
  const a = numeric.away_team || teams[0],
    h = numeric.home_team || teams[1];
  if (!a || !h) return row.final_score || "";
  return `${nativeTeamLabel(a, league)} ${away} · ${nativeTeamLabel(h, league)} ${home}`;
}
