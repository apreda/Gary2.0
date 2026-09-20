import SwiftUI

/// Reusable floating rules/info pop (founder: rules live in a pop, never as
/// prose on the page) — centered card over a dim field, same grammar as the
/// take overlay. Feed it any title + rows wherever rules need explaining.
struct FloatingRulesOverlay: View {
    let title: String
    let rows: [(String, String)]
    var onClose: () -> Void
    var body: some View {
        ZStack {
            Color.black.opacity(0.9).ignoresSafeArea()
                .onTapGesture { onClose() }
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    BroadcastBar(height: 13)
                    Text(title)
                        .font(GaryFonts.accent(13))
                        .tracking(1.0)
                        .foregroundStyle(GaryColors.gold)
                    Spacer(minLength: 0)
                    Button(action: onClose) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(.white.opacity(0.4))
                    }
                    .buttonStyle(.plain)
                }
                ForEach(rows, id: \.0) { r in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.0)
                            .font(GaryFonts.mono(11, bold: true)).tracking(1.0)
                            .foregroundStyle(GaryColors.gold)
                        Text(r.1)
                            .font(GaryFonts.text(13.5))
                            .foregroundStyle(.white.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(20)
            .background(RoundedRectangle(cornerRadius: 18).fill(GaryColors.cardBg))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.white.opacity(0.1), lineWidth: 1))
            .padding(.horizontal, 22)
        }
    }
}

/// The floating GARY'S TAKE pop for a contest row — centered card over a
/// dimmed field, tap-out or ✕ to close.
struct DerbyTakeOverlay: View {
    let row: SupabaseAPI.AllStarPropRow
    var onClose: () -> Void
    var body: some View {
        ZStack {
            Color.black.opacity(0.9).ignoresSafeArea()
                .onTapGesture { onClose() }
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    BroadcastBar(height: 13)
                    Text("GARY'S TAKE")
                        .font(GaryFonts.accent(13))
                        .tracking(1.0)
                        .foregroundStyle(GaryColors.gold)
                    Spacer(minLength: 0)
                    Button(action: onClose) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(.white.opacity(0.4))
                    }
                    .buttonStyle(.plain)
                }
                Text((row.player ?? "").uppercased())
                    .font(GaryFonts.display(30))
                    .foregroundStyle(.white)
                HStack(spacing: 8) {
                    if let line = row.line, let call = row.call {
                        Text("R1 O/U \(line.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(line)) : String(line)) — \(call.uppercased())\(row.odds.map { " \($0 > 0 ? "+" : "")\($0)" } ?? "")")
                            .font(GaryFonts.mono(13.5, bold: true))
                            .foregroundStyle(GaryColors.gold)
                    } else if row.call != nil {
                        // Extras: the whole bet line rides `call` (price stripped —
                        // the odds render once, from the odds field).
                        Text("\(DerbyContestSection.cleanBet(row.call).uppercased())\(row.odds.map { " \($0 > 0 ? "+" : "")\($0)" } ?? "")")
                            .font(GaryFonts.mono(13.5, bold: true))
                            .foregroundStyle(GaryColors.gold)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    if let w = row.win_odds {
                        Text("TO WIN \(w > 0 ? "+" : "")\(w)")
                            .font(GaryFonts.mono(11.5, bold: true))
                            .foregroundStyle(GaryColors.meta)
                    }
                }
                ScrollView(showsIndicators: false) {
                    // Readable paragraphs (founder): honor authored \n\n breaks;
                    // a single-block take gets soft-split into sentence groups.
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(Self.paragraphs(row.reason ?? "").enumerated()), id: \.offset) { _, p in
                            Text(p)
                                .font(GaryFonts.text(14.5))
                                .foregroundStyle(.white.opacity(0.88))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .frame(maxHeight: 380)
            }
            .padding(20)
            .background(RoundedRectangle(cornerRadius: 18).fill(GaryColors.cardBg))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.white.opacity(0.1), lineWidth: 1))
            .padding(.horizontal, 22)
        }
    }

    /// Authored \n\n paragraphs pass through; a single block splits into
    /// groups of ~3 sentences (layout only — the words are untouched).
    static func paragraphs(_ text: String) -> [String] {
        let authored = text.components(separatedBy: "\n\n").filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if authored.count > 1 { return authored }
        let sentences = text.components(separatedBy: ". ")
        guard sentences.count > 4 else { return [text] }
        let per = Int(ceil(Double(sentences.count) / 3.0))
        return stride(from: 0, to: sentences.count, by: per).map { start in
            let chunk = sentences[start..<min(start + per, sentences.count)].joined(separator: ". ")
            return chunk.hasSuffix(".") || chunk.hasSuffix("!") ? chunk : chunk + "."
        }
    }
}

