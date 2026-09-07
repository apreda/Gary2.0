import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const source = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const snapshot = JSON.parse(readFileSync(new URL('../../scripts/gen/data/ncaaf-scoreboard-teams.json', import.meta.url)));
const picks = source('PicksTab.swift'), shares = source('ShareCards.swift');
const hasSwift = spawnSync('swift', ['--version']).status === 0;
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9&() ]+/g, '').replace(/\s+/g, ' ').trim();
const byName = new Map([...source('NCAAFTeams.swift').matchAll(/^ {4}"([^"]+)": \(school: "([^"]+)", abbr: "([^"]*)"\),$/gm)].map(m => [m[1], { school: m[2], abbr: m[3] }]));
function declaration(text, signature) {
  const start = text.indexOf(signature);
  if (start < 0) throw new Error(`Missing ${signature}`);
  let i = text.indexOf('{', start) + 1, depth = 1;
  while (depth && i < text.length) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    i++;
  }
  return text.slice(start, i);
}
describe('ESPN college scoreboard abbreviations', () => {
  it('regenerates from the reviewed snapshot without network access', () => {
    expect(execFileSync(process.execPath, [new URL('../../scripts/gen/ncaaf-team-names.js', import.meta.url).pathname, '--check'], { encoding: 'utf8' })).toContain('NCAAFTeams.swift is current');
  });
  it('covers every FBS school and every unambiguous ESPN full team name', () => {
    expect(snapshot.fbsIds.length).toBe(138);
    for (const id of snapshot.fbsIds) {
      const t = snapshot.espn.find(t => t.id === id);
      expect(t, id).toBeDefined();
      for (const name of [t.name, t.school]) expect(byName.get(norm(name))?.abbr, name).toBe(t.abbr);
    }
    for (const t of snapshot.espn) {
      if (!t.school || !t.abbr) continue;
      const identities = new Set(snapshot.espn.filter(e => norm(e.name) === norm(t.name)).map(e => `${e.school}|${e.abbr}`));
      if (identities.size === 1) expect(byName.get(norm(t.name))?.abbr, t.name).toBe(t.abbr);
    }
  });
  it.skipIf(!hasSwift)('executes all FBS names through actual Home/Picks/share formatting and chip labels', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-scoreboard-'));
    try {
      const maps = picks.slice(picks.indexOf('let mlbTeamKeywords:'), picks.indexOf('/// Reverse keyword index'));
      const helpers = ['func teamAbbrevFromName(', 'func scoreboardTeamAbbreviation(', 'func finalScoreLine('].map(s => declaration(picks, s)).join('\n');
      const home = declaration(source('HomeView.swift'), '    private static func teamAbbrev(').replace('private static func teamAbbrev', 'func homeTeamAbbrev');
      const fbs = snapshot.espn.filter(t => snapshot.fbsIds.includes(t.id));
      const checks = fbs.flatMap(t => [t.name, t.school, t.abbr].map(name => `
precondition(homeTeamAbbrev(${JSON.stringify(name)}, league: "NCAAF") == ${JSON.stringify(t.abbr)})
precondition(scoreboardTeamAbbreviation(${JSON.stringify(name)}, league: "NCAAF") == ${JSON.stringify(t.abbr)})
precondition(teamChipStyle(team: ${JSON.stringify(name)}, league: "NCAAF", abbreviation: "WRONG").label == ${JSON.stringify(t.abbr)})`)).join('\n');
      const script = `${source('NCAAFTeams.swift')}\n${maps}\n${helpers}\n${home}
// Color stubs isolate the actual chip label function from platform rendering.
struct Color { init(hex: String) {} }
struct Sport { static func from(league: String?) -> Sport { Sport() }; var accentColor: Color { Color(hex: "") } }
let mlbTeamColors: [String: String] = [:], nbaTeamColors: [String: String] = [:]
let nhlTeamColors: [String: String] = [:], wcTeamColors: [String: String] = [:]
${declaration(shares, 'func teamChipStyle(')}
${checks}
struct GaryPick {
    var homeTeam: String?, awayTeam: String?, homeTeamAbbreviation: String?, awayTeamAbbreviation: String?, league: String?
    var formattedPickParts: (pick: String, odds: String)
}
${declaration(shares, 'func compactSharePick(')}
let ticket = GaryPick(homeTeam: "Florida State Seminoles", awayTeam: "SMU Mustangs", homeTeamAbbreviation: "FLA", awayTeamAbbreviation: "MUS", league: "NCAAF", formattedPickParts: ("Florida State Seminoles +2.5", "-110"))
precondition(compactSharePick(pick: ticket, awayPicked: false, homePicked: true, awayShort: "SMU", homeShort: "Florida State") == "FSU +2.5")
precondition(scoreboardTeamAbbreviation("Florida State Seminoles", stored: "FLA", league: "NCAAF") == "FSU")
precondition(scoreboardTeamAbbreviation("SMU Mustangs", stored: "MUS", league: "NCAAF") == "SMU")
precondition(scoreboardTeamAbbreviation("Butler Bulldogs", stored: "BUT", league: "NCAAF") == "BTLR")
precondition(teamAbbrevFromName("Florida Panthers", league: "NHL") == "FLA")
precondition(teamAbbrevFromName("Carolina Panthers", league: "NFL") == "CAR")
precondition(teamAbbrevFromName("Pittsburgh Panthers", league: "NCAAF") == "PITT")
precondition(teamAbbrevFromName("Ohio State Buckeyes", league: "NCAAF") == "OSU")
precondition(teamAbbrevFromName("Ohio Bobcats", league: "NCAAF") == "OHIO")
precondition(teamAbbrevFromName("Miami (OH) RedHawks", league: "NCAAF") == "M-OH")
precondition(teamAbbrevFromName("Miami Hurricanes", league: "NCAAF") == "MIA")
precondition(teamAbbrevFromName("Unlisted College Panthers", league: "NCAAF") == "UNLISTED COLLEGE PANTHERS")
precondition(teamAbbrevFromName("Rio Grande Red Storm", league: "NCAAF") == "RIO GRANDE")
precondition(finalScoreLine(matchup: "SMU Mustangs @ Florida State Seminoles", raw: "24-21", league: "NCAAF") == "SMU 24 · FSU 21")
print("All FBS display routes and collision regressions passed")
`;
      const path = join(directory, 'scoreboard.swift');
      writeFileSync(path, script);
      expect(execFileSync('swift', [path], { encoding: 'utf8', timeout: 60_000 })).toContain('All FBS display routes');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 70_000);
});
