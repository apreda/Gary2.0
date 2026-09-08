import { normalizeLeague } from "@/lib/gary/leagues";
import { propLine, parseGameTime } from "@/lib/gary/format";
import { estDateStr } from "@/lib/gary/dates";
import type {
  GaryPick,
  PropPick,
  GameResultRow,
  PropResultRow,
  LiveScoreRow,
} from "@/lib/gary/types";
import type { CardPick } from "./model";
export type CardResults = {
  date: string;
  games: GameResultRow[];
  props: PropResultRow[];
  live: Pick<
    LiveScoreRow,
    | "date"
    | "league"
    | "game_id"
    | "away_abbr"
    | "home_abbr"
    | "away_score"
    | "home_score"
    | "status"
    | "detail"
  >[];
  slate: {
    league: string | null;
    away_team: string | null;
    home_team: string | null;
    commence_time: string | null;
    bdl_game_id?: string | number | null;
    game_status?: string | null;
    status_detail?: string | null;
  }[];
};
const key = (s?: string | null) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const same = (a?: string | null, b?: string | null) =>
  !!key(a) &&
  !!key(b) &&
  (key(a) === key(b) || key(a).includes(key(b)) || key(b).includes(key(a)));
const matchup = (s?: string | null) =>
  (s || "").split(/\s+(?:@|at|vs\.?|versus)\s+/i);
const pickKey = (s?: string | null) =>
  (s || "")
    .toLowerCase()
    .replace(/\s*\(?[+−-]\d{3,}\)?\s*$/, "")
    .replace(/\bmoney\s*line\b/g, "ml")
    .replace(/\s+/g, " ")
    .trim();
export function cardDate(p: GaryPick | PropPick, date?: string) {
  const start = parseGameTime(p.commence_time);
  return start ? estDateStr(start) : date;
}
export function applyCardResult(
  card: CardPick,
  p: GaryPick | PropPick,
  data: CardResults | null,
  now = Date.now(),
): CardPick {
  if (!data) return card;
  const start = parseGameTime(p.commence_time);
  if (start && (start.getTime() > now || estDateStr(start) !== data.date))
    return card;
  const prop = card.kind === "prop";
  const game = p as GaryPick,
    pr = p as PropPick;
  const teams = prop ? matchup(pr.matchup) : [game.awayTeam, game.homeTeam];
  if (teams.length !== 2 || !teams[0] || !teams[1]) return card;
  const league = normalizeLeague(p.league, p.sport)?.replace(" HR", "");
  const id = String(p.bdl_game_id || p.game_id || "");
  const slateMatches = data.slate.filter(
    (s) =>
      normalizeLeague(s.league) === league &&
      same(teams[0], s.away_team) &&
      same(teams[1], s.home_team),
  );
  const exactSlate = id
    ? slateMatches.filter((s) => String(s.bdl_game_id ?? "") === id)
    : [];
  const authoritative =
    exactSlate.length === 1
      ? exactSlate[0]
      : !id && slateMatches.length === 1
        ? slateMatches[0]
        : undefined;
  const interruption = authoritative?.game_status?.toLowerCase();
  if (
    ["postponed", "suspended", "cancelled", "canceled", "delayed"].includes(
      interruption || "",
    )
  )
    return {
      ...card,
      resultLine:
        authoritative?.status_detail?.trim() || interruption?.toUpperCase(),
    };
  const scores = data.live.filter(
    (s) => normalizeLeague(s.league) === league && id && s.game_id === id,
  );
  const live = scores.length === 1 ? scores[0] : undefined;
  const scoreLine =
    live &&
    ["live", "final"].includes(live.status || "") &&
    live.away_score != null &&
    live.home_score != null
      ? `${live.away_abbr} ${live.away_score} · ${live.home_abbr} ${live.home_score}`
      : "";
  if (live && live.status !== "final") {
    return {
      ...card,
      resultLine: [live.detail || live.status?.toUpperCase(), scoreLine]
        .filter(Boolean)
        .join(" · "),
    };
  }
  const repeats = data.slate.filter(
    (s) =>
      normalizeLeague(s.league) === league &&
      same(teams[0], s.away_team) &&
      same(teams[1], s.home_team),
  );
  if (repeats.length > 1)
    return {
      ...card,
      resultLine:
        live?.status === "final"
          ? ["FINAL · GRADING", scoreLine].filter(Boolean).join(" · ")
          : undefined,
    };
  const belongs = (r: {
    league?: string | null;
    sport?: string | null;
    game_date: string | null;
    matchup: string | null;
  }) => {
    const t = matchup(r.matchup),
      l = normalizeLeague(r.league, r.sport)?.replace(" HR", "");
    return (
      r.game_date === data.date &&
      (!l || l === league) &&
      t.length === 2 &&
      same(teams[0], t[0]) &&
      same(teams[1], t[1])
    );
  };
  let matches: (GameResultRow | PropResultRow)[] = [];
  if (prop) {
    if (!key(pr.player) || !key(pr.prop) || !key(pr.bet)) return card;
    const type = (s?: string | null) =>
      (s || "")
        .trim()
        .toLowerCase()
        .replace(/\s+[\d.]+$/, "")
        .replace(/[^a-z0-9]+/g, "_");
    const line = propLine(pr);
    matches = data.props.filter(
      (r) =>
        belongs(r) &&
        key(r.player_name) === key(pr.player) &&
        type(r.prop_type) === type(pr.prop) &&
        key(r.bet) === key(pr.bet) &&
        line != null &&
        r.line_value != null &&
        Number(line) === Number(r.line_value),
    );
  } else if (pickKey(game.pick))
    matches = data.games.filter(
      (r) => belongs(r) && pickKey(r.pick_text) === pickKey(game.pick),
    );
  if (matches.length !== 1)
    return {
      ...card,
      resultLine:
        live?.status === "final"
          ? ["FINAL · GRADING", scoreLine].filter(Boolean).join(" · ")
          : undefined,
    };
  const row = matches[0];
  const result = row.result?.trim().toLowerCase();
  if (!["won", "lost", "push"].includes(result || "")) return card;
  const detail = prop
    ? (row as PropResultRow).actual_value != null
      ? `ACTUAL ${(row as PropResultRow).actual_value}`
      : ""
    : scoreLine || (row as GameResultRow).final_score || "";
  const odds = Number(card.odds.replace("−", "-"));
  const profit =
    Number.isFinite(odds) && Math.abs(odds) >= 100
      ? odds > 0
        ? odds
        : 10000 / Math.abs(odds)
      : null;
  return {
    ...card,
    result: result as CardPick["result"],
    resultLine: [
      result === "won" ? "CASHED" : result === "lost" ? "LOST" : "PUSH",
      detail,
    ]
      .filter(Boolean)
      .join(" · "),
    payout:
      result === "won" && profit != null
        ? `+$${Math.round(profit)}`
        : undefined,
  };
}
