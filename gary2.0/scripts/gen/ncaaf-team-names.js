#!/usr/bin/env node
/**
 * Generates ios/GaryApp/NCAAFTeams.swift — the college name table the app
 * prints: the school without its mascot, and the provider's own abbreviation
 * (founder, Sep 4 2026: "we can just say the school name no mascot and use
 * standard ESPN abbreviations where applicable").
 *
 * The names are Ball Don't Lie's, never hand-typed: `college` is the school
 * and `abbreviation` is the scoreboard code (SJSU, EMU, FSU, M-OH). A curated
 * list would drift the first time a school rebranded.
 *
 *   node scripts/gen/ncaaf-team-names.js          # rewrite the Swift table
 *   node scripts/gen/ncaaf-team-names.js --check  # fail if it is out of date
 */
import '../../src/loadEnv.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { getApiKey } from '../../src/services/ballDontLieService.js';

const OUT = new URL('../../../ios/GaryApp/NCAAFTeams.swift', import.meta.url).pathname;
const CHECK = process.argv.includes('--check');

/** Accents and punctuation off, lowercased — the shape the app keys on. */
const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9&() ]+/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const teams = await (async () => {
  const key = getApiKey();
  if (!key) throw new Error('BALLDONTLIE_API_KEY is required to regenerate the college name table');
  const resp = await fetch('https://api.balldontlie.io/ncaaf/v1/teams?per_page=100', {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(45_000),
  });
  if (!resp.ok) throw new Error(`BDL college teams returned HTTP ${resp.status}`);
  const rows = (await resp.json())?.data ?? [];
  if (rows.length < 100) throw new Error(`BDL college teams returned only ${rows.length} rows — refusing to write a thin table`);
  return rows;
})();

// One entry per NAME the feed can hand us: the full name ("San José State
// Spartans") and the bare school ("San José State") both resolve.
const entries = new Map();
for (const t of teams) {
  const school = String(t?.college ?? '').trim();
  const abbr = String(t?.abbreviation ?? '').trim().toUpperCase();
  if (!school || !abbr) continue;
  for (const key of [t?.full_name, school]) {
    const k = norm(key);
    if (k && !entries.has(k)) entries.set(k, { school, abbr });
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
// abbreviation, both straight from Ball Don't Lie (\`college\` and
// \`abbreviation\`). Founder, Sep 4 2026: the game strip read "SAN JOSÉ STATE
// SPARTANS @ EASTERN MICHIGAN EAGLE…" and truncated — "we can just say the
// school name no mascot and use standard ESPN abbreviations where applicable".
//
// Regenerate: node gary2.0/scripts/gen/ncaaf-team-names.js
// Verify in CI/tests: node gary2.0/scripts/gen/ncaaf-team-names.js --check
//
// ${entries.size} keys, ${teams.length} teams from the provider.

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

    /// "San José State Spartans" → "SJSU".
    static func abbreviation(_ name: String) -> String? { byName[key(name)]?.abbr }
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
console.log(`Wrote ${OUT} — ${entries.size} keys from ${teams.length} provider teams.`);
