// What Gary knows when someone asks him something: his own picks for the slate, written the way he wrote
// them, and how they're going. Two parts, so the prompt cache works across everyone asking on the same day:
//   board(): the picks and his write-ups. Same for every listener; changes only when he adds picks.
//   scoreboard(): the clock, live scores, results, his Winners plays (as this listener may see them), his
//   bankroll and record. Read fresh on every question.
// Everything comes from the same tables and RPCs the app reads. Winners is read with the listener's own
// token, so a play behind the paywall never reaches someone who hasn't unlocked it.

export interface Db {
  /** Public reads (service key): tables and RPCs the app reads with the anon key. */
  get(path: string): Promise<any>;
  rpc(name: string, body: Record<string, unknown>): Promise<any>;
  /** Reads as the listener (their token, or the anon key signed out). */
  userRpc(name: string, body: Record<string, unknown>): Promise<any>;
}

export function makeDb(url: string, serviceKey: string, anonKey: string, bearer: string | null, f: typeof fetch = fetch): Db {
  const read = async (path: string, init: RequestInit, key: string, token: string) => {
    const r = await f(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`${path.split("?")[0]} HTTP ${r.status}`);
    return r.json();
  };
  return {
    get: (path) => read(path, { method: "GET" }, serviceKey, serviceKey),
    rpc: (name, body) => read(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) }, serviceKey, serviceKey),
    userRpc: (name, body) => read(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) }, anonKey, bearer ?? anonKey),
  };
}

const safe = async <T>(p: Promise<T>): Promise<T | null> => { try { return await p; } catch { return null; } };

// ---------- dates ----------

const ET = "America/New_York";

/** "6-6" from graded rows, so he never has to count. */
export function tally(rows: any[]): string {
  const n = (r: string) => rows.filter((x) => x.result === r).length;
  const p = n("push");
  return `${n("won")}-${n("lost")}${p ? `-${p}` : ""}`;
}

/** The app's slate day: the ET date, held until 5 AM. */
export function slateDate(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", hourCycle: "h23" }).format(now));
  const d = hour < 5 ? new Date(now.getTime() - 6 * 3600_000) : now;
  return new Intl.DateTimeFormat("en-CA", { timeZone: ET }).format(d);
}

/** The ET calendar day a game starts on. */
export function etDay(iso: unknown): string | null {
  if (typeof iso !== "string") return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat("en-CA", { timeZone: ET }).format(d);
}

/** The NFL week's stored picks (weekly_nfl_picks, week starting Tuesday) for the week holding `date`. */
export async function nflWeek(db: Db, date: string): Promise<any[]> {
  const row = (await db.get(`weekly_nfl_picks?week_start=lte.${date}&order=week_start.desc&limit=1&select=week_start,picks`))?.[0];
  if (!row) return [];
  return Array.isArray(row.picks) ? row.picks : (row.picks?.picks ?? []);
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayName(ymd: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" })
    .format(new Date(`${ymd}T12:00:00Z`));
}

export function clock(now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(now);
}

const etTime = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" }).format(d);
};

// ---------- small text helpers ----------

const odds = (o: unknown) => {
  const n = Number(o);
  return Number.isFinite(n) && n !== 0 ? (n > 0 ? `+${n}` : `${n}`) : null;
};
const dollars = (units: number) => `${units < 0 ? "-" : ""}$${Math.round(Math.abs(units) * 100).toLocaleString("en-US")}`;
const tidy = (s: unknown) => String(s ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
/** "Jaren Jackson Jr." → "Jackson"; "Charlotte Hornets" → "Hornets". */
const lastName = (s: unknown) => String(s ?? "").trim().split(/\s+/).filter((w) => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w)).slice(-1)[0] ?? "";
const propWords = (prop: unknown) => String(prop ?? "").replace(/_/g, " ").replace(/\bpra\b/i, "points + rebounds + assists");

// ---------- the board (cached part) ----------

export interface Board { date: string; text: string; names: string[]; games: number; questions: string[] }

export async function readBoard(db: Db, date: string): Promise<Board> {
  const [daily, props, darts, parlay, week] = await Promise.all([
    safe(db.get(`daily_picks?date=eq.${date}&select=picks`)),
    safe(db.get(`prop_picks?date=eq.${date}&select=picks&order=id`)),
    safe(db.rpc("get_darts", { p_date: date })),
    safe(db.rpc("get_parlay", { p_date: date })),
    safe(nflWeek(db, date)),
  ]);
  return renderBoard({
    date,
    games: (daily?.[0]?.picks ?? []) as any[],
    props: (props ?? []).flatMap((r: any) => r.picks ?? []),
    darts: (darts?.today ?? []) as any[],
    parlay,
    // This NFL week's picks that play on this slate or later (Thursday's is a result by Friday).
    nfl: (week ?? []).filter((p: any) => (etDay(p.commence_time) ?? date) >= date),
  });
}

export function renderBoard(b: { date: string; games: any[]; props: any[]; darts: any[]; parlay: any; nfl: any[] }): Board {
  const out: string[] = [];
  const names = new Set<string>();
  const questions: string[] = [];
  const addTeams = (...t: unknown[]) => t.forEach((x) => typeof x === "string" && x && names.add(lastName(x)));

  const gamePick = (p: any, i: number) => {
    addTeams(p.awayTeam, p.homeTeam);
    const day = etDay(p.commence_time);
    const when = [day && day !== b.date ? dayName(day) : null, p.time ? `${p.time} ET` : etTime(p.commence_time)].filter(Boolean).join(", ");
    const lines = [
      `### ${i + 1}. ${p.league ?? ""}: ${p.awayTeam ?? "?"} at ${p.homeTeam ?? "?"}${when ? `, ${when}` : ""}${p.venue ? ` (${p.venue})` : ""}`,
      `Your pick: ${p.pick}`,
    ];
    if (p.brief?.summary) lines.push(`In a sentence: ${tidy(p.brief.summary)}`);
    const out = (p.injuries?.away ?? []).concat(p.injuries?.home ?? [])
      .filter((x: any) => /out|doubtful|questionable/i.test(x?.status ?? ""))
      .map((x: any) => `${x.name} (${String(x.status).toLowerCase()})`);
    if (out.length) lines.push(`Injury report when you picked: ${out.join(", ")}`);
    const read = tidy(p.game_read) || tidy(p.rationale);
    if (read) lines.push(`Your write-up:\n${read}`);
    const team = lastName(String(p.pick ?? "").split(/\s[+-]\d|\sML\b/)[0]);
    if (team && !questions.length) questions.push(`Why the ${team}?`);
    return lines.join("\n");
  };

  out.push(`## YOUR GAME PICKS FOR ${dayName(b.date).toUpperCase()}`);
  out.push(b.games.length ? b.games.map(gamePick).join("\n\n") : "None posted yet for this day.");

  if (b.nfl.length) {
    out.push(`## YOUR NFL PICKS FROM ${dayName(b.date).toUpperCase()} THROUGH THE REST OF THIS NFL WEEK (each says its day)`);
    out.push(b.nfl.map(gamePick).join("\n\n"));
  }

  out.push(`## YOUR PLAYER PROPS FOR ${dayName(b.date).toUpperCase()}`);
  out.push(b.props.length ? b.props.map((p: any) => {
    names.add(lastName(p.player));
    const line = `- ${p.player} ${p.bet} ${propWords(p.prop)} (${odds(p.odds) ?? "no price"}), ${p.sport ?? ""} ${p.matchup ?? ""}`.trim();
    const why = tidy(p.rationale).replace(/^Gary's Take\s*/i, "");
    return why ? `${line}\n  Why: ${why}` : line;
  }).join("\n") : "None posted yet for this day.");

  const darts = b.darts.filter((d: any) => !d.scratched);
  if (darts.length) {
    out.push(`## YOUR DARTS FOR ${dayName(b.date).toUpperCase()} (quick player shots, posted in the app's Darts tab)`);
    out.push(darts.map((d: any) => {
      names.add(lastName(d.player));
      return `- ${d.player} (${d.team ?? d.league}) ${d.bet} ${propWords(d.prop)} ${odds(d.odds) ?? ""}, ${d.matchup ?? ""}\n  Why: ${tidy(d.reason)}`;
    }).join("\n"));
    questions.push("Best dart tonight?");
  }

  if (b.parlay?.legs?.length) {
    out.push(`## YOUR PARLAY OF THE DAY (${b.parlay.legs.length} legs, ${odds(b.parlay.american_odds) ?? ""})`);
    out.push(b.parlay.legs.map((l: any) => `- ${l.text} (${odds(l.odds) ?? ""}), ${l.matchup ?? ""}`).join("\n"));
    if (b.parlay.reason) out.push(`Why: ${tidy(b.parlay.reason)}`);
    questions.push("How's the parlay looking?");
  }

  return { date: b.date, text: out.join("\n\n"), names: [...names].filter((n) => n.length > 2), games: b.games.length, questions };
}

// ---------- the scoreboard (fresh every question) ----------

export async function readScoreboard(db: Db, date: string, now = new Date()): Promise<string> {
  const yesterday = addDays(date, -1);
  const since = addDays(date, -30);
  const [live, gradedGames, gradedNfl, gradedProps, darts, parlay, streak, winners, bankroll, recentGames, recentNfl, recentProps] = await Promise.all([
    safe(db.get(`live_scores?date=eq.${date}&select=league,away_abbr,home_abbr,away_score,home_score,status,detail`)),
    safe(db.get(`game_results?game_date=in.(${yesterday},${date})&select=game_date,league,pick_text,matchup,result,final_score&order=game_date`)),
    safe(db.get(`nfl_results?game_date=in.(${yesterday},${date})&select=game_date,pick_text,matchup,result,final_score&order=game_date`)),
    safe(db.get(`prop_results?game_date=in.(${yesterday},${date})&select=game_date,player_name,pick_text,result,actual_value,line_value&order=game_date`)),
    safe(db.rpc("get_darts", { p_date: date })),
    safe(db.rpc("get_parlay", { p_date: date })),
    safe(db.rpc("get_streak", { p_date: date })),
    safe(db.userRpc("get_winners_board", { p_date: date })),
    safe(db.userRpc("get_gary_bankroll", {})),
    safe(db.get(`game_results?game_date=gte.${since}&game_date=lt.${date}&select=game_date,league,result`)),
    safe(db.get(`nfl_results?game_date=gte.${since}&game_date=lt.${date}&select=game_date,result`)),
    safe(db.get(`prop_results?game_date=gte.${since}&game_date=lt.${date}&select=game_date,result`)),
  ]);
  const nfl = (rows: any[] | null) => (rows ?? []).map((r) => ({ ...r, league: "NFL" }));
  return renderScoreboard({
    date, now, live, gradedGames: [...(gradedGames ?? []), ...nfl(gradedNfl)], gradedProps, darts, parlay, streak, winners, bankroll,
    recentGames: [...(recentGames ?? []), ...nfl(recentNfl)], recentProps,
  });
}

export function renderScoreboard(s: {
  date: string; now: Date; live: any[] | null; gradedGames: any[] | null; gradedProps: any[] | null; darts: any; parlay: any;
  streak: any; winners: any; bankroll: any; recentGames: any[] | null; recentProps: any[] | null;
}): string {
  const out: string[] = [];
  const yesterday = addDays(s.date, -1);
  out.push(`## RIGHT NOW\nIt is ${clock(s.now)} Eastern. The slate you're talking about is ${dayName(s.date)}.`);

  if (s.live?.length) {
    out.push(`## SCORES ON THE ${dayName(s.date).toUpperCase()} SLATE`);
    out.push(s.live.map((g: any) => `- ${g.league} ${g.away_abbr} ${g.away_score ?? 0}, ${g.home_abbr} ${g.home_score ?? 0} (${g.status === "scheduled" ? "not started" : g.detail ?? g.status})`).join("\n"));
  }

  const results = (rows: any[] | null, day: string) => (rows ?? []).filter((r) => r.game_date === day);
  const gameLine = (r: any) => `- ${r.pick_text} (${r.matchup ?? r.league}): ${String(r.result).toUpperCase()}${r.final_score ? `, final ${r.final_score}` : ""}`;
  const propLine = (r: any) => `- ${r.pick_text}: ${String(r.result).toUpperCase()}${r.actual_value != null ? ` (finished with ${r.actual_value})` : ""}`;
  for (const [day, label] of [[s.date, `GRADED SO FAR ON ${dayName(s.date).toUpperCase()}`], [yesterday, `HOW ${dayName(yesterday).toUpperCase()} WENT`]] as const) {
    const g = results(s.gradedGames, day), p = results(s.gradedProps, day);
    if (!g.length && !p.length) continue;
    out.push(`## ${label}`);
    if (g.length) out.push(`Game picks, ${tally(g)}:\n${g.map(gameLine).join("\n")}`);
    if (p.length) out.push(`Props, ${tally(p)}:\n${p.map(propLine).join("\n")}`);
  }

  const dartsToday = (s.darts?.today ?? []).filter((d: any) => !d.scratched && d.result);
  if (dartsToday.length) out.push(`## DARTS GRADED TONIGHT\n${dartsToday.map((d: any) => `- ${d.player} ${d.bet} ${propWords(d.prop)}: ${d.result === "hit" ? "HIT" : "MISSED"}`).join("\n")}`);
  const scratched = (s.darts?.today ?? []).filter((d: any) => d.scratched);
  if (scratched.length) out.push(`Scratched darts (player ruled out, no bet): ${scratched.map((d: any) => d.player).join(", ")}`);
  const dartHits = s.darts?.yesterday ?? [];
  if (dartHits.length) out.push(`Darts that hit on ${dayName(yesterday)}: ${dartHits.map((d: any) => `${d.player} ${d.bet} ${propWords(d.prop)}${d.actual != null ? ` (${d.actual})` : ""}`).join("; ")}`);

  if (s.parlay?.legs?.length) {
    const legs = s.parlay.legs.map((l: any) => `${l.text}: ${l.result ? String(l.result).toUpperCase() : l.live?.status === "live" ? `live, ${l.progress?.actual ?? "?"} so far (${l.live?.detail ?? ""})` : "not started"}`);
    out.push(`## PARLAY OF THE DAY STATUS${s.parlay.result ? `: ${String(s.parlay.result).toUpperCase()}` : ""}\n${legs.map((l: string) => `- ${l}`).join("\n")}`);
  }

  if (s.streak?.today) {
    const t = s.streak.today;
    out.push(`## YOUR FREE PICK (the streak pick everyone in the app gets)\n${t.pick_text} (${t.matchup ?? t.league})${t.result ? `: ${String(t.result).toUpperCase()}` : ""}. Streak: ${s.streak.current ?? 0} in a row, best ${s.streak.best ?? 0}.`);
  }

  out.push(renderWinners(s.winners, s.date));

  const bk = s.bankroll;
  if (bk && typeof bk.initial_units === "number") {
    const days = (bk.days ?? []).filter((d: any) => d.settled > 0);
    const last = days.filter((d: any) => d.date < s.date).slice(-1)[0];
    const week = days.filter((d: any) => d.date >= addDays(s.date, -7) && d.date < s.date);
    const weekNet = week.reduce((a: number, d: any) => a + (d.net_units ?? 0), 0);
    const today = days.find((d: any) => d.date === s.date);
    out.push([
      `## YOUR WINNERS BANKROLL (real dollars; you started with ${dollars(bk.initial_units)} on ${dayName(bk.started_date ?? "2026-09-16")})`,
      `Bankroll now: ${dollars(bk.bankroll_units)} (${bk.profit_units >= 0 ? "up" : "down"} ${dollars(Math.abs(bk.profit_units))} overall). Record ${bk.wins}-${bk.losses}${bk.pushes ? `-${bk.pushes}` : ""} on ${bk.bets} bets.`,
      last ? `Last night (${dayName(last.date)}): ${last.wins}-${last.losses}, ${last.net_units >= 0 ? "+" : ""}${dollars(last.net_units)}.` : "",
      week.length ? `Last 7 days: ${weekNet >= 0 ? "+" : ""}${dollars(weekNet)}.` : "",
      today ? `Tonight so far: ${today.wins}-${today.losses}, ${today.net_units >= 0 ? "+" : ""}${dollars(today.net_units)}.` : "",
    ].filter(Boolean).join("\n"));
  }

  const rec = (rows: any[] | null) => {
    const by = new Map<string, { w: number; l: number; p: number }>();
    for (const r of rows ?? []) {
      const k = r.league ?? "Props";
      const e = by.get(k) ?? { w: 0, l: 0, p: 0 };
      if (r.result === "won") e.w++; else if (r.result === "lost") e.l++; else if (r.result === "push") e.p++;
      by.set(k, e);
    }
    return [...by.entries()].map(([k, e]) => `${k} ${e.w}-${e.l}${e.p ? `-${e.p}` : ""}`).join(", ");
  };
  const g = rec(s.recentGames), p = rec((s.recentProps ?? []).map((r) => ({ ...r, league: "Props" })));
  if (g || p) out.push(`## YOUR RECORD, LAST 30 DAYS (free picks in the app)\n${[g && `Game picks: ${g}`, p && `${p}`].filter(Boolean).join(". ")}`);

  return out.filter(Boolean).join("\n\n");
}

function renderWinners(w: any, date: string): string {
  if (!w) return "";
  const tickets = (w.tickets ?? []) as any[];
  const locked = ((w.boards ?? []) as any[]).filter((b) => b.locked);
  const lines: string[] = [`## YOUR WINNERS PLAYS FOR ${dayName(date).toUpperCase()} (Winners is the paid room: your real-money bets from the $10,000 bankroll)`];
  if (tickets.length) {
    lines.push(tickets.filter((t) => !t.scratched_at).map((t) => {
      const s = t.pick_snapshot ?? {};
      const what = t.kind === "prop" && s.player ? `${s.player} ${s.bet ?? ""} ${propWords(s.prop ?? s.prop_type)} ${s.line ?? ""}`.replace(/\s+/g, " ").trim() : (s.pick ?? "");
      const stake = Number(t.stake_units) > 0 ? `$${Math.round(Number(t.stake_units) * 100)}` : null;
      const head = `- ${t.league} ${t.kind === "prop" ? "prop" : "game"}: ${what}${s.game ? ` (${s.game})` : ""}${stake ? `, ${stake} on it` : ""}${t.result?.result ? `: ${String(t.result.result).toUpperCase()}` : ""}${t.candidate_id === w.free_candidate_id ? " (also today's free pick)" : ""}`;
      const why = (t.reasons ?? []).map((r: any) => `${r.claim}: ${r.why}`).join(" ");
      return [head, why ? `  Why: ${why}` : ""].filter(Boolean).join("\n");
    }).join("\n"));
  }
  if (locked.length) {
    const what = locked.map((b) => `${b.count} ${b.league} ${b.kind === "prop" ? "prop" : "game"}${b.count === 1 ? "" : "s"}`).join(", ");
    lines.push(`LOCKED for this listener (they haven't unlocked Winners for these): ${what}. You may say how many plays are in there, never which ones.`);
  }
  if (!tickets.length && !locked.length) lines.push("No Winners plays posted yet for this day.");
  return lines.join("\n");
}
