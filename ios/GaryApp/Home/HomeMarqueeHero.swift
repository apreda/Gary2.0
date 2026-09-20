import SwiftUI

/// ③ The Marquee — last night's story as a static hero (no footage, no
/// logos: facts are free). League chip up top, the game headline, and the
/// receipt bar: "Gary had it · Phillies TT over 4.5 — CASHED +145".
// Day-keyed on-disk cache of the derived headline cards, so the Home marquee paints instantly
// on cold open and then refreshes. Keyed on the graded night (rolls 6am ET) so it can never
// surface yesterday's card today; never stores [] so a transient failure can't poison it.
struct HomeHeadlinesCacheEntry: Codable {
    let payloadDayKey: String
    let stories: [HomeMarqueeHero.Story]
}
enum HomeHeadlinesCache {
    // v2 drops the pre-editorial schema whose cached cards could still contain
    // old betting-result copy after the database headline had been repaired.
    private static let key = "homeHeadlines.editorial.v2"
    static func load() -> [HomeMarqueeHero.Story]? {
        guard let data = UserDefaults.standard.data(forKey: key),
              let entry = try? JSONDecoder().decode(HomeHeadlinesCacheEntry.self, from: data),
              entry.payloadDayKey == SupabaseAPI.hubGradedDateEST(),
              !entry.stories.isEmpty
        else { return nil }
        return entry.stories
    }
    static func save(_ stories: [HomeMarqueeHero.Story]) {
        guard !stories.isEmpty else { return }
        let entry = HomeHeadlinesCacheEntry(payloadDayKey: SupabaseAPI.hubGradedDateEST(), stories: stories)
        if let data = try? JSONEncoder().encode(entry) { UserDefaults.standard.set(data, forKey: key) }
    }
}

struct HomeMarqueeHero: View {
    struct Story: Codable {
        let league: String
        var headline: String
        let sub: String
        let receiptLead: String   // "Gary had it" / "Gary was on" — prose voice
        let receiptPick: String   // "ANGELS ML" — data voice, rendered mono
        let verdict: String
        let cashed: Bool
        // The flip side — what Gary CALLED before the game played. Enriched
        // from that night's daily picks after the story is built; nil = the
        // card doesn't flip (no matching pick found).
        var take: String? = nil
        var tier: String? = nil
        /// The betting recap body (game_recaps) — the ESPN-style story of
        /// how the bet lived and died, under the headline.
        var recap: String? = nil
        /// Graded claims from the rationale (right/wrong only — "unclear"
        /// stays off the card). Empty = no fact check yet.
        var claims: [FactClaim] = []
        /// The night's stat lines, real prop prices attached (game_recaps
        /// bullets). Rendered mono under the recap.
        var bullets: [String] = []
        /// "Angels @ Orioles" — the game, for the card's own line.
        var matchup: String = ""
        /// The price Gary took, split off pick_text ("−150").
        var odds: String = ""
        /// "3-1" once the game settles; nil until then. Away runs first.
        var score: String? = nil
        /// "AUG 4" — the slate day, for the card's kicker.
        var date: String = ""
        /// Hits and home runs per side when the recap captured them.
        var awayHits: Int? = nil
        var homeHits: Int? = nil
        var awayHR: Int? = nil
        var homeHR: Int? = nil
        /// Touchdowns per side — football's box line, the exact analog of the
        /// home runs above it (founder, Sep 4 2026: the football card is the
        /// MLB card "to a tee except HR are TD").
        var awayTD: Int? = nil
        var homeTD: Int? = nil
        /// Profit on a flat $100 at `odds` — positive when the ticket cashed,
        /// −100 when it didn't, 0 on a push. nil when the price won't parse.
        var netOnFlat: Double? {
            let raw = odds.replacingOccurrences(of: "−", with: "-")
                .trimmingCharacters(in: CharacterSet(charactersIn: "+ "))
            guard let n = Double(raw), n != 0 else { return nil }
            if verdict == "PUSH" { return 0 }
            guard cashed else { return -100 }
            return n > 0 ? n : 10000 / abs(n)
        }
    }
    let story: Story
    /// Carousel cards disable the flip (fixed-height pages); tap falls
    /// through to onTap instead.
    var flipEnabled: Bool = true
    /// Carousel pages fill a fixed frame so the receipt pins to the same
    /// bottom edge on every slide — the section below never jumps.
    var fillsHeight: Bool = false
    /// The card's horizontal screen margin — 16 full-width, 0 in the 70/30
    /// side-by-side where the row provides the margin and the Wire sits beside it.
    var edgePad: CGFloat = 16
    let onTap: () -> Void
    /// Carousel expand: when a toggle is provided, the card shows a MORE/LESS
    /// affordance and tapping it expands the full recap inline — the carousel
    /// grows the card and pauses auto-advance — instead of flipping/navigating.
    var isExpanded: Bool = false
    var onToggleExpand: (() -> Void)? = nil

    @State private var flipped = false
    @State private var frontH: CGFloat = 0

    private var tint: Color { Sport.from(league: story.league).accentColor }
    /// The league reads in its own accent — MLB in its white-green-brown field
    /// gradient (user call, Jun 17); every other league in its flat accent color.
    private var leagueStyle: AnyShapeStyle {
        (story.league == "MLB" || story.league == "MLB HR")
            ? AnyShapeStyle(GaryColors.mlbFieldText)
            : AnyShapeStyle(tint)
    }
    private var canFlip: Bool { flipEnabled && story.take != nil }
    private var verdictColor: Color { story.cashed ? GaryColors.win : GaryColors.lostTint }

    var body: some View {
        ZStack {
            front
                // In the carousel (fillsHeight) DON'T fix the vertical size — let the
                // card fill the uniform page height so every slide matches (a fixedSize
                // here shrank each card to its content, making the short-headline lead
                // card smaller than the rest). Single-card use still sizes to content.
                .fixedSize(horizontal: false, vertical: !fillsHeight)
                .background(GeometryReader { g in
                    Color.clear.preference(key: PickCardHeightKey.self, value: g.size.height)
                })
                .opacity(flipped ? 0 : 1)

            if canFlip {
                back
                    .opacity(flipped ? 1 : 0)
                    .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
            }
        }
        // fillsHeight (carousel): fill the parent's fixed frame so every slide is the
        // same height and the receipt pins to one bottom edge — no per-card measuring.
        .frame(height: flipped ? max(frontH + 150 + CGFloat(min(story.claims.count, 4)) * 38, 320) : (fillsHeight ? nil : (frontH > 0 ? frontH : nil)))
        .rotation3DEffect(.degrees(flipped ? 180 : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.55)
        .onPreferenceChange(PickCardHeightKey.self) { frontH = $0 }
        .padding(.horizontal, edgePad)
        .contentShape(Rectangle())
        .onTapGesture {
            if let toggle = onToggleExpand {
                toggle()                              // grow/collapse the recap inline
            } else if canFlip {
                withAnimation(.spring(response: 0.6, dampingFraction: 0.82)) { flipped.toggle() }
            } else {
                onTap()
            }
        }
    }

    // MARK: Front — the news + the receipt stub

    private var front: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                // The headline LEADS — full width, tight, at the very top (user call,
                // Jun 17). Nothing crowds it; the brand cues sit in the byline below.
                // The headline LEADS, with room on the right for the league chip
                // that now lives in the top-right corner (user call, Jun 18).
                Text(story.headline)
                    .font(GaryFonts.display(26))
                    .foregroundStyle(.white.opacity(0.96))
                    .lineLimit(2).minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.trailing, 40)
                    .padding(.bottom, 9)
                // Headline → BULLETS lead the card (founder). The prose recap is
                // hidden until MORE — most of the value is the headline + the stat
                // lines; the write-up is optional depth.
                if !story.bullets.isEmpty {
                    bulletList.padding(.top, 10)
                }
                if isExpanded, let recap = story.recap, !recap.isEmpty {
                    Text(recap)
                        .font(GaryFonts.text(13))
                        .foregroundStyle(.white.opacity(0.82))
                        .lineSpacing(2.5)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                        .padding(.top, 12)
                }
                if onToggleExpand != nil, story.recap?.isEmpty == false {
                    HStack(spacing: 4) {
                        Text(isExpanded ? "LESS" : "MORE")
                            .font(GaryFonts.mono(8.5, bold: true)).tracking(1)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 7, weight: .bold))
                            .rotationEffect(.degrees(isExpanded ? 180 : 0))
                    }
                    .foregroundStyle(GaryColors.gold.opacity(0.65))
                    .padding(.top, 8)
                }
            }
            // Center the (now shorter, prose-less) content in the card body so the
            // slack is balanced — not dumped as a void between the bullets and the
            // receipt (founder: removing the prose left the layout invalid).
            .frame(maxWidth: .infinity, maxHeight: fillsHeight ? .infinity : nil, alignment: .leading)
            .padding(14)
            // The bear is an overlaid corner stamp now — it no longer takes a layout
            // row that crowds the story (user call, Jun 18). The text may run beneath
            // it; that's intended (no fight for space, no awkward gap).
            .overlay(alignment: .bottomTrailing) {
                Image(GaryBrand.mark)
                    .resizable().scaledToFit()
                    .frame(width: 38, height: 38)
                    .padding(.trailing, 10)
                    .padding(.bottom, 8)
                    .allowsHitTesting(false)
            }
            // The sport accent (WC / MLB) sits in the top-right corner — its own
            // league color, mirroring the bear stamp in the opposite corner.
            .overlay(alignment: .topTrailing) {
                HStack(spacing: 5) {
                    Circle().fill(tint.opacity(0.9)).frame(width: 5, height: 5)
                    Text(story.league)
                        .font(GaryFonts.mono(11, bold: true)).tracking(1.2)
                        .foregroundStyle(leagueStyle)
                }
                .padding(.trailing, 14)
                .padding(.top, 16)
            }
            if !story.receiptPick.isEmpty || !story.verdict.isEmpty {
                receiptStub(lead: story.receiptLead, pick: story.receiptPick,
                            trailing: story.verdict, hint: nil)
            }
        }
        .frame(maxHeight: fillsHeight ? .infinity : nil, alignment: .top)
        // Clean, sharp, simple black — no glow, no watermark (user call, Jun 17).
        // Branding lives in the gold GARY'S CALL eyebrow + the small corner bear mark.
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(hex: "#181616")))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
    }

    /// The night's stat lines — gold tick + mono, the data voice. Bigger + more
    /// readable (founder); the stat line is the point of the card.
    private var bulletList: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(story.bullets.prefix(3)), id: \.self) { (b: String) in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Rectangle()
                        .fill(GaryColors.gold.opacity(0.85))
                        .frame(width: 11, height: 2)
                    Text(b)
                        .font(GaryFonts.mono(15))
                        .foregroundStyle(.white.opacity(0.96))
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                }
            }
        }
    }

    // MARK: Back — what Gary called vs what the game did

    private var back: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("THE CALL")
                        .font(GaryFonts.mono(10, bold: true)).tracking(1)
                        .foregroundStyle(GaryColors.gold)
                    Spacer()
                    Text("BEFORE THE GAME")
                        .font(GaryFonts.mono(9, bold: true)).tracking(1)
                        .foregroundStyle(.white.opacity(0.62))
                }
                .padding(.bottom, 14)

                // Gary's voice — gold rule (the app-wide quote marker).
                if let take = story.take {
                    HStack(alignment: .top, spacing: 10) {
                        RoundedRectangle(cornerRadius: 1)
                            .fill(GaryColors.gold.opacity(0.7))
                            .frame(width: 2)
                        Text(take)
                            .font(GaryFonts.text(13.5))
                            .foregroundStyle(.white.opacity(0.85))
                            .lineSpacing(3)
                            .lineLimit(8)
                            .minimumScaleFactor(0.85)
                    }
                }

                // The fact check — the rationale's claims, graded by the game.
                if !story.claims.isEmpty {
                    VStack(alignment: .leading, spacing: 7) {
                        Text("THE FACT CHECK")
                            .font(GaryFonts.mono(8.5, bold: true)).tracking(1.2)
                            .foregroundStyle(.white.opacity(0.62))
                        ForEach(Array(story.claims.prefix(4).enumerated()), id: \.offset) { _, c in
                            HStack(alignment: .top, spacing: 8) {
                                Text(c.verdict == "right" ? "✓" : "✗")
                                    .font(GaryFonts.mono(11, bold: true))
                                    .foregroundStyle(c.verdict == "right" ? GaryColors.win : GaryColors.loss)
                                Text(c.claim ?? "")
                                    .font(.system(size: 12))
                                    .foregroundStyle(.white.opacity(0.7))
                                    .lineLimit(2)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .padding(.top, 12)
                }

                HStack(spacing: 14) {
                    if let tier = story.tier {
                        HStack(spacing: 6) {
                            Text("CONVICTION")
                                .font(GaryFonts.mono(8.5, bold: true)).tracking(1.2)
                                .foregroundStyle(.white.opacity(0.62))
                            Text(tier)
                                .font(GaryFonts.mono(11, bold: true))
                                .foregroundStyle(.white.opacity(0.85))
                        }
                    }
                    Spacer()
                    Button(action: onTap) {
                        Text("FULL CARD ›")
                            .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                            .foregroundStyle(.white.opacity(0.62))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 12)

                Spacer(minLength: 8)

                Text("tap to flip back  ↺")
                    .font(GaryFonts.mono(9, bold: false))
                    .foregroundStyle(.white.opacity(0.62))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.bottom, 8)
            }
            .padding(14)

            receiptStub(lead: "How it played ·", pick: story.sub.uppercased(),
                        trailing: story.verdict, hint: nil)
        }
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(hex: "#181616")))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
    }

    // MARK: Shared pieces

    /// The ticket stub: dashed stitch perforation + full-bleed darker band.
    /// Prose lead, mono data, and the verdict as the row's ONLY color moment.
    private func receiptStub(lead: String, pick: String, trailing: String, hint: String?) -> some View {
        VStack(spacing: 0) {
            StitchLine()
                .stroke(Color.white.opacity(0.14), style: StrokeStyle(lineWidth: 1, dash: [4, 5]))
                .frame(height: 1)
            HStack(spacing: 6) {
                Text(lead)
                    .font(.system(size: 14))
                    .foregroundStyle(.white.opacity(0.85))
                Text(pick)
                    .font(GaryFonts.mono(13, bold: true))
                    .foregroundStyle(GaryColors.gold)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 8)
                if let hint {
                    Text(hint)
                        .font(GaryFonts.mono(10, bold: true)).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))
                }
                Text(trailing)
                    .font(GaryFonts.mono(12.5, bold: true)).tracking(0.6)
                    .foregroundStyle(verdictColor)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color.black.opacity(0.32))
        }
    }

}

