/**
 * WINNERS SELECTION SCORE v1 (founder GO, Aug 10 2026 — "any system right
 * now is better than none; do what you think is best and I'll tweak").
 *
 * A transparent, ledger-empirical rank for choosing the Winners-page picks —
 * computed OUTSIDE Gary, from what his pick classes have actually done:
 *
 *   score = trailing-30d win rate of the pick's shape class
 *         + 0.10 × (confidence − 0.59)
 *
 * The class prior does the work; Gary's compressed confidence (0.54-0.64
 * band, weekend spread 7-6 vs 16-16 — currently near-uninformative) is a
 * small tiebreak only. A class with fewer than 8 graded picks in the window
 * falls back to 0.5 — never let three results anoint or bury a class.
 *
 * Stored per pick as winners_class + winners_score; the app's slot chooser
 * can sort by it. Pure functions here; the runner owns the ledger fetch.
 */

/** Pick text → shape class. Null when the text carries no readable price. */
export function classOf(pickText) {
  const s = String(pickText || '');
  const rl = s.match(/([+-])1\.5/);
  if (rl) return rl[1] === '-' ? 'rl_lay' : 'rl_dog';
  const m = s.replace(/\(\s*([+-]\d{3,4})\s*\)/g, '$1').match(/([+-]\d{3,4})\s*$/);
  if (!m) return null;
  const odds = parseInt(m[1], 10);
  if (odds > 0) return 'ml_dog';
  if (odds >= -135) return 'ml_fav_light';
  return 'ml_fav_heavy';
}

/** Graded rows ({pick_text, result}) → { class: { won, lost } }. Won/lost only — pushes and voids stay out. */
export function classWinRates(rows) {
  const out = {};
  for (const r of rows || []) {
    const cls = classOf(r?.pick_text);
    const res = String(r?.result || '').toLowerCase();
    if (!cls || (res !== 'won' && res !== 'lost')) continue;
    out[cls] = out[cls] || { won: 0, lost: 0 };
    out[cls][res === 'won' ? 'won' : 'lost'] += 1;
  }
  return out;
}

const MIN_CLASS_SAMPLE = 8;

/** The score itself. Null only when the pick text has no class. */
export function winnersScore(pickText, confidence, rates) {
  const cls = classOf(pickText);
  if (!cls) return null;
  const r = rates?.[cls];
  const n = r ? r.won + r.lost : 0;
  const base = n >= MIN_CLASS_SAMPLE ? r.won / n : 0.5;
  const conf = confidence == null ? NaN : Number(confidence);
  const nudge = Number.isFinite(conf) ? 0.10 * (conf - 0.59) : 0;
  return Math.round((base + nudge) * 1000) / 1000;
}
