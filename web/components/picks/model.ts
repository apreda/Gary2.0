import type { GaryPick, PropPick } from "@/lib/gary/types";
import { normalizeLeague } from "@/lib/gary/leagues";
import {
  etTime,
  oddsText,
  propLabel,
  propLine,
  parseScoutSections,
} from "@/lib/gary/format";
import { effectiveOdds } from "@/lib/gary/odds";
import { isLongShot } from "@/lib/gary/prop-lanes";
export type CardPick = {
  id: string;
  sport: string;
  team: string;
  market: string;
  opponent: string;
  odds: string;
  time: string;
  summary: string;
  case: string[];
  risks: string[];
  kind: "game" | "prop";
  away?: boolean;
  result?: "won" | "lost" | "push";
  resultLine?: string;
  payout?: string;
  href?: string;
  shareHref?: string;
  eyebrow?: string;
  meta?: string;
  fullAnalysis?: string;
};
const paragraphs = (s?: string) =>
  parseScoutSections(s).map((p) =>
    p.label ? `${p.label}: ${p.body}` : p.body,
  );
const nicknames = [
  "Red Sox",
  "White Sox",
  "Blue Jays",
  "Trail Blazers",
  "Golden Knights",
  "Red Wings",
  "Blue Jackets",
  "Diamondbacks",
  "Braves",
  "Orioles",
  "Cubs",
  "Reds",
  "Guardians",
  "Rockies",
  "Tigers",
  "Astros",
  "Royals",
  "Angels",
  "Dodgers",
  "Marlins",
  "Brewers",
  "Twins",
  "Mets",
  "Yankees",
  "Athletics",
  "Phillies",
  "Pirates",
  "Padres",
  "Giants",
  "Mariners",
  "Cardinals",
  "Rays",
  "Rangers",
  "Nationals",
  "Bills",
  "Dolphins",
  "Patriots",
  "Jets",
  "Ravens",
  "Bengals",
  "Browns",
  "Steelers",
  "Texans",
  "Colts",
  "Jaguars",
  "Titans",
  "Broncos",
  "Chiefs",
  "Raiders",
  "Chargers",
  "Cowboys",
  "Eagles",
  "Commanders",
  "Bears",
  "Lions",
  "Packers",
  "Vikings",
  "Falcons",
  "Panthers",
  "Saints",
  "Buccaneers",
  "Rams",
  "49ers",
  "Seahawks",
  "Celtics",
  "Nets",
  "Knicks",
  "76ers",
  "Raptors",
  "Bulls",
  "Cavaliers",
  "Pistons",
  "Pacers",
  "Bucks",
  "Hawks",
  "Hornets",
  "Heat",
  "Magic",
  "Wizards",
  "Nuggets",
  "Timberwolves",
  "Thunder",
  "Jazz",
  "Warriors",
  "Clippers",
  "Lakers",
  "Suns",
  "Kings",
  "Mavericks",
  "Rockets",
  "Grizzlies",
  "Pelicans",
  "Spurs",
];
export function cardTeamName(name: string, league = "") {
  const n = name.trim();
  if (league.startsWith("NCAA")) return n;
  return (
    nicknames.find(
      (t) =>
        n.toLowerCase() === t.toLowerCase() ||
        n.toLowerCase().endsWith(" " + t.toLowerCase()),
    ) || n
  );
}
function containsTeam(label: string, club: string) {
  const a = label.toLowerCase().replace(/[^a-z0-9]/g, ""),
    b = club.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    a.length > 2 && b.length > 2 && (a === b || a.includes(b) || b.includes(a))
  );
}
function kickoff(time?: string, fallback?: string) {
  const t = etTime(time);
  return t ? `${t} ET` : fallback || "START TIME TBD";
}
export function gameCardPick(p: GaryPick, href?: string | null): CardPick {
  const label = (p.pick || "")
    .replace(/\s*[([]?[+−-]\d{3,}[)\]]?\s*$/, "")
    .trim();
  const total = label.match(/\b(over|under)\s*(\d+(?:\.\d+)?)/i);
  const ml = label.match(/\s+(?:ML|money\s*line)\b/i);
  const spread = label.match(
    /\s([+−-]\d+(?:\.\d+)?)(?:\s+(?:runs?|points?))?$/i,
  );
  const split = ml?.index ?? spread?.index;
  let team = split != null ? label.slice(0, split).trim() : label;
  let market = ml ? "Moneyline" : spread ? spread[1] : "";
  const league = normalizeLeague(p.league, p.sport) || "";
  const home = p.homeTeam || "",
    away = p.awayTeam || "";
  const awayMatch = containsTeam(team, away),
    homeMatch = containsTeam(team, home);
  const isAway = awayMatch && !homeMatch,
    isHome = homeMatch && !awayMatch;
  if (total) {
    team = `${total[1]} ${total[2]}`;
    market =
      league === "MLB"
        ? "Total Runs"
        : ["NHL", "WC", "EPL"].includes(league)
          ? "Total Goals"
          : "Total Points";
  } else if (isAway || isHome) {
    team = cardTeamName(isAway ? away : home, league);
  }
  const take = paragraphs(p.rationale || p.rationale_plain);
  return {
    id:
      p.pick_id ||
      [
        league,
        p.game_id || p.bdl_game_id || "",
        p.commence_time || "",
        p.pick || "",
      ].join("-"),
    sport: league,
    team,
    market,
    opponent: total
      ? [away, home]
          .filter(Boolean)
          .map((n) => cardTeamName(n, league))
          .join(" @ ")
      : cardTeamName(isAway ? home : isHome ? away : "", league),
    meta:
      total || (!isAway && !isHome)
        ? [away, home]
            .filter(Boolean)
            .map((n) => cardTeamName(n, league))
            .join(" @ ")
        : undefined,
    away: isAway,
    odds: oddsText(p.odds ?? effectiveOdds(p.pick)) || "",
    time: kickoff(p.commence_time, p.time),
    summary: take[0] || "Gary’s reasoning is not available for this pick.",
    case: take.slice(1),
    risks: [],
    kind: "game",
    href: href || undefined,
  };
}
const abbreviations: Record<string, string> = {
  pitcher_strikeouts: "K'S",
  strikeouts: "K'S",
  home_runs: "HR",
  home_run: "HR",
  stolen_bases: "SB",
  hits_runs_rbis: "H+R+RBI",
  pra: "PRA",
};
export function propCardPick(p: PropPick, href?: string | null): CardPick {
  const league = normalizeLeague(p.league, p.sport) || "";
  const label =
    abbreviations[(p.prop || "").replace(/\s+[\d.]+$/, "").toLowerCase()] ||
    propLabel(p.prop);
  const line = propLine(p);
  const take = paragraphs(p.rationale || p.analysis);
  return {
    id: [
      league,
      p.game_id || p.bdl_game_id || "",
      p.commence_time || "",
      p.player,
      p.prop,
      p.bet,
      line,
    ].join("-"),
    sport: league === "MLB HR" ? "MLB" : league,
    team: p.player || "",
    market: [label, p.bet, line].filter((v) => v != null && v !== "").join(" "),
    opponent: p.team || "",
    odds: oddsText(p.odds) || "",
    time: kickoff(p.commence_time),
    summary: take[0] || "Gary’s reasoning is not available for this prop.",
    case: take.slice(1),
    risks: [],
    kind: "prop",
    href: href || undefined,
    eyebrow: isLongShot(p) ? "THE LONG SHOT" : undefined,
  };
}
