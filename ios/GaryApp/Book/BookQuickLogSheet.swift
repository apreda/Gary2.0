import SwiftUI
import Charts
import PhotosUI

// ── Add-a-bet sheet — the DIRECTORY (founder, Aug 20: "a directory search
// look up of all the bets they could have be their streak, then its a simple
// click rather than like a full log of the bet") ────────────────────────────
// Tonight's whole board — every game pick and prop Gary published — behind
// one search field. Tap a bet, pick your side, it books through the same
// lock-checked RPCs as the card buttons (VERIFIED lane, streak-eligible).
// The old free-text form survives underneath as "an outside bet" for plays
// that aren't on Gary's board (self-graded, YOUR PLAYS lane).
struct QuickLogSheet: View {
    var onLogged: (UserBet) -> Void
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var auth = AuthManager.shared

    private struct DirectoryEntry: Identifiable {
        let id: String
        let title: String        // "CARDINALS ML -108" / "Aaron Judge total_bases 1.5"
        let subtitle: String     // "MLB · STL @ CHC · 7:45 PM"
        let isProp: Bool
        let gameDate: String
        let pickText: String     // game lane identity (pick.pick)
        let player: String?      // prop lane identity
        let propToken: String?
        let pickId: String?
        let commenceTime: String?
        var locked: Bool { BookTicketTime.isLocked(commenceTime) }
        /// Already on their book — the row shows the receipt instead of an
        /// arm button, so the directory can never double-book a play.
        var booked: String? = nil
        var gameID: String? = nil
        var line: Double? = nil
        var propSide: String? = nil
    }

    @State private var entries: [DirectoryEntry] = []
    @State private var boardSnapshot = BookDirectorySnapshot<GaryPick, PropPick>()
    @State private var boardRequest = UUID()
    @State private var loadingBoard = true
    @State private var search = ""
    @State private var armedId: String? = nil
    @State private var side = "tail"
    @State private var stake: Double = 1.0
    @State private var streakOn = false
    @State private var busy = false
    @State private var errorText: String? = nil
    @State private var showOutside = false
    @State private var draft = UserBookAPI.ManualBetDraft()
    @State private var oddsText = "-110"
    @State private var manualDate = Date()
    @State private var stakeText = ""
    @State private var tagSuggestions: [String] = []
    @State private var slipItem: PhotosPickerItem? = nil
    @State private var scanning = false
    @State private var scanned: [SlipScanAPI.ScannedBet] = []
    @State private var scanSportsbook: String? = nil
    @State private var scanNotes: String? = nil
    @State private var scanError: String? = nil
    private let leagues = ["MLB", "NFL", "NCAAF", "NBA", "OTHER"]
    private let ember = Color(hex: "#E5844B")

    private var filtered: [DirectoryEntry] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return entries }
        return entries.filter {
            $0.title.lowercased().contains(q) || $0.subtitle.lowercased().contains(q)
        }
    }

    var body: some View {
        ZStack {
            Color(hex: "#141212").ignoresSafeArea()
            VStack(alignment: .leading, spacing: 0) {
                header
                searchField
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        if let message = boardSnapshot.errorMessage {
                            ProfileNotice(title: "Board couldn't refresh", message: message,
                                          retry: loadingBoard ? nil : { Task { await loadBoard() } })
                                .padding(.bottom, 12)
                        }
                        if loadingBoard {
                            ProgressView().tint(.white.opacity(0.4))
                                .frame(maxWidth: .infinity).padding(.vertical, 40)
                        } else if filtered.isEmpty && boardSnapshot.errorMessage == nil {
                            Text(entries.isEmpty
                                 ? "No verified picks are available in this board. You can still log an outside bet below."
                                 : "Nothing on tonight's board matches that.")
                                .font(GaryFonts.text(12.5))
                                .foregroundStyle(.white.opacity(0.5))
                                .padding(.vertical, 24)
                                .frame(maxWidth: .infinity)
                        } else {
                            ForEach(filtered) { entry in
                                directoryRow(entry)
                                if entry.id != filtered.last?.id {
                                    Rectangle().fill(.white.opacity(0.05)).frame(height: 0.5)
                                }
                            }
                        }
                        outsideBetBlock
                    }
                    .padding(.bottom, 30)
                }
            }
            .padding(.horizontal, 18)
        }
        .task(id: auth.currentUser?.id) {
            entries = []; armedId = nil; errorText = nil
            stakeText = String(format: "%.2f", BookMoney.unitDollars)
            await loadBoard()
        }
        .onGaryTour { verb, _ in
            // DEBUG harness: open the outside-bet form for screenshots.
            if verb == "outsidebet" { withAnimation { showOutside = true } }
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("ADD A BET")
                    .font(GaryFonts.mono(12, bold: true)).tracking(1.4)
                    .foregroundStyle(GaryColors.gold)
                Text("Tonight's board — tap a bet, pick a side. Star it and it rides your streak.")
                    .font(GaryFonts.text(12))
                    .foregroundStyle(.white.opacity(0.55))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.55))
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(Color.white.opacity(0.06)))
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 18).padding(.bottom, 12)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.4))
            TextField("Search a team, player, or market", text: $search)
                .font(GaryFonts.text(14))
                .foregroundStyle(.white)
                .autocorrectionDisabled()
            if !search.isEmpty {
                Button { search = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 13))
                        .foregroundStyle(.white.opacity(0.35))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.white.opacity(0.06))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1))
        )
        .padding(.bottom, 6)
    }

    @ViewBuilder private func directoryRow(_ entry: DirectoryEntry) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                errorText = nil
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    armedId = armedId == entry.id ? nil : entry.id
                    side = "tail"; streakOn = false
                }
            } label: {
                HStack(spacing: 10) {
                    // One line always — the old 38pt column wrapped "GAME"
                    // into "GAM E" (wrapping is clipping; seen live Aug 21).
                    Text(entry.isProp ? "PROP" : "GAME")
                        .font(GaryFonts.mono(8, bold: true)).tracking(0.7)
                        .foregroundStyle(.white.opacity(0.45))
                        .lineLimit(1).fixedSize()
                        .frame(width: 44, alignment: .leading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.title)
                            .font(GaryFonts.text(13.5, .semibold))
                            .foregroundStyle(.white.opacity(0.9))
                            // Scale, never truncate — no ellipsis, ever.
                            .lineLimit(1).minimumScaleFactor(0.5)
                        Text(entry.subtitle)
                            .font(GaryFonts.mono(9))
                            .foregroundStyle(.white.opacity(0.4))
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                    Spacer(minLength: 8)
                    if let booked = entry.booked {
                        Text(booked)
                            .font(GaryFonts.mono(8.5, bold: true)).tracking(0.7)
                            .foregroundStyle(GaryColors.gold.opacity(0.75))
                            .lineLimit(1).fixedSize()
                    } else if entry.locked {
                        Text("LOCKED")
                            .font(GaryFonts.mono(8.5, bold: true)).tracking(0.7)
                            .foregroundStyle(.white.opacity(0.35))
                    } else {
                        Image(systemName: armedId == entry.id ? "chevron.up" : "plus")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(GaryColors.gold.opacity(0.8))
                    }
                }
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(entry.locked || entry.booked != nil)

            if armedId == entry.id, !entry.locked, entry.booked == nil {
                armedControls(entry)
                    .padding(.bottom, 10)
            }
        }
    }

    private func armedControls(_ entry: DirectoryEntry) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                sideChip("RIDE IT", key: "tail", tint: GaryColors.gold)
                sideChip("FADE IT", key: "fade", tint: Color(hex: "#8B93A7"))
                Spacer(minLength: 6)
                stepChip("minus") { stake = max(0.5, stake - 0.5) }
                Text(BookMoney.stake(stake))
                    .font(GaryFonts.mono(12.5, bold: true))
                    .foregroundStyle(.white.opacity(0.9))
                    .frame(minWidth: 44)
                stepChip("plus") { stake = min(5, stake + 0.5) }
            }
            HStack(spacing: 10) {
                Button { streakOn.toggle() } label: {
                    HStack(spacing: 5) {
                        Image(systemName: streakOn ? "star.fill" : "star")
                            .font(.system(size: 11, weight: .semibold))
                        Text("STREAK PLAY")
                            .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                    }
                    .foregroundStyle(streakOn ? ember : .white.opacity(0.5))
                }
                .buttonStyle(.plain)
                Spacer()
                Button { place(entry) } label: {
                    Text(busy ? "Booking" : "Lock it in")
                        .font(GaryFonts.mono(11, bold: true))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 14).padding(.vertical, 7)
                        .background(RoundedRectangle(cornerRadius: 6).fill(GaryColors.gold))
                }
                .buttonStyle(.plain)
                .disabled(busy)
            }
            if let e = errorText {
                Text(e)
                    .font(GaryFonts.mono(9.5))
                    .foregroundStyle(GaryColors.loss.opacity(0.9))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(0.045)))
    }

    private func sideChip(_ label: String, key: String, tint: Color) -> some View {
        Button { side = key } label: {
            Text(label)
                .font(GaryFonts.mono(10, bold: true)).tracking(0.8)
                .foregroundStyle(side == key ? tint : .white.opacity(0.5))
                .padding(.horizontal, 10).padding(.vertical, 7)
                .background(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(side == key ? tint.opacity(0.12) : Color.white.opacity(0.05))
                        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .stroke(side == key ? tint.opacity(0.5) : Color.white.opacity(0.10), lineWidth: 1))
                )
        }
        .buttonStyle(.plain)
    }

    private func stepChip(_ symbol: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white.opacity(0.85))
                .frame(width: 26, height: 26)
                .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Color.white.opacity(0.07)))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // ── The outside-bet fallback (self-graded, YOUR PLAYS lane) ─────────────
    @ViewBuilder private var outsideBetBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showOutside.toggle() } } label: {
                HStack(spacing: 6) {
                    Text("OR LOG AN OUTSIDE BET")
                        .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                        .foregroundStyle(.white.opacity(0.55))
                    Image(systemName: showOutside ? "chevron.up" : "chevron.down")
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.4))
                    Spacer()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 18)

            if showOutside {
                VStack(alignment: .leading, spacing: 10) {
                    scanRow
                    HStack(spacing: 12) {
                        ForEach(leagues, id: \.self) { lg in
                            let isOn = draft.league == lg
                            Button { draft.league = lg } label: {
                                Text(lg)
                                    .font(GaryFonts.mono(9, bold: true)).tracking(0.6)
                                    .foregroundStyle(isOn ? GaryColors.gold : .white.opacity(0.5))
                                    .fixedSize()
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    TextField("What did you bet? (Yankees ML, Over 8.5, a parlay)", text: $draft.description, axis: .vertical)
                        .font(GaryFonts.text(13.5))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 11).padding(.vertical, 9)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
                    HStack(spacing: 10) {
                        TextField("Odds (-120, +145)", text: $oddsText)
                            .keyboardType(.numbersAndPunctuation)
                            .font(GaryFonts.mono(12.5))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 11).padding(.vertical, 9)
                            .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
                            .frame(width: 140)
                        TextField("Stake ($)", text: $stakeText)
                            .keyboardType(.decimalPad).font(GaryFonts.mono(12.5))
                            .padding(10).background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
                    }
                    DatePicker("Bet date (Eastern)", selection: $manualDate, displayedComponents: .date)
                        .environment(\.timeZone, TimeZone(identifier: "America/New_York")!)
                        .font(GaryFonts.text(13)).tint(GaryColors.gold)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("BET TYPE")
                            .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                            .foregroundStyle(.white.opacity(0.45))
                        BookMarketPicker(market: $draft.market)
                    }
                    TextField("Sportsbook (optional)", text: $draft.bookmaker)
                        .font(GaryFonts.text(13)).padding(10)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
                    VStack(alignment: .leading, spacing: 6) {
                        Text("TAGS")
                            .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                            .foregroundStyle(.white.opacity(0.45))
                        TagChipsEditor(tags: $draft.tags, suggestions: tagSuggestions)
                    }
                    TextField("Private notes (optional)", text: $draft.notes, axis: .vertical)
                        .font(GaryFonts.text(13)).padding(10)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
                    HStack {
                        Button { draft.favorite.toggle() } label: {
                            HStack(spacing: 5) {
                                Image(systemName: draft.favorite ? "heart.fill" : "heart")
                                    .font(.system(size: 11, weight: .semibold))
                                Text("FAVORITE")
                                    .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                            }
                            .foregroundStyle(draft.favorite ? ember : .white.opacity(0.5))
                        }
                        .buttonStyle(.plain)
                        Spacer()
                        Button { saveManual() } label: {
                            Text(busy ? "Saving" : "Add to Your Plays")
                                .font(GaryFonts.mono(11, bold: true))
                                .foregroundStyle(.black)
                                .padding(.horizontal, 14).padding(.vertical, 7)
                                .background(RoundedRectangle(cornerRadius: 6).fill(GaryColors.gold))
                        }
                        .buttonStyle(.plain)
                        .disabled(busy || draft.description.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    Text("Self-tracked entries stay in YOUR PLAYS — separate from your verified record with Gary.")
                        .font(GaryFonts.mono(8.5)).tracking(0.3)
                        .foregroundStyle(.white.opacity(0.35))
                        .fixedSize(horizontal: false, vertical: true)
                    if showOutside, let e = errorText {
                        Text(e)
                            .font(GaryFonts.mono(9.5))
                            .foregroundStyle(GaryColors.loss.opacity(0.9))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    // ── The slip scanner ─────────────────────────────────────────────────────

    @ViewBuilder private var scanRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                PhotosPicker(selection: $slipItem, matching: .images, photoLibrary: .shared()) {
                    HStack(spacing: 6) {
                        Image(systemName: scanning ? "hourglass" : "doc.viewfinder")
                            .font(.system(size: 12, weight: .semibold))
                        Text(scanning ? "READING YOUR SLIP" : "SCAN A SLIP")
                            .font(GaryFonts.mono(9.5, bold: true)).tracking(0.9)
                    }
                    .foregroundStyle(GaryColors.gold)
                    .padding(.horizontal, 12).frame(minHeight: 36)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(GaryColors.gold.opacity(0.10))
                            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(GaryColors.gold.opacity(0.4), lineWidth: 1))
                    )
                }
                .disabled(scanning || !auth.isAuthenticated)
                .accessibilityLabel("Scan a sportsbook slip screenshot to fill this form")
                Text("A screenshot of the slip fills the form. You still review and add it.")
                    .font(GaryFonts.text(11))
                    .foregroundStyle(.white.opacity(0.5))
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let scanError {
                Text(scanError)
                    .font(GaryFonts.mono(9.5))
                    .foregroundStyle(GaryColors.loss.opacity(0.9))
                    .fixedSize(horizontal: false, vertical: true)
            }
            if scanned.count > 1 {
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(scanned.count) BETS ON THIS SLIP · TAP ONE TO LOAD IT")
                        .font(GaryFonts.mono(8.5, bold: true)).tracking(0.7)
                        .foregroundStyle(.white.opacity(0.5))
                    ForEach(scanned) { bet in
                        Button { apply(bet) } label: {
                            HStack(spacing: 8) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(bet.description)
                                        .font(GaryFonts.text(12.5, .semibold))
                                        .foregroundStyle(.white.opacity(0.9))
                                        .lineLimit(2).minimumScaleFactor(0.7)
                                    Text("\(bet.league) · \(bet.oddsText) · \(bet.stakeText)")
                                        .font(GaryFonts.mono(9)).foregroundStyle(.white.opacity(0.45))
                                        .lineLimit(1).minimumScaleFactor(0.7)
                                }
                                Spacer(minLength: 6)
                                Text(draft.description == bet.description ? "LOADED" : "LOAD")
                                    .font(GaryFonts.mono(8.5, bold: true)).tracking(0.7)
                                    .foregroundStyle(GaryColors.gold.opacity(draft.description == bet.description ? 0.5 : 0.9))
                            }
                            .padding(10)
                            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.white.opacity(0.045)))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            if let scanNotes, !scanNotes.isEmpty {
                Text(scanNotes)
                    .font(GaryFonts.mono(9)).foregroundStyle(.white.opacity(0.45))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .onChange(of: slipItem) { item in
            guard let item else { return }
            Task { await scan(item) }
        }
    }

    private func scan(_ item: PhotosPickerItem) async {
        scanning = true; scanError = nil; scanNotes = nil; scanned = []
        defer { scanning = false; slipItem = nil }
        do {
            guard let raw = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: raw),
                  let jpeg = SlipScanAPI.prepare(image) else {
                scanError = "That image couldn't be opened. Try a screenshot of the slip."
                return
            }
            let result = try await SlipScanAPI.scan(jpeg: jpeg)
            scanned = result.bets
            scanSportsbook = result.sportsbook
            scanNotes = result.notes
            if let first = result.bets.first { apply(first) }
            if result.bets.count > 1 {
                scanNotes = [result.notes ?? "", "The first bet is loaded. Add it, then scan again or tap another to load it."]
                    .filter { !$0.isEmpty }.joined(separator: " ")
            }
        } catch {
            scanError = error.localizedDescription
        }
    }

    /// Prefills the outside-bet form. The user still reviews and taps Add.
    private func apply(_ bet: SlipScanAPI.ScannedBet) {
        var text = bet.description
        if bet.legs.count > 1 { text += " — " + bet.legs.joined(separator: ", ") }
        draft.description = String(text.prefix(300))
        draft.league = leagues.contains(bet.league) ? bet.league : "OTHER"
        draft.market = bet.market
        if let odds = bet.odds_american { oddsText = String(odds) }
        if let dollars = bet.stake_dollars { stakeText = String(format: "%.2f", dollars) }
        if let book = scanSportsbook, draft.bookmaker.isEmpty { draft.bookmaker = book }
        if let day = bet.game_date, let date = BookDates.parse(day) { manualDate = date }
        errorText = nil
    }

    // ── Data + booking ──────────────────────────────────────────────────────

    private func loadBoard() async {
        let request = UUID(); boardRequest = request
        let owner = auth.currentUser?.id
        loadingBoard = true
        let today = SupabaseAPI.todayEST()
        async let gameLoad = try? SupabaseAPI.fetchDailyPicks(date: today)
        async let propLoad = try? SupabaseAPI.fetchPropPicks(date: today, forceRefresh: true)
        let (games, props) = await (gameLoad, propLoad)
        guard boardRequest == request, owner == auth.currentUser?.id, !Task.isCancelled else { return }
        boardSnapshot.apply(date: today, games: games, props: props)

        func etClock(_ iso: String?) -> String? {
            guard let d = userBookInstant(iso) else { return nil }
            let f = DateFormatter(); f.dateFormat = "h:mm a"
            f.locale = Locale(identifier: "en_US_POSIX")
            f.timeZone = TimeZone(identifier: "America/New_York")
            return f.string(from: d)
        }

        var rows: [DirectoryEntry] = []
        for p in boardSnapshot.games {
            guard let text = p.pick, !text.isEmpty else { continue }
            var subBits = [(p.league ?? "").uppercased()]
            if let away = p.awayTeam, let home = p.homeTeam, !away.isEmpty, !home.isEmpty {
                subBits.append("\(away) @ \(home)")
            }
            subBits.append(etClock(p.commence_time) ?? "Start time unavailable")
            rows.append(DirectoryEntry(
                id: "game-\(p.game_id.map(String.init) ?? text)",
                title: text,
                subtitle: subBits.filter { !$0.isEmpty }.joined(separator: " · "),
                isProp: false,
                gameDate: BookTicketTime.gameDate(p.commence_time) ?? "",
                pickText: text,
                player: nil, propToken: nil,
                pickId: p.pick_id,
                commenceTime: p.commence_time, gameID: p.game_id.map(String.init)))
        }
        for p in boardSnapshot.props {
            guard BookPropEligibility.canVerify(p) else { continue }
            guard let player = p.player, let propText = p.prop, !propText.isEmpty else { continue }
            let betWord = (p.bet ?? "over").uppercased()
            var subBits = [(p.league ?? p.sport ?? "").uppercased()]
            if let m = p.matchup { subBits.append(m) }
            subBits.append(etClock(p.commence_time) ?? "Start time unavailable")
            rows.append(DirectoryEntry(
                id: "prop-\(player)-\(propText)-\(p.game_id.map(String.init) ?? "")",
                // The app's own prop grammar ("pitcher_earned_runs 2.5" reads
                // "Pitcher Earned Runs 2.5") — raw tokens ran long enough to
                // truncate, and an ellipsis is never acceptable.
                title: "\(player) \(betWord) \(Formatters.propDisplay(propText, league: p.effectiveLeague))",
                subtitle: subBits.filter { !$0.isEmpty }.joined(separator: " · "),
                isProp: true,
                gameDate: BookTicketTime.gameDate(p.commence_time) ?? "",
                pickText: propText,
                player: player,
                propToken: String(propText.split(separator: " ").first ?? "").lowercased(),
                pickId: nil,
                commenceTime: p.commence_time, gameID: p.game_id.map(String.init),
                line: Double(p.line ?? "") ?? Double(p.prop?.split(separator: " ").last.map(String.init) ?? ""), propSide: p.bet))
        }
        // What's already on their book — a bet you hold shows its receipt
        // instead of an arm button, so the directory can't double-book it.
        let mine = AuthManager.shared.bearerToken == nil ? [] : (await UserBookAPI.fetchMyBets() ?? [])
        guard boardRequest == request, owner == auth.currentUser?.id, !Task.isCancelled else { return }
        tagSuggestions = BookTags.popular(mine.map(\.analyticsEntry))
        rows = rows.map { entry in
            var e = entry
            let matches = mine.filter { bet in
                guard bet.isVerified, bet.game_date == e.gameDate else { return false }
                if let source = bet.source_game_id, let game = e.gameID, source != game { return false }
                if e.isProp {
                    guard bet.pick_type == "prop", bet.player_name?.lowercased() == e.player?.lowercased(),
                          bet.prop_type?.lowercased() == e.propToken?.lowercased() else { return false }
                    if let line = bet.source_line, line != e.line { return false }
                    if let side = bet.source_side, side.lowercased() != e.propSide?.lowercased() { return false }
                    return true
                }
                return bet.pick_type != "prop" && bet.pick_text.lowercased() == e.pickText.lowercased()
            }
            let held = matches.first { $0.source_game_id == e.gameID && $0.source_game_id != nil }
                ?? (matches.count == 1 ? matches.first : nil)
            if let held {
                let word = held.kind == "fade" ? "FADED" : held.kind == "tail" ? "RIDING" : "YOURS"
                e.booked = "\(word) · \(BookMoney.stake(held.stake_units))"
            }
            return e
        }

        // Open bets first, each lane in board order; anything already booked
        // sinks below the plays they can still take.
        let rank = { (e: DirectoryEntry) -> Int in e.locked ? 2 : (e.booked != nil ? 1 : 0) }
        let sorted = rows.sorted { a, b in
            rank(a) == rank(b)
                ? (a.isProp == b.isProp ? a.title < b.title : !a.isProp)
                : rank(a) < rank(b)
        }
        entries = sorted
        loadingBoard = false
    }

    private func place(_ entry: DirectoryEntry) {
        guard !entry.locked, !entry.gameDate.isEmpty else {
            errorText = "This pick is locked or its start time is unavailable."
            return
        }
        busy = true
        errorText = nil
        Task {
            defer { busy = false }
            do {
                var bet: UserBet
                if entry.isProp, let player = entry.player, let token = entry.propToken {
                    bet = try await UserBookAPI.placePropBet(
                        gameDate: entry.gameDate, player: player, propType: token,
                        kind: side, stake: stake, streak: streakOn, gameID: entry.gameID, line: entry.line, side: entry.propSide)
                } else {
                    bet = try await UserBookAPI.placeBet(
                        gameDate: entry.gameDate, pickId: entry.pickId,
                        pickText: entry.pickText, kind: side, stake: stake, streak: streakOn)
                }
                onLogged(bet)
                dismiss()
            } catch { errorText = error.localizedDescription }
        }
    }

    private func saveManual() {
        guard let dollars = Double(stakeText), dollars.isFinite, dollars > 0 else {
            errorText = "Enter your stake in dollars."; return
        }
        draft.stake = dollars / BookMoney.unitDollars
        draft.odds = Int(oddsText.trimmingCharacters(in: .whitespacesAndNewlines))
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        draft.gameDate = formatter.string(from: manualDate)
        busy = true
        errorText = nil
        Task {
            defer { busy = false }
            do {
                let bet = try await UserBookAPI.logManual(draft)
                onLogged(bet)
                dismiss()
            } catch { errorText = error.localizedDescription }
        }
    }
}

