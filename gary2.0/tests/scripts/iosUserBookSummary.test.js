import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const book = readFileSync(new URL('../../../ios/GaryApp/UserBookView.swift', import.meta.url), 'utf8');
const section = book.slice(book.indexOf('struct UserBookSection:'));
const hasSwift = spawnSync('swiftc', ['--version']).status === 0;

function declaration(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing declaration: ${marker}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed declaration: ${marker}`);
}

describe('native You book summary and ledger scopes', () => {
  it.skipIf(!hasSwift)('runs production Swift to keep grading sources, history filters and open slips consistent', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-book-summary-'));
    try {
      const file = join(directory, 'main.swift');
      const members = [
        'private func record(',
        'private var summaryBets:',
        'private var summarySettled:',
        'private struct ProfitPoint:',
        'private var profitPoints:',
        'private var scopedBets:',
        'private var scopedWithGary:',
        'private var scopedYourPlays:',
        'private var scopedSettled:',
        'private var openSlips:',
        'private func matchesBookFilters(',
      ].map(marker => declaration(section, marker)).join('\n');
      writeFileSync(file, String.raw`import Foundation
${declaration(book, 'struct UserBet:')}
${declaration(book, 'enum BookTimeframe')}

func bet(_ id: String, _ kind: String, _ day: String, _ status: String,
         net: Double? = nil, placed: String? = nil, lock: String? = nil,
         favorite: Bool? = nil, pick: String = "Fixture", league: String? = nil,
         notes: String? = nil, bookmaker: String? = nil) -> UserBet {
    UserBet(id: id, kind: kind, pick_type: "game", game_date: day,
        league: league, pick_text: pick, matchup: nil, player_name: nil,
        prop_type: nil, description: nil, odds_american: -110, odds_estimated: false,
        stake_units: 1, gary_confidence: nil, streak_pick: nil, status: status,
        units_net: net, lock_at: lock, placed_at: placed, graded_by: nil,
        is_favorite: favorite, notes: notes, bookmaker: bookmaker)
}

// Only view storage is substituted; all selection and aggregation code above
// the assertions is extracted unchanged from UserBookSection.
struct BookProbe {
    var bets: [UserBet] = []
    var kindFilter = "all"
    var timeframe = "all"
    var favoritesOnly = false
    var query = ""
    ${members}

    private func ids(_ rows: [UserBet]) -> [String] { rows.map(\.id).sorted() }

    mutating func verifySourcesAndCurve() {
        bets = [
            bet("tail-loss", "tail", "2026-08-03", "lost", net: -2),
            bet("tail-win", "tail", "2026-08-01", "won", net: 1.5, placed: "2026-08-01T20:00:00Z"),
            bet("manual-win", "manual", "2026-08-01", "won", net: 999),
            bet("void", "fade", "2026-08-05", "void", net: 77),
            bet("push", "tail", "2026-08-02", "push"),
            bet("fade-loss", "fade", "2026-08-01", "lost", net: -1, placed: "2026-08-01T10:00:00Z"),
            bet("pending", "tail", "2026-08-06", "pending", net: 88),
            bet("manual-loss", "manual", "2026-08-04", "lost", net: -10),
            bet("manual-pending", "manual", "2026-08-06", "pending", net: 222),
            bet("manual-void", "manual", "2026-08-07", "void", net: 333)
        ]
        precondition(scopedBets.count == 10, "All ledger retains both grading sources")
        precondition(ids(scopedWithGary) == ["fade-loss", "pending", "push", "tail-loss", "tail-win", "void"])
        precondition(ids(scopedYourPlays) == ["manual-loss", "manual-pending", "manual-void", "manual-win"])
        precondition(ids(summaryBets) == ids(scopedWithGary), "All headline uses verified bets only")
        precondition(summarySettled.map(\.id) == ["fade-loss", "tail-win", "push", "tail-loss"],
            "Summary includes pushes, excludes pending/void, and orders by game day then placement")
        let headline = record(summarySettled)
        precondition(headline.w == 1 && headline.l == 2 && headline.p == 1 && headline.units == -1.5)
        precondition(scopedSettled.count == 8 && scopedSettled.contains { $0.id == "void" },
            "The ledger keeps void receipts even though they do not enter the summary")
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        formatter.dateFormat = "yyyy-MM-dd"
        precondition(profitPoints.map { formatter.string(from: $0.date) } == ["2026-08-01", "2026-08-02", "2026-08-03"])
        precondition(profitPoints.map(\.net) == [0.5, 0.5, -1.5],
            "The curve groups same-day tickets and accumulates daily verified net chronologically")

        kindFilter = "tail"
        precondition(ids(summaryBets) == ["pending", "push", "tail-loss", "tail-win"])
        precondition(profitPoints.map(\.net) == [1.5, 1.5, -0.5])
        kindFilter = "fade"
        precondition(ids(summaryBets) == ["fade-loss", "void"])
        precondition(profitPoints.map(\.net) == [-1])
        kindFilter = "manual"
        precondition(ids(scopedBets) == ids(scopedYourPlays) && scopedWithGary.isEmpty)
        precondition(ids(summaryBets) == ids(scopedYourPlays), "Yours headline switches to self-graded plays")
        precondition(summarySettled.map(\.id) == ["manual-win", "manual-loss"])
        let yours = record(summarySettled)
        precondition(yours.w == 1 && yours.l == 1 && yours.p == 0 && yours.units == 989)
        precondition(profitPoints.map(\.net) == [999, 989], "Yours curve never incorporates verified bets")
        print("BOOK_GRADING_SOURCES_AND_DAILY_CURVE_OK")
    }

    mutating func verifySearchAndFavorites() {
        self = BookProbe()
        bets = [
            bet("tail", "tail", "2026-08-01", "won", net: 1, favorite: true,
                pick: "Cubs ML", league: "MLB", notes: "Road value", bookmaker: "DraftKings"),
            bet("fade", "fade", "2026-08-01", "lost", net: -1, favorite: false,
                pick: "Bears spread", league: "NFL"),
            bet("manual", "manual", "2026-08-01", "won", net: 50, favorite: true,
                pick: "Bears total", league: "NFL"),
            bet("unset-favorite", "tail", "2026-08-01", "push")
        ]
        for term in ["cUbS", "mlb", "ROAD VALUE", "draftkings"] {
            query = term
            precondition(ids(scopedBets) == ["tail"], "Search matches pick, league, notes and bookmaker case-insensitively")
            precondition(ids(summarySettled) == ["tail"] && profitPoints.map(\.net) == [1])
        }
        query = "bears"
        precondition(ids(scopedBets) == ["fade", "manual"])
        precondition(ids(summarySettled) == ["fade"], "Search does not mix grading sources in All summary")
        favoritesOnly = true
        precondition(ids(scopedBets) == ["manual"] && summarySettled.isEmpty && profitPoints.isEmpty)
        kindFilter = "manual"
        precondition(ids(summarySettled) == ["manual"] && profitPoints.map(\.net) == [50])
        query = ""
        kindFilter = "all"
        precondition(ids(scopedBets) == ["manual", "tail"], "Unset and false favorites are excluded")
        precondition(ids(summarySettled) == ["tail"])
        query = "no matching ticket"
        precondition(scopedBets.isEmpty && summaryBets.isEmpty && profitPoints.isEmpty)
        print("BOOK_SEARCH_AND_FAVORITES_OK")
    }

    mutating func verifyHistoryAndOpenSlips() {
        self = BookProbe()
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/New_York")!
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        func shifted(_ day: String, _ amount: Int) -> String {
            formatter.string(from: calendar.date(byAdding: .day, value: amount, to: formatter.date(from: day)!)!)
        }
        // scopedBets uses the real clock. Build fixtures at its current Eastern
        // boundaries without changing the production declaration to inject time.
        for value in ["7d", "30d", "season"] {
            timeframe = value
            let window = BookTimeframe.window(value)!
            let before = shifted(window.start, -1)
            let after = shifted(window.end, 1)
            bets = [
                bet("floor", "tail", window.start, "won", net: 2, favorite: true, notes: "Needle"),
                bet("today", "fade", window.end, "lost", net: -1, favorite: false),
                bet("old", "tail", before, "won", net: 100, favorite: true, notes: "Needle"),
                bet("future-settled", "tail", after, "won", net: 200),
                bet("future-pending", "fade", after, "pending", lock: after + "T12:00:00Z", favorite: false, notes: "Needle"),
                bet("old-pending", "tail", before, "pending", favorite: true, notes: "Needle"),
                bet("future-tail", "tail", after, "pending", lock: after + "T20:00:00Z", favorite: true, notes: "Needle")
            ]
            precondition(ids(scopedBets) == ["floor", "today"], "History includes both date boundaries and excludes dates outside them")
            precondition(ids(summarySettled) == ["floor", "today"] && profitPoints.last?.net == 1)
            precondition(openSlips.map(\.id) == ["future-pending", "future-tail", "old-pending"],
                "Pending slips remain visible outside history dates and sort by lock with unknown locks last")
            favoritesOnly = true
            query = "needle"
            kindFilter = "tail"
            precondition(ids(scopedBets) == ["floor"] && profitPoints.last?.net == 2)
            precondition(openSlips.map(\.id) == ["future-tail", "old-pending"],
                "Open slips still obey source, favorite and search filters")
            query = "no match"
            precondition(openSlips.isEmpty && scopedBets.isEmpty)
            query = ""
            favoritesOnly = false
            kindFilter = "all"
            timeframe = "all"
            precondition(scopedBets.count == 7, "All time removes the history date boundary")
            precondition(record(summarySettled).units == 301)
        }
        print("BOOK_HISTORY_AND_OPEN_SLIPS_OK")
    }
}
var probe = BookProbe()
probe.verifySourcesAndCurve()
probe.verifySearchAndFavorites()
probe.verifyHistoryAndOpenSlips()
`);
      const output = execFileSync('swift', [file], { encoding: 'utf8', timeout: 30_000 });
      expect(output).toContain('BOOK_GRADING_SOURCES_AND_DAILY_CURVE_OK');
      expect(output).toContain('BOOK_SEARCH_AND_FAVORITES_OK');
      expect(output).toContain('BOOK_HISTORY_AND_OPEN_SLIPS_OK');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 35_000);
});
