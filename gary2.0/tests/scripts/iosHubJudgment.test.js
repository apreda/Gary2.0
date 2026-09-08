import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const native = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const hasSwift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0;
function block(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing shipping declaration: ${marker}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed shipping declaration: ${marker}`);
}
function run(source) {
  const directory = mkdtempSync(join(tmpdir(), 'gary-hub-judgment-'));
  try {
    const file = join(directory, 'Fixture.swift'), binary = join(directory, 'fixture');
    writeFileSync(file, source);
    execFileSync('swiftc', ['-O', '-swift-version', '5', '-parse-as-library', file, '-o', binary], { encoding: 'utf8', timeout: 45_000 });
    return execFileSync(binary, [], { encoding: 'utf8', timeout: 10_000 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe('native Hub observation presentation and additive judgment compatibility', () => {
  it.skipIf(!hasSwift)('validates actual model, exact game/source scope, full cases, expiry, changes and source suppression', () => {
    const tests = readFileSync(new URL('../../../ios/Tests/HubJudgmentTests.swift', import.meta.url), 'utf8');
    expect(run(native('HubJudgment.swift') + '\n' + tests)).toContain('Hub judgment model passed:');
  }, 60_000);

  it.skipIf(!hasSwift)('keeps original observation order, lanes and search even when stored judgments are ready', () => {
    const hub = native('HubView.swift');
    const search = block(hub, 'fileprivate struct HubSearchResults:');
    const source = `${native('HubJudgment.swift')}\n${native('HubStoryIdentity.swift')}
${block(hub, 'enum HubFmt {')}
enum League { case mlb; var label: String { "MLB" } }
typealias HubLeagueSel = League
enum SignalKind { case hot, bullpen, regression, h2h, fantasy, module }
struct Meta { let judgment: HubJudgment? }
struct Regression { let day: String }
struct Signal {
 let id: UUID = UUID(); let headline: String; let detail: String
 var league: League = .mlb; var kind: SignalKind = .hot; var game = "CHC @ STL"; var value = ""
 var slateDate: String? = "2026-09-08"; var gameId: String? = "100"; var sourceKey: String? = "heat_check|100|44|8"
 var lane: Meta?; var reg: Regression?; var confirmedXI: String? = nil
}
func signalChipLabel(kind: SignalKind, league: League) -> String { "Heat check" }
enum SupabaseAPI { static func todayEST() -> String { "2026-09-08" } }
struct Beat { let kinds: [SignalKind] }
final class Reader {
 var sel: League = .mlb
 var leagueSignals: [Signal] = []
 var itemsIndex: [League: [SignalKind: [Signal]]] = [:]
 static let fantasyKinds: Set<SignalKind> = [.fantasy]
 static let moduleKinds: Set<SignalKind> = [.module]
${block(hub, '    private static func dedupe(')}
${block(hub, '    private var ranked:')}
${block(hub, '    private func items(')}
${block(hub, '    private func beatRows(')}
 static func resolve(_ rows: [Signal]) -> [Signal] { dedupe(rows) }
 var frontPage: [Signal] { ranked }
 func lane(_ kind: SignalKind) -> [Signal] { items(kind) }
 func beat(_ kinds: [SignalKind], featured: Set<UUID> = []) -> [Signal] { beatRows(Beat(kinds: kinds), featured: featured) }
}
struct Search {
 let q: String
${block(search, '        func hits(')}
}
@main struct Fixture {
 static func main() throws {
  func envelope(_ status: String, _ clock: String, _ take: String = "The matchup gives the streak a different meaning") throws -> HubJudgment {
   let payload: [String: Any] = ["schema_version": 1, "status": status, "date": "2026-09-08", "league": "mlb",
    "game_id": "100", "primary_source_key": "heat_check|100|44|8", "as_of": clock, "take": take,
    "explanation": "Contact and the current opponent connect", "full_case": "A distinctive full argument about breaking pitches",
    "counterargument": "The sample is limited", "watch_for": "The posted order", "horizon": "pregame",
    "valid_until": "2026-09-08T23:00:00Z", "prominence": "major", "editorial_rank": 1,
    "editorial_fingerprint": String(repeating: "a", count: 64),
    "supporting_evidence_ids": ["form", "today"], "counter_evidence_ids": ["form"],
    "supersedes_source_keys": ["bullpen_fatigue|100||8"],
    "evidence": [
     ["id": "form", "source_key": "heat_check|100|44|8", "label": "Form", "summary": "Observed contact", "source": "Provider", "game_id": "100", "as_of": clock],
     ["id": "today", "source_key": "bullpen_fatigue|100||8", "label": "Bullpen", "summary": "Observed workload", "source": "Provider", "game_id": "100", "as_of": clock]]]
   return try JSONDecoder().decode(HubJudgment.self, from: JSONSerialization.data(withJSONObject: payload))
  }
  let ready = try envelope("ready", "2026-09-08T15:00:00Z")
  precondition(ready.isCurrent(league: "MLB", date: "2026-09-08", gameID: "100", sourceKey: "heat_check|100|44|8", now: HubJudgment.timestamp("2026-09-08T16:00:00Z")!))
  let newer = try envelope("context_unavailable", "2026-09-08T15:30:00Z")
  let raw = Signal(headline: "José: hot recent form", detail: "Original facts")
  let upgraded = Signal(headline: raw.headline, detail: raw.detail, lane: Meta(judgment: ready))
  let invalidated = Signal(headline: raw.headline, detail: raw.detail, lane: Meta(judgment: newer))
  precondition(Reader.resolve([raw, upgraded]).map(\\.id) == [raw.id], "Stored narratives cannot replace relevance-ordered observations")
  precondition(Reader.resolve([upgraded, invalidated]).map(\\.id) == [upgraded.id], "Envelope clocks cannot change observation deduplication")
  precondition(Reader.resolve([invalidated, upgraded]).map(\\.id) == [invalidated.id])
  var gameTwo = raw; gameTwo.gameId = "101"; gameTwo.sourceKey = "heat_check|101|44|8"
  precondition(Reader.resolve([raw, gameTwo]).count == 2, "Doubleheaders remain separate")
  var nextDate = raw; nextDate.slateDate = "2026-09-09"
  precondition(Reader.resolve([raw, nextDate]).count == 2, "Dated observations remain separate")
  let bullpen = Signal(headline: "Texas bullpen: 18 innings over three days", detail: "Original workload facts", kind: .bullpen, sourceKey: "bullpen_fatigue|100||8")
  let reader = Reader()
  reader.leagueSignals = [bullpen, upgraded, nextDate]
  reader.itemsIndex = [.mlb: [.bullpen: [bullpen], .hot: [upgraded]]]
  precondition(reader.frontPage.map(\\.id) == [bullpen.id, upgraded.id], "Major/editorial rank and superseded keys cannot override original current-day ordering")
  precondition(reader.lane(.bullpen).map(\\.id) == [bullpen.id] && reader.lane(.hot).map(\\.id) == [upgraded.id])
  precondition(reader.beat([.bullpen, .hot]).map(\\.id) == [bullpen.id, upgraded.id, nextDate.id], "Original lanes retain observations cited by stored narratives")
  precondition(reader.beat([.bullpen, .hot], featured: [upgraded.id]).map(\\.id) == [bullpen.id, nextDate.id], "Only actual featured observations are omitted from supporting beats")
  for term in ["josé", "original facts", "chc", "heat check"] {
   precondition(Search(q: term).hits(upgraded), "Visible original observation remains searchable")
  }
  for term in ["matchup gives", "opponent connect", "breaking pitches"] {
   precondition(!Search(q: term).hits(upgraded), "Stored narrative prose cannot leak into observation search")
  }
  print("Hub observation integration passed")
 }
}
`;
    expect(run(source)).toContain('Hub observation integration passed');
    expect(hub).toContain('now.timeIntervalSince($0) >= 300');
    expect(hub).not.toMatch(/HubJudgment|currentJudgment|openRead\(/);
    for (const marker of ['fileprivate struct HubLeadStory:', 'fileprivate struct HubBestOf:', 'fileprivate struct HubBoardSection']) {
      expect(block(hub, marker)).toContain('fill: GaryColors.readingPanel');
    }
    expect(block(hub, 'fileprivate struct HubLeadStory:')).toContain('Text(s.headline)');
    expect(block(hub, 'fileprivate struct HubLeadStory:')).toContain('Text(s.detail.trimmingCharacters');
    expect(block(hub, '    @ViewBuilder private var frontPageBoards:')).toContain('openSignal(s)');
    expect(block(hub, '    @ViewBuilder private var referenceShelf:')).toContain('title: "League Pulse"');
    expect(block(hub, '    @ViewBuilder private var referenceShelf:')).toContain('HubCollapsible(anchor: "lastNight"');
    expect(hub).toContain('.accessibilityLabel("Close game research")');
    expect(hub).toContain('.accessibilityAddTraits(.isModal)');
  }, 60_000);

  it.skipIf(!hasSwift)('uses original observation clocks through shipping metadata and ignores later persistence time', () => {
    const models = native('Models.swift');
    const graph = models.slice(models.indexOf('struct Connection:'), models.indexOf('// MARK: - Live Scores'));
    expect(run(`${native('HubJudgment.swift')}\n${block(models, 'struct ExactGameIdentity:')}\n${block(native('FantasyBriefing.swift'), 'enum GaryMlbMetricPolicy {')}\n${graph}
@main struct Fixture {
 static func main() throws {
  let raw = #"{"date":"2026-09-08","league":"MLB","category":"starter_form","game_id":"100","created_at":"2026-09-08T16:30:00Z","meta":{"computed_as_of":"2026-09-08T15:00:00Z","source_collected_at":"2026-09-08T14:00:00Z","created_at":"2026-09-08T16:30:00Z"}}"#
  let row = try JSONDecoder().decode(Connection.self, from: Data(raw.utf8))
  let observed = HubJudgment.latestSourceObservation(computedAsOf: row.meta?.computed_as_of, collectedAt: row.meta?.source_collected_at)
  precondition(observed == HubJudgment.timestamp("2026-09-08T15:00:00Z"), "Same-pass persistence cannot become a newer original observation")
  let copy = try JSONDecoder().decode(Connection.self, from: JSONEncoder().encode(row))
  precondition(copy.meta?.computed_as_of == row.meta?.computed_as_of && copy.meta?.source_collected_at == row.meta?.source_collected_at)
  print("Source observation metadata passed")
 }
}
`)).toContain('Source observation metadata passed');
    const mapper = native('HubModules.swift');
    expect(mapper).toContain('sourceObservedAt: HubJudgment.latestSourceObservation(computedAsOf: meta?.computed_as_of,');
    expect(mapper).toContain('collectedAt: meta?.source_collected_at)');
  }, 60_000);
});
