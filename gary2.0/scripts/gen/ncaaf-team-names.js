#!/usr/bin/env node
/**
 * Generate the app's college school names and ESPN scoreboard codes.
 * The checked-in source snapshot makes generation and CI checks deterministic.
 * --refresh fetches current ESPN codes and provider name aliases before writing.
 * --check compares generated Swift with the reviewed snapshot without credentials.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const OUT = new URL('../../../ios/GaryApp/NCAAFTeams.swift', import.meta.url).pathname;
const DATA = new URL('./data/ncaaf-scoreboard-teams.json', import.meta.url);
const CHECK = process.argv.includes('--check');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9&() ]+/g, '').replace(/\s+/g, ' ').trim();
let snapshot = JSON.parse(readFileSync(DATA, 'utf8'));
if (process.argv.includes('--refresh')) {
  if (CHECK) throw new Error('--check and --refresh cannot be combined');
  await import('../../src/loadEnv.js');
  const { getApiKey } = await import('../../src/services/ballDontLieService.js');
  const key = getApiKey();
  if (!key) throw new Error('BALLDONTLIE_API_KEY is required to refresh provider aliases');
  const get = async (url, headers = {}) => {
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(45_000) });
    if (!resp.ok) throw new Error(`Team source returned HTTP ${resp.status}`);
    return resp;
  };
  const [espn, provider, page] = await Promise.all([
    get(snapshot.sources.espn).then(r => r.json()),
    get(snapshot.sources.provider, { Authorization: key }).then(r => r.json()),
    get(snapshot.sources.fbs).then(r => r.text()),
  ]);
  snapshot = { ...snapshot, checkedOn: new Date().toISOString().slice(0, 10),
    fbsIds: [...new Set([...page.matchAll(/\/college-football\/team\/_\/id\/(\d+)/g)].map(m => m[1]))],
    espn: espn.sports[0].leagues[0].teams.map(({ team: t }) => ({
      id: t.id, school: t.location, name: t.displayName, shortName: t.shortDisplayName, abbr: t.abbreviation,
    })),
    provider: provider.data.map(t => ({ id: t.id, school: t.college, name: t.full_name, abbr: t.abbreviation })),
  };
}
if (snapshot.espn.length < 700 || snapshot.provider.length < 500 || snapshot.fbsIds.length < 130) {
  throw new Error('Incomplete team sources; refusing to replace the reviewed table');
}
const fbsIds = new Set(snapshot.fbsIds);
for (const id of fbsIds) {
  if (!snapshot.espn.some(t => t.id === id && t.abbr && t.school)) throw new Error(`Missing FBS scoreboard team ${id}`);
}
// Exact full names win over school aliases. Within bare names, the FBS school
// takes priority over a lower-division namesake (Charlotte, Troy). Otherwise
// ambiguous aliases are omitted instead of silently choosing a different team.
const candidates = new Map();
function add(name, value, priority) {
  const key = norm(name);
  if (!key) return;
  const prior = candidates.get(key);
  if (!prior || priority > prior.priority) candidates.set(key, { ...value, priority, ambiguous: false });
  else if (priority === prior.priority && (prior.school !== value.school || prior.abbr !== value.abbr)) prior.ambiguous = true;
}
for (const t of snapshot.espn) {
  if (!t.school || !t.abbr) continue;
  const value = { school: t.school, abbr: t.abbr };
  add(t.name, value, 30);
  add(t.school, value, fbsIds.has(t.id) ? 21 : 20);
  add(t.shortName, value, 10);
}
const unique = (rows) => {
  const identities = new Map(rows.map(t => [JSON.stringify([t.school, t.abbr]), t]));
  return identities.size === 1 ? [...identities.values()][0] : null;
};
let verifiedProviderTeams = 0;
const corrected = [];
const unverified = [];
for (const t of snapshot.provider) {
  if (!t.school) continue; // Mascot-only rows cannot identify a school.
  const match = unique(snapshot.espn.filter(e => norm(e.name) === norm(t.name)))
    ?? unique(snapshot.espn.filter(e => norm(e.school) === norm(t.school)))
    ?? unique(snapshot.espn.filter(e => norm(e.shortName) === norm(t.school)));
  const value = { school: match?.school ?? t.school, abbr: match?.abbr ?? '' };
  add(t.name, value, 30);
  add(t.school, value, 20);
  if (match) {
    verifiedProviderTeams++;
    if (match.abbr !== t.abbr) corrected.push({ team: t.name, provider: t.abbr, espn: match.abbr });
  } else unverified.push(t.name);
}
const entries = new Map([...candidates].filter(([, v]) => !v.ambiguous));
for (const t of snapshot.espn.filter(t => fbsIds.has(t.id))) {
  for (const name of [t.name, t.school]) {
    if (entries.get(norm(name))?.abbr !== t.abbr) throw new Error(`FBS alias mismatch: ${name}`);
  }
}
console.log(`Verified ${fbsIds.size} FBS teams; ${verifiedProviderTeams} provider teams matched ESPN; ${corrected.length} code differences corrected.`);
console.log(`${unverified.length} unmatched provider schools retain their name instead of an unverified code.`);
if (process.argv.includes('--audit')) console.log(JSON.stringify({ corrected, unverified }, null, 2));
if (process.argv.includes('--refresh')) writeFileSync(DATA, JSON.stringify(snapshot, null, 2) + '\n');

// Keep upstream codes available for joins against immutable stored cards.
// These are never used as the college display label.
const providerOverrides = new Map();
for (const t of snapshot.provider) {
  if (!t.school || !t.abbr) continue;
  for (const name of [t.name, t.school]) {
    const key = norm(name);
    if (entries.get(key)?.abbr === t.abbr) continue;
    if (providerOverrides.has(key) && providerOverrides.get(key) !== t.abbr) providerOverrides.set(key, null);
    else providerOverrides.set(key, t.abbr);
  }
}
const swiftString = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const lines = [...entries.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([key, v]) => `    ${swiftString(key)}: (school: ${swiftString(v.school)}, abbr: ${swiftString(v.abbr)}),`);

const swift = `import Foundation

// NCAAFTeams.swift — GENERATED, do not edit by hand.
//
// The college name table: the school without its mascot, and the scoreboard
// abbreviation, verified against ESPN scoreboard team data. Ball Don't Lie names
// are retained as feed aliases; unverified schools have no invented code.
// Source snapshot: gary2.0/scripts/gen/data/ncaaf-scoreboard-teams.json
// Refresh sources: node gary2.0/scripts/gen/ncaaf-team-names.js --refresh
//
// Regenerate: node gary2.0/scripts/gen/ncaaf-team-names.js
// Verify in CI/tests: node gary2.0/scripts/gen/ncaaf-team-names.js --check
//
// ${entries.size} name keys; ${snapshot.espn.length} ESPN teams, checked ${snapshot.checkedOn}.

enum NCAAFTeams {
    /// normalized name (accents and punctuation stripped, lowercased) →
    /// the school and its abbreviation.
    static let byName: [String: (school: String, abbr: String)] = [
${lines.join('\n')}
    ]

    /// The app's own normalizer — must match the generator's \`norm\`.
    static func key(_ name: String) -> String {
        let folded = name.folding(options: [.diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX")).lowercased()
        let kept = folded.unicodeScalars.filter { scalar in
            CharacterSet.alphanumerics.contains(scalar) || scalar == " " || scalar == "&" || scalar == "(" || scalar == ")"
        }
        return String(String.UnicodeScalarView(kept)).split(separator: " ").joined(separator: " ")
    }

    /// "San José State Spartans" → "San José State". nil when the school is
    /// not the provider's (an FCS opponent the feed spells its own way).
    static func school(_ name: String) -> String? { byName[key(name)]?.school }

    /// Provider codes are retained only for identity joins with existing server cards.
    private static let providerCodeOverrides: [String: String] = [
${[...providerOverrides].filter(([, code]) => code).sort((a, b) => a[0].localeCompare(b[0])).map(([name, code]) => `        ${swiftString(name)}: ${swiftString(code)},`).join('\n')}
    ]
    static func providerAbbreviation(_ name: String) -> String? {
        providerCodeOverrides[key(name)] ?? abbreviation(name)
    }

    /// Preserve official codes of any length, including already-abbreviated inputs.
    static let scoreboardCodes: Set<String> = [${[...new Set(snapshot.espn.map(t => t.abbr).filter(Boolean))].sort().map(swiftString).join(', ')}]

    /// "San José State Spartans" → "SJSU"; unknown names never become mascot prefixes.
    static func abbreviation(_ name: String) -> String? {
        if let entry = byName[key(name)], !entry.abbr.isEmpty { return entry.abbr }
        let code = name.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return scoreboardCodes.contains(code) ? code : nil
    }
}
`;

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== swift) {
    console.error('NCAAFTeams.swift is out of date — run: node scripts/gen/ncaaf-team-names.js');
    process.exit(1);
  }
  console.log(`NCAAFTeams.swift is current (${entries.size} keys).`);
  process.exit(0);
}

writeFileSync(OUT, swift);
console.log(`Wrote ${OUT} — ${entries.size} keys; ${snapshot.espn.length} ESPN teams.`);
