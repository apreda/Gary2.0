/**
 * League-wide articles on a one-game desk (founder, Sep 24 2026: "clean up
 * the oversized desk").
 *
 * The topic finder often lands on a league-wide piece — the 32-team power
 * rankings, "what we learned from every Sunday game", the QB index, division
 * rankings — and the desk printed all of it: 15–50K characters per article,
 * nearly all about other teams. A team-specific article still prints whole.
 * An article that names many franchises prints only the passages about the
 * teams this topic is about, in the publisher's own words and order.
 */

const NFL_TEAMS = [
  ['Arizona', 'Cardinals'], ['Atlanta', 'Falcons'], ['Baltimore', 'Ravens'], ['Buffalo', 'Bills'],
  ['Carolina', 'Panthers'], ['Chicago', 'Bears'], ['Cincinnati', 'Bengals'], ['Cleveland', 'Browns'],
  ['Dallas', 'Cowboys'], ['Denver', 'Broncos'], ['Detroit', 'Lions'], ['Green Bay', 'Packers'],
  ['Houston', 'Texans'], ['Indianapolis', 'Colts'], ['Jacksonville', 'Jaguars'], ['Kansas City', 'Chiefs'],
  ['Las Vegas', 'Raiders'], ['Los Angeles', 'Chargers'], ['Los Angeles', 'Rams'], ['Miami', 'Dolphins'],
  ['Minnesota', 'Vikings'], ['New England', 'Patriots'], ['New Orleans', 'Saints'], ['New York', 'Giants'],
  ['New York', 'Jets'], ['Philadelphia', 'Eagles'], ['Pittsburgh', 'Steelers'], ['San Francisco', '49ers'],
  ['Seattle', 'Seahawks'], ['Tampa Bay', 'Buccaneers'], ['Tennessee', 'Titans'], ['Washington', 'Commanders'],
];

// An article naming at least this many franchises is league-wide.
export const LEAGUE_WIDE_TEAM_COUNT = 10;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SHARED_CITIES = new Set(['Los Angeles', 'New York']);

/** Every way a passage can name this team: nickname, full name, a city no other club shares. */
function namePatterns(teamName) {
  const name = String(teamName || '').trim();
  const team = NFL_TEAMS.find(([city, nick]) => name === `${city} ${nick}` || name.endsWith(` ${nick}`) || name === nick);
  if (!team) return name ? [new RegExp(`\\b${escape(name)}\\b`, 'i')] : [];
  const [city, nick] = team;
  const forms = [nick, `${city} ${nick}`];
  if (!SHARED_CITIES.has(city)) forms.push(city);
  if (nick === 'Buccaneers') forms.push('Bucs');
  return forms.map((form) => new RegExp(`\\b${escape(form)}\\b`, 'i'));
}

// A franchise is named by its nickname or by a city no other club shares
// ("Green Bay was the better team", "New England's meltdown").
const ALL_FRANCHISES = NFL_TEAMS.map(([city, nick]) => ({
  nick,
  pattern: new RegExp(`\\b(?:${escape(nick)}${SHARED_CITIES.has(city) ? '' : `|${escape(city)}`})\\b`, 'i'),
}));

export function franchisesNamed(text) {
  return new Set(ALL_FRANCHISES.filter(({ pattern }) => pattern.test(text)).map(({ nick }) => nick));
}

// Sentences, including ones a publisher's blocks ran together without a space
// ("…the football, though.Rank15Rank increased by11It was…").
function sentences(text) {
  return String(text || '')
    .split(/(?<=[.!?]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])|(?<=[a-z0-9][.!?])(?=[A-Z])|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * The passages of a league-wide article about `teams`, or null when the
 * article is team-specific and prints whole. A sentence naming one of these
 * teams is kept; a sentence naming no franchise continues the entry before
 * it; a sentence naming only other franchises closes that entry.
 */
export function leagueWideExcerpt(body, teams = []) {
  if (franchisesNamed(body).size < LEAGUE_WIDE_TEAM_COUNT) return null;
  const ours = teams.flatMap(namePatterns);
  if (!ours.length) return '';
  const kept = [];
  let following = false;
  for (const sentence of sentences(body)) {
    const namesOurs = ours.some((pattern) => pattern.test(sentence));
    if (namesOurs) { kept.push(sentence); following = true; continue; }
    if (franchisesNamed(sentence).size) { following = false; continue; }
    if (following) kept.push(sentence);
  }
  return kept.join(' ');
}
