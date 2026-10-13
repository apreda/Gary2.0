/**
 * NFL venue environment (Aug 25 2026).
 *
 * The scout report has always carried a stadium NAME and nothing else, while
 * MLB got a full environment build — park class, roof state, wind. So a game
 * in a dome and a game in a Buffalo crosswind read identically to Gary, and
 * the grounding pass is instructed to omit weather entirely below 25 mph
 * sustained — which is well past the point where kicking and the deep ball
 * start to break.
 *
 * Roof semantics matter more than they look:
 *   'dome'        — fixed roof, weather is never a factor
 *   'retractable' — MAY be open or closed; the state is a game-day decision
 *                   this table cannot know, so lanes must say "retractable
 *                   (state unknown)" rather than assume either way
 *   'open'        — outdoor, weather applies
 *
 * Coordinates are stadium-accurate to within a few hundred metres, which is
 * far finer than weather resolution. Every one is cross-checked against the
 * elevation Open-Meteo returns for it (see tests) — a coordinate that landed
 * in the wrong city would show up immediately as a wrong elevation.
 */

export const NFL_VENUES = {
  'Arizona Cardinals':    { venue: 'State Farm Stadium',          lat: 33.5276, lon: -112.2626, roof: 'retractable', surface: 'grass', tz: 'America/Phoenix' },
  'Atlanta Falcons':      { venue: 'Mercedes-Benz Stadium',       lat: 33.7554, lon: -84.4008,  roof: 'retractable', surface: 'turf',  tz: 'America/New_York' },
  'Baltimore Ravens':     { venue: 'M&T Bank Stadium',            lat: 39.2780, lon: -76.6227,  roof: 'open',        surface: 'grass', tz: 'America/New_York' },
  'Buffalo Bills':        { venue: 'Highmark Stadium',            lat: 42.7738, lon: -78.7870,  roof: 'open',        surface: 'turf',  tz: 'America/New_York' },
  'Carolina Panthers':    { venue: 'Bank of America Stadium',     lat: 35.2258, lon: -80.8528,  roof: 'open',        surface: 'turf',  tz: 'America/New_York' },
  'Chicago Bears':        { venue: 'Soldier Field',               lat: 41.8623, lon: -87.6167,  roof: 'open',        surface: 'grass', tz: 'America/Chicago' },
  'Cincinnati Bengals':   { venue: 'Paycor Stadium',              lat: 39.0954, lon: -84.5160,  roof: 'open',        surface: 'turf',  tz: 'America/New_York' },
  'Cleveland Browns':     { venue: 'Cleveland Browns Stadium',    lat: 41.5061, lon: -81.6995,  roof: 'open',        surface: 'grass', tz: 'America/New_York' },
  'Dallas Cowboys':       { venue: 'AT&T Stadium',                lat: 32.7473, lon: -97.0945,  roof: 'retractable', surface: 'turf',  tz: 'America/Chicago' },
  'Denver Broncos':       { venue: 'Empower Field at Mile High',  lat: 39.7439, lon: -105.0201, roof: 'open',        surface: 'grass', tz: 'America/Denver' },
  'Detroit Lions':        { venue: 'Ford Field',                  lat: 42.3400, lon: -83.0456,  roof: 'dome',        surface: 'turf',  tz: 'America/New_York' },
  'Green Bay Packers':    { venue: 'Lambeau Field',               lat: 44.5013, lon: -88.0622,  roof: 'open',        surface: 'grass', tz: 'America/Chicago' },
  'Houston Texans':       { venue: 'NRG Stadium',                 lat: 29.6847, lon: -95.4107,  roof: 'retractable', surface: 'turf',  tz: 'America/Chicago' },
  'Indianapolis Colts':   { venue: 'Lucas Oil Stadium',           lat: 39.7601, lon: -86.1639,  roof: 'retractable', surface: 'turf',  tz: 'America/New_York' },
  'Jacksonville Jaguars': { venue: 'EverBank Stadium',            lat: 30.3239, lon: -81.6373,  roof: 'open',        surface: 'grass', tz: 'America/New_York' },
  'Kansas City Chiefs':   { venue: 'GEHA Field at Arrowhead',     lat: 39.0489, lon: -94.4839,  roof: 'open',        surface: 'grass', tz: 'America/Chicago' },
  'Las Vegas Raiders':    { venue: 'Allegiant Stadium',           lat: 36.0909, lon: -115.1833, roof: 'dome',        surface: 'grass', tz: 'America/Los_Angeles' },
  'Los Angeles Chargers': { venue: 'SoFi Stadium',                lat: 33.9535, lon: -118.3392, roof: 'dome',        surface: 'turf',  tz: 'America/Los_Angeles' },
  'Los Angeles Rams':     { venue: 'SoFi Stadium',                lat: 33.9535, lon: -118.3392, roof: 'dome',        surface: 'turf',  tz: 'America/Los_Angeles' },
  'Miami Dolphins':       { venue: 'Hard Rock Stadium',           lat: 25.9580, lon: -80.2389,  roof: 'open',        surface: 'grass', tz: 'America/New_York' },
  'Minnesota Vikings':    { venue: 'U.S. Bank Stadium',           lat: 44.9736, lon: -93.2575,  roof: 'dome',        surface: 'turf',  tz: 'America/Chicago' },
  'New England Patriots': { venue: 'Gillette Stadium',            lat: 42.0909, lon: -71.2643,  roof: 'open',        surface: 'turf',  tz: 'America/New_York' },
  'New Orleans Saints':   { venue: 'Caesars Superdome',           lat: 29.9511, lon: -90.0812,  roof: 'dome',        surface: 'turf',  tz: 'America/Chicago' },
  'New York Giants':      { venue: 'MetLife Stadium',             lat: 40.8135, lon: -74.0745,  roof: 'open',        surface: 'turf',  tz: 'America/New_York' },
  'New York Jets':        { venue: 'MetLife Stadium',             lat: 40.8135, lon: -74.0745,  roof: 'open',        surface: 'turf',  tz: 'America/New_York' },
  'Philadelphia Eagles':  { venue: 'Lincoln Financial Field',     lat: 39.9008, lon: -75.1675,  roof: 'open',        surface: 'grass', tz: 'America/New_York' },
  'Pittsburgh Steelers':  { venue: 'Acrisure Stadium',            lat: 40.4468, lon: -80.0158,  roof: 'open',        surface: 'grass', tz: 'America/New_York' },
  'San Francisco 49ers':  { venue: "Levi's Stadium",              lat: 37.4030, lon: -121.9698, roof: 'open',        surface: 'grass', tz: 'America/Los_Angeles' },
  'Seattle Seahawks':     { venue: 'Lumen Field',                 lat: 47.5952, lon: -122.3316, roof: 'open',        surface: 'turf',  tz: 'America/Los_Angeles' },
  'Tampa Bay Buccaneers': { venue: 'Raymond James Stadium',       lat: 27.9759, lon: -82.5033,  roof: 'open',        surface: 'grass', tz: 'America/New_York' },
  'Tennessee Titans':     { venue: 'Nissan Stadium',              lat: 36.1665, lon: -86.7713,  roof: 'open',        surface: 'turf',  tz: 'America/Chicago' },
  'Washington Commanders':{ venue: 'Northwest Stadium',           lat: 38.9076, lon: -76.8645,  roof: 'open',        surface: 'grass', tz: 'America/New_York' }
};

export function nflVenueFor(teamName) {
  if (!teamName) return null;
  if (NFL_VENUES[teamName]) return { team: teamName, ...NFL_VENUES[teamName] };
  // Tolerate "Detroit Lions " / nickname-only forms without guessing across
  // teams: require the full nickname to match exactly one entry.
  const wanted = String(teamName).trim().toLowerCase();
  const hits = Object.entries(NFL_VENUES).filter(([name]) => {
    const n = name.toLowerCase();
    return n === wanted || n.endsWith(` ${wanted}`) || wanted.endsWith(n);
  });
  return hits.length === 1 ? { team: hits[0][0], ...hits[0][1] } : null;
}

/** Weather only matters where weather can reach the field. */
export function weatherApplies(roof) {
  return roof === 'open' || roof === 'retractable';
}
