import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const ios = (file) => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const table = ios('NCAAFTeams.swift');
const picksTab = ios('PicksTab.swift');
const formatters = ios('PickDetailSections.swift');
const project = ios('GaryApp.xcodeproj/project.pbxproj');

/** The generated table, parsed back out of the Swift literal. */
const byName = new Map(
  [...table.matchAll(/^ {4}"([^"]+)": \(school: "([^"]+)", abbr: "([^"]+)"\),$/gm)]
    .map((m) => [m[1], { school: m[2], abbr: m[3] }])
);
/** Must match NCAAFTeams.key and the generator's norm. */
const key = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9&() ]+/g, '').replace(/\s+/g, ' ').trim();

// Founder, Sep 4 2026: the strip read "SAN JOSÉ STATE SPARTANS @ EASTERN
// MICHIGAN EAGLE…" and truncated — school name, no mascot, and the standard
// abbreviation where there is one.
describe('college names on the game strip', () => {
  it('carries the provider table, generated not hand-typed', () => {
    expect(table).toContain('GENERATED, do not edit by hand');
    expect(table).toContain('node gary2.0/scripts/gen/ncaaf-team-names.js');
    expect(table.startsWith('import Foundation')).toBe(true);
    expect(byName.size).toBeGreaterThan(400);
  });

  it('resolves the founder\'s matchup to abbreviations and mascot-free schools', () => {
    expect(byName.get(key('San José State Spartans'))).toEqual({ school: 'San José State', abbr: 'SJSU' });
    expect(byName.get(key('Eastern Michigan Eagles'))).toEqual({ school: 'Eastern Michigan', abbr: 'EMU' });
    // Accent-free spelling from a different feed resolves to the same team.
    expect(byName.get(key('San Jose State'))).toEqual({ school: 'San José State', abbr: 'SJSU' });
  });

  it('fixes the names the word-stripping heuristic got wrong', () => {
    // "Louisiana Ragin' Cajuns" fell to "Louisiana Ragin'" with the old rule.
    expect(byName.get(key("Louisiana Ragin' Cajuns")).school).toBe('Louisiana');
    expect(byName.get(key('Miami (OH) RedHawks')).school).toBe('Miami (OH)');
    expect(byName.get(key('Massachusetts Minutemen')).school).toBe('Massachusetts');
  });

  it('the strip asks for the college name instead of printing the raw matchup', () => {
    expect(picksTab).toContain('static func ncaafStripName(_ team: String) -> String {');
    expect(picksTab).toContain('if let abbr = NCAAFTeams.abbreviation(team) { return abbr }');
    expect(picksTab).toContain('Self.ncaafStripName(parts[0])) @ \\(Self.ncaafStripName(parts[1])');
    // The old branch printed every college game's full names.
    expect(picksTab).not.toContain('lg == "NCAAF"\n                ? g.matchup.uppercased()');
  });

  it('the shared formatter prefers the provider school over the heuristic', () => {
    expect(formatters).toContain('if let school = NCAAFTeams.school(team) { return school }');
  });

  it('the table is in the build', () => {
    expect(project).toContain('NCAAFTeams.swift in Sources');
    expect(project).toContain('path = NCAAFTeams.swift');
  });
});

// Founder, Sep 4 2026: the recap card "should match NFL and MLB to a tee
// except HR are TD for football" — and it must never truncate a long school.
describe('the recap card, football edition', () => {
  const home = readFileSync(new URL('../../../ios/GaryApp/HomeFrontPage.swift', import.meta.url), 'utf8');
  const models = readFileSync(new URL('../../../ios/GaryApp/Models.swift', import.meta.url), 'utf8');
  const homeView = readFileSync(new URL('../../../ios/GaryApp/HomeView.swift', import.meta.url), 'utf8');

  it('counts touchdowns where baseball counts homers, in the same box line', () => {
    expect(home).toContain('if let a = story.awayTD, let h = story.homeTD { return ("TDs", a + h) }');
    expect(home).toContain('if let a = story.awayHR, let h = story.homeHR { return ("HRs", a + h) }');
    expect(models).toContain('let td: Int?');
    expect(homeView).toContain('awayTD: r.box?.away?.td');
  });

  it('shortens the school on the bottom line instead of cutting it off', () => {
    expect(formatters).toContain('static func shortenCollegePick(_ pick: String) -> String {');
    expect(home).toContain('? Formatters.shortenCollegePick(story.receiptPick)');
    // The ellipsis law: the line scales, it never truncates.
    expect(home).not.toContain('Text(story.receiptPick)');
  });
});
