/** Exact publication identity shared by grading and its read-only verification. */
export const WINNERS_CUTOVER_DATE = "2026-09-04";
const norm = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
type Row = Record<string, any>;

function ticketKey(date: string, league: unknown, gameId: unknown, text: unknown, odds: unknown): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !norm(league) || !norm(gameId) || !norm(text)
    || odds == null || String(odds).trim() === "" || !Number.isFinite(Number(odds)) || Math.abs(Number(odds)) < 100) return null;
  return JSON.stringify([date, norm(league), norm(gameId), norm(text), Number(odds)]);
}

/** Missing publications produce false; callers must propagate read failures. */
export function winnersFlags(date: string, picks: Row[], board: Row[]): boolean[] {
  if (date < WINNERS_CUTOVER_DATE) {
    // Preserve the cloud grader's historical top-three definition before cutover.
    const legacyKey = (p: Row) => `${String(p.league ?? "").toUpperCase()}|${p.pick}|${p.awayTeam} @ ${p.homeTeam}`;
    const winners = new Set<string>();
    const byLeague: Record<string, Row[]> = {};
    for (const pick of picks) (byLeague[String(pick.league ?? "UNKNOWN").toUpperCase()] ||= []).push(pick);
    for (const leaguePicks of Object.values(byLeague)) {
      const ranked = leaguePicks.slice().sort((a, b) => Number(!!b.is_top_pick) - Number(!!a.is_top_pick) || (b.confidence ?? 0) - (a.confidence ?? 0));
      for (const pick of ranked.slice(0, 3)) winners.add(legacyKey(pick));
    }
    return picks.map(pick => winners.has(legacyKey(pick)));
  }
  const keys = new Set(board.filter(row => row.kind === "game").map(row => ticketKey(
    row.game_date, row.league, row.game_id, row.pick_snapshot?.pick, row.pick_snapshot?.odds,
  )).filter((key): key is string => key !== null));
  return picks.map(pick => {
    const key = ticketKey(date, pick.league, pick.game_id ?? pick.bdl_game_id, pick.pick, pick.odds);
    return key !== null && keys.has(key);
  });
}

/** A changed publication flag must self-correct even when the score is unchanged. */
export function resultAlreadyCurrent(existing: Row, incoming: Row): boolean {
  return String(existing.game_id ?? "") === incoming.game_id
    && String(existing.league ?? "") === incoming.league
    && existing.result === incoming.result && existing.final_score === incoming.final_score
    && existing.is_winners_pick === incoming.is_winners_pick;
}
