import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const source = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const hasSwift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0;
function block(text, start) {
  const begin = text.indexOf(start);
  if (begin < 0) throw new Error(`Missing declaration: ${start}`);
  let depth = 0;
  for (let i = text.indexOf('{', begin); i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(begin, i + 1);
  }
  throw new Error(`Unclosed declaration: ${start}`);
}

describe('Billfold record eligibility across calculation paths', () => {
  it.skipIf(!hasSwift)('executes the optimized shipping models/full/selection/spread/top-pick calculations against retained public NFL rows', () => {
    const shared = source('ViewsShared.swift'), models = source('Models.swift');
    const view = source('BillfoldView.swift'), sports = source('SportFilter.swift');
    const modelRows = models.slice(models.indexOf('struct GameResult: Decodable'), models.indexOf('/// Helper to decode values'));
    const sportCases = sports.slice(sports.indexOf('enum Sport:'), sports.indexOf('    var icon:'));
    const sharedTypes = ['BillfoldTopPickCandidate', 'BillfoldDayRow', 'BillfoldCalibrationBucket', 'BillfoldJournal', 'BillfoldDerivedState', 'BillfoldSelectionDerivedState']
      .map(type => block(shared, `struct ${type}`)).join('\n');
    const chartTypes = ['BillfoldTrendPoint', 'BillfoldCandlestick', 'BillfoldSportSeries', 'BillfoldSportPoint']
      .map(type => block(view, `struct ${type}`)).join('\n');
    const fixture = new URL('../fixtures/nfl/billfold-countability-2026-09-08.json', import.meta.url);
    const directory = mkdtempSync(join(tmpdir(), 'gary-billfold-countability-'));
    try {
      const script = `import Foundation
let isoFormatterNoFrac = ISO8601DateFormatter()
let isoFormatterFrac: ISO8601DateFormatter = {
 let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return formatter
}()
${block(shared, 'func parseISO8601(')}
// Only the wall clock and display-only date formatting are controlled here.
// Eligibility, filtering, DTO decoding and every derived metric execute source.
let fixtureNow = ISO8601DateFormatter().date(from: "2026-09-08T16:00:00Z")!
enum Formatters { static func formatDate(_ value: String) -> String { String(value.prefix(10)) } }
enum BillfoldView {
 ${block(view, '    static func sinceDateValueStatic(').replace('let now = Date()', 'let now = fixtureNow')}
}
${sportCases}
 ${block(sports, '    var isPropsOnly:')}
}
${block(models, 'struct StringOrNumber:')}
${modelRows}
${block(models, 'struct BillfoldPickMetadata')}
${sharedTypes}
${chartTypes}
${block(shared, 'enum BillfoldCompute')}
struct Snapshot: Decodable { let rows: [GameResult] }
func record(_ value: (wins: Int, losses: Int, pushes: Int)) -> String { "\\(value.wins)-\\(value.losses)-\\(value.pushes)" }
func near(_ a: Double, _ b: Double) -> Bool { abs(a - b) < 0.000001 }
@main struct Fixture {
 static func main() throws {
  NSTimeZone.default = TimeZone(identifier: "America/New_York")!
  let rows = try JSONDecoder().decode(Snapshot.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))).rows
  precondition(rows.count == 93 && rows.countable.count == 59)
  precondition(rows.filter(\\.isPreseasonResult).count == 34)
  let lookup = BillfoldCompute.gameResultLookup(from: rows)
  let topPicks = rows.map { BillfoldTopPickCandidate(date: $0.game_date!, pickText: $0.pick_text!) }
  let confidence = Dictionary(uniqueKeysWithValues: rows.map { ("\\($0.game_date!)|\\($0.pick_text!)", 0.72) })
  let props = try JSONDecoder().decode([PropResult].self, from: Data(#"[{"game_date":"2026-09-07","league":"MLB","player_name":"Fixture Player","prop_type":"hits","result":"won","odds":110,"confidence":0.7},{"game_date":"2026-09-06","league":"NCAAF","player_name":"College Player","prop_type":"anytime_touchdown","result":"lost","odds":150},{"game_date":"2026-09-06","league":"NFL","player_name":"NFL Player","prop_type":"anytime_touchdown","result":"won","odds":150}]"#.utf8))
  func full(_ tab: Int = 0, _ sport: Sport = .nfl, _ timeframe: String = "all", _ sportTimeframe: String = "all") -> BillfoldDerivedState {
   BillfoldCompute.deriveState(selectedTab: tab, selectedSport: sport, timeframe: timeframe, sportTimeframe: sportTimeframe, spreadSport: "NFL", topdTimeframe: "all", gameResults: rows, propResults: props, resultLookup: lookup, topPickRows: topPicks, confidenceIndex: confidence)
  }
  func selection(_ tab: Int = 0, _ sport: Sport = .nfl, _ timeframe: String = "all", _ sportTimeframe: String = "all") -> BillfoldSelectionDerivedState {
   BillfoldCompute.deriveSelectionState(selectedTab: tab, selectedSport: sport, timeframe: timeframe, sportTimeframe: sportTimeframe, gameResults: rows, propResults: props, confidenceIndex: confidence)
  }
  let initial = full(), tapped = selection()
  let top = BillfoldCompute.topdStats(timeframe: "all", resultLookup: lookup, topPickRows: topPicks)
  let receipt = "full=\\(record(initial.record)) selection=\\(record(tapped.record)) top=\\(top.wins)-\\(top.losses) net=\\(String(format: "%.6f", tapped.netUnits))\\n"
  FileHandle.standardOutput.write(Data(receipt.utf8))
  precondition(record(initial.record) == "30-29-0" && near(initial.netUnits, -1.039919))
  precondition(record(tapped.record) == "30-29-0", "Tapping a sport cannot admit the 34 preseason rows")
  precondition(near(tapped.netUnits, initial.netUnits))
  precondition(tapped.filteredGames.count == 59 && tapped.filteredGames.prefix(20).allSatisfy { !$0.isPreseasonResult }, "Recent cards come from the same eligible record rows")
  precondition(top.wins == 30 && top.losses == 29 && near(top.pnl, initial.netUnits), "Top Pick metrics must exclude preseason despite retaining its lookup entries")
  precondition(lookup.count == rows.count && lookup.values.filter(\\.isPreseasonResult).count == 34, "Keep raw lookup for graded pick-card stamps")

  for tab in [0, 1] {
   for sport in [Sport.all, .nfl, .mlb, .ncaaf, .nflTDs, .all, .nfl] {
    for timeframe in ["all", "7d", "30d", "90d", "ytd"] {
     for sportTimeframe in ["all", "30d"] {
      let a = full(tab, sport, timeframe, sportTimeframe), b = selection(tab, sport, timeframe, sportTimeframe)
      precondition(a.filteredGames.map(\\.game_id) == b.filteredGames.map(\\.game_id))
      precondition(b.filteredGames.allSatisfy { !$0.isPreseasonResult })
      precondition(a.filteredProps.map(\\.player_name) == b.filteredProps.map(\\.player_name))
      precondition(record(a.record) == record(b.record) && near(a.netUnits, b.netUnits))
      precondition(a.streak.label == b.streak.label && a.streak.value == b.streak.value && a.streak.positive == b.streak.positive)
      precondition(a.trend.map(\\.date) == b.trend.map(\\.date) && a.trend.map(\\.cumulative) == b.trend.map(\\.cumulative))
      precondition(a.candles.map(\\.date) == b.candles.map(\\.date) && a.candles.map(\\.close) == b.candles.map(\\.close))
      precondition(a.journal.last10 == b.journal.last10 && near(a.journal.roiPct, b.journal.roiPct))
      precondition(a.journal.days.map(\\.id) == b.journal.days.map(\\.id) && a.journal.days.map(\\.net) == b.journal.days.map(\\.net))
      precondition(near(a.journal.maxDrawdownUnits, b.journal.maxDrawdownUnits))
      precondition(a.calibration.map(\\.n) == b.calibration.map(\\.n) && a.calibration.map(\\.wins) == b.calibration.map(\\.wins))
      precondition(a.sportPerformance.map(\\.sport) == b.sportPerformance.map(\\.sport) && a.sportPerformance.map(\\.settledCount) == b.sportPerformance.map(\\.settledCount))
     }
    }
   }
  }
  for timeframe in ["all", "30d", "90d", "ytd"] {
   let filtered = BillfoldCompute.filterGameResults(rows, cutoff: BillfoldView.sinceDateValueStatic(for: timeframe), selectedSport: .all)
   let spread = BillfoldCompute.spreadPerf(selectedTab: 0, spreadSport: "NFL", buckets: BillfoldCompute.spreadBuckets(for: "NFL"), results: filtered)
   let expected = full(0, .nfl, timeframe).spreadPerformance
   precondition(spread.map(\\.wins) == expected.map(\\.wins) && spread.map(\\.losses) == expected.map(\\.losses) && spread.map(\\.net) == expected.map(\\.net))
  }
  precondition(selection(0, .nfl, "30d").filteredGames.isEmpty, "The observed 30-day NFL window contains preseason only")
  precondition(selection(0, .all, "90d").record.wins == 0)
  print("Billfold countability parity passed: 93 retained / 59 countable / 34 graded preseason lookup entries")
 }
}
`;
      const file = join(directory, 'Fixture.swift'), binary = join(directory, 'fixture');
      writeFileSync(file, script);
      execFileSync('swiftc', ['-O', '-swift-version', '5', '-parse-as-library', file, '-o', binary], { encoding: 'utf8', timeout: 45_000 });
      let output;
      try { output = execFileSync(binary, [fixture.pathname], { encoding: 'utf8', timeout: 15_000 }); }
      catch (error) { throw new Error(`Optimized Billfold fixture failed:\n${error.stdout ?? ''}\n${error.stderr ?? ''}`); }
      expect(output).toContain('full=30-29-0 selection=30-29-0 top=30-29');
      expect(output).toContain('Billfold countability parity passed');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 65_000);
});
