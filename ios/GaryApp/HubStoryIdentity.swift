import Foundation

/// Presentation-only identity checks for Hub stories and the already-loaded
/// player cards. A missing or ambiguous match leaves the story readable.
enum HubStoryIdentity {
    struct PlayerCard {
        let league: String?
        let playerID: String?
        let gameID: String?
        let name: String?
        let hasPayload: Bool
    }

    /// Returns an index into the original candidate array. Supplied provider
    /// IDs are authoritative: an exact-ID miss never becomes a name match or
    /// the other game of a doubleheader. ID-less names must be unique within
    /// the current league/game. Empty packs still count toward ambiguity.
    static func playerCardIndex(
        league: String,
        slateDate: String?,
        playerID: String?,
        playerName: String?,
        gameID: String?,
        loadedDate: String,
        currentDate: String,
        candidates: [PlayerCard]
    ) -> Int? {
        guard let expectedLeague = cleaned(league)?.uppercased(),
              let storyDate = cleaned(slateDate),
              let loadedDate = cleaned(loadedDate),
              let currentDate = cleaned(currentDate),
              storyDate == currentDate, loadedDate == currentDate else { return nil }

        let expectedGame = cleaned(gameID)
        let scope = candidates.indices.filter { index in
            let card = candidates[index]
            return cleaned(card.league)?.uppercased() == expectedLeague
                && (expectedGame == nil || cleaned(card.gameID) == expectedGame)
        }

        let matches: [Int]
        if let expectedPlayer = cleaned(playerID) {
            matches = scope.filter { cleaned(candidates[$0].playerID) == expectedPlayer }
        } else {
            guard let playerName = cleaned(playerName) else { return nil }
            let query = nameKey(playerName)
            guard query.count >= 5 else { return nil }
            let exact = scope.filter { nameKey(candidates[$0].name ?? "") == query }
            if !exact.isEmpty {
                matches = exact
            } else {
                // Accept an initial plus a complete surname only when it
                // identifies one card in this scope; never use substrings.
                let tokens = nameTokens(playerName)
                guard tokens.count >= 2, tokens[0].count == 1 else { return nil }
                let surname = tokens.dropFirst().joined()
                matches = scope.filter { index in
                    let candidate = nameTokens(candidates[index].name ?? "")
                    return candidate.count >= 2 && candidate[0].hasPrefix(tokens[0])
                        && candidate.dropFirst().joined() == surname
                }
            }
        }

        guard matches.count == 1, let index = matches.first,
              candidates[index].hasPayload else { return nil }
        return index
    }

    /// The caller supplies its editorial subject (including any intentional
    /// removal of changing stat text). Framing preserves boundaries even if a
    /// provider label contains a separator. Variant keeps look-ahead rows apart.
    static func dedupeKey(
        league: String,
        slateDate: String?,
        gameID: String?,
        game: String,
        kind: String,
        subject: String,
        variant: String? = nil
    ) -> String {
        let gameKey = cleaned(gameID).map { "id:\($0)" } ?? "name:\(textKey(game))"
        return [
            cleaned(league)?.uppercased() ?? "",
            cleaned(slateDate) ?? "",
            gameKey,
            textKey(kind),
            textKey(subject),
            textKey(variant ?? ""),
        ].map { "\($0.utf8.count):\($0)" }.joined(separator: "|")
    }

    private static func cleaned(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else { return nil }
        return value
    }

    private static func textKey(_ value: String) -> String {
        value.folding(options: [.diacriticInsensitive, .caseInsensitive],
                      locale: Locale(identifier: "en_US_POSIX"))
            .split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    private static func nameKey(_ value: String) -> String {
        textKey(value).filter { $0.isLetter || $0.isNumber }
    }

    private static func nameTokens(_ value: String) -> [String] {
        value.split(whereSeparator: { $0.isWhitespace }).map { nameKey(String($0)) }
            .filter { !$0.isEmpty }
    }
}
