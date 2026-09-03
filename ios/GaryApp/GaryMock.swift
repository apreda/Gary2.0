#if DEBUG
import Foundation

// MARK: - Mock NFL day (sim design harness — founder, Sep 3 2026)
//
// Week 1 kicks off Sep 10; until then the NFL Picks page, its game pages and
// The Hub's NFL tab have nothing to render, so nothing under the pick card can
// be designed. This serves a REAL stored NFL day (GaryMockFixture.swift —
// cloned by gary2.0/scripts/mock-nfl-fixture.js) as if it were today.
//
// Mechanics: a URLProtocol registered on URLSession.shared, so every
// SupabaseAPI fetcher flows through it untouched and decodes the fixture with
// its production decoder — a row that renders is a row the contracts accept.
// NFL-scoped requests are answered from the fixture; mixed tables (the board,
// the wire) are fetched for real and the NFL rows are spliced in. Dates and
// kickoffs are tokens filled per request, so the day is always "today" and
// the football proof contract's as-of/kickoff ordering holds at any hour.
//
//   echo "mock nfl on"  > "$CONT/tmp/gary-tour.txt"; xcrun simctl spawn $UDID notifyutil -p com.gary.tour
//   echo "mock nfl off" > ...
//
// The switch persists in UserDefaults and re-arms on launch (GaryTour.start).
// Whole file compiled out of Release: no shipped build carries the protocol,
// the fixture, or the verb.
enum GaryMock {
    private static let key = "gary.mock.nfl"
    static var isOn: Bool { UserDefaults.standard.bool(forKey: key) }

    static func set(_ on: Bool) {
        UserDefaults.standard.set(on, forKey: key)
        restore()
        Task { await APICache.shared.invalidateAll() }
        print("[GaryMock] NFL mock day \(on ? "ON" : "OFF") — relaunch to drop the in-memory boards")
    }

    /// Arms or disarms the interceptor to match the persisted switch.
    static func restore() {
        if isOn { URLProtocol.registerClass(GaryMockProtocol.self) }
        else { URLProtocol.unregisterClass(GaryMockProtocol.self) }
    }

    // MARK: Token fill

    private static let eastern = TimeZone(identifier: "America/New_York")!
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// Today at an ET clock time ("20:20") as a Date.
    static func kickoff(_ hhmm: String, now: Date = Date()) -> Date {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = eastern
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        let f = DateFormatter()
        f.calendar = cal; f.timeZone = eastern; f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        let day = f.date(from: SupabaseAPI.todayEST(now: now)) ?? now
        return cal.date(bySettingHour: parts.first ?? 0, minute: parts.count > 1 ? parts[1] : 0, second: 0, of: day) ?? day
    }

    /// Resolves every fixture token against the current clock.
    static func fill(_ text: String, now: Date = Date()) -> String {
        var out = text.replacingOccurrences(of: "{{DATE}}", with: SupabaseAPI.todayEST(now: now))
        let pattern = try! NSRegularExpression(pattern: #"\{\{(ET|ASOF|PUB) (\d{1,2}:\d{2})\}\}"#)
        let ns = out as NSString
        var result = ""
        var cursor = 0
        for m in pattern.matches(in: out, range: NSRange(location: 0, length: ns.length)) {
            result += ns.substring(with: NSRange(location: cursor, length: m.range.location - cursor))
            let kind = ns.substring(with: m.range(at: 1))
            let kick = kickoff(ns.substring(with: m.range(at: 2)), now: now)
            let date: Date
            switch kind {
            case "ASOF": date = min(now.addingTimeInterval(-45 * 60), kick.addingTimeInterval(-30 * 60))
            case "PUB":  date = min(now.addingTimeInterval(-90 * 60), kick.addingTimeInterval(-60 * 60))
            default:     date = kick
            }
            result += iso.string(from: date)
            cursor = m.range.location + m.range.length
        }
        result += ns.substring(from: cursor)
        out = result
        return out
    }

    /// The board/wire rows as JSON objects, tokens filled.
    static func rows(_ literal: String) -> [[String: Any]] {
        (try? JSONSerialization.jsonObject(with: Data(fill(literal).utf8))) as? [[String: Any]] ?? []
    }
}

// MARK: - The interceptor

final class GaryMockProtocol: URLProtocol {
    private static let handledKey = "gary.mock.handled"
    /// Fresh session for pass-through fetches: custom protocols registered via
    /// registerClass apply only to URLSession.shared, so this never recurses.
    private static let passthrough = URLSession(configuration: .default)

    private enum Plan {
        case serve(String)                                    // fixture literal, filled
        case splice(table: String, mockRows: [[String: Any]]) // real fetch + NFL rows
    }

    private static func plan(for url: URL) -> Plan? {
        guard GaryMock.isOn else { return nil }
        let table = url.lastPathComponent
        let q = Dictionary(uniqueKeysWithValues: (URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems ?? []).map { ($0.name, $0.value ?? "") })
        let today = "eq.\(SupabaseAPI.todayEST())"
        switch table {
        case "weekly_nfl_picks":
            // The app selects `picks::text` — the row carries the picks as a
            // JSON string, week keys echoed from the request.
            let weekStart = q["week_start"].map { String($0.dropFirst(3)) } ?? SupabaseAPI.todayEST()
            let season = Int(q["season"].map { String($0.dropFirst(3)) } ?? "") ?? 2026
            let picksText = GaryMock.fill(GaryMockFixture.weeklyNFLPicks)
            let row: [String: Any] = ["picks": picksText, "week_start": weekStart, "week_number": 1, "season": season]
            guard let data = try? JSONSerialization.data(withJSONObject: [row]),
                  let text = String(data: data, encoding: .utf8) else { return nil }
            return .serve(text)
        case "insight_connections":
            guard q["league"] == "eq.NFL", q["date"] == today else { return nil }
            return .serve(GaryMockFixture.insightConnections)
        case "league_pulse":
            guard q["league"] == "eq.NFL", q["date"] == today else { return nil }
            return .serve(GaryMockFixture.leaguePulse)
        case "tomorrow_board":
            guard q["date"] == today else { return nil }
            return .splice(table: table, mockRows: GaryMock.rows(GaryMockFixture.boardRows))
        case "wire_items":
            guard q["date"] == today else { return nil }
            return .splice(table: table, mockRows: GaryMock.rows(GaryMockFixture.wireItems))
        default:
            return nil
        }
    }

    override class func canInit(with request: URLRequest) -> Bool {
        guard property(forKey: handledKey, in: request) == nil,
              let url = request.url, url.path.contains("/rest/v1/") else { return false }
        return plan(for: url) != nil
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, let plan = Self.plan(for: url) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL)); return
        }
        switch plan {
        case .serve(let literal):
            respond(Data(GaryMock.fill(literal).utf8))
        case .splice(let table, let mockRows):
            let mutable = (request as NSURLRequest).mutableCopy() as! NSMutableURLRequest
            URLProtocol.setProperty(true, forKey: Self.handledKey, in: mutable)
            let task = Self.passthrough.dataTask(with: mutable as URLRequest) { [weak self] data, response, error in
                guard let self else { return }
                if let error { self.client?.urlProtocol(self, didFailWithError: error); return }
                guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                    self.client?.urlProtocol(self, didReceive: response ?? URLResponse(), cacheStoragePolicy: .notAllowed)
                    self.client?.urlProtocol(self, didLoad: data ?? Data())
                    self.client?.urlProtocolDidFinishLoading(self)
                    return
                }
                self.respond(Self.spliced(table: table, real: data ?? Data(), mockRows: mockRows))
            }
            task.resume()
        }
    }

    override func stopLoading() {}

    /// Adds the NFL rows to today's real response. The board is one row per
    /// day carrying a `board` array; the wire is a flat list.
    private static func spliced(table: String, real: Data, mockRows: [[String: Any]]) -> Data {
        var rows = (try? JSONSerialization.jsonObject(with: real)) as? [[String: Any]] ?? []
        switch table {
        case "tomorrow_board":
            if rows.isEmpty { rows = [["date": SupabaseAPI.todayEST(), "board": [], "game_count": 0, "any_lines": true]] }
            var board = rows[0]["board"] as? [[String: Any]] ?? []
            board.append(contentsOf: mockRows)
            rows[0]["board"] = board
            rows[0]["game_count"] = board.count
        default:
            rows.append(contentsOf: mockRows)
        }
        return (try? JSONSerialization.data(withJSONObject: rows)) ?? real
    }

    private func respond(_ body: Data) {
        guard let url = request.url,
              let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                             headerFields: ["Content-Type": "application/json; charset=utf-8"]) else {
            client?.urlProtocol(self, didFailWithError: URLError(.cannotParseResponse)); return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
}
#endif
