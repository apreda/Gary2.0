import SwiftUI
import Charts
import PhotosUI

enum BookTicketTime {
    static func gameDate(_ value: String?) -> String? {
        guard let date = userBookInstant(value) else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func isLocked(_ value: String?, now: Date = Date()) -> Bool {
        guard let date = userBookInstant(value) else { return true }
        return now >= date
    }
}

enum BookPropEligibility {
    static func canVerify(_ prop: PropPick) -> Bool {
        // The server rejects explicit HR/TD lanes. Legacy home-run threats
        // follow the existing model classification; tdCategory alone is not a lane.
        !["HR", "TD"].contains((prop.lane ?? "CORE").uppercased()) && !prop.isHRLane
    }
}

struct BookDirectorySnapshot<Game, Prop> {
    private(set) var date: String?
    private(set) var games: [Game] = []
    private(set) var props: [Prop] = []
    private(set) var failedLanes: [String] = []

    mutating func apply(date: String, games: [Game]?, props: [Prop]?) {
        if self.date != date { self.games = []; self.props = [] }
        self.date = date
        failedLanes = []
        if let games { self.games = games } else { failedLanes.append("Game picks") }
        if let props { self.props = props } else { failedLanes.append("Props") }
    }

    var errorMessage: String? {
        guard !failedLanes.isEmpty else { return nil }
        let unavailable = failedLanes.joined(separator: " and ")
        let retained = games.isEmpty && props.isEmpty ? "" : " Available picks below may be from an earlier refresh."
        return "\(unavailable) couldn't refresh.\(retained) Try again when you're connected. You can still log an outside bet."
    }
}

