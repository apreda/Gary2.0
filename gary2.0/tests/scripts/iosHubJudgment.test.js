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

describe('native Hub judgment contract and shipping integration', () => {
  it.skipIf(!hasSwift)('validates actual model, exact game/source scope, full cases, expiry, changes and source suppression', () => {
    const tests = readFileSync(new URL('../../../ios/Tests/HubJudgmentTests.swift', import.meta.url), 'utf8');
    expect(run(native('HubJudgment.swift') + '\n' + tests)).toContain('Hub judgment model passed:');
  }, 60_000);

  it.skipIf(!hasSwift)('preserves newest envelopes before legacy deduplication and searches the visible take and full reasoning', () => {
    const hub = native('HubView.swift');
    const search = block(hub, 'fileprivate struct HubSearchResults:');
    const source = `${native('HubJudgment.swift')}\n${native('HubStoryIdentity.swift')}
${block(hub, 'enum HubFmt {')}
enum League { case mlb; var label: String { "MLB" } }
enum Kind { case hot }
struct Meta { let judgment: HubJudgment? }
struct Regression { let day: String }
struct Signal {
 let id: Int; let headline: String; let detail: String
 var league: League = .mlb; var kind: Kind = .hot; var game = "CHC @ STL"; var value = ""
 var slateDate: String? = "2026-09-08"; var gameId: String? = "100"; var sourceKey: String? = "heat_check|100|44|8"
 var lane: Meta?; var reg: Regression?; var rejectsJudgment = false
}
func signalChipLabel(kind: Kind, league: League) -> String { "Heat check" }
struct Reader {
${block(hub, '    private static func dedupe(')}
 static func resolve(_ rows: [Signal]) -> [Signal] { dedupe(rows) }
}
struct Search {
 let q: String
 let judgmentFor: (Signal) -> HubJudgment?
${block(search, '        func hits(')}
}
@main struct Fixture {
 static func main() throws {
  func envelope(_ status: String, _ clock: String, _ take: String = "The matchup gives the streak a different meaning") throws -> HubJudgment {
   let payload: [String: Any] = ["schema_version": 1, "status": status, "date": "2026-09-08", "league": "mlb",
    "game_id": "100", "primary_source_key": "heat_check|100|44|8", "as_of": clock, "take": take,
    "explanation": "Contact and the current opponent connect", "full_case": "A distinctive full argument about breaking pitches"]
   return try JSONDecoder().decode(HubJudgment.self, from: JSONSerialization.data(withJSONObject: payload))
  }
  let ready = try envelope("ready", "2026-09-08T15:00:00Z")
  let newer = try envelope("context_unavailable", "2026-09-08T15:30:00Z")
  let raw = Signal(id: 1, headline: "José: hot recent form", detail: "Original facts")
  let upgraded = Signal(id: 2, headline: raw.headline, detail: raw.detail, lane: Meta(judgment: ready))
  let invalidated = Signal(id: 3, headline: raw.headline, detail: raw.detail, lane: Meta(judgment: newer))
  precondition(Reader.resolve([raw, upgraded]).map(\\.id) == [2], "First unjudged source must not swallow its upgrade")
  precondition(Reader.resolve([upgraded, invalidated]).map(\\.id) == [3], "Newest invalidation must reach the selector")
  precondition(Reader.resolve([invalidated, upgraded]).map(\\.id) == [3], "Relevance order must not revive older context")
  let conflicting = Signal(id: 4, headline: raw.headline, detail: raw.detail,
      lane: Meta(judgment: try envelope("ready", "2026-09-08T15:00:00Z", "A conflicting take")))
  let conflict = Reader.resolve([upgraded, conflicting])
  precondition(conflict.count == 1 && conflict[0].rejectsJudgment && conflict[0].detail == raw.detail)
  var gameTwo = raw; gameTwo.gameId = "101"; gameTwo.sourceKey = "heat_check|101|44|8"
  precondition(Reader.resolve([raw, gameTwo]).count == 2, "Doubleheaders stay separate before selection")
  let resolves: (Signal) -> HubJudgment? = { $0.id == 2 ? ready : nil }
  for term in ["matchup gives", "opponent connect", "breaking pitches", "josé"] {
   precondition(Search(q: term, judgmentFor: resolves).hits(upgraded), "Visible judgment and full case are searchable")
  }
  precondition(!Search(q: "breaking pitches", judgmentFor: { _ in nil }).hits(upgraded), "Expired judgments cannot leak into active search")
  print("Hub judgment integration passed")
 }
}
`;
    expect(run(source)).toContain('Hub judgment integration passed');
    expect(hub).toContain('now.timeIntervalSince($0) >= 300');
    expect(hub).toContain('.task(id: isVisible ? nextJudgmentExpiry : nil)');
  }, 60_000);
});
