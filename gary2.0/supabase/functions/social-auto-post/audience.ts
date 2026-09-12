import { marqueeScore } from "./marquee.ts";
import { slotOf, SLOT_ORDER } from "./window.ts";
import { sameSourceGame, hasLoggedTicket, publicationKey } from "./pickSources.js";

export const AUDIENCE_VERSION = "audience-drip-v1";
export const POST_GAP_MS = 30 * 60_000;
export const audienceCap = (day: string) => day === "2026-09-12" ? 16 : 12;
const MIN = 60_000;
const etDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
const dayOf = (ms: number) => etDay.format(ms);
const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const mean = (a: number[]) => a.reduce((n, x) => n + x, 0) / Math.max(1, a.length);
const clamp = (x: number, limit: number) => Math.max(-limit, Math.min(limit, x));
const cellOf = (p: any) => `${String(p.league).toUpperCase()}:${slotOf(p.commence_time)}`;
const matchesTeam = (a: string, b: string) => Boolean(a && b) && (a === b || a.endsWith(` ${b}`) || b.endsWith(` ${a}`));

/** Selecting a subset intentionally leaves games untweeted. Only a durable
 * publication attempt missing its deadline is a failed pregame post. */
export function audienceDeadlineOutcomes(picks: any[], logs: any[], intents: any[], nowMs: number) {
  const attempted = new Set(intents.map(i => i.publication_key));
  const missed: string[] = [], skipped_pregame: string[] = [];
  for (const p of picks) {
    if (hasLoggedTicket(p, logs)) continue;
    const start = Date.parse(p.commence_time);
    if (Number.isFinite(start) && start - nowMs >= 5 * MIN) continue;
    let key: string | undefined;
    try { key = publicationKey(p); } catch { /* source lacks stable identity */ }
    (key && attempted.has(key) ? missed : skipped_pregame).push(p.pick);
  }
  return { missed, skipped_pregame };
}

/** Use only mature, measured pick posts. No missing metric is treated as zero
 * reach; no result/win rate/confidence enters this audience estimate. */
export function audienceEvidence(p: any, history: any[], nowMs: number) {
  const league = String(p.league).toUpperCase();
  const rows = history.filter(r => r.league === league && ["standard", "top_pick"].includes(r.thread_format)
    && Number.isFinite(r.impressions) && r.impressions >= 0
    && nowMs - Date.parse(r.posted_at) >= 24 * 60 * MIN && nowMs - Date.parse(r.posted_at) <= 28 * 24 * 60 * MIN);
  const teams = [norm(p.awayTeam), norm(p.homeTeam)];
  const teamRows = rows.filter(r => {
    const metadata = r.audience_selection;
    // Older receipts have only the posted ticket: attribute them to its named
    // side, never guess which opponent it played.
    const named = metadata?.teams ?? [String(r.pick_text ?? "").split(/\s+(?:ML\b|moneyline\b|[+-]\d)/i)[0]];
    return named.some((t: string) => teams.some(s => matchesTeam(s, norm(t))));
  });
  // Compare each metric only where it was measured. Missing profile visits must
  // not lower a post's score relative to rows where X supplied that metric.
  const adjustment = (sample: any[], minimum: number, shrink: number, limit: number) => {
    const views = sample.length >= minimum ? (mean(sample.map(r => Math.log1p(r.impressions)))
      - mean(rows.map(r => Math.log1p(r.impressions)))) * sample.length / (sample.length + shrink) : 0;
    const measured = (list: any[]) => list.filter(r => Number.isFinite(r.profile_clicks) && r.profile_clicks >= 0);
    const profiles = measured(sample), baseline = measured(rows);
    const visits = profiles.length >= minimum ? 0.5 * (mean(profiles.map(r => Math.log1p(r.profile_clicks)))
      - mean(baseline.map(r => Math.log1p(r.profile_clicks)))) * profiles.length / (profiles.length + shrink) : 0;
    return clamp(views + visits, limit);
  };
  const teamBoost = adjustment(teamRows, 5, 10, 2);
  const slot = slotOf(p.commence_time);
  const slotRows = rows.filter(r => r.slot === slot);
  const timeBoost = adjustment(slotRows, 10, 20, 1);
  return { score: marqueeScore(p) + teamBoost + timeBoost, prior: marqueeScore(p), team_posts: teamRows.length,
    window_posts: slotRows.length, team_adjustment: teamBoost, window_adjustment: timeBoost };
}

/** Plan against the schedule, not just research already finished. This reserves
 * late-game and other-sport space before those picks have been written. */
export function selectAudiencePicks(picks: any[], slate: any[], receipts: any[], history: any[], nowMs: number, allPublished = picks) {
  const today = dayOf(nowMs), cap = audienceCap(today);
  const logs = receipts.filter(r => ["standard", "top_pick"].includes(r.thread_format));
  const interrupted = (p: any) => /cancel|postpon|suspend|final|in.progress|^live$/i.test(String(p.game_status ?? ""));
  const onDay = (p: any) => Number.isFinite(Date.parse(p.commence_time)) && dayOf(Date.parse(p.commence_time)) === today;
  const valid = (p: any) => onDay(p) && !interrupted(p)
    && !slate.some(row => sameSourceGame(p, row) && interrupted(row));
  // Include already-posted originals when matching the schedule. Older picks
  // may use matchup identity while the provider's slate now carries a game ID.
  const board: any[] = allPublished.filter(valid).map(p => ({ ...p }));
  for (const row of slate) {
    const game = { ...row, awayTeam: row.away_team, homeTeam: row.home_team, awayRanking: row.away_ranking, homeRanking: row.home_ranking };
    if (!valid(game)) continue;
    const existing = board.find(p => sameSourceGame(p, game));
    if (existing) {
      // Never replace the published pick's identity, ticket, rank or start.
      existing.awayRanking ??= game.awayRanking; existing.homeRanking ??= game.homeRanking;
    } else board.push(game);
  }
  const cells = new Map<string, { games: any[]; used: number; quota: number }>();
  for (const p of board) {
    const key = cellOf(p);
    if (!cells.has(key)) cells.set(key, { games: [], used: 0, quota: 0 });
    if (Date.parse(p.commence_time) - nowMs >= 5 * MIN && !hasLoggedTicket(p, logs)) cells.get(key)!.games.push(p);
  }
  for (const r of logs) {
    const key = r.audience_selection?.cell ?? `${r.league}:${r.slot}`;
    if (!cells.has(key)) cells.set(key, { games: [], used: 0, quota: 0 });
    cells.get(key)!.used++; cells.get(key)!.quota++;
  }
  const evidenceCache = new Map<any, ReturnType<typeof audienceEvidence>>();
  const evidence = (p: any) => {
    if (!evidenceCache.has(p)) evidenceCache.set(p, audienceEvidence(p, history, nowMs));
    return evidenceCache.get(p)!;
  };
  const order = (a: any, b: any) => evidence(b).score - evidence(a).score || Date.parse(a.commence_time) - Date.parse(b.commence_time)
    || `${a.awayTeam}|${a.homeTeam}`.localeCompare(`${b.awayTeam}|${b.homeTeam}`);
  for (const cell of cells.values()) cell.games.sort(order);
  const active = [...cells.entries()].filter(([, c]) => c.games.length);
  // Finals don't shrink the original day's denominator and erase night slots.
  const scheduledCount = slate.filter(p => onDay(p) && !/cancel|postpon|suspend/i.test(String(p.game_status ?? ""))).length;
  const target = Math.min(cap, Math.max(Math.ceil(Math.max(board.length, scheduledCount) * 0.4), active.length, logs.length));
  let remaining = Math.max(0, target - logs.length);
  // One per sport/day-part first. When all sports cannot fit, earlier windows
  // and then audience appeal determine coverage. There is no sport confidence quota.
  active.sort(([ka, a], [kb, b]) => SLOT_ORDER.indexOf(ka.split(":")[1] as any) - SLOT_ORDER.indexOf(kb.split(":")[1] as any)
    || order(a.games[0], b.games[0]));
  for (const [, c] of active) if (!c.used && remaining > 0) { c.quota++; remaining--; }
  // Extra space goes to the strongest remaining scheduled audience opportunities.
  // Diminishing priority gives a second sport/window a chance before a third pick.
  while (remaining > 0) {
    const options = active.filter(([, c]) => c.quota - c.used < c.games.length);
    options.sort(([, a], [, b]) => (evidence(b.games[b.quota - b.used]).score - b.quota * 2)
      - (evidence(a.games[a.quota - a.used]).score - a.quota * 2));
    if (!options.length) break;
    options[0][1].quota++; remaining--;
  }
  const plan = [...cells].map(([cell, c]) => ({ cell, posted: c.used, quota: c.quota,
    preferred: c.games.slice(0, Math.max(0, c.quota - c.used)).map(p => `${p.awayTeam} @ ${p.homeTeam}`) }));
  const latest = Math.max(0, ...logs.map(r => Date.parse(r.posted_at)).filter(Number.isFinite));
  const result = { version: AUDIENCE_VERSION, cap, target, plan, queue: [] as any[], reason: "no selected pick ready in the 5–120 minute window" };
  if (nowMs - latest < POST_GAP_MS) return { ...result, reason: "30-minute spacing", next_post_after: new Date(latest + POST_GAP_MS).toISOString() };
  if (logs.length >= target) return { ...result, reason: "daily audience budget filled" };
  const eligible = picks.filter(p => valid(p) && !hasLoggedTicket(p, logs)
    && Date.parse(p.commence_time) - nowMs >= 5 * MIN && Date.parse(p.commence_time) - nowMs <= 120 * MIN);
  const choices: any[] = [];
  for (const p of eligible) {
    const key = cellOf(p), cell = cells.get(key);
    if (!cell || cell.quota <= cell.used) continue;
    const shortlist = cell.games.slice(0, cell.quota - cell.used);
    const preferred = shortlist.some(g => sameSourceGame(g, p));
    // If the preferred game's pick is still absent at T-45, use another real,
    // safe published pick from that window instead of silently losing coverage.
    const release = shortlist.some(g => Date.parse(g.commence_time) - nowMs <= 45 * MIN && !eligible.some(e => sameSourceGame(e, g)));
    if (!preferred && !release) continue;
    const enriched = board.find(g => sameSourceGame(g, p)) ?? p;
    choices.push({ ...p, audience_selection: { version: AUDIENCE_VERSION, cell: key, quota: cell.quota,
      target, cap, teams: [p.awayTeam, p.homeTeam], ...evidence(enriched), basis: preferred ? "audience_priority" : "missing_pick_window_fill" } });
  }
  choices.sort((a, b) => {
    const urgent = (p: any) => Date.parse(p.commence_time) - nowMs < 30 * MIN ? 1 : 0;
    return urgent(b) - urgent(a) || b.audience_selection.score - a.audience_selection.score
      || Date.parse(a.commence_time) - Date.parse(b.commence_time) || String(a.pick).localeCompare(String(b.pick));
  });
  return { ...result, queue: choices.slice(0, 1), reason: choices.length ? "selected for audience and timing" : result.reason };
}
