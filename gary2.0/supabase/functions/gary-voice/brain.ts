// Gary answering out loud. Claude Opus 5.5 (Gary is Opus), low effort because someone is waiting on him,
// streaming so the voice starts on his first sentence. The rules and the day's picks sit in a cached prefix
// shared by everyone asking that day; the scoreboard and the question come after it.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { addDays, type Board, type Db, dayName, etDay, nflWeek, readBoard, tally } from "./notebook.ts";

export const GARY_MODEL = "claude-opus-5-5";

export const RULES = `You are Gary, the AI behind the Gary sports betting app. Someone in the app tapped you on the home screen and is talking to you out loud. Your answer is spoken in your voice, so it is heard, not read.

Below is your notebook: the picks you made for the slate, with the write-ups you wrote when you made them, and then how things stand right now. These are your own picks and your own reasoning. When you explain one, explain it the way you wrote it, in the first person: what you saw, why you took that side, what worries you.

How to answer
- Answer what they asked, then stop. Lead with the answer itself. Most answers are two or three sentences, under about 60 words, ten to fifteen seconds out loud; pick the one or two reasons that matter most instead of everything in the write-up. Go longer only when they ask you to walk them through something.
- Plain spoken sentences only: no lists, headings, symbols, emoji or markdown. Say lines and prices the way a fan says them out loud ("Hornets plus one and a half", "minus one twenty", "plus four forty-three"). Other numbers can stay as digits.
- Talk like a person across the table, not a press release: no greetings unless they greet you, no "great question", no sign-offs, no catchphrases. Don't end every answer with a question back to them.
- What they said comes from speech recognition, so a name can come through misspelled. Go with the closest player or team in your notebook.

What you can and can't say
- Everything you say about picks, players, stats, injuries, scores and results comes from the notebook or a lookup. If it isn't there, say you don't have it. Never make up a number, a stat, an injury or a score.
- Only talk about picks you actually made. If they ask about a game you have no pick on, say so plainly; if that day's picks aren't out yet, say they come out once the lineups and injury news are in, usually a few hours before the game. Never make up a new pick on the spot.
- This season only. Never bring up last season.
- Winners is the paid room in the app: your real-money bets from a $10,000 bankroll. Talk about it in dollars, never units. If the notebook says Winners plays are locked for this listener, you can say how many are in there, never which teams or players; tell them they're in Winners.
- Be straight about results, good and bad. A loss is a loss; don't spin it.
- Never tell someone how much of their own money to bet, and never promise a win. If someone sounds like betting is hurting them (chasing losses, money they need, can't stop), drop the picks talk, be kind and brief, and mention 1-800-GAMBLER.
- If they ask about something that has nothing to do with sports or betting, give a short friendly answer and steer back to the games.
- If they ask, you're an AI.

Lookups: you have tools for another day's picks and results, the full write-up behind one pick, a team's recent games, and your record over a stretch. Use one only when the notebook doesn't already answer the question; the listener is waiting on you. Before a lookup, say at most a few natural words ("Let me check my book.") and nothing else; never read dates out to yourself.`;

const TOOLS = [
  {
    name: "look_up_day",
    description: "Your picks (games, props, darts, parlay) for another date this season, each with its one-line summary and result. Use for questions about a past day, or tomorrow once its picks are out.",
    input_schema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" } }, required: ["date"], additionalProperties: false },
  },
  {
    name: "pick_write_up",
    description: "The full write-up you wrote for one of your picks on a given date, found by a team or player name in it.",
    input_schema: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD" }, name: { type: "string", description: "A team or player in the pick" } },
      required: ["date", "name"], additionalProperties: false,
    },
  },
  {
    name: "team_games",
    description: "A team's games this season: dates, opponents and final scores.",
    input_schema: {
      type: "object",
      properties: { league: { type: "string", enum: ["NFL", "NBA", "MLB", "NCAAF", "NHL", "NCAAB"] }, team: { type: "string", description: "Team name, e.g. Charlotte Hornets" } },
      required: ["league", "team"], additionalProperties: false,
    },
  },
  {
    name: "my_record",
    description: "Your won-lost record on free game picks and props over the last N days (this season only), by league.",
    input_schema: {
      type: "object",
      properties: { days: { type: "integer", minimum: 1, maximum: 60 }, league: { type: "string", description: "Optional: NFL, NBA, MLB, NCAAF" } },
      required: ["days"], additionalProperties: false,
    },
  },
].map((t) => ({ ...t, eager_input_streaming: true }));

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n[cut for length]` : s);

export async function runTool(db: Db, slate: string, name: string, input: any): Promise<string> {
  if (!input || typeof input !== "object") throw new Error("bad input");
  if (name === "look_up_day") {
    if (!YMD.test(input.date)) throw new Error("date must be YYYY-MM-DD");
    if (input.date < "2026-08-01") return "That's before this season. You only talk about this season.";
    const date = input.date;
    const [daily, props, darts, parlay, games, nflGames, propResults, week] = await Promise.all([
      db.get(`daily_picks?date=eq.${date}&select=picks`).catch(() => null),
      db.get(`prop_picks?date=eq.${date}&select=picks&order=id`).catch(() => null),
      db.rpc("get_darts", { p_date: date }).catch(() => null),
      db.rpc("get_parlay", { p_date: date }).catch(() => null),
      db.get(`game_results?game_date=eq.${date}&select=pick_text,result,final_score`).catch(() => null),
      db.get(`nfl_results?game_date=eq.${date}&select=pick_text,result,final_score`).catch(() => null),
      db.get(`prop_results?game_date=eq.${date}&select=pick_text,result,actual_value`).catch(() => null),
      nflWeek(db, date).catch(() => []),
    ]);
    const graded = [...(games ?? []), ...(nflGames ?? [])];
    const result = (text: string, _rows: any[] | null) => graded.find((r) => r.pick_text === text);
    const out: string[] = [`${dayName(date)}:`];
    if (graded.length || propResults?.length) {
      out.push(`Record that day: game picks ${graded.length ? `${tally(graded)} (${graded.length} graded)` : "none graded"}; props ${propResults?.length ? `${tally(propResults)} (${propResults.length} graded)` : "none graded"}.`);
    }
    const gp = [...((daily?.[0]?.picks ?? []) as any[]), ...week.filter((p: any) => etDay(p.commence_time) === date).map((p: any) => ({ ...p, league: p.league ?? "NFL" }))];
    out.push(gp.length ? "Game picks:\n" + gp.map((p) => {
      const r = result(p.pick, games);
      return `- ${p.league} ${p.awayTeam} at ${p.homeTeam}: ${p.pick}${r ? ` (${String(r.result).toUpperCase()}${r.final_score ? `, ${r.final_score}` : ""})` : ""}. ${p.brief?.summary ?? ""}`;
    }).join("\n") : "No game picks stored for that day.");
    const pp = (props ?? []).flatMap((r: any) => r.picks ?? []);
    if (pp.length) out.push("Props:\n" + pp.map((p: any) => `- ${p.player} ${p.bet} ${String(p.prop).replace(/_/g, " ")}${(() => { const r = (propResults ?? []).find((x: any) => String(x.pick_text ?? "").startsWith(String(p.player))); return r ? ` (${String(r.result).toUpperCase()}${r.actual_value != null ? `, had ${r.actual_value}` : ""})` : ""; })()}`).join("\n"));
    const dt = (darts?.today ?? []).filter((d: any) => !d.scratched);
    if (dt.length) out.push("Darts:\n" + dt.map((d: any) => `- ${d.player} ${d.bet} ${String(d.prop).replace(/_/g, " ")}${d.result ? ` (${d.result === "hit" ? "HIT" : "MISSED"})` : ""}`).join("\n"));
    if (parlay?.legs?.length) out.push(`Parlay of the day: ${parlay.legs.map((l: any) => `${l.text}${l.result ? ` (${l.result})` : ""}`).join("; ")}${parlay.result ? `. Result: ${parlay.result}` : ""}`);
    return clip(out.join("\n\n"), 9000);
  }
  if (name === "pick_write_up") {
    if (!YMD.test(input.date)) throw new Error("date must be YYYY-MM-DD");
    const needle = String(input.name ?? "").toLowerCase().trim();
    if (needle.length < 3) throw new Error("name too short");
    const [daily, props, week] = await Promise.all([
      db.get(`daily_picks?date=eq.${input.date}&select=picks`).catch(() => null),
      db.get(`prop_picks?date=eq.${input.date}&select=picks&order=id`).catch(() => null),
      nflWeek(db, input.date).catch(() => []),
    ]);
    const games = [...((daily?.[0]?.picks ?? []) as any[]), ...week.filter((p: any) => etDay(p.commence_time) === input.date)];
    const g = games.find((p) => `${p.pick} ${p.awayTeam} ${p.homeTeam}`.toLowerCase().includes(needle));
    if (g) return clip(`${g.pick} (${g.awayTeam} at ${g.homeTeam})\n${g.game_read || g.rationale || "No write-up stored."}`, 9000);
    const p = (props ?? []).flatMap((r: any) => r.picks ?? []).find((x: any) => `${x.player} ${x.team} ${x.matchup}`.toLowerCase().includes(needle));
    if (p) return clip(`${p.player} ${p.bet} ${String(p.prop).replace(/_/g, " ")}\n${p.rationale ?? "No write-up stored."}`, 6000);
    return `No pick on ${dayName(input.date)} mentions "${input.name}".`;
  }
  if (name === "team_games") {
    const rows = await db.rpc("get_team_games", { p_league: String(input.league), p_team: String(input.team) });
    const list = Array.isArray(rows) ? rows : rows?.games ?? [];
    if (!list.length) return `No games found for ${input.team}.`;
    return clip(JSON.stringify(list.slice(-12)), 5000);
  }
  if (name === "my_record") {
    const days = Math.max(1, Math.min(60, Number(input.days) || 7));
    const since = addDays(slate, -days);
    const league = typeof input.league === "string" && input.league ? `&league=eq.${encodeURIComponent(input.league.toUpperCase())}` : "";
    const wantNfl = !league || /NFL/i.test(String(input.league));
    const [nonNfl, nfl, props] = await Promise.all([
      /NFL/i.test(String(input.league ?? "")) ? Promise.resolve([]) : db.get(`game_results?game_date=gte.${since}&game_date=lt.${slate}${league}&select=league,result`),
      wantNfl ? db.get(`nfl_results?game_date=gte.${since}&game_date=lt.${slate}&select=result`) : Promise.resolve([]),
      league ? Promise.resolve([]) : db.get(`prop_results?game_date=gte.${since}&game_date=lt.${slate}&select=result`),
    ]);
    const games = [...(nonNfl ?? []), ...(nfl ?? []).map((r: any) => ({ ...r, league: "NFL" }))];
    const by = new Map<string, any[]>();
    for (const r of games ?? []) by.set(r.league, [...(by.get(r.league) ?? []), r]);
    return `Last ${days} days. Game picks: ${tally(games ?? [])} (${[...by].map(([k, v]) => `${k} ${tally(v)}`).join(", ") || "none"}).${league ? "" : ` Props: ${tally(props ?? [])}.`}`;
  }
  throw new Error(`unknown tool ${name}`);
}

export interface Turn { role: "user" | "assistant"; text: string }

export interface BrainResult {
  answer: string;
  tools: string[];
  usage: { input: number; cacheRead: number; cacheWrite: number; output: number };
  refused: boolean;
}

/** Ask Gary. `onText` receives his words as they're written. */
export async function ask(opts: {
  apiKey: string; db: Db; slate: string; board: Board; scoreboard: string; history: Turn[]; question: string;
  onText: (delta: string) => void; onLookup?: () => void; signal?: AbortSignal; model?: string;
}): Promise<BrainResult> {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 1, timeout: 60_000 });
  const system = [
    { type: "text", text: RULES },
    { type: "text", text: `# YOUR NOTEBOOK\n\n${opts.board.text}`, cache_control: { type: "ephemeral", ttl: "1h" } },
  ];
  const messages: any[] = [];
  for (const t of opts.history.slice(-8)) messages.push({ role: t.role, content: t.text });
  // The API needs the conversation to open with the listener.
  while (messages.length && messages[0].role !== "user") messages.shift();
  messages.push({ role: "user", content: `${opts.scoreboard}\n\n---\nThey just said: "${opts.question}"` });

  const usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  const tools: string[] = [];
  let answer = "";
  for (let round = 0; round < 4; round++) {
    const stream = client.beta.messages.stream({
      model: opts.model ?? GARY_MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system,
      tools: TOOLS,
      messages,
    } as any, { signal: opts.signal });
    for await (const event of stream as any) {
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        answer += event.delta.text;
        opts.onText(event.delta.text);
      }
    }
    const message: any = await stream.finalMessage();
    const u = message.usage ?? {};
    usage.input += u.input_tokens ?? 0;
    usage.cacheRead += u.cache_read_input_tokens ?? 0;
    usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
    usage.output += u.output_tokens ?? 0;
    if (message.stop_reason === "refusal") return { answer, tools, usage, refused: true };
    const calls = (message.content ?? []).filter((b: any) => b.type === "tool_use");
    if (message.stop_reason !== "tool_use" || !calls.length) break;
    messages.push({ role: "assistant", content: message.content });
    opts.onLookup?.();
    const results = await Promise.all(calls.map(async (c: any) => {
      tools.push(c.name);
      try {
        return { type: "tool_result", tool_use_id: c.id, content: await runTool(opts.db, opts.slate, c.name, c.input) };
      } catch (e) {
        return { type: "tool_result", tool_use_id: c.id, content: `Lookup failed: ${(e as Error).message}`, is_error: true };
      }
    }));
    messages.push({ role: "user", content: results });
    // A sentence before a lookup and the one after it shouldn't run together.
    if (answer && !/\s$/.test(answer)) { answer += " "; opts.onText(" "); }
  }
  return { answer: answer.trim(), tools, usage, refused: false };
}

/** Dollars for one answer: Opus 5.5 ($4 in, $20 out, cache write 1h $8, read $0.40) and the voice by character. */
export function costUSD(u: BrainResult["usage"], ttsChars: number): number {
  return (u.input * 4 + u.output * 20 + u.cacheWrite * 8 + u.cacheRead * 0.4) / 1e6 + ttsChars * 0.00005;
}

export async function boardFor(db: Db, date: string, cache: Map<string, { at: number; board: Board }>): Promise<Board> {
  const hit = cache.get(date);
  if (hit && Date.now() - hit.at < 60_000) return hit.board;
  const board = await readBoard(db, date);
  cache.set(date, { at: Date.now(), board });
  return board;
}
