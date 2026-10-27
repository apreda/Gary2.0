/**
 * Each NBA team's home arena by abbreviation: city, coordinates, time zone and, where it is high enough to matter, the
 * altitude (game records, Oct 27 2026: how far a team traveled to a game and how many time zones it crossed). A
 * game away from the home arena (a second home city, an international or neutral site) is not in the schedule feed,
 * so a record says the home arena's city.
 */
export const NBA_ARENAS = Object.freeze({
  ATL: { city: 'Atlanta', lat: 33.757, lon: -84.396, tz: 'America/New_York' },
  BOS: { city: 'Boston', lat: 42.366, lon: -71.062, tz: 'America/New_York' },
  BKN: { city: 'Brooklyn', lat: 40.683, lon: -73.975, tz: 'America/New_York' },
  CHA: { city: 'Charlotte', lat: 35.225, lon: -80.839, tz: 'America/New_York' },
  CHI: { city: 'Chicago', lat: 41.881, lon: -87.674, tz: 'America/Chicago' },
  CLE: { city: 'Cleveland', lat: 41.496, lon: -81.688, tz: 'America/New_York' },
  DAL: { city: 'Dallas', lat: 32.790, lon: -96.810, tz: 'America/Chicago' },
  DEN: { city: 'Denver', lat: 39.749, lon: -105.008, tz: 'America/Denver', altitudeFt: 5280 },
  DET: { city: 'Detroit', lat: 42.341, lon: -83.055, tz: 'America/New_York' },
  GSW: { city: 'San Francisco', lat: 37.768, lon: -122.388, tz: 'America/Los_Angeles' },
  HOU: { city: 'Houston', lat: 29.751, lon: -95.362, tz: 'America/Chicago' },
  IND: { city: 'Indianapolis', lat: 39.764, lon: -86.155, tz: 'America/Indiana/Indianapolis' },
  LAC: { city: 'Inglewood', lat: 33.945, lon: -118.343, tz: 'America/Los_Angeles' },
  LAL: { city: 'Los Angeles', lat: 34.043, lon: -118.267, tz: 'America/Los_Angeles' },
  MEM: { city: 'Memphis', lat: 35.138, lon: -90.051, tz: 'America/Chicago' },
  MIA: { city: 'Miami', lat: 25.781, lon: -80.188, tz: 'America/New_York' },
  MIL: { city: 'Milwaukee', lat: 43.045, lon: -87.917, tz: 'America/Chicago' },
  MIN: { city: 'Minneapolis', lat: 44.979, lon: -93.276, tz: 'America/Chicago' },
  NOP: { city: 'New Orleans', lat: 29.949, lon: -90.082, tz: 'America/Chicago' },
  NYK: { city: 'New York', lat: 40.750, lon: -73.993, tz: 'America/New_York' },
  OKC: { city: 'Oklahoma City', lat: 35.463, lon: -97.515, tz: 'America/Chicago' },
  ORL: { city: 'Orlando', lat: 28.539, lon: -81.384, tz: 'America/New_York' },
  PHI: { city: 'Philadelphia', lat: 39.901, lon: -75.172, tz: 'America/New_York' },
  PHX: { city: 'Phoenix', lat: 33.446, lon: -112.071, tz: 'America/Phoenix' },
  POR: { city: 'Portland', lat: 45.532, lon: -122.667, tz: 'America/Los_Angeles' },
  SAC: { city: 'Sacramento', lat: 38.580, lon: -121.500, tz: 'America/Los_Angeles' },
  SAS: { city: 'San Antonio', lat: 29.427, lon: -98.438, tz: 'America/Chicago' },
  TOR: { city: 'Toronto', lat: 43.643, lon: -79.379, tz: 'America/Toronto' },
  UTA: { city: 'Salt Lake City', lat: 40.768, lon: -111.901, tz: 'America/Denver', altitudeFt: 4226 },
  WAS: { city: 'Washington', lat: 38.898, lon: -77.021, tz: 'America/New_York' },
});

// Cities that host NBA games away from a team's arena (a second home city, international and Cup sites), for the trip
// to and from them. A venue in none of these or the arenas has no miles on file.
export const NBA_OTHER_SITES = Object.freeze({
  Austin: { lat: 30.282, lon: -97.732, tz: 'America/Chicago' },
  'Mexico City': { lat: 19.490, lon: -99.180, tz: 'America/Mexico_City', altitudeFt: 7350 },
  'Las Vegas': { lat: 36.103, lon: -115.178, tz: 'America/Los_Angeles' },
  Paris: { lat: 48.838, lon: 2.378, tz: 'Europe/Paris' },
  London: { lat: 51.503, lon: 0.003, tz: 'Europe/London' },
  Berlin: { lat: 52.505, lon: 13.443, tz: 'Europe/Berlin' },
  'Abu Dhabi': { lat: 24.470, lon: 54.600, tz: 'Asia/Dubai' },
  'Kansas City': { lat: 39.097, lon: -94.580, tz: 'America/Chicago' },
  Seattle: { lat: 47.622, lon: -122.354, tz: 'America/Los_Angeles' },
});
const CITY_OF = Object.fromEntries([...Object.values(NBA_ARENAS).map((a) => [a.city, a]), ['New York', NBA_ARENAS.NYK], ['Los Angeles', NBA_ARENAS.LAL], ['Inglewood', NBA_ARENAS.LAC], ['Brooklyn', NBA_ARENAS.BKN]]);
/** Where a city is, for a venue's city: an arena city or another host city, or null. */
export const placeOf = (city) => CITY_OF[city] || NBA_OTHER_SITES[city] || null;

/** Miles between two arenas (great-circle). */
export function milesBetween(a, b) {
  if (!a || !b) return null;
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return Math.round(3958.8 * 2 * Math.asin(Math.sqrt(h)));
}

/** A time zone's offset from UTC in hours on a date. */
export function utcOffsetHours(tz, at) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date(at));
  const m = (parts.find((p) => p.type === 'timeZoneName')?.value || '').match(/GMT([+-]\d+)(?::(\d+))?/);
  return m ? Number(m[1]) + (m[2] ? Math.sign(Number(m[1])) * Number(m[2]) / 60 : 0) : 0;
}
