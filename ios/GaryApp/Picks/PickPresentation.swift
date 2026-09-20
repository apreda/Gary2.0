import Foundation

/// Conviction tiers — Gary's vocabulary, not calculator language ("82%" is
/// fake precision and self-inflicted accountability). Bands set from the real
/// Apr–Jun 2026 confidence distribution so the tiers actually spread:
/// 27% SPRINKLE · 48% LEAN · 25% HAMMER.
func convictionTier(_ confidence: Double) -> String {
    confidence >= 0.80 ? "HAMMER" : confidence >= 0.70 ? "LEAN" : "SPRINKLE"
}

/// Splits a rationale into (take, rest): the opening 1–2 SENTENCES lead the
/// card back at quote weight and seed the front quote + share card. Sentence-
/// walked (not paragraph-split) because stored rationales open with a single
/// ~850-char paragraph; works for the current announcer voice and any future
/// shorter one. Strips the literal "Gary's Take" heading the JSON template
/// pastes in. Anything that doesn't split cleanly renders whole as `rest`.
func splitTake(_ rationale: String?) -> (take: String?, rest: String?) {
    guard var r = rationale?.trimmingCharacters(in: .whitespacesAndNewlines), !r.isEmpty else {
        return (nil, "No rationale available.")
    }
    if r.lowercased().hasPrefix("gary's take") {
        r = String(r.dropFirst("gary's take".count)).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // Sentence boundaries: ./!/? followed by whitespace, where the word
    // before the period isn't an abbreviation ("St. Louis", "Jr.", "vs.").
    let abbreviations: Set<String> = ["st", "jr", "sr", "dr", "vs", "mr", "mrs", "no"]
    var boundaries: [String.Index] = []
    var i = r.startIndex
    while i < r.endIndex, boundaries.count < 3 {
        let ch = r[i]
        if ch == "." || ch == "!" || ch == "?" {
            let next = r.index(after: i)
            if next == r.endIndex || r[next] == " " || r[next] == "\n" {
                let wordStart = r[..<i].lastIndex(where: { $0 == " " || $0 == "\n" })
                    .map { r.index(after: $0) } ?? r.startIndex
                if !abbreviations.contains(r[wordStart..<i].lowercased()) {
                    boundaries.append(next)
                }
            }
        }
        i = r.index(after: i)
    }

    // The take = the longest 1–2 sentence opening that stays under ~300
    // chars — enough to be a real quote, short enough to BE a quote.
    var cut: String.Index? = nil
    for end in boundaries.prefix(2) {
        if r.distance(from: r.startIndex, to: end) <= 300 { cut = end } else { break }
    }
    guard let cutIdx = cut else { return (nil, r) }
    let take = String(r[..<cutIdx]).trimmingCharacters(in: .whitespacesAndNewlines)
    let rest = String(r[cutIdx...]).trimmingCharacters(in: .whitespacesAndNewlines)
    guard take.count >= 40, !rest.isEmpty else { return (nil, r) }
    return (take, rest)
}
