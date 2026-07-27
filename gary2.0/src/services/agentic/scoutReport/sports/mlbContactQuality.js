/**
 * CONTACT QUALITY (founder GO, Jul 27 2026): the slump-diagnosis layer.
 * Per-pitch Statcast from BDL plate_appearances, aggregated to facts a fan
 * argues with — is the 2-for-19 loud-contact unlucky or genuinely lost?
 *
 * Sourcing: one cached request per FINISHED game (immutable → long TTL at the
 * service); both teams' hitters aggregate from the same payloads, and a
 * starter's whiff-by-start reads from his own last starts' games. Facts only,
 * thin samples say nothing.
 */
import { ballDontLieService } from '../../../ballDontLieService.js';

const HARD_HIT_EV = 95;
const MIN_BIP = 8;        // balls in play before an EV average means anything
const MIN_SWINGS = 15;    // swings before a whiff% prints
const MIN_OOZ = 15;       // out-of-zone pitches before a chase% prints
const MIN_GAME_SWINGS = 10; // per-start floor for a whiff% point

/**
 * Aggregate hitter contact across a set of finished games.
 * @returns Map(batterId -> { bip, evSum, hardHit, barrels, swings, whiffs, oozSwings, oozPitches })
 */
export async function computeHitterContact({ gameIds = [], hitterIds = [] }) {
  const track = new Set(hitterIds.map(String));
  const out = new Map();
  await Promise.all([...new Set(gameIds)].map(async (gid) => {
    const pas = await ballDontLieService.getMlbPlateAppearances(gid).catch(() => []);
    for (const pa of pas || []) {
      const bid = String(pa.batter_id);
      if (!track.has(bid)) continue;
      const h = out.get(bid) || { bip: 0, evSum: 0, hardHit: 0, barrels: 0, swings: 0, whiffs: 0, oozSwings: 0, oozPitches: 0 };
      for (const pt of pa.pitches || []) {
        if (pt.is_swing) h.swings++;
        if (pt.is_whiff) h.whiffs++;
        if (pt.is_in_zone === false) { h.oozPitches++; if (pt.is_chase) h.oozSwings++; }
        if (pt.exit_velocity != null) {
          h.bip++;
          h.evSum += Number(pt.exit_velocity);
          if (Number(pt.exit_velocity) >= HARD_HIT_EV) h.hardHit++;
          if (pt.is_barrel) h.barrels++;
        }
      }
      out.set(bid, h);
    }
  }));
  return out;
}

/** "92.4 mph avg exit velo, 7 hard-hit, 2 barrels on 21 balls in play, whiff 24%, chase 31%" — or null.
 *  Never abbreviate exit velocity to "EV" — on a betting desk that reads as
 *  expected value (founder, Jul 27: no EV language anywhere). */
export function hitterContactLine(agg) {
  if (!agg || agg.bip < MIN_BIP) return null;
  const bits = [
    `${(agg.evSum / agg.bip).toFixed(1)} mph avg exit velo`,
    `${agg.hardHit} hard-hit`,
    `${agg.barrels} barrel${agg.barrels === 1 ? '' : 's'} on ${agg.bip} balls in play`,
  ];
  if (agg.swings >= MIN_SWINGS) bits.push(`whiff ${Math.round((agg.whiffs / agg.swings) * 100)}%`);
  if (agg.oozPitches >= MIN_OOZ) bits.push(`chase ${Math.round((agg.oozSwings / agg.oozPitches) * 100)}%`);
  return bits.join(', ');
}

/**
 * A starter's swinging-strike trend across his own recent starts:
 * "whiff% by start (oldest→newest): 22, 31, 28" — or null on thin data.
 */
export async function computePitcherWhiffByStart({ pitcherId, season, starts = 5 }) {
  if (pitcherId == null) return null;
  const chrono = await ballDontLieService.getMlbPlayerGameRowsChrono(pitcherId, season).catch(() => []);
  const startRows = (chrono || []).filter((r) => r?.ip != null && parseFloat(r.ip) > 0).slice(-starts);
  if (startRows.length < 2) return null;
  const pid = String(pitcherId);
  const points = [];
  for (const row of startRows) {
    const pas = await ballDontLieService.getMlbPlateAppearances(row.game_id).catch(() => []);
    let swings = 0, whiffs = 0;
    for (const pa of pas || []) {
      if (String(pa.pitcher_id) !== pid) continue;
      for (const pt of pa.pitches || []) {
        if (pt.is_swing) swings++;
        if (pt.is_whiff) whiffs++;
      }
    }
    if (swings >= MIN_GAME_SWINGS) points.push(Math.round((whiffs / swings) * 100));
  }
  return points.length >= 2 ? points.join(', ') : null;
}

export default { computeHitterContact, hitterContactLine, computePitcherWhiffByStart };
