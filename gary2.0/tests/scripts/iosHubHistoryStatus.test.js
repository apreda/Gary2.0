import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const read = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const hasSwift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0;
function block(text, start) {
  const begin = text.indexOf(start);
  if (begin < 0) throw new Error(`Missing ${start}`);
  let depth = 0;
  for (let i = text.indexOf('{', begin); i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(begin, i + 1);
  }
  throw new Error(`Unclosed ${start}`);
}
describe('Hub supplementary history status', () => {
  it.skipIf(!hasSwift)('preserves empty, failure and cancellation semantics in the actual HTTP readers', () => {
    const api = read('SupabaseAPI.swift'), models = read('Models.swift');
    const directory = mkdtempSync(join(tmpdir(), 'gary-history-status-'));
    try {
      const file = join(directory, 'Fixture.swift'), binary = join(directory, 'fixture');
      writeFileSync(file, `import Foundation
final class FixtureSession {
 static let shared = FixtureSession()
 var status = 200; var payload = Data("[]".utf8); var error: Error?
 var requests: [URLRequest] = []
 func data(for request: URLRequest) async throws -> (Data, URLResponse) {
  precondition(request.url?.host == "fixture.invalid")
  requests.append(request)
  if let error { throw error }
  return (payload, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
 }
}
typealias URLSession = FixtureSession
${block(models, 'struct StreakRow:')}
${block(models, 'struct NightHighlightRow:')}
enum SupabaseAPI {
 static func buildURL(table: String, query: [URLQueryItem]) -> URL {
  var url = URLComponents(string: "https://fixture.invalid/" + table)!
  url.queryItems = query; return url.url!
 }
 static func makeRequest(url: URL) -> URLRequest { URLRequest(url: url) }
 ${['fetchStreaks', 'fetchStreaksResult', 'fetchNightHighlights', 'fetchNightHighlightsResult', 'fetchInsightHitRate', 'fetchInsightHitRateResult', 'isCancellation'].map(name => block(api, '    static func ' + name + '(')).join('\n')}
}
@main struct Fixture {
 static func main() async throws {
  let session = FixtureSession.shared
  let emptyStreaks = try await SupabaseAPI.fetchStreaksResult().get(); precondition(emptyStreaks.isEmpty)
  let emptyNight = try await SupabaseAPI.fetchNightHighlightsResult(date: "2026-09-06").get(); precondition(emptyNight.isEmpty)
  let emptyRate = try await SupabaseAPI.fetchInsightHitRateResult(date: "2026-09-06").get(); precondition(emptyRate == nil)
  for fault in ["http", "decode", "transport", "cancelled"] {
   session.status = fault == "http" ? 503 : 200
   session.payload = Data((fault == "decode" ? "invalid" : "[]").utf8)
   session.error = fault == "transport" ? URLError(.notConnectedToInternet) : fault == "cancelled" ? URLError(.cancelled) : nil
   func check<T>(_ result: Result<T, Error>) {
    guard case .failure(let error) = result else { preconditionFailure("Failure must not become a successful empty") }
    precondition(SupabaseAPI.isCancellation(error) == (fault == "cancelled"))
   }
   check(await SupabaseAPI.fetchStreaksResult())
   check(await SupabaseAPI.fetchNightHighlightsResult(date: "2026-09-06"))
   check(await SupabaseAPI.fetchInsightHitRateResult(date: "2026-09-06"))
   let legacy = await SupabaseAPI.fetchStreaks()
   precondition(legacy.isEmpty, "Existing callers retain their legacy fallback")
  }
  session.error = nil; session.status = 200
  session.payload = Data(#"[{"result":"hit"},{"result":"miss"},{"result":"push"}]"#.utf8)
  let rate = try await SupabaseAPI.fetchInsightHitRateResult(date: "2026-09-06").get()
  precondition(rate?.hit == 1 && rate?.graded == 2)
  session.payload = Data(#"[{"league":"MLB","game_date":"2026-09-06"},{"league":"MLB","game_date":"2026-09-05"},{"league":"NFL","game_date":"2026-09-05"}]"#.utf8)
  let streaks = try await SupabaseAPI.fetchStreaksResult().get()
  precondition(streaks.count == 2 && Set(streaks.compactMap(\\.league)) == ["MLB", "NFL"])
  print("History status assertions passed")
 }
}`);
      execFileSync('swiftc', ['-parse-as-library', file, '-o', binary], { encoding: 'utf8', timeout: 30_000 });
      expect(execFileSync(binary, [], { encoding: 'utf8', timeout: 10_000 })).toContain('History status assertions passed');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 45_000);
});
