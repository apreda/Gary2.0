import Foundation

/// Shared identity rules for joining Hub signals, schedule teams and stored cards.
/// Provider ids and abbreviations are only meaningful inside their league.
enum HubCardIdentity {
    static func sameLeague(_ lhs: String?, _ rhs: String) -> Bool {
        guard let lhs else { return false }
        return lhs.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == rhs.uppercased()
    }

    static func nameKey(_ value: String) -> String {
        value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .filter { $0.isLetter || $0.isNumber }
    }

    static func abbreviation(_ stored: String?, name: String, league: String) -> String? {
        let supplied = stored?.trimmingCharacters(in: .whitespacesAndNewlines)
        let value = (supplied?.isEmpty == false ? supplied : nil)
            ?? (league.uppercased() == "NCAAF" ? NCAAFTeams.abbreviation(name) : nil)
        guard let value else { return nil }
        let upper = value.uppercased()
        if league.uppercased() == "MLB" {
            return ["AZ": "ARI", "CWS": "CHW", "ATH": "OAK"][upper] ?? upper
        }
        return upper
    }

    static func matchesTeam(_ query: String, name: String?, abbr: String?, league: String) -> Bool {
        let key = nameKey(query)
        guard !key.isEmpty else { return false }
        let team = name ?? ""
        if let code = abbreviation(abbr, name: team, league: league),
           abbreviation(query, name: query, league: league) == code { return true }
        if key == nameKey(team) { return true }
        if league.uppercased() == "NCAAF" {
            // "Ohio" is not Ohio State; a shared mascot is not a school id.
            guard let school = NCAAFTeams.school(query), let candidate = NCAAFTeams.school(team) else { return false }
            return school == candidate
        }
        // Pro lanes supply single- and multiword nicknames ("Yankees", "Red Sox").
        // Match a complete trailing phrase, never a substring within a name.
        let queryWords = query.split(separator: " ").map { nameKey(String($0)) }
        let teamWords = team.split(separator: " ").map { nameKey(String($0)) }
        guard key.count > 2, !teamWords.isEmpty else { return false }
        return (teamWords.count >= queryWords.count && Array(teamWords.suffix(queryWords.count)) == queryWords)
            || (queryWords.count >= teamWords.count && Array(queryWords.suffix(teamWords.count)) == teamWords)
    }

    static func cardBelongsToTeam(cardLeague: String?, cardAbbr: String?, league: String, team: String, abbr: String?) -> Bool {
        guard sameLeague(cardLeague, league),
              let expected = abbreviation(abbr, name: team, league: league),
              let actual = abbreviation(cardAbbr, name: "", league: league) else { return false }
        return expected == actual
    }

    static func uniquePlayerIndex(_ query: String, names: [String]) -> Int? {
        let key = nameKey(query)
        guard key.count >= 5 else { return nil }
        let exact = names.indices.filter { nameKey(names[$0]) == key }
        if !exact.isEmpty { return exact.count == 1 ? exact[0] : nil }
        let tokens = query.split(separator: " ").map { nameKey(String($0)) }
        guard tokens.count >= 2, tokens[0].count == 1 else { return nil }
        let surname = tokens.dropFirst().joined()
        let hits = names.indices.filter { index in
            let candidate = names[index].split(separator: " ").map { nameKey(String($0)) }
            return candidate.count >= 2 && candidate[0].hasPrefix(tokens[0])
                && candidate.dropFirst().joined() == surname
        }
        return hits.count == 1 ? hits[0] : nil
    }
}
