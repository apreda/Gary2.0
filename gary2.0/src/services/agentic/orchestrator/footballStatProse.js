/**
 * Football tool results as sentences a fan reads (founder, Sep 9 2026: the
 * NE @ SEA card recited "0.0896 sack rate" and "-0.199 EPA/play" straight
 * from JSON tool dumps, while the MLB desk hands Gary readable text).
 *
 * The routers' payloads are nested objects of rates, counts and notes. This
 * renders every field as a labeled phrase — rates as percentages, EPA as
 * signed points per play, seconds as seconds — and keeps the router's own
 * category, basis, scope and reading note as plain lines. Nothing is dropped
 * and nothing is invented: a null stays "not available", a rank appears only
 * when the router supplied one.
 */

const RATE_KEY = /(^|_)(rate|pct|percentage|share|prob)(_|$)|rate_over_expected/i;
const EPA_KEY = /epa/i;
const SECONDS_KEY = /(seconds|_sec)$/i;
const NOTE_KEYS = new Set(['category', 'data_scope', 'basis', 'reading_note', 'charting_note', 'source', 'season', 'sample', 'coverage', 'note', 'limitation', 'limitations', 'unavailable_reason']);

const words = (key) => String(key).replace(/_/g, ' ').replace(/\bqb\b/gi, 'QB').replace(/\bepa\b/gi, 'EPA').replace(/\bpct\b/gi, 'pct').trim();

export function formatFootballValue(key, value) {
  if (value == null || value === '') return 'not available';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') {
    // Keep familiar display units and retain the exact source value whenever
    // rounding would lose precision. IDs and counts are never rounded.
    const exact = (display, rounded) => Number(rounded) === value ? display : `${display} (source value ${value})`;
    if (RATE_KEY.test(key) && Math.abs(value) <= 1) return exact(`${(value * 100).toFixed(1)}%`, Number((value * 100).toFixed(1)) / 100);
    if (RATE_KEY.test(key)) return exact(`${value.toFixed(1)}%`, value.toFixed(1));
    if (EPA_KEY.test(key)) return exact(`${value >= 0 ? '+' : ''}${value.toFixed(2)} points per play`, value.toFixed(2));
    if (SECONDS_KEY.test(key)) return exact(`${value.toFixed(2)} s`, value.toFixed(2));
    return String(value);
  }
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (!value.length) return 'none listed';
    return value.map((item) => (item && typeof item === 'object' ? renderObjectInline(item) : formatFootballValue(key, item))).join('; ');
  }
  if (typeof value === 'object') return renderObjectInline(value);
  return String(value);
}

function renderObjectInline(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ['team', 'player', 'name'].includes(k) && typeof v === 'string' ? v : `${words(k)} ${formatFootballValue(k, v)}`)
    .join(', ');
}

function renderSide(label, side) {
  if (!side || typeof side !== 'object') return `${label}: ${formatFootballValue('', side)}`;
  const lines = [`${label}${side.team ? ` (${formatFootballValue('team', side.team)})` : ''}:`];
  for (const [k, v] of Object.entries(side)) {
    if (k === 'team' || v === undefined) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      lines.push(`  ${words(k)}:`);
      for (const [k2, v2] of Object.entries(v)) lines.push(`    ${words(k2)}: ${formatFootballValue(k2, v2)}`);
      continue;
    }
    lines.push(`  ${words(k)}: ${formatFootballValue(k, v)}`);
  }
  return lines.join('\n');
}

/** The whole tool result as prose blocks; home/away order is the caller's. */
export function renderFootballStat(statToken, statResult, homeTeam, awayTeam, { homeFirst = true } = {}) {
  const { home, away, ...context } = statResult || {};
  const notes = [];
  const rest = [];
  for (const [k, v] of Object.entries(context)) {
    if (NOTE_KEYS.has(k)) notes.push(`${words(k)}: ${formatFootballValue(k, v)}`);
    else rest.push(`${words(k)}: ${formatFootballValue(k, v)}`);
  }
  const sides = [renderSide(homeTeam, home), renderSide(awayTeam, away)];
  if (!homeFirst) sides.reverse();
  return [`${statToken}:`, ...notes, ...sides, ...rest].join('\n');
}

export default { renderFootballStat, formatFootballValue };
