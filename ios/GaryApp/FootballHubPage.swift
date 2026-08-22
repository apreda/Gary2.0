import SwiftUI

/// Fail-closed display contract for football proof rows. The backend category
/// selects a component, but only its structured payload is allowed to make a
/// market or live-state claim visible.
enum FootballProofContract {
    enum SweatState: String {
        case watch = "WATCH"
        case holding = "HOLDING"
        case flipped = "FLIPPED"
        case held = "HELD"
        case missed = "MISSED"
        case push = "PUSH"

        var isLiveOrFinal: Bool { self != .watch }
        var isFinal: Bool { self == .held || self == .missed || self == .push }
    }

    private static let factors: Set<String> = [
        "THE_NUMBER", "RUSH_EDGE", "AIR_EDGE", "PRESSURE", "BALL_SECURITY",
    ]
    private static let excludedVendors: Set<String> = [
        "", "unknown", "openingsnapshot", "kalshi", "polymarket",
    ]

    private static func text(_ value: String?) -> String? {
        guard let cleaned = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !cleaned.isEmpty else { return nil }
        return cleaned
    }

    private static func value(_ value: InsightMetaValue?) -> String? {
        text(value?.display)
    }

    // PERF: these were allocated per call. One receipt runs `date()` seven
    // times, and the contract runs for every row on every pass of the page's
    // funnel — that is hundreds of formatter allocations per render for a
    // parse that never changes shape. ISO8601DateFormatter is thread-safe for
    // parsing, so one shared pair does the whole app's football proof work.
    private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoStandard: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static func date(_ value: String?) -> Date? {
        guard let value = text(value) else { return nil }
        return isoFractional.date(from: value) ?? isoStandard.date(from: value)
    }

    private static func finite(_ value: Double?) -> Double? {
        guard let value, value.isFinite else { return nil }
        return value
    }

    private static func vendorKey(_ value: String?) -> String {
        (text(value) ?? "").lowercased().filter { $0.isLetter || $0.isNumber }
    }

    /// AFTER GARY is a receipt, not editorial copy. Every identity, quote,
    /// timestamp, source, and movement field must be present and internally
    /// consistent before either the Hub or an exact-game page may render it.
    static func isRenderableAfterGary(
        _ signal: Signal,
        exactGameID: String? = nil,
        now: Date = Date()
    ) -> Bool {
        guard signal.kind == .afterGary,
              let meta = signal.afterGary,
              text(meta.kind)?.lowercased() == "after_gary",
              meta.version == 1,
              text(meta.pick_id) != nil,
              let outerGameID = text(signal.gameId),
              let sealedGameID = text(meta.game_id),
              outerGameID == sealedGameID,
              exactGameID.map({ $0 == outerGameID }) ?? true,
              text(meta.pick_label) != nil,
              !excludedVendors.contains(vendorKey(meta.vendor)),
              text(meta.published_at_source)?.lowercased() == "pick",
              ["provider_updated_at", "retrieved_at"].contains(text(meta.as_of_source)?.lowercased() ?? ""),
              let publishedAt = date(meta.published_at),
              let observedAt = date(meta.as_of),
              let kickoff = date(meta.kickoff),
              publishedAt <= observedAt,
              observedAt < kickoff,
              publishedAt < kickoff,
              observedAt <= now.addingTimeInterval(300),
              ["pregame", "closed"].contains(text(meta.market_state)?.lowercased() ?? ""),
              let market = text(meta.market_type)?.lowercased(),
              let side = text(meta.pick_side)?.lowercased(),
              let published = meta.published,
              let current = meta.current,
              let publishedOdds = finite(published.odds), publishedOdds != 0,
              let currentOdds = finite(current.odds), currentOdds != 0,
              let movement = meta.movement,
              let advantage = text(movement.advantage)?.lowercased(),
              ["same", "gary", "now"].contains(advantage),
              let unit = text(movement.primary_unit)?.lowercased(),
              let primaryValue = finite(movement.primary_value), primaryValue >= 0,
              (advantage == "same" ? primaryValue < 0.001 : primaryValue > 0) else { return false }

        switch market {
        case "moneyline":
            guard ["home", "away"].contains(side), unit == "probability_points" else { return false }
        case "spread":
            guard ["home", "away"].contains(side),
                  finite(published.line) != nil, finite(current.line) != nil,
                  ["points", "probability_points"].contains(unit) else { return false }
        case "total":
            guard ["over", "under"].contains(side),
                  let publishedLine = finite(published.line), publishedLine > 0,
                  let currentLine = finite(current.line), currentLine > 0,
                  ["points", "probability_points"].contains(unit) else { return false }
        default:
            return false
        }

        if unit == "points" {
            return finite(movement.line_delta_for_pick) != nil
        }
        return finite(movement.price_delta_pp_for_pick) != nil
    }

    static func sweatState(_ signal: Signal) -> SweatState? {
        guard signal.kind == .theSweat,
              let raw = text(signal.sweat?.state)?.lowercased() else { return nil }
        switch raw {
        case "watch": return .watch
        case "holding": return .holding
        case "flipped": return .flipped
        case "held": return .held
        case "missed": return .missed
        case "push": return .push
        default: return nil
        }
    }

    static func isRenderableSweat(_ signal: Signal, includeWatch: Bool) -> Bool {
        guard let meta = signal.sweat,
              text(meta.kind)?.lowercased() == "the_sweat",
              text(meta.pick_id) != nil,
              text(signal.gameId) != nil,
              let factor = text(meta.factor_code)?.uppercased(), factors.contains(factor),
              date(meta.as_of) != nil,
              let state = sweatState(signal),
              includeWatch || state.isLiveOrFinal else { return false }

        let hasBaseline = value(meta.baseline) != nil || value(meta.baseline_selected) != nil
        let hasLive = value(meta.live_value) != nil
            || (value(meta.live_selected) != nil && value(meta.live_opponent) != nil)
        if state == .watch {
            guard hasBaseline else { return false }
        } else {
            guard hasLive else { return false }
        }

        if factor == "THE_NUMBER" {
            guard ["spread", "moneyline", "total"].contains(text(meta.market_type)?.lowercased() ?? "")
            else { return false }
        }
        return true
    }

    /// The caller supplies rows for one exact provider game. Once the audited
    /// ticket factor (THE_NUMBER) reaches a terminal state, older live snapshots
    /// cannot sit beside it or turn the section summary back into WATCH. Keep
    /// only explicit terminal states; no factor outcome is inferred here.
    static func finalScopedSweat(_ signals: [Signal]) -> [Signal] {
        let ticketIsTerminal = signals.contains { signal in
            text(signal.sweat?.factor_code)?.uppercased() == "THE_NUMBER"
                && sweatState(signal)?.isFinal == true
        }
        guard ticketIsTerminal else { return signals }
        return signals.filter { sweatState($0)?.isFinal == true }
    }

    static func isRenderableMarketRange(
        _ signal: Signal,
        slateRow: TomorrowBoardRow?,
        now: Date = Date()
    ) -> Bool {
        guard signal.kind == .marketRange,
              let meta = signal.marketRange,
              text(meta.kind)?.lowercased() == "market_range",
              text(meta.source)?.lowercased() == "balldontlie_odds",
              let signalGameID = text(signal.gameId),
              let slateRow,
              slateRow.bdl_game_id.map(String.init) == signalGameID,
              text(slateRow.kickoff_status)?.lowercased() == "confirmed",
              let kickoff = date(slateRow.commence_time), kickoff > now,
              let proofKickoff = date(meta.kickoff),
              abs(proofKickoff.timeIntervalSince(kickoff)) < 1,
              let observed = date(meta.as_of), observed < kickoff,
              observed <= now.addingTimeInterval(300),
              let market = text(meta.market)?.lowercased(),
              let metric = text(meta.metric)?.lowercased(),
              let low = meta.low, let high = meta.high, let range = meta.range,
              low <= high, range >= 0, abs((high - low) - range) < 0.001,
              let bookCount = meta.book_count, bookCount >= 3,
              let vendors = meta.vendors else { return false }

        let vendorKeys = Set(vendors.compactMap(text).map {
            $0.lowercased().filter { $0.isLetter || $0.isNumber }
        }.filter { !$0.isEmpty })
        guard vendorKeys.count == bookCount else { return false }

        switch market {
        case "total": return metric == "sportsbook_total_range"
        case "spread": return metric == "sportsbook_home_spread_range"
        default: return false
        }
    }
}

// The football Hub PAGE is gone (founder, Aug 21 2026): NFL and NCAAF render
// HubView's own MLB page — the same slate strip, THE LEAD, Best of the Board,
// beats, renderers, chrome and mechanics, carrying football's lanes. What
// remains here is the part that was never about layout: the fail-closed proof
// contract above, which HubView applies once at `leagueSignals` so no football
// surface can show an unverifiable receipt, live factor, or market range.
