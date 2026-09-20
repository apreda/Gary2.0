import { getESTDate as getETDateStr, shiftDateKey as addDaysISO } from '../../src/utils/dateUtils.js';


export function getTodayETDateStr() {
  return getETDateStr(new Date());
}

export function getTomorrowETDateStr() {
  return addDaysISO(getTodayETDateStr(), 1);
}

/** Resolve scheduler wall-clock targets (currently 5AM ET) across DST.
 * Callers must not use ambiguous/nonexistent DST-transition hours. */
export function instantForETDate(etDateStr, hourET, minuteET) {
  // Start with a candidate UTC instant assuming ET is UTC-5, then correct.
  let candidate = new Date(`${etDateStr}T${String(hourET).padStart(2, '0')}:${String(minuteET).padStart(2, '0')}:00Z`);
  // Loop twice to settle DST boundaries (one correction is enough except at
  // the spring-forward instant; two is bulletproof).
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).formatToParts(candidate);
    const obj = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const civilET = `${obj.year}-${obj.month}-${obj.day}T${obj.hour === '24' ? '00' : obj.hour}:${obj.minute}:${obj.second}`;
    const targetCivil = `${etDateStr}T${String(hourET).padStart(2, '0')}:${String(minuteET).padStart(2, '0')}:00`;
    const driftMs = new Date(targetCivil + 'Z').getTime() - new Date(civilET + 'Z').getTime();
    if (driftMs === 0) break;
    candidate = new Date(candidate.getTime() + driftMs);
  }
  return candidate;
}
