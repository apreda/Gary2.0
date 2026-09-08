import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const source = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const hasSwift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0;

function declaration(text, start) {
  const begin = text.indexOf(start);
  if (begin < 0) throw new Error(`Missing declaration: ${start}`);
  let depth = 0;
  for (let i = text.indexOf('{', begin); i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}' && --depth === 0) return text.slice(begin, i + 1);
  }
  throw new Error(`Unclosed declaration: ${start}`);
}

function runSwift(body) {
  const api = source('SupabaseAPI.swift');
  const start = api.indexOf('    private struct LeaguePulseCacheKey:');
  const end = api.indexOf('    /// The full day\'s slate', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const directory = mkdtempSync(join(tmpdir(), 'gary-pulse-concurrency-'));
  try {
    const file = join(directory, 'Fixture.swift');
    const binary = join(directory, 'fixture');
    writeFileSync(file, `
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
${declaration(source('Models.swift'), 'struct LeaguePulseColumn:')}
${declaration(source('Models.swift'), 'struct LeaguePulseRow:')}
enum SupabaseAPI {
 ${declaration(api, '    static func isCancellation(')}
 private static func buildURL(table: String, query: [URLQueryItem]) -> URL {
  var components = URLComponents(string: "https://fixture.invalid/" + table)!
  components.queryItems = query
  return components.url!
 }
 private static func makeRequest(url: URL) -> URLRequest { URLRequest(url: url) }
 ${api.slice(start, end)}
 @MainActor static func cached(_ date: String, _ league: String, _ session: URLSession) -> (rows: [LeaguePulseRow], at: Date)? {
  _leaguePulseCache[LeaguePulseCacheKey(date: date, league: league, session: ObjectIdentifier(session))]
 }
 @MainActor static var pendingCount: Int { _leaguePulseFlights.count }
}
struct Reply: @unchecked Sendable {
 var data: Data
 var status = 200
 var error: Error?
 var delay: TimeInterval = 0.004
}
final class FixtureServer: @unchecked Sendable {
 private let lock = NSLock()
 private var handler: (@Sendable (URLRequest, Int) -> Reply)?
 private var recorded: [URLRequest] = []
 func configure(_ next: @escaping @Sendable (URLRequest, Int) -> Reply) {
  lock.lock(); defer { lock.unlock() }
  handler = next; recorded = []
 }
 func response(to request: URLRequest) -> Reply {
  lock.lock(); defer { lock.unlock() }
  precondition(request.url?.host == "fixture.invalid", "Fixtures must never reach a service")
  precondition(request.url?.path == "/league_pulse")
  precondition(parameters(request)["order"] == "tab.asc")
  recorded.append(request)
  return handler!(request, recorded.count)
 }
 var requests: [URLRequest] {
  lock.lock(); defer { lock.unlock() }
  return recorded
 }
}
final class FixtureProtocol: URLProtocol, @unchecked Sendable {
 static let server = FixtureServer()
 override class func canInit(with request: URLRequest) -> Bool { true }
 override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
 override func startLoading() {
  let reply = Self.server.response(to: request)
  // Complete on concurrent queues, as real simultaneous sport responses do.
  DispatchQueue.global().asyncAfter(deadline: .now() + reply.delay) {
   if let error = reply.error { self.client?.urlProtocol(self, didFailWithError: error); return }
   let response = HTTPURLResponse(url: self.request.url!, statusCode: reply.status,
       httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
   self.client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
   self.client?.urlProtocol(self, didLoad: reply.data)
   self.client?.urlProtocolDidFinishLoading(self)
  }
 }
 override func stopLoading() {}
}
func parameters(_ request: URLRequest) -> [String: String] {
 let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
 return Dictionary(uniqueKeysWithValues: query.map { ($0.name, $0.value ?? "") })
}
func reply(for request: URLRequest, marker: String = "fresh") -> Reply {
 let query = parameters(request)
 let date = String(query["date"]!.dropFirst(3))
 let league = String(query["league"]!.dropFirst(3))
 let rows: [[String: Any]] = [["date": date, "league": league, "tab": "board", "title": marker,
   "columns": [["key": "team", "label": "TEAM"]], "rows": [["team": league]]]]
 return Reply(data: try! JSONSerialization.data(withJSONObject: rows))
}
@MainActor func waitUntil(_ ready: () -> Bool) async {
 for _ in 0..<10_000 { if ready() { return }; await Task.yield() }
 preconditionFailure("The bounded fixture did not reach its expected state")
}
@main struct Fixture {
 @MainActor static func main() async {
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [FixtureProtocol.self]
  let session = URLSession(configuration: configuration)
  let server = FixtureProtocol.server
  defer { session.invalidateAndCancel() }
  ${body}
  precondition(SupabaseAPI.pendingCount == 0, "All shared request owners must release their slots")
  print("League Pulse concurrency assertions passed")
 }
}
`);
    execFileSync('swiftc', ['-parse-as-library', '-swift-version', '5', '-Xfrontend', '-enable-actor-data-race-checks', file, '-o', binary], { encoding: 'utf8', timeout: 30_000 });
    expect(execFileSync(binary, [], { encoding: 'utf8', timeout: 15_000 })).toContain('League Pulse concurrency assertions passed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('native Hub League Pulse cache concurrency', () => {
  it.skipIf(!hasSwift)('survives overlapping MLB, NFL and NCAAF completions from detached tasks without mixing dates or leagues', () => {
    runSwift(`
server.configure { request, _ in reply(for: request) }
let leagues = ["MLB", "NFL", "NCAAF"]
let tasks = (0..<300).map { index in
 Task.detached {
  let league = leagues[index % 3]
  let date = "fixture-day-" + String(index / 3)
  let result = await SupabaseAPI.fetchLeaguePulse(date: date, league: league, session: session)
  precondition(result.count == 1 && result[0].date == date && result[0].league == league)
  precondition(result[0].rows.first?["team"] == league)
 }
}
for task in tasks { await task.value }
precondition(server.requests.count == 300)
for index in 0..<300 {
 let league = leagues[index % 3]
 let date = "fixture-day-" + String(index / 3)
 let cached = await SupabaseAPI.fetchLeaguePulse(date: date, league: league, session: session)
 precondition(cached.count == 1 && cached[0].date == date && cached[0].league == league)
}
precondition(server.requests.count == 300, "All independent snapshots survive the overlapping writes")
`);
  }, 50_000);

  it.skipIf(!hasSwift)('coalesces simultaneous refreshes per sport and keeps the shared request alive after one waiter is cancelled', () => {
    runSwift(`
server.configure { request, _ in var result = reply(for: request); result.delay = 0.08; return result }
let leagues = ["MLB", "NFL", "NCAAF"]
let first = Task { await SupabaseAPI.fetchLeaguePulse(date: "2026-09-07", league: "MLB", forceRefresh: true, session: session) }
await waitUntil { server.requests.count == 1 }
let followers = (0..<60).map { index in
 Task { await SupabaseAPI.fetchLeaguePulse(date: "2026-09-07", league: leagues[index % 3], forceRefresh: true, session: session) }
}
await waitUntil { server.requests.count == 3 }
first.cancel()
let firstRows = await first.value
precondition(firstRows.first?.league == "MLB")
for (index, task) in followers.enumerated() {
 let rows = await task.value
 precondition(rows.first?.league == leagues[index % 3])
}
precondition(server.requests.count == 3)
precondition(server.requests.allSatisfy { $0.cachePolicy == .reloadIgnoringLocalCacheData && $0.value(forHTTPHeaderField: "Cache-Control") == "no-cache" })
`);
  }, 50_000);

  it.skipIf(!hasSwift)('keeps failures distinct from successful empty responses without renewing or borrowing the previous snapshot', () => {
    runSwift(`
server.configure { request, _ in reply(for: request, marker: "last good") }
let original = await SupabaseAPI.fetchLeaguePulse(date: "2026-09-07", league: "NCAAF", session: session)
precondition(original.first?.title == "last good")
let publishedAt = SupabaseAPI.cached("2026-09-07", "NCAAF", session)!.at
for fault in ["http", "decode", "transport", "cancelled", "wrong-date", "wrong-league"] {
 server.configure { request, _ in
  var result = reply(for: request)
  if fault == "http" { result.status = 503 }
  if fault == "decode" { result.data = Data("not-json".utf8) }
  if fault == "transport" { result.error = URLError(.notConnectedToInternet) }
  if fault == "cancelled" { result.error = URLError(.cancelled) }
  if fault == "wrong-date" { result.data = Data(String(data: result.data, encoding: .utf8)!.replacingOccurrences(of: "2026-09-07", with: "2026-09-06").utf8) }
  if fault == "wrong-league" { result.data = Data(String(data: result.data, encoding: .utf8)!.replacingOccurrences(of: "NCAAF", with: "MLB").utf8) }
  return result
 }
 let failed = await SupabaseAPI.fetchLeaguePulse(date: "2026-09-07", league: "NCAAF", forceRefresh: true, session: session)
 precondition(failed.isEmpty, "Existing API contract reports failure as an empty response")
 let status = await SupabaseAPI.fetchLeaguePulseResult(date: "2026-09-07", league: "NCAAF", forceRefresh: true, session: session)
 precondition(!status.succeeded && status.cancelled == (fault == "cancelled"))
 precondition(status.rows.first?.title == "last good", "New status reader returns same-date last good without disguising failure")
 precondition(SupabaseAPI.cached("2026-09-07", "NCAAF", session)!.at == publishedAt)
 let preserved = await SupabaseAPI.fetchLeaguePulse(date: "2026-09-07", league: "NCAAF", session: session)
 precondition(preserved.first?.title == "last good" && server.requests.count == 2)
 if !fault.hasPrefix("wrong-") {
 let otherDate = await SupabaseAPI.fetchLeaguePulse(date: "2026-09-08", league: "NCAAF", session: session)
 let otherLeague = await SupabaseAPI.fetchLeaguePulse(date: "2026-09-07", league: "NFL", session: session)
 precondition(otherDate.isEmpty && otherLeague.isEmpty)
 precondition(SupabaseAPI.cached("2026-09-08", "NCAAF", session) == nil)
 precondition(SupabaseAPI.cached("2026-09-07", "NFL", session) == nil)
 }
}
server.configure { _, _ in Reply(data: Data("[]".utf8)) }
let empty = await SupabaseAPI.fetchLeaguePulseResult(date: "2026-09-07", league: "NCAAF", forceRefresh: true, session: session)
precondition(empty.rows.isEmpty && empty.succeeded && !empty.cancelled)
precondition(SupabaseAPI.cached("2026-09-07", "NCAAF", session)!.rows.isEmpty)
let cachedEmpty = await SupabaseAPI.fetchLeaguePulse(date: "2026-09-07", league: "NCAAF", session: session)
precondition(cachedEmpty.isEmpty && server.requests.count == 1, "A verified empty remains authoritative")
server.configure { request, _ in reply(for: request, marker: "recovered") }
let recovered = await SupabaseAPI.fetchLeaguePulse(date: "2026-09-07", league: "NCAAF", forceRefresh: true, session: session)
precondition(recovered.first?.title == "recovered" && server.requests.count == 1)
`);
  }, 50_000);
});
