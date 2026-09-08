export type PickAlert = {
  key: string; legacyKey: string; expiresAt: string;
  title: string; body: string; data: Record<string, string>;
};
const sports = new Set(['MLB', 'NFL', 'NCAAF', 'NBA']);
const terminal = new Set(['sent', 'unknown', 'dead', 'expired', 'abandoned']);
export const terminalPushState = (status: string) => terminal.has(status);
const easternDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

export function nflWeek(date: string) {
  const day = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) throw new Error('Invalid slate date');
  const season = day.getUTCFullYear() - (day.getUTCMonth() < 7 ? 1 : 0);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() - 2 + 7) % 7);
  return { weekStart: day.toISOString().slice(0, 10), season };
}

export function mergeAlertSources(daily: unknown[], weekly: unknown[]): unknown[] {
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
  const dailyPicks = daily.filter(value => object(value) && String(value.league ?? '').toUpperCase() !== 'NFL');
  const nflPicks = weekly.filter(object).map(pick => ({ ...pick, league: pick.league ?? 'NFL' }))
    .filter(pick => String(pick.league).toUpperCase() === 'NFL');
  return [...dailyPicks, ...nflPicks];
}

/** Public game picks are free. The Winners admission/access system is separate. */
export function pickAlerts(picks: unknown[], date: string, now: number): PickAlert[] {
  const unique = new Map<string, PickAlert>();
  for (const value of picks) {
    if (!value || typeof value !== 'object') continue;
    const row = value as Record<string, unknown>;
    if (row.game_id != null && row.bdl_game_id != null && String(row.game_id) !== String(row.bdl_game_id)) continue;
    const p: Record<string, unknown> = { ...row, game_id: row.game_id ?? row.bdl_game_id,
      awayTeam: row.awayTeam ?? row.away_team, homeTeam: row.homeTeam ?? row.home_team };
    const league = typeof p.league === 'string' ? p.league.toUpperCase() : '';
    const boardDate = typeof p._alertDate === 'string' ? p._alertDate : date;
    const id = String(p.game_id ?? '');
    const start = typeof p.commence_time === 'string' && /T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(p.commence_time)
      ? Date.parse(p.commence_time) : NaN;
    if (!sports.has(league) || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))
      || !Number.isFinite(start) || start <= now
      || (league === 'NCAAF' ? ncaafSlateDateForInstant(start) !== boardDate
        : boardDate !== date || easternDay.format(new Date(start)) !== boardDate)
      || p.type === 'prop' || p.pickType === 'prop'
      || typeof p.pick !== 'string' || !p.pick.trim()
      || typeof p.awayTeam !== 'string' || !p.awayTeam.trim()
      || typeof p.homeTeam !== 'string' || !p.homeTeam.trim()) continue;
    const key = `${boardDate}|${league}|${id}|game`;
    unique.set(key, {
      key, legacyKey: `${boardDate}|${p.league}|${p.awayTeam}@${p.homeTeam}|${p.pick}`,
      expiresAt: new Date(start).toISOString(),
      title: `${league} pick is ready`,
      body: `${p.awayTeam} @ ${p.homeTeam}: see Gary's pick and the reasoning.`,
      data: { destination: 'picks', league, game_id: id, game_date: boardDate, matchup: `${p.awayTeam} @ ${p.homeTeam}` },
    });
  }
  return [...unique.values()];
}

export type PushOutcome = { status: 'sent' | 'failed' | 'unknown' | 'dead' | 'expired'; httpStatus: number | null };

export function pushMessage(token: string, alert: PickAlert) {
  return { message: { token, notification: { title: alert.title, body: alert.body }, data: alert.data,
    apns: { headers: { 'apns-expiration': String(Math.floor(Date.parse(alert.expiresAt) / 1000)),
      'apns-collapse-id': `${alert.data.game_date}|${alert.data.league}|${alert.data.game_id}` },
      payload: { aps: { sound: 'default' } } },
  } };
}

/** FCM acceptance is not device delivery. Transport ambiguity never retries. */
export async function deliverPickAlert(project: string, access: string, token: string, alert: PickAlert,
  request: typeof fetch = fetch, now: () => number = Date.now): Promise<PushOutcome> {
  if (Date.parse(alert.expiresAt) <= now()) return { status: 'expired', httpStatus: null };
  try {
    const response = await request(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pushMessage(token, alert)), signal: AbortSignal.timeout(8000),
    });
    if (response.ok) return { status: 'sent', httpStatus: response.status };
    const payload = await response.json().catch(() => null);
    // HTTP 404 alone can mean a wrong project. Only FCM's explicit token error
    // justifies deactivating a device; invalid credentials must not erase it.
    const dead = payload?.error?.details?.some((item: Record<string, unknown>) =>
      item['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError' && item.errorCode === 'UNREGISTERED');
    return { status: dead ? 'dead' : 'failed', httpStatus: response.status };
  } catch {
    return { status: 'unknown', httpStatus: null };
  }
}

export async function deviceKey(token: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
}

export function authorizedPushRequest(request: Request, serviceKey: string): boolean {
  return !!serviceKey && request.headers.get('authorization') === `Bearer ${serviceKey}`;
}
import { ncaafSlateDateForInstant } from '../_shared/ncaafKickoff.js';
