// ShareCards.swift — Share Cards (pick → branded story/square image).

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Share Cards (pick → branded square image)
//
// The share buttons render the Headline card below. States ride `gameResult`:
// pregame (no stamp), CASHED (gold) on wins, LOST on losses.
// HOUSE RULE: share assets carry UNITS/records only — never dollars.

/// Which side of the matchup does the pick text back? Short mascot first,
/// then any distinctive ≥4-char word of the full name — display truncation
/// can strip mascots ("Vegas Golden ML"). Sibling of CompactPickRow.sideIsPicked.
func sharePickSideMatch(pickText: String, full: String?, short: String, otherFull: String?) -> Bool {
    let p = pickText.lowercased()
    if !short.isEmpty, p.contains(short.lowercased()) { return true }
    guard let full, !full.isEmpty else { return false }
    let otherWords = Set((otherFull ?? "").lowercased().split(separator: " ").map(String.init))
    return full.lowercased().split(separator: " ").map(String.init)
        .contains { $0.count >= 4 && !otherWords.contains($0) && p.contains($0) }
}

/// Market + call as separate pieces ("H+R+RBI", "OVER 0.5") — the market
/// abbreviated exactly like the prop chip. Headline cards stack them as two
/// lines.
func sharePropMarketParts(_ prop: PropPick) -> (market: String, call: String) {
    var words = Formatters.propDisplay(prop.prop, league: prop.effectiveLeague)
        .split(separator: " ").map(String.init)
    if let last = words.last, Double(last) != nil { words.removeLast() }
    let name = words.joined(separator: " ").uppercased()
    let market = CompactPropRow.marketAbbrevShared[name] ?? name
    var call = (prop.bet ?? "").uppercased()
    if let raw = prop.line?.trimmingCharacters(in: .whitespaces), !raw.isEmpty {
        let lineText: String
        if let d = Double(raw) {
            lineText = d.truncatingRemainder(dividingBy: 1) == 0
                ? String(format: "%g", d) : String(format: "%.1f", d)
        } else { lineText = raw }
        call = call.isEmpty ? lineText : "\(call) \(lineText)"
    }
    return (market, call)
}

/// Renders THE prop share image — the square Headline prop card at 2x.
/// Main-thread only (ImageRenderer); called from button actions. ONE
/// attachment, same rule as renderPickShareImages (founder, Jul 4): two
/// attachments + the tall story canvas read badly in Messages.
@MainActor
func renderPropShareImages(prop: PropPick, gameResult: String?) -> [UIImage] {
    let renderer = ImageRenderer(content: HeadlineSharePropCardView(prop: prop, gameResult: gameResult, square: true, bare: true))
    renderer.scale = 2
    return renderer.uiImage.map { [$0] } ?? []
}

/// "Headline" share card — the Volt Mode direction from the range boards,
/// re-cut in Gary's own colors: the pick as huge display type on warm black,
/// gold eyebrow, the bear riding the top corner so the brand survives any
/// crop. FLAGSHIP (chosen Jun 11): this is what the share buttons render.
struct HeadlineShareCardView: View {
    let pick: GaryPick
    var gameResult: String? = nil
    var square: Bool = false
    var bare: Bool = false

    private var tier: String? { pick.confidence.map { convictionTier(min(max($0, 0), 1)) } }
    private var stamp: (text: String, color: Color)? {
        switch gameResult?.lowercased() {
        case "won":  return ("CASHED", GaryColors.gold)
        case "lost": return ("LOST", GaryColors.gold)
        default:     return nil
        }
    }
    private var awayShort: String { Formatters.shortTeamName(pick.awayTeam, league: pick.league) }
    private var homeShort: String { Formatters.shortTeamName(pick.homeTeam, league: pick.league) }
    private var awayPicked: Bool {
        sharePickSideMatch(pickText: pick.pick ?? "", full: pick.awayTeam, short: awayShort, otherFull: pick.homeTeam)
    }
    private var homePicked: Bool {
        sharePickSideMatch(pickText: pick.pick ?? "", full: pick.homeTeam, short: homeShort, otherFull: pick.awayTeam)
    }
    private var pickParts: (pick: String, odds: String) { pick.formattedPickParts }
    /// The pick, one word per line, "ML" spelled out — headline type wants
    /// full words stacked tall ("NATIONALS / MONEYLINE").
    private var heroLines: String {
        // Specials: name on top, the claim on one line under it (the word-per-
        // line split below would stack "TO/WIN/THE/DERBY" absurdly).
        if (pick.type ?? "") == "special" {
            var w = (pick.pick ?? "").split(separator: " ").map(String.init)
            w.removeAll { $0.range(of: #"^[+-]?\d{3,}$"#, options: .regularExpression) != nil }
            let raw = w.joined(separator: " ")
            // Same verb split as the on-page face — name line, claim line.
            for verb in [" to ", " over ", " under "] {
                if let r = raw.range(of: verb, options: .caseInsensitive) {
                    let claim = String(raw[r.lowerBound...]).trimmingCharacters(in: .whitespaces)
                    return "\(String(raw[..<r.lowerBound]).uppercased())\n\(claim.uppercased())"
                }
            }
            // No bet verb ("Walker longest HR") — name still leads its own line.
            let parts = raw.split(separator: " ").map(String.init)
            if parts.count >= 3 {
                return "\(parts[0].uppercased())\n\(parts.dropFirst().joined(separator: " ").uppercased())"
            }
            return raw.uppercased()
        }
        var words = pickParts.pick.uppercased().split(separator: " ").map(String.init)
        if let i = words.firstIndex(of: "ML") { words[i] = "MONEYLINE" }
        // "ANYTIME GOAL OVER 1" -> "ANYTIME GOAL" (line 1 is implied; book convention)
        if words.contains("ANYTIME"), words.suffix(2) == ["OVER", "1"] { words.removeLast(2) }
        return words.joined(separator: "\n")
    }
    private var metaLine: String {
        // The hero is the exact published call. Put both poll ranks in the
        // matchup so the selected team's context also survives a shared image.
        let rankings = pick.collegeRankings
        let opponent = rankings.hasRankings
            ? rankings.matchup(
                away: scoreboardTeamAbbreviation(pick.awayTeam, stored: pick.awayTeamAbbreviation, league: pick.league),
                home: scoreboardTeamAbbreviation(pick.homeTeam, stored: pick.homeTeamAbbreviation, league: pick.league))
            : homePicked ? "vs \(awayShort)"
            : awayPicked ? "@ \(homeShort)"
            : "\(awayShort) @ \(homeShort)"
        let t = Formatters.formatCommenceTime(pick.displayTime)
        var parts = [opponent]
        if !t.isEmpty { parts.append(t) }
        if !pickParts.odds.isEmpty { parts.append(pickParts.odds) }
        return parts.joined(separator: " · ")
    }

    /// The card's ONE sport-color touch — the league token leading the meta
    /// row. MLB uses the lightened grass (flat #2D5A27 dies on warm black).
    private var sportAccentOnDark: Color {
        let s = Sport.from(league: pick.league)
        return (s == .mlb || s == .mlbHR) ? GaryColors.mlbGrass : s.accentColor
    }

    private var cardWidth: CGFloat { square ? 460 : 470 }

    var body: some View {
        ZStack {
            // bare (Jul 5, founder): the shared image IS the card, no canvas behind it. The card's own
            // rounded rectangle becomes the image edge (transparent corners), so it reads as a native
            // card in Messages and DMs instead of a card floating on a black box.
            if !bare {
                RadialGradient(colors: [Color(hex: "#151311"), Color(hex: "#0B0A09")],
                               center: .top, startRadius: 60, endRadius: square ? 640 : 1000)
            }

            headlineCard

            if let stamp {
                Text(stamp.text)
                    .font(GaryFonts.mono(square ? 38 : 46, bold: true)).tracking(4)
                    .foregroundStyle(stamp.color.opacity(0.92))
                    .padding(.horizontal, 22).padding(.vertical, 10)
                    .overlay(Rectangle().stroke(stamp.color.opacity(0.85), lineWidth: 3))
                    .rotationEffect(.degrees(-12))
            }
        }
        .frame(width: bare ? nil : 540, height: bare ? nil : (square ? 540 : 960))
    }

    private var headlineCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Text("GARY'S PICK")
                    .font(GaryFonts.mono(14, bold: true)).tracking(3)
                    .foregroundStyle(GaryColors.gold)
                    .padding(.top, 8)
                Spacer()
                Image(GaryBrand.mark)
                    .resizable().scaledToFit()
                    .frame(width: 54, height: 54)
            }

            Text(heroLines)
                .font(GaryFonts.display(square ? 62 : 74))
                .foregroundStyle(.white)
                .lineSpacing(0)
                .lineLimit(4)
                .minimumScaleFactor(0.5)
                .padding(.top, 16)

            HStack(alignment: .firstTextBaseline, spacing: 9) {
                Text((pick.league ?? "").uppercased())
                    .font(GaryFonts.mono(13, bold: true)).tracking(1.5)
                    .foregroundStyle(sportAccentOnDark)
                CollegeRankText.label(metaLine, size: 18)
                    .font(GaryFonts.text(18, .medium))
                    .accessibilityLabel(metaLine)
                    .foregroundStyle(.white.opacity(0.55))
            }
            .padding(.top, 14)

            Rectangle()
                .fill(.white.opacity(0.12))
                .frame(height: 1)
                .padding(.vertical, 18)

            HStack {
                Text("betwithgary.ai")
                    .font(GaryFonts.mono(12.5))
                    .foregroundStyle(GaryColors.gold.opacity(0.8))
                Spacer()
            }
        }
        .padding(square ? 30 : 34)
        .frame(width: cardWidth, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Color(hex: "#121110"))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.10), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.55), radius: 26, y: 14)
    }
}

/// Prop sibling of the Headline card — market + call stacked as the headline
/// ("H+R+RBI" / "OVER 0.5"), the player leading the meta row. FLAGSHIP for
/// prop shares, paired with HeadlineShareCardView.
struct HeadlineSharePropCardView: View {
    let prop: PropPick
    var gameResult: String? = nil
    var square: Bool = false
    var bare: Bool = false

    private var tier: String? { prop.confidence.map { convictionTier(min(max($0, 0), 1)) } }
    private var stamp: (text: String, color: Color)? {
        switch gameResult?.lowercased() {
        case "won":  return ("CASHED", GaryColors.gold)
        case "lost": return ("LOST", GaryColors.gold)
        default:     return nil
        }
    }
    private var heroLines: String {
        let parts = sharePropMarketParts(prop)
        let bet = parts.call.isEmpty ? parts.market : "\(parts.market) \(parts.call)"
        let player = (prop.player ?? "").uppercased()
        return player.isEmpty ? bet : "\(player)\n\(bet)"
    }
    private var metaLine: String {
        var parts: [String] = []
        let team = Formatters.shortTeamName(prop.team, league: prop.effectiveLeague)
        if !team.isEmpty { parts.append(team) }
        let t = Formatters.formatCommenceTime(prop.commence_time)
        if !t.isEmpty { parts.append(t) }
        let odds = Formatters.americanOdds(prop.odds)
        if !odds.isEmpty { parts.append(odds) }
        return parts.joined(separator: " · ")
    }
    private var sportAccentOnDark: Color {
        let s = Sport.from(league: prop.effectiveLeague)
        return (s == .mlb || s == .mlbHR) ? GaryColors.mlbGrass : s.accentColor
    }

    private var cardWidth: CGFloat { square ? 460 : 470 }

    var body: some View {
        ZStack {
            // bare (Jul 5, founder): the shared image IS the card, no canvas behind it. The card's own
            // rounded rectangle becomes the image edge (transparent corners), so it reads as a native
            // card in Messages and DMs instead of a card floating on a black box.
            if !bare {
                RadialGradient(colors: [Color(hex: "#151311"), Color(hex: "#0B0A09")],
                               center: .top, startRadius: 60, endRadius: square ? 640 : 1000)
            }

            headlineCard

            if let stamp {
                Text(stamp.text)
                    .font(GaryFonts.mono(square ? 38 : 46, bold: true)).tracking(4)
                    .foregroundStyle(stamp.color.opacity(0.92))
                    .padding(.horizontal, 22).padding(.vertical, 10)
                    .overlay(Rectangle().stroke(stamp.color.opacity(0.85), lineWidth: 3))
                    .rotationEffect(.degrees(-12))
            }
        }
        .frame(width: bare ? nil : 540, height: bare ? nil : (square ? 540 : 960))
    }

    private var headlineCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Text("GARY'S PICK")
                    .font(GaryFonts.mono(14, bold: true)).tracking(3)
                    .foregroundStyle(GaryColors.gold)
                    .padding(.top, 8)
                Spacer()
                Image(GaryBrand.mark)
                    .resizable().scaledToFit()
                    .frame(width: 54, height: 54)
            }

            Text(heroLines)
                .font(GaryFonts.display(square ? 58 : 70))
                .foregroundStyle(.white)
                .lineSpacing(0)
                .lineLimit(4)
                .minimumScaleFactor(0.45)
                .padding(.top, 16)

            HStack(alignment: .firstTextBaseline, spacing: 9) {
                Text(((prop.effectiveLeague ?? "") + " · PROP").uppercased())
                    .font(GaryFonts.mono(13, bold: true)).tracking(1.5)
                    .foregroundStyle(sportAccentOnDark)
                Text(metaLine)
                    .font(GaryFonts.text(18, .medium))
                    .foregroundStyle(.white.opacity(0.55))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .padding(.top, 14)

            Rectangle()
                .fill(.white.opacity(0.12))
                .frame(height: 1)
                .padding(.vertical, 18)

            HStack {
                Text("betwithgary.ai")
                    .font(GaryFonts.mono(12.5))
                    .foregroundStyle(GaryColors.gold.opacity(0.8))
                Spacer()
            }
        }
        .padding(square ? 30 : 34)
        .frame(width: cardWidth, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Color(hex: "#121110"))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.10), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.55), radius: 26, y: 14)
    }
}

#if DEBUG
// MARK: Share card previews — one per sport skin + result states

#endif

/// Renders THE share image — the square Headline card at 2x. Main-thread only
/// (ImageRenderer); called from button actions. ONE attachment (founder, Jul 4):
/// sharing both formats made Messages attach two cards, and the 9:16 story
/// canvas read as a tall mostly-empty image in a text bubble. The square is
/// the one shape that reads clean in texts, DMs, and feeds; the story render
/// stays available in code for an explicit story-format option later.
@MainActor
func renderPickShareImages(pick: GaryPick, gameResult: String?) -> [UIImage] {
    let renderer = ImageRenderer(content: HeadlineShareCardView(pick: pick, gameResult: gameResult, square: true, bare: true))
    renderer.scale = 2
    return renderer.uiImage.map { [$0] } ?? []
}

/// Identifiable wrapper so the share sheet rides .sheet(item:).
struct PickShareItem: Identifiable {
    let id = UUID()
    let images: [UIImage]
}

struct ActivityShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

/// One literal back-face layout for both game picks and prop picks. Supplying
/// different take/share/book actions cannot change its typography, geometry,
/// expansion behavior, fade, border, or footer.
struct GaryTakeCardBack<Tail: View>: View {
    let flipped: Bool
    let takeText: String?
    let readingTarget: ReadingContentTarget?
    let shareAccessibilityLabel: String
    let shareImages: () -> [UIImage]
    let tail: Tail

    @State private var shareItem: PickShareItem? = nil
    @State private var copiedTake = false
    @State private var caseExpanded = false

    init(flipped: Bool,
         takeText: String?,
         readingTarget: ReadingContentTarget? = nil,
         shareAccessibilityLabel: String,
         shareImages: @escaping () -> [UIImage],
         @ViewBuilder tail: () -> Tail) {
        self.flipped = flipped
        self.takeText = takeText
        self.readingTarget = readingTarget
        self.shareAccessibilityLabel = shareAccessibilityLabel
        self.shareImages = shareImages
        self.tail = tail()
    }

    private var backFade: some View {
        LinearGradient(colors: [Color(hex: "#1C1A1A").opacity(0), Color(hex: "#1C1A1A")],
                       startPoint: .top, endPoint: .bottom)
            .frame(height: 24)
            .allowsHitTesting(false)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            if let take = takeText, !take.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 0) {
                        Text("GARY'S TAKE")
                            .font(GaryFonts.mono(9, bold: true)).tracking(2.2)
                            .foregroundStyle(GaryColors.gold)
                        Spacer(minLength: 8)
                        Button {
                            UIPasteboard.general.string = take
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            withAnimation(.easeOut(duration: 0.15)) { copiedTake = true }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
                                withAnimation(.easeIn(duration: 0.25)) { copiedTake = false }
                            }
                        } label: {
                            Image(systemName: copiedTake ? "checkmark" : "doc.on.doc")
                                .font(.system(size: 11.5, weight: .semibold))
                                .foregroundStyle(copiedTake ? GaryColors.gold : .white.opacity(0.5))
                                .frame(width: 24, height: 18)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(copiedTake ? "Take copied" : "Copy Gary's take")

                        Button {
                            let images = shareImages()
                            if !images.isEmpty { shareItem = PickShareItem(images: images) }
                        } label: {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 11.5, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.5))
                                .frame(width: 24, height: 18)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(shareAccessibilityLabel)
                    }

                    // ONLY THE ARROW expands (founder, Aug 26: "expand if a
                    // user clicks the arrow, but if they just click the card's
                    // body it should flip back"). The take text is plain — a
                    // body tap falls through to the container's flip gesture;
                    // the chevron is the one expand control, wearing a real
                    // 44pt-class tap target so it wins the race cleanly.
                    Group {
                        if caseExpanded {
                            Text(take)
                                .font(GaryFonts.text(14.5))
                                .foregroundStyle(.white.opacity(0.88))
                                .lineSpacing(3.5)
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .measureOriginalReasoning(readingTarget, presented: flipped && shareItem == nil)
                        } else {
                            ZStack(alignment: .bottom) {
                                // Paragraph breaks flatten to one space in the
                                // PREVIEW only (founder, Aug 26: the window
                                // shows words, not gaps) — expanded keeps
                                // Gary's paragraphs exactly as written.
                                Text(take.replacingOccurrences(of: "\n\n", with: " ")
                                    .replacingOccurrences(of: "\n", with: " "))
                                    .font(GaryFonts.text(14.5))
                                    .foregroundStyle(.white.opacity(0.88))
                                    .lineSpacing(3.5)
                                    // fixedSize = the text renders at FULL height
                                    // and the window clips it mid-line under the
                                    // fade. Without it, SwiftUI ellipsized the
                                    // last visible line ("…") inside the fixed
                                    // frame — the hard no-ellipsis law (Aug 19).
                                    .fixedSize(horizontal: false, vertical: true)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .frame(height: 158, alignment: .top)
                                    .clipped()
                                backFade
                            }
                        }
                    }
                    .overlay(alignment: .bottomTrailing) {
                        Button {
                            // Keep the rail's horizontal geometry stable while a
                            // long take changes the surrounding page's height.
                            caseExpanded.toggle()
                        } label: {
                            Image(systemName: caseExpanded ? "chevron.up" : "chevron.down")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(GaryColors.gold.opacity(0.85))
                                .frame(width: 40, height: 34, alignment: .bottomTrailing)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(caseExpanded ? "Collapse Gary's take" : "Read Gary's full take")
                    }
                }
            }

            tail
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(hex: "#1C1A1A"))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(GaryColors.gold.opacity(0.32), lineWidth: 1))
        )
        .onChange(of: flipped) { if !$0 { caseExpanded = false } }
        .sheet(item: $shareItem) { ActivityShareSheet(items: $0.images) }
    }
}

struct PickCardBack: View {
    let flipped: Bool
    let pick: GaryPick
    var gameResult: String? = nil

    private var takeText: String? {
        // rationale_plain tier REMOVED (founder ruling, Aug 12: "Gary makes
        // the pick. He writes the rationale. That's what goes on the back of
        // the pick card." One organic rationale — no translated middleman,
        // not even for the historical rows that still carry the field.)
        let parts = splitTake(pick.rationale)
        let joined = [parts.take, parts.rest]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
        return joined.isEmpty ? nil : joined
    }

    var body: some View {
        GaryTakeCardBack(flipped: flipped,
                         takeText: takeText,
                         readingTarget: ReadingContentTarget(key: "game:\(pick.id)", surface: .gameCard),
                         shareAccessibilityLabel: "Share this pick",
                         shareImages: { renderPickShareImages(pick: pick, gameResult: gameResult) }) {
            TailFadeRow(pick: pick)
        }
    }
}
