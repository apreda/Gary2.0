// gary2.0/supabase/functions/social-auto-post/winnersRecap.ts
// Pure composition for the DAILY WINNERS RECAP — yesterday's Winners board,
// ONE POST: every ticket with the money Gary had on it, the day's record and
// net, and the bankroll. No Deno, no network, no model: the same
// node-testable shape as recap.ts / weektape.ts.
//
// Founder, Sep 24 2026: "each day i want to post a recap tweet of the Winners
// page - the picks Gary had the money he had on them the record etc that
// should replace our current recap daily tweets". Winners is one $10,000
// bankroll across games and props, so it is one post, never one per sport.
// Dollars only, never units. The ✅/❌ markers stay: in a results table they
// are scannable structure, the recap's one exception to the no-emoji rule.

import { ordinalDate } from "./recap.ts";

export type WinnersTicket = {
  kind: string | null;
  pick_text: string | null;
  odds: number | null;
  player?: string | null;
  prop?: string | null;
  line?: string | null;
  bet?: string | null;
  stake_dollars: number | string | null;
  result: string | null;
  net_dollars: number | string | null;
};

export type WinnersRecapData = {
  tickets: WinnersTicket[];
  bankroll_dollars: number | string | null;
  initial_dollars: number | string | null;
  started_date: string | null;
};

export type WinnersRecapPost = {
  text: string; won: number; lost: number; pushes: number; pending: number; net: number;
};

const SETTLED = new Set(["won", "lost", "push", "void"]);

/** 1234.5 -> "$1,235" */
function money(n: number): string {
  return "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
}

/** +$346 / -$450 / $0 */
function signedMoney(n: number): string {
  if (Math.round(Math.abs(n)) === 0) return "$0";
  return (n > 0 ? "+" : "-") + money(n);
}

function priceText(odds: number | null): string {
  if (odds == null || !Number.isFinite(Number(odds))) return "";
  const o = Number(odds);
  return o > 0 ? `+${o}` : `${o}`;
}

/** "pitcher_strikeouts 5.5" -> "strikeouts"; the app's LabFormat.marketWords. */
export function marketWords(raw: string | null | undefined): string {
  let s = String(raw ?? "").toLowerCase().trim();
  s = s.replace(/\s*[0-9]+(\.[0-9]+)?$/, "").replace(/^player_/, "");
  s = s.replace(/pitcher_/g, "").replace(/batter_/g, "").replace(/_/g, " ").trim();
  if (s === "hits runs rbis") return "hits + runs + RBI";
  if (s === "rbi" || s === "rbis") return "RBI";
  return s;
}

/** The ticket as a reader says it: "Sonny Gray over 17.5 outs -130". */
export function ticketText(t: WinnersTicket): string {
  if (t.kind !== "prop") return String(t.pick_text ?? "").trim();
  const market = marketWords(t.prop);
  const price = priceText(t.odds);
  if (/anytime.?t/.test(market)) return [t.player, "anytime TD", price].filter(Boolean).join(" ");
  const line = String(t.line ?? "").trim() || (String(t.prop ?? "").match(/[0-9]+(\.[0-9]+)?$/)?.[0] ?? "");
  const parts = [t.player, String(t.bet ?? "").toLowerCase(), line, market, price].filter((p) => p && String(p).trim());
  return parts.length > 1 ? parts.join(" ") : String(t.pick_text ?? "").trim();
}

function mark(t: WinnersTicket, net: number): string {
  switch (String(t.result ?? "").toLowerCase()) {
    case "won": return `✅ ${signedMoney(net)}`;
    case "lost": return `❌ ${signedMoney(net)}`;
    case "push": return "(push)";
    case "void": return "(void)";
    default: return "(pending)";
  }
}

/** "2026-09-16" -> "Sep 16" */
function shortDate(ymd: string): string {
  return new Date(ymd + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * One post for the day's board, or null when the board had no money on it.
 * Pending tickets show as "(pending)" and stay out of the record and the net;
 * the caller decides whether a board with pending tickets posts yet.
 */
export function composeWinnersRecap(data: WinnersRecapData, slateDay: string): WinnersRecapPost | null {
  const tickets = (data?.tickets ?? []).filter((t) => Number(t?.stake_dollars) > 0);
  if (!tickets.length) return null;

  let won = 0, lost = 0, pushes = 0, pending = 0, net = 0;
  const lines = tickets.map((t) => {
    const result = String(t.result ?? "").toLowerCase();
    const n = Number(t.net_dollars) || 0;
    if (result === "won") won++;
    else if (result === "lost") lost++;
    else if (result === "push") pushes++;
    else if (!SETTLED.has(result)) pending++;
    if (SETTLED.has(result)) net += n;
    return `${money(Number(t.stake_dollars))} ${ticketText(t)} ${mark(t, n)}`;
  });

  const record = `${won}-${lost}${pushes ? `-${pushes}` : ""}`;
  const out = [
    `Gary's Winners, ${ordinalDate(slateDay)}`,
    "",
    `${record}, ${signedMoney(net)}`,
    "",
    ...lines,
  ];
  const bankroll = Number(data?.bankroll_dollars);
  if (Number.isFinite(bankroll) && bankroll > 0) {
    const start = Number(data?.initial_dollars);
    const since = Number.isFinite(start) && start > 0 && data?.started_date
      ? ` (started at ${money(start)} on ${shortDate(data.started_date)})` : "";
    out.push("", `Bankroll: ${money(bankroll)}${since}`);
  }
  out.push("", "Today's board is in the app.");

  return { text: out.join("\n"), won, lost, pushes, pending, net };
}
