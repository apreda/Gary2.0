// gary2.0/supabase/functions/social-auto-post/marquee.ts
// Audience weighting for the picks drip (Aug 5 2026, founder's call).
//
// Two audiences, deliberately BOTH served — see window.ts for how the slots are reserved:
//   1. Bettors who just want action NOW. They are served by day-part coverage: whatever is starting soon
//      gets tweeted, marquee or not. "A lot of gamblers want to start gambling, as crazy as that sounds."
//   2. The bigger crowd on the games everyone is already watching. Served by this file: when a day-part has
//      more games than slots, the ones with the most eyeballs win the tiebreak.
// When a window has FEW games, this file barely matters — everything available gets posted. It only decides
// which games to drop when we are oversubscribed.
//
// This is an audience heuristic (how many people are watching / betting this game), NOT a quality signal.
// It must never touch which side Gary takes or how confident he is — it only picks which of HIS picks get
// airtime when there is not room for all of them.

// Editorial audience priors. These are not measured TV audiences or handle;
// audience.ts adjusts priority using Gary's own mature X post metrics.
const TIER_1 = [
  "yankees", "dodgers", "red sox", "cubs", "mets", "braves", "phillies", "cardinals", "giants", "astros",
];
const TIER_2 = [
  "padres", "mariners", "rangers", "blue jays", "orioles", "tigers", "brewers", "twins", "guardians",
  "white sox", "angels", "nationals", "diamondbacks", "reds", "pirates", "rockies",
];
// NFL audience priors, independent of betting strength.
const NFL_TIER_1 = [
  "cowboys", "chiefs", "eagles", "49ers", "packers", "bills", "steelers", "patriots", "giants", "jets",
  "bears", "lions", "ravens", "dolphins",
];

function tierOf(team: string, league: string): number {
  const t = String(team ?? "").toLowerCase();
  const hit = (list: string[]) => list.some((name) => t.includes(name));
  if (league === "NFL") return hit(NFL_TIER_1) ? 2 : 1;
  if (league === "NCAAF") {
    // Editorial audience priors, not claimed ratings or betting strength.
    // Full school/mascot names prevent Oregon State and Michigan State from
    // inheriting Oregon/Michigan's identity. Measured X response can adjust these.
    return /^(alabama crimson tide|ohio state buckeyes|michigan wolverines|texas longhorns|georgia bulldogs|notre dame fighting irish|oklahoma sooners|penn state nittany lions|lsu tigers|tennessee volunteers|usc trojans|oregon ducks|florida gators|florida state seminoles|clemson tigers|miami hurricanes)$/.test(t.trim()) ? 2 : 1;
  }
  if (league !== "MLB") return 0;
  if (hit(TIER_1)) return 2;
  if (hit(TIER_2)) return 1;
  return 0;
}

export type MarqueeInput = {
  awayTeam?: string | null;
  homeTeam?: string | null;
  league?: string | null;
  commence_time?: string | null;
  awayRanking?: number | null;
  homeRanking?: number | null;
};

// Higher = greater editorial audience priority, not a prediction of impressions.
// Both sides count, including the team Gary picked against.
export function marqueeScore(p: MarqueeInput): number {
  const league = String(p.league ?? "MLB").toUpperCase();
  const away = tierOf(p.awayTeam ?? "", league);
  const home = tierOf(p.homeTeam ?? "", league);
  let score = away + home;
  if (away === 2 && home === 2) score += 2; // two national clubs = the game of the day, not just additive
  if (league === "NCAAF") {
    const ranked = [p.awayRanking, p.homeRanking].filter(r => Number.isInteger(r) && r! >= 1 && r! <= 25);
    score += ranked.length + ranked.filter(r => r! <= 10).length;
    if (ranked.length === 2) score += 2;
  }
  return score;
}
