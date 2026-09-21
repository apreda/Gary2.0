import SwiftUI

/// "2026-07-06" → "7/6" — the overnight strip's date tag (founder, Jul 7: the
/// words LAST NIGHT were spending the roller's room; the date says it shorter).
func slateDayShort(_ iso: String) -> String {
    let p = iso.split(separator: "-")
    guard p.count == 3, let m = Int(p[1]), let d = Int(p[2]) else { return iso }
    return "\(m)/\(d)"
}

/// THE HEADLINES — the horizontal swipe is back (founder, Aug 3 round 4:
/// "back to how it was ... but enhanced design and info wise"; the vertical
/// container is dead). Enhanced: board-chrome cards, the lead card wider
/// with a bigger headline, snap paging on iOS 17. Feed order, wins AND
/// losses where the night put them. Tap → the ledger.
struct HomeHeadlinesBoard: View {
    let stories: [HomeMarqueeHero.Story]
    let onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // No rule of its own — headlines lead the page all day, so a rule
            // here just doubled the masthead's hairline with a dead band
            // between (founder screenshot, Aug 6 night: "duplicate lines").
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Array(stories.prefix(6).enumerated()), id: \.offset) { _, s in
                        HeadlineFlipCard(story: s, onOpen: onOpen)
                            .frame(maxHeight: .infinity, alignment: .top)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .pageGutter()
                .snapTargets()
            }
            .snapAligned()
            // The house helper, not the raw modifier — it degrades quietly on
            // iOS 16 instead of failing the build (DesignSystem, Jul 22).
            .unclippedRail()
        }
    }
}

/// THE HEADLINE CARD (founder pick, Aug 5 — mock 14 off the twenty-one round,
/// with the flip he specified). FRONT: the ticket where colour is the verdict —
/// the pick, the game, and the money on a flat $100. No stamp, no label, no
/// word for the result: the sign and the colour say it. BACK: what ELSE hit in
/// that game — the stat lines the recap writer already produces, prices carried
/// only where they're real — against what happened.
///
/// The bullets lane is the whole data story here: gameRecap.js asks for
/// "betting events that hit — the markets that would have cashed", with the
/// standing rule that a price rides along ONLY when that exact price is in the
/// evidence. So a prop Gary never took shows its stat line without a price
/// rather than an invented one.
struct HeadlineFlipCard: View {
    let story: HomeMarqueeHero.Story
    let onOpen: () -> Void
    @State private var flipped = false

    private static let W: CGFloat = 296
    // Sep 21 2026 (founder): the card sat taller than its box; the box's own
    // rows set the height now and the padding tightened. One card, every sport.
    private static let H: CGFloat = 118

    private var leagueAccent: Color { Sport.from(league: story.league).accentColor }

    var body: some View {
        ZStack {
            front.opacity(flipped ? 0 : 1)
            back
                .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
                .opacity(flipped ? 1 : 0)
        }
        .frame(width: Self.W)
        .frame(minHeight: Self.H, maxHeight: .infinity, alignment: .top)
        .garyPanel(radius: 14)
        .rotation3DEffect(.degrees(flipped ? 180 : 0), axis: (x: 0, y: 1, z: 0))
        .contentShape(Rectangle())
        .onTapGesture {
            // A recap without extra stat lines has no reverse to display.
            guard !story.bullets.isEmpty else { onOpen(); return }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.82)) { flipped.toggle() }
        }
        .onLongPressGesture(minimumDuration: 0.35) { onOpen() }
        // QA can't tap a sim (GaryTour, iOS 2.18): `flip` turns every headline
        // card so a screenshot can prove the back renders. DEBUG-only by the
        // harness's own construction.
        .onGaryTour { verb, _ in
            guard verb == "flip", !story.bullets.isEmpty else { return }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.82)) { flipped.toggle() }
        }
        // A card always opens on the ticket. Home re-pulls recaps on every
        // foreground, and a card left turned over would otherwise come back
        // showing its back for a story the reader hasn't seen the front of.
        .onChange(of: story.headline) { _ in flipped = false }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(story.bullets.isEmpty ? "View the record in Billfold"
                           : flipped ? "Turn back to the ticket" : "Turn for what else hit")
    }

    // MARK: front — mock 14

    private var front: some View {
        // MOCK 05 — the story on the left, the box docked right. The card stops
        // being either a table or a story and becomes both, in columns. The
        // money lives in the box's own spare room under the score (founder,
        // Aug 5), so the result reads in the same column that produced it.
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                // The turn glyph rides the kicker row, not the pick row: down
                // there it stole the width "CARDINALS +1.5" needed, and the
                // pick answered by truncating to "CARDINALS…". An ellipsis is
                // never acceptable — the glyph moved instead.
                HStack(spacing: 6) {
                    // One compressible line keeps the date together in the
                    // narrower story column, including five-letter leagues.
                    (Text(story.league.uppercased()).foregroundColor(leagueAccent)
                     + Text(story.date.isEmpty ? "" : (story.league.isEmpty ? story.date : " · \(story.date)"))
                        .foregroundColor(GaryColors.gold))
                        .font(GaryFonts.kicker(9.9)).tracking(1)
                        .lineLimit(1).minimumScaleFactor(0.75)
                        .allowsTightening(true)
                    Spacer(minLength: 4)
                    if !story.bullets.isEmpty {
                        Image(systemName: "arrow.left.arrow.right")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white.opacity(0.3))
                    }
                }
                Text(story.headline)
                    // The words are the ONLY thing allowed to give (founder,
                    // Aug 5). Aug 19 round two: the STORY owns the whole left
                    // column now — the bet and the cash moved into the box
                    // column, so the headline runs bigger and deeper.
                    .font(GaryFonts.text(15, .semibold))
                    .foregroundStyle(.white.opacity(0.92))
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(.top, 5)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Rectangle().fill(Color.white.opacity(0.07)).frame(width: 1)

            VStack(alignment: .leading, spacing: 0) {
                // Two rows, nothing computed on top of them (founder, Aug 5:
                // a margin row is just the two numbers above it subtracted).
                // Real box lines — hits, errors, the winning pitcher — need a
                // pipeline field first: game_results stores only the score.
                if let s = Self.sides(story) {
                    Text("FINAL")
                        .font(GaryFonts.kicker(8)).tracking(1)
                        .foregroundStyle(.white.opacity(0.55))
                        .padding(.bottom, 4)
                    scoreRow(s.away.name, s.away.runs, winner: s.away.runs > s.home.runs)
                    boxRule
                    scoreRow(s.home.name, s.home.runs, winner: s.home.runs > s.away.runs)
                    // HR sits UNDER the score, not beside it (founder, Aug 5) —
                    // its own line, away-home in the same order as the rows
                    // above. Hits came back off the card entirely.
                    if let line = boxStatLine {
                        boxRule
                        // Same weights, same sizes, same colours as the club
                        // rows above it (founder, Aug 5) — it IS a box line,
                        // so it shouldn't look like a caption stapled under one.
                        HStack(alignment: .firstTextBaseline, spacing: 0) {
                            Text(line.label)
                                .font(GaryFonts.mono(11.5, bold: true)).tracking(0.6)
                                .foregroundStyle(.white.opacity(0.55))
                                .lineLimit(1).minimumScaleFactor(0.7)
                            Spacer(minLength: 4)
                            // The game's total, not a split (founder, Aug 5).
                            Text("\(line.total)")
                                .font(GaryFonts.mono(13.5, bold: true))
                                .foregroundStyle(.white.opacity(0.62))
                        }
                    }
                }
                Spacer(minLength: 4)
                // Aug 20 (founder): the money and the odds came OFF the card —
                // just the pick, sitting on the bottom line where they were.
                // Scale, never truncate — an ellipsis is never acceptable.
                Text(boxPick)
                    .font(GaryFonts.mono(10.5, bold: true)).tracking(0.6)
                    .foregroundStyle(GaryColors.gold)
                    .lineLimit(1).minimumScaleFactor(0.5)
            }
            // Narrower box column (Aug 19, with the smaller box type) — the
            // freed points go to the story column the founder wants leading.
            .frame(width: 112, alignment: .leading)
        }
        .padding(.horizontal, 15).padding(.vertical, 11)
        .frame(width: Self.W)
        .frame(minHeight: Self.H, maxHeight: .infinity, alignment: .topLeading)
    }

    /// The box's own hairline — every row separated the same way. Tight on
    /// purpose: the extra rows come out of the space the one-line money
    /// figure freed, NOT out of a taller card (founder, Aug 5).
    private var boxRule: some View {
        Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
            .padding(.vertical, 2)
    }

    /// One box row: club left, runs and (when captured) hits right, the winner
    /// in gold. Hits are the quiet column — they lose games as often as they
    /// win them, so they never take the gold even on the winning line.
    @ViewBuilder private func scoreRow(_ name: String, _ runs: Int, winner: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            // Abbreviated, like a real box — the headline beside it already
            // names both clubs in full.
            // Aug 19 (founder): the box is the SUPPORTING column — one step
            // below the headline beside it, same internal law as before.
            // Round two: a touch back up ("to the right... a little bit
            // bigger maybe too") now that the bet+cash rows joined the box.
            Text(teamAbbrevFromName(name, league: story.league))
                .font(GaryFonts.mono(11.5, bold: true)).tracking(0.6)
                .foregroundStyle(winner ? GaryColors.warmGold : .white.opacity(0.55))
                .lineLimit(1).minimumScaleFactor(0.6)
            Spacer(minLength: 4)
            Text("\(runs)")
                .font(GaryFonts.mono(13.5, bold: true))
                .foregroundStyle(winner ? GaryColors.warmGold : .white.opacity(0.62))
        }
    }

    /// The box's stat line: baseball counts homers, football counts
    /// touchdowns (founder, Sep 4 2026 — the football card is the MLB card
    /// "to a tee except HR are TD"; later that day: the label is the short
    /// form, "HRs" and "TDs", the way the box's team codes are short). nil
    /// when the night's box carried neither.
    private var boxStatLine: (label: String, total: Int)? {
        if ["NFL", "NCAAF"].contains(story.league.uppercased()),
           let a = story.awayTD, let h = story.homeTD, a >= 0, h >= 0 { return ("TDs", a + h) }
        if story.league.uppercased() == "MLB",
           let a = story.awayHR, let h = story.homeHR, a >= 0, h >= 0 { return ("HRs", a + h) }
        return nil
    }

    /// The bottom line's pick. A college school is replaced by its scoreboard
    /// code so the line reads whole — "MASS +28.5", never "MASSACHUSETTS +2…"
    /// (founder, Sep 4 2026; ellipsis is never acceptable).
    private var boxPick: String {
        story.league.uppercased() == "NCAAF"
            ? Formatters.shortenCollegePick(story.receiptPick)
            : story.receiptPick
    }

    /// "Angels @ Orioles" + "1-3" → the two box rows. nil when either half is
    /// missing, and the column simply doesn't draw — never a half-built box.
    static func sides(_ s: HomeMarqueeHero.Story)
        -> (away: (name: String, runs: Int), home: (name: String, runs: Int))? {
        let clubs = s.matchup.components(separatedBy: " @ ")
            .map { $0.trimmingCharacters(in: .whitespaces) }
        guard clubs.count == 2, !clubs[0].isEmpty, !clubs[1].isEmpty else { return nil }
        let runs = (s.score ?? "").components(separatedBy: CharacterSet(charactersIn: "-–—"))
            .map { $0.trimmingCharacters(in: .whitespaces) }
        guard runs.count == 2, let a = Int(runs[0]), let h = Int(runs[1]), a >= 0, h >= 0 else { return nil }
        return (away: (clubs[0], a), home: (clubs[1], h))
    }

    // (moneyText/footMeta deleted Aug 20 — the founder took the money and the
    // odds off the card front; the pick alone holds the bottom line.)

    // MARK: back — what else hit

    private var back: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(story.bullets.isEmpty ? "THE STORY" : "WHAT ELSE HIT")
                .font(GaryFonts.kicker(8.5)).tracking(1.6)
                .foregroundStyle(GaryColors.gold)
                .padding(.bottom, 7)
            // Two or three bullets leave slack on a card sized for the front's
            // four-line headline; the group sits centred rather than stranded
            // at the top with a hole under it.
            Spacer(minLength: 0)

            ForEach(Array(story.bullets.prefix(3).enumerated()), id: \.offset) { i, b in
                if i > 0 {
                    Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                        .padding(.vertical, 3.5)
                }
                bulletLine(b)
            }

            Spacer(minLength: 0)
            // Bullets ONLY (founder, Aug 5). The headline moved to the front's
            // left column and the verdict rides the money there, so repeating
            // either here would just be the same card twice.
        }
        .padding(.horizontal, 15).padding(.vertical, 12)
        .frame(width: Self.W)
        .frame(minHeight: Self.H, maxHeight: .infinity, alignment: .topLeading)
    }

    /// One stat line, no bullet glyph (founder, Aug 5). A trailing parenthetical
    /// is where the recap writer puts a real price — it takes the gold so the
    /// payout reads apart from the stat without parsing the sentence.
    @ViewBuilder private func bulletLine(_ raw: String) -> some View {
        let parts = Self.splitPrice(raw)
        VStack(alignment: .leading, spacing: 4) {
            Text(parts.stat)
                .font(GaryFonts.text(11.5, .semibold))
                .foregroundStyle(.white.opacity(0.82))
                .fixedSize(horizontal: false, vertical: true)
            if let price = parts.price {
                Text(price)
                    .font(GaryFonts.mono(10.5, bold: true))
                    .foregroundStyle(GaryColors.warmGold)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// "Pete Alonso 2 RBI (+110 TB lost)" → stat + "+110 TB lost". Pulls EVERY
    /// parenthetical that really holds an American price out of the line,
    /// wherever it sits, and hands them to the gold column.
    ///
    /// Placement-agnostic on purpose (founder, Aug 6): the writer's contract
    /// says one TRAILING parenthetical, but on a two-market bullet where only
    /// one market is priced it attaches the price inline — "JJ Bleday 1 HR
    /// (+336), 1 RBI" — and a trailing-only parser left that +336 stranded in
    /// the stat text while the row above it wore its price in gold. Parsing
    /// beats another prompt law here: the price lands in the same column no
    /// matter where the model puts it.
    static func splitPrice(_ raw: String) -> (stat: String, price: String?) {
        // A parenthetical qualifies only if it contains a signed 2+ digit
        // number, so "(6.2 IP)" or "(2 for 5)" stay part of the stat.
        let pattern = #"\(([^()]*[-+−]\d{2,}[^()]*)\)"#
        guard let re = try? NSRegularExpression(pattern: pattern) else { return (raw, nil) }
        let ns = raw as NSString
        let full = NSRange(location: 0, length: ns.length)
        let matches = re.matches(in: raw, range: full)
        guard !matches.isEmpty else { return (raw, nil) }

        var prices: [String] = []
        for m in matches {
            let inner = ns.substring(with: m.range(at: 1))
            // A price that DIDN'T cash has no business in gold under a header
            // that says "what else hit" — the recap writer sometimes annotates
            // Gary's own losing prop there ("Pete Alonso 2 RBI (+110 TB
            // lost)"). The stat is true and stays; the payout comes off.
            if inner.range(of: #"\b(lost|loses|losing|missed|miss|no cash)\b"#,
                           options: [.regularExpression, .caseInsensitive]) != nil { continue }
            prices.append(inner.trimmingCharacters(in: .whitespaces))
        }

        // Strip the priced parentheticals, then close the seams the removal
        // leaves ("1 HR , 1 RBI", a dangling trailing comma).
        var stat = re.stringByReplacingMatches(in: raw, range: full, withTemplate: "")
        stat = stat.replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression)
        stat = stat.replacingOccurrences(of: #"\s+([,;])"#, with: "$1", options: .regularExpression)
        stat = stat.trimmingCharacters(in: CharacterSet(charactersIn: " ,;"))

        return (stat, prices.isEmpty ? nil : prices.joined(separator: " · "))
    }
}

extension View {
    /// Snap-paging pair for horizontal rails (iOS 17; quiet no-op on 16).
    @ViewBuilder func snapTargets() -> some View {
        if #available(iOS 17.0, *) { self.scrollTargetLayout() } else { self }
    }
    @ViewBuilder func snapAligned() -> some View {
        if #available(iOS 17.0, *) { self.scrollTargetBehavior(.viewAligned) } else { self }
    }
}

