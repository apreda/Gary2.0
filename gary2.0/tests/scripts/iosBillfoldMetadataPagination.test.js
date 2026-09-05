import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const api = readFileSync(new URL('../../../ios/GaryApp/SupabaseAPI.swift', import.meta.url), 'utf8');
const models = readFileSync(new URL('../../../ios/GaryApp/Models.swift', import.meta.url), 'utf8');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;
const method = api.slice(api.indexOf('    static func fetchBillfoldPickMetadata('), api.indexOf('    /// THE PROPS BOOK starts here'));
const pagerStart = api.indexOf('    private static func fetchAllPages<');
const pager = api.slice(pagerStart, api.indexOf('\n    // MARK:', pagerStart));
const modelStart = models.indexOf('struct BillfoldPickMetadata {');
const model = models.slice(modelStart, models.indexOf('\n}', modelStart) + 2);

describe('native Billfold metadata pagination', () => {
  it.skipIf(!hasSwift)('executes the real Swift reader through multiple pages and never caches a failed partial window', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-billfold-pages-'));
    try {
      const script = `import Foundation
${model}
final class APICache {
    static let shared = APICache()
    static let billfoldTTL: TimeInterval = 60
    var values: [String: Any] = [:]
    var writes = 0
    func get<T>(_ key: String, ttl: TimeInterval?) async -> T? { values[key] as? T }
    func set<T>(_ key: String, value: T) async { values[key] = value; writes += 1 }
}
enum Reader {
    static var requests: [[URLQueryItem]] = []
    static var failSecond = false
    static func billfoldSnapshotWindowKey() -> String { "fixture" }
    static func fetchDecodablePage<T: Decodable>(table: String, query: [URLQueryItem]) async throws -> [T] {
        precondition(table == "pick_history_summary")
        requests.append(query)
        let values = Dictionary(uniqueKeysWithValues: query.map { ($0.name, $0.value ?? "") })
        precondition(values["select"] == "game_date,pick,confidence,is_top_pick")
        precondition(values["game_date"] == "gte.2026-06-07")
        precondition(values["order"] == "game_date.desc,source.asc,src_key.asc,slot.asc")
        precondition(values["limit"] == "1000")
        let offset = Int(values["offset"]!)!
        if failSecond && offset == 1000 { throw NSError(domain: "fixture", code: 503) }
        let end = min(offset + 1000, 1286)
        let rows: [[String: Any]] = (offset..<end).map { index in
            ["game_date": index < 1000 ? "2026-09-04" : "2026-06-07", "pick": "Ticket \\(index)", "confidence": 0.61, "is_top_pick": index == 1285]
        }
        return try JSONDecoder().decode([T].self, from: JSONSerialization.data(withJSONObject: rows))
    }
${pager}
${method}
}
// An old successful single-page cache must not satisfy the new reader.
APICache.shared.values["billfoldPickMetadataV3_2026-06-07_fixture"] = [BillfoldPickMetadata(date: "2026-09-04", pick: "Truncated cache", confidence: nil, isTopPick: false)]
let all = try await Reader.fetchBillfoldPickMetadata(since: "2026-06-07")
precondition(all.count == 1286 && all.last!.pick == "Ticket 1285" && all.last!.isTopPick)
precondition(Reader.requests.count == 2 && APICache.shared.writes == 1)
let cached = try await Reader.fetchBillfoldPickMetadata(since: "2026-06-07")
precondition(cached.count == 1286 && Reader.requests.count == 2)
Reader.failSecond = true
do {
    _ = try await Reader.fetchBillfoldPickMetadata(since: "2026-06-07", forceRefresh: true)
    fatalError("A failed second page must throw")
} catch {
    precondition(APICache.shared.writes == 1, "Partial rows must never replace the complete cache")
}
let retained = try await Reader.fetchBillfoldPickMetadata(since: "2026-06-07")
precondition(retained.count == 1286 && Reader.requests.count == 4)
print("complete=1286 requests=4 writes=1")
`;
      const path = join(directory, 'metadata.swift');
      writeFileSync(path, script);
      const output = execFileSync('swift', [path], { encoding: 'utf8', timeout: 30_000 });
      expect(output).toContain('complete=1286 requests=4 writes=1');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 40_000);
});
