import { StitchRule } from '@/components/Terminal';
import { LANES, LANE_ORDER, laneFromCategory, type LaneKey } from '@/lib/gary/hub';
import type { InsightRow } from '@/lib/gary/types';

// THE RESEARCH (Sep 9 2026): the dated measurements the app shows under a
// pick card — the starters, the numbers, the head-to-head, availability and
// the practice report — on the web game page, from the same rows. Every row
// is shown whole; nothing here predicts.

/** The app's under-card order, then any other lane in the Hub's order. */
const GAME_ORDER: LaneKey[] = [
  'quarterback', 'starterForm', 'batterVsArm', 'platoon', 'hot', 'cold', 'hrThreat',
  'bullpenFatigue', 'firstInning', 'runningGame',
  'trenches', 'passRush', 'paceScript', 'turnoverEdge', 'explosivePlay', 'redZone', 'coaching',
  'mismatch', 'coverage', 'ballpark', 'parkWeather', 'h2h', 'injury', 'practiceReport',
  'situational', 'streak', 'teamRecord', 'regression', 'debut', 'closerWatch',
  'marketRange', 'theSweat', 'afterGary',
];

export function researchForGame(rows: InsightRow[], gameId: string | number | null | undefined): Map<LaneKey, InsightRow[]> {
  const id = gameId == null ? '' : String(gameId).trim();
  const out = new Map<LaneKey, InsightRow[]>();
  if (!id) return out;
  for (const row of rows) {
    if (String(row.game_id ?? '').trim() !== id) continue;
    const lane = laneFromCategory(row.category);
    if (!lane) continue;
    const list = out.get(lane) ?? [];
    list.push(row);
    out.set(lane, list);
  }
  return out;
}

export function GameResearch({ rows, gameId, matchup }: { rows: InsightRow[]; gameId: string | number | null | undefined; matchup: string }) {
  const groups = researchForGame(rows, gameId);
  if (groups.size === 0) return null;
  const order = [...GAME_ORDER, ...LANE_ORDER.filter(l => !GAME_ORDER.includes(l))].filter(l => groups.has(l));
  return (
    <section className="mt-10" aria-label={`Research for ${matchup}`}>
      <h2 className="font-display text-[1.7rem] uppercase leading-none text-hi">The research</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-low">
        The dated measurements the app shows under this card — observations with their sample and source, not predictions.
      </p>
      <StitchRule tone="faint" className="mt-4" />
      {order.map(lane => (
        <div key={lane} className="mt-6">
          <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-gold">{LANES[lane].chip}</p>
          <ul className="mt-1 divide-y divide-line">
            {groups.get(lane)!.map(row => (
              <li key={row.id} className="py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[15px] leading-snug text-hi">{row.headline}</p>
                  {row.value && <span className="tnum shrink-0 font-mono text-[12px] font-bold text-gold">{row.value}</span>}
                </div>
                {row.detail && <p className="mt-1.5 text-[13.5px] leading-relaxed text-mid">{row.detail}</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
