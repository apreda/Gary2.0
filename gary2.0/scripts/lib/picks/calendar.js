import { easternDate } from '../../../supabase/functions/_shared/dateKeys.js';
import { ncaafSlateDateForInstant } from '../../../src/services/ncaafGamePolicy.js';

/** An exact kickoff follows its league's existing playing-date policy. */
export function pickGameDate(league, value) {
  if (value == null || value === '' || /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const instant = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  return ['NCAAF', 'americanfootball_ncaaf'].includes(league)
    ? ncaafSlateDateForInstant(instant)
    : easternDate(instant);
}
