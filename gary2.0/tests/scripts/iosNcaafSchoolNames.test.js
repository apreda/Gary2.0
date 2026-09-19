import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = name => readFileSync(new URL(`../../../ios/GaryApp/${name}.swift`, import.meta.url), 'utf8');
const hasSwift = spawnSync('swift', ['--version']).status === 0;
function declaration(text, signature) {
  const start = text.indexOf(signature);
  if (start < 0) throw new Error(`Missing ${signature}`);
  let end = text.indexOf('{', start) + 1, depth = 1;
  while (depth && end < text.length) {
    if (text[end] === '{') depth++;
    if (text[end] === '}') depth--;
    end++;
  }
  return text.slice(start, end);
}

describe('NCAAF school names on native pick cards', () => {
  it.skipIf(!hasSwift)('executes the app and share card formatters without mascots, school truncation or identity changes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-ncaaf-school-cards-'));
    try {
      const formatters = source('PickDetailSections');
      const cards = source('PickCards');
      const shares = source('ShareCards').split('struct HeadlineShareCardView: View {')[1];
      const splitStart = formatters.indexOf('    static func splitPickAndOdds(');
      const formatterTail = formatters.slice(splitStart, formatters.indexOf('\n}', splitStart));
      const mascots = formatters.slice(formatters.indexOf('    static let twoWordMascots = ['), formatters.indexOf('\n    /// A college pick'));
      const cardProperties = ['private var awayName:', 'private var homeName:', 'private var pickParts:', 'private var pickedSideLower:', 'private func sideIsPicked(', 'private var awayIsPicked:', 'private var homeIsPicked:', 'private var heroLines:', 'private var ncaafOpponentLine:']
        .map(signature => declaration(cards, signature).replace(/^private /, '')).join('\n');
      const swift = `${source('NCAAFTeams')}
enum AppFlags {
 static let storeSafe = false
 static func bridgePickText(_ text: String) -> String { text }
}
enum Formatters {
 ${mascots}
 ${declaration(formatters, 'static func shortTeamName(')}
 ${declaration(formatters, 'private static func collegeSchoolName(')}
 ${formatterTail}
}
struct BookOdds { var spread: Double? }
struct GaryPick {
 var pick: String?, league: String? = "NCAAF", type: String? = "spread"
 var awayTeam: String? = "Coastal Carolina Chanticleers", homeTeam: String? = "Delaware Blue Hens"
 var spread: Double? = nil, sportsbook_odds: [BookOdds]? = nil
}
${declaration(cards, 'extension GaryPick {')}
struct NativeCard {
 var pick: GaryPick
 var isNCAAF: Bool { pick.league == "NCAAF" }
 var homeSeedTag: String? = nil, awaySeedTag: String? = nil
 var isRankedMatchup: Bool { homeSeedTag != nil || awaySeedTag != nil }
 var totalNoun: String { "POINTS" }
 func metaTeamAbbrev(homeSide: Bool) -> String {
   NCAAFTeams.abbreviation((homeSide ? pick.homeTeam : pick.awayTeam) ?? "") ?? ""
 }
 ${cardProperties}
}
struct SharedCard {
 var pick: GaryPick
 var pickParts: (pick: String, odds: String) { pick.formattedPickParts }
 ${declaration(shares, 'private var heroLines:').replace(/^private /, '')}
}
let call = "Coastal Carolina Chanticleers +4.5 -105"
let pick = GaryPick(pick: call)
precondition(pick.formattedPickParts == ("Coastal Carolina +4.5", "-105"))
precondition(NativeCard(pick: pick).heroLines == "COASTAL CAROLINA\\n+4.5")
precondition(NativeCard(pick: pick).ncaafOpponentLine == "@ Delaware")
precondition(SharedCard(pick: pick).heroLines == "COASTAL\\nCAROLINA\\n+4.5")
precondition(pick.pick == call && pick.awayTeam == "Coastal Carolina Chanticleers" && pick.homeTeam == "Delaware Blue Hens")
let home = GaryPick(pick: "Delaware Blue Hens ML +105", type: "moneyline")
precondition(NativeCard(pick: home).heroLines == "DELAWARE\\nMONEYLINE")
precondition(NativeCard(pick: home).ncaafOpponentLine == "vs Coastal Carolina")
let total = GaryPick(pick: "Under 48.5 -110", type: "total")
precondition(total.formattedPickParts == ("Under 48.5", "-110"))
precondition(NativeCard(pick: total).ncaafOpponentLine == "Coastal Carolina @ Delaware")
for (input, school) in [
 ("Coastal Carolina Chanticleers", "Coastal Carolina"), ("Delaware Blue Hens", "Delaware"),
 ("Ohio State Buckeyes", "Ohio State"), ("Ohio Bobcats", "Ohio"),
 ("Miami (OH) RedHawks", "Miami (OH)"), ("Miami Hurricanes", "Miami"),
 ("Michigan State Spartans", "Michigan State"), ("Michigan Wolverines", "Michigan"),
 ("Boston College Eagles", "Boston College"), ("San José State Spartans", "San José State")
] {
 precondition(Formatters.shortTeamName(input, league: "NCAAF") == school)
 precondition(Formatters.splitPickAndOdds(input + " +4.5 -105", league: "NCAAF") == (school + " +4.5", "-105"), input)
}
// Every reviewed full-name alias takes its exact school; shared words and
// pro-city names cannot erase a campus qualifier or leave a mascot behind.
for (name, entry) in NCAAFTeams.byName {
 precondition(Formatters.splitPickAndOdds(name + " ML -110", league: "NCAAF") == (entry.school + " ML", "-110"), name)
}
precondition(Formatters.splitPickAndOdds("Miami Lakes University +4.5 -105", league: "NCAAF") == ("Miami Lakes University +4.5", "-105"))
precondition(Formatters.splitPickAndOdds("Ohio State Buckeyes spread +4.5 -105", league: "ncaaf") == ("Ohio State +4.5", "-105"))
precondition(Formatters.splitPickAndOdds("Miami Dolphins +4.5 -105", league: "NFL") == ("Dolphins +4.5", "-105"))
precondition(Formatters.splitPickAndOdds("Toronto Blue Jays -1.5 +150", league: "MLB") == ("Blue Jays -1.5", "+150"))
print("PASS: native and shared school names; exact campus aliases, prices and identities preserved")
`;
      const path = join(directory, 'main.swift');
      writeFileSync(path, swift);
      expect(execFileSync('swift', [path], { encoding: 'utf8', timeout: 60_000 })).toContain('PASS: native and shared school names');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 70_000);
});
