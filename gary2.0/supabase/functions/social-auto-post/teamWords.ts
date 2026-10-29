// How a post names teams and start times. Shared by the free pick and the stat desk.

// Two-word nicknames; every other pro nickname is the team name's last word.
const TWO_WORD_NAMES = new Set(["white sox", "red sox", "blue jays", "trail blazers", "maple leafs", "golden knights", "blue jackets", "red wings"]);

/** A pro team's nickname ("Chicago White Sox" -> "White Sox"); a college team keeps its full name. */
export function shortTeam(team: string, league: string): string {
  const words = String(team ?? "").trim().split(/\s+/);
  if (/NCAA/i.test(league) || words.length < 2) return words.join(" ");
  const two = words.slice(-2).join(" ");
  return TWO_WORD_NAMES.has(two.toLowerCase()) ? two : words[words.length - 1];
}

/** "5pm EST", "7:05pm EST" (founder's words, Oct 6 2026). */
export function startWords(iso: string): string {
  const s = new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  return `${s.replace(":00", "").replace(/\s*([AP])M$/, (_m, h) => `${h.toLowerCase()}m`)} EST`;
}
