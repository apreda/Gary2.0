import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildNflNextSlateRow } from '../../src/services/insights/computers/nflNextSlate.js';
import { buildNcaafNextSlateRow } from '../../src/services/insights/computers/ncaafNextSlate.js';

const read = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const models = read('Models.swift');
const view = read('FootballGameIntelView.swift');
const formatters = read('ViewsShared.swift');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;
const team = (id, abbreviation, full_name) => ({ id, abbreviation, full_name });
const game = (id, date, extra = {}) => ({ id, date,
  visitor_team: team(1, 'NE', 'New England Patriots'), home_team: team(2, 'SEA', 'Seattle Seahawks'), ...extra });
const checkedAt = '2026-09-07T22:00:00Z';

describe('native next-slate schedule', () => {
  it.skipIf(!hasSwift)('decodes builder output, preserves clocks and exposes every matchup through the shipping preview logic', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-next-slate-preview-'));
    try {
      const nfl = buildNflNextSlateRow({ date: '2026-09-07', scheduledDate: '2026-09-13', checkedAt,
        games: [game(1, '2026-09-13T17:00:00Z'), game(2, '2026-09-13T20:25:00Z'),
          game(3, '2026-09-14T00:20:00Z'), game(4, '2026-09-13')],
      });
      const college = buildNcaafNextSlateRow({ date: '2026-09-07', scheduledDate: '2026-09-12', checkedAt,
        games: [game(5, '2026-09-13T05:30:00Z', {
          visitor_team: team(3, 'ORST', 'Oregon State Beavers'), home_team: team(4, 'HOU', 'Houston Cougars'),
        })],
      });
      const fixtures = [
        { ...nfl, league: 'NFL', date: '2026-09-07' },
        { ...college, league: 'NCAAF', date: '2026-09-07' },
        { ...nfl, league: 'NFL', date: '2026-09-07', meta: {
          kind: 'next_slate', scheduled_date: '2026-09-09', game_count: 1,
          confirmed_count: 1, time_tbd_count: 0, first_confirmed_kickoff: '2026-09-10T00:20:00.000Z',
        } },
      ];
      const fixturePath = join(directory, 'connections.json');
      writeFileSync(fixturePath, JSON.stringify(fixtures));
      const modelSource = models.slice(models.indexOf('struct Connection: Decodable'), models.indexOf('// MARK: - Live Scores'));
      const formatterSource = formatters.slice(formatters.indexOf('let isoFormatterFrac:'), formatters.indexOf('struct BillfoldTopPickCandidate'));
      const component = view.slice(view.indexOf('struct FootballNextSlatePreview: View'), view.indexOf('// MARK: - Football Today feed'));
      const properties = component.slice(component.indexOf('    private var meta:'), component.indexOf('    var body: some View'));
      const script = `import Foundation
${modelSource}
${formatterSource}
enum League { case nfl, ncaaf; var label: String { self == .nfl ? "NFL" : "NCAAF" } }
struct Signal { var nextSlate: SwapMeta?; var league: League = .nfl }
struct Preview {
 let signal: Signal
 var showAllMatchups = false
 ${properties}
 var rows: [FootballNextSlateGame] { visibleMatchups }
 var sourceLabel: String? { checkedLabel }
 var legacyClock: String { kickoffLabel }
 var count: String { countLabel }
 var day: String { dateLabel }
}
let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
let connections = try JSONDecoder().decode([Connection].self, from: data)
precondition(connections.count == 3)
let meta = connections[0].meta!
precondition(meta.next_slate_games?.count == 4)
var preview = Preview(signal: Signal(nextSlate: meta))
precondition(preview.rows.count == 3, "Initial card has three matchup rows")
preview.showAllMatchups = true
precondition(preview.rows.count == 4, "Expansion retains the whole verified schedule")
precondition(preview.rows.map(\\.game_id) == ["1", "2", "3", "4"])
precondition(preview.rows[0].matchupLabel == "New England Patriots at Seattle Seahawks")
precondition(preview.rows[0].kickoffLabel == "1:00 PM ET")
precondition(preview.rows[2].kickoffLabel == "8:20 PM ET")
precondition(preview.rows[3].kickoffLabel == "TIME TBD")
precondition(preview.sourceLabel == "Schedule checked Sep 7, 6:00 PM ET")
let college = Preview(signal: Signal(nextSlate: connections[1].meta, league: .ncaaf))
precondition(college.day == "SAT · SEP 12")
precondition(college.rows[0].kickoffLabel == "SUN 1:30 AM ET", "College rollover must not mislabel the calendar day of an overnight kickoff")
let legacy = Preview(signal: Signal(nextSlate: connections[2].meta))
precondition(legacy.rows.isEmpty && legacy.sourceLabel == nil)
precondition(legacy.count == "1 GAME" && legacy.day == "WED · SEP 9")
precondition(legacy.legacyClock == "FIRST KICK 8:20 PM ET")
let missing = Preview(signal: Signal(nextSlate: nil))
precondition(missing.count == "DETAILS PENDING", "Missing evidence cannot display zero games")
func decodeGame(_ updates: [String: Any]) throws -> FootballNextSlateGame {
 var row: [String: Any] = ["game_id": "6", "scheduled_date": "2026-09-13", "away_abbr": "NE", "home_abbr": "SEA",
                           "kickoff_status": "confirmed", "commence_time": "2026-09-13T17:00:00Z"]
 row.merge(updates) { _, new in new }
 return try JSONDecoder().decode(FootballNextSlateGame.self, from: JSONSerialization.data(withJSONObject: row))
}
let abbreviationsOnly = try decodeGame([:])
precondition(abbreviationsOnly.matchupLabel == "NE at SEA")
for badClock in ["bad", "2026-09-13"] {
 let malformed = try decodeGame(["commence_time": badClock])
 precondition(malformed.kickoffLabel == "TIME TBD")
}
let dateOnly = try decodeGame(["kickoff_status": "date_only"])
precondition(dateOnly.kickoffLabel == "TIME TBD")
for pair in [("Postponed", "POSTPONED"), ("STATUS_DELAYED", "DELAYED"), ("Final/OT", "FINAL"), ("STATUS_IN_PROGRESS", "LIVE")] {
 let state = try decodeGame(["game_status": pair.0])
 precondition(state.kickoffLabel == pair.1)
}
print("Native next-slate regressions passed")
`;
      const scriptPath = join(directory, 'preview.swift');
      writeFileSync(scriptPath, script);
      const result = spawnSync('swift', [scriptPath, fixturePath], { encoding: 'utf8', timeout: 30_000 });
      expect(result.status, result.stderr + result.stdout).toBe(0);
      expect(result.stdout).toContain('Native next-slate regressions passed');
      expect(component).toContain('ForEach(visibleMatchups)');
      expect(component).toContain('showAllMatchups.toggle()');
      expect(component).toContain('DisclosureGroup("Schedule details")');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 40_000);
});
