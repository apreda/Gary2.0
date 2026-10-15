/**
 * THE QUARTERBACKS' SEASON (founder GO, Oct 14 2026 late night: "Gary should have QB data and context fully"; the
 * Seahawks' quarterback "is just coming back from injury" while the 49ers' "has played all year"). Each starter's
 * season so far from the desk's own player lines: his passing line, his rushing line and his share of the snaps week
 * by week, so a replay reads them as of the game. Facts only.
 */
import { esc } from '../../orchestrator/footballDeskText.js';

/** One quarterback's season so far: the passing line, the rushing line, his snaps by week. */
export function nflQuarterbackSeason(desk, name) {
  const lines = String(desk || '').split('\n').map((l) => l.trim());
  const n = esc(name);
  const passing = lines.find((l) => new RegExp(`^${n} QB1 — starting this week, `).test(l));
  const rushing = lines.find((l) => new RegExp(`^${n} QB1 — \\d+ car, `).test(l));
  const snaps = lines.find((l) => new RegExp(`^${n} QB · Wk`).test(l));
  const out = [];
  if (passing) out.push(`this season passing: ${passing.replace(new RegExp(`^${n} QB1 — starting this week, `), '').replace(/ · also .*$/, '')}`);
  if (rushing) out.push(`rushing: ${rushing.replace(new RegExp(`^${n} QB1 — `), '')}`);
  if (snaps) out.push(`his share of the snaps by week: ${snaps.replace(new RegExp(`^${n} QB · `), '')}`);
  return out;
}
