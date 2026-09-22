import SwiftUI

// THE WINNERS LAB — your desk. A system is a named set of filters over the
// slate; every match enters at one unit when the game seals and grades like
// the board. Gary never sees it. The compare strip keeps score.

struct LabSystemsSection: View {
    let date: String
    let onOpen: (LabRoute) -> Void
    @State private var systems: [UserSystem] = []
    @State private var beat: BeatGary?
    @State private var loading = true
    @State private var error: String?
    @State private var builder: UserSystem?
    @State private var showBuilder = false
    @EnvironmentObject private var authManager: AuthManager

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !authManager.isAuthenticated {
                signIn
            } else {
                compareStrip
                if loading && systems.isEmpty {
                    HStack { Spacer(); ProgressView().tint(GaryColors.gold); Spacer() }.padding(.top, 20)
                } else {
                    ForEach(systems) { system in systemRow(system) }
                    if systems.isEmpty { starter }
                }
                Button { builder = nil; showBuilder = true } label: {
                    Text("START A NEW SYSTEM").font(GaryFonts.display(17)).tracking(1.2).foregroundStyle(GaryColors.gold)
                        .frame(maxWidth: .infinity).padding(.vertical, 13)
                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(GaryColors.gold.opacity(0.5), lineWidth: 1))
                }
                .buttonStyle(.plain)
                if let error { Text(error).font(GaryFonts.ui(12, .medium)).foregroundStyle(GaryColors.loss) }
            }
        }
        .pageGutter()
        .task { await load() }
        .sheet(isPresented: $showBuilder, onDismiss: { Task { await load() } }) {
            SystemBuilderSheet(date: date, existing: builder)
        }
    }

    private func load() async {
        guard authManager.isAuthenticated else { loading = false; return }
        do {
            async let s = SupabaseAPI.mySystems()
            async let b = SupabaseAPI.beatGary(days: 30)
            let list = try await s
            let compare = try? await b
            await MainActor.run { systems = list; beat = compare; loading = false; error = nil }
        } catch {
            await MainActor.run { loading = false; self.error = LabFormat.errorText(error) }
        }
    }

    private var signIn: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Your desk needs an account.").font(GaryFonts.display(24)).foregroundStyle(GaryColors.warmWhite)
            Button { NotificationCenter.default.post(name: Notification.Name("ShowProfile"), object: nil) } label: {
                Text("SIGN IN").font(GaryFonts.display(15)).tracking(1.2).foregroundStyle(GaryColors.gold)
            }.buttonStyle(.plain)
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading).labPlate()
    }

    private var compareStrip: some View {
        let best = beat?.systems?.max { ($0.units?.value ?? -99) < ($1.units?.value ?? -99) }
        return HStack(spacing: 10) {
            compareCell(title: "Gary, 30 days", record: beat?.gary?.line ?? "0-0", units: beat?.gary?.units?.value)
            Text("VS").font(GaryFonts.display(18)).foregroundStyle(LabInk.dimmer)
            compareCell(title: best?.name ?? "Your best system", record: best.map { "\($0.won ?? 0)-\($0.lost ?? 0)" } ?? "—", units: best?.units?.value)
        }
    }

    private func compareCell(title: String, record: String, units: Double?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(GaryFonts.ui(11, .medium)).foregroundStyle(LabInk.dim).lineLimit(1).minimumScaleFactor(0.7)
            Text(record).font(GaryFonts.display(34)).foregroundStyle(GaryColors.warmWhite)
            Text(LabFormat.unitsNet(units)).font(GaryFonts.display(16))
                .foregroundStyle((units ?? 0) > 0.049 ? GaryColors.win : (units ?? 0) < -0.049 ? GaryColors.loss : GaryColors.silver)
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading).labPlate()
    }

    private var starter: some View {
        Text("No systems yet.").font(GaryFonts.display(22)).foregroundStyle(GaryColors.warmWhite)
            .padding(16).frame(maxWidth: .infinity, alignment: .leading).labPlate()
    }

    private func systemRow(_ system: UserSystem) -> some View {
        Button { onOpen(.system(system)) } label: {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(system.name.uppercased()).font(GaryFonts.display(22)).foregroundStyle(GaryColors.warmWhite).lineLimit(1).minimumScaleFactor(0.7)
                    Text(SystemWords.describe(system.filters ?? SystemFilters())).font(GaryFonts.ui(11.5, .medium)).foregroundStyle(LabInk.dim)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(system.record?.line ?? "0-0").font(GaryFonts.display(22)).foregroundStyle(GaryColors.warmWhite)
                    Text(LabFormat.unitsNet(system.record?.units?.value)).font(GaryFonts.display(14))
                        .foregroundStyle((system.record?.units?.value ?? 0) > 0.049 ? GaryColors.win : (system.record?.units?.value ?? 0) < -0.049 ? GaryColors.loss : GaryColors.silver)
                    if let pending = system.record?.pending, pending > 0 {
                        Text("\(pending) open").font(GaryFonts.ui(11, .medium)).foregroundStyle(GaryColors.gold)
                    }
                }
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(LabInk.dimmer)
            }
            .padding(14).frame(maxWidth: .infinity, alignment: .leading).labPlate()
        }
        .buttonStyle(.plain)
    }
}

enum SystemWords {
    static let sides: [(String, String)] = [("any_dog", "Any dog"), ("road_dog", "Road dog"), ("home_dog", "Home dog"), ("any_favorite", "Favorite"), ("road_favorite", "Road favorite"), ("home_favorite", "Home favorite"), ("home", "Home team"), ("road", "Road team")]
    static let markets: [(String, String)] = [("moneyline", "Moneyline"), ("spread", "Spread"), ("total_over", "Over"), ("total_under", "Under")]
    static let times: [(String, String)] = [("any", "Any time"), ("day", "Day"), ("night", "Night"), ("primetime", "Primetime")]
    static let gary: [(String, String)] = [("any", "Either way"), ("with", "With Gary"), ("against", "Against Gary")]
    static let prices: [(String, Int?, Int?)] = [("Any price", nil, nil), ("Short dogs, +100 to +200", 100, 200), ("Long dogs, +200 up", 200, nil), ("Favorites to -200", -200, -100), ("Heavy favorites", nil, -200)]
    static let spreads: [(String, Double?)] = [("Any spread", nil), ("3 or less", 3), ("7 or less", 7), ("10 or less", 10)]

    static func label(_ key: String?, in table: [(String, String)]) -> String { table.first { $0.0 == key }?.1 ?? table[0].1 }
    static func describe(_ f: SystemFilters) -> String {
        var parts: [String] = []
        parts.append(label(f.side, in: sides))
        parts.append(label(f.market, in: markets).lowercased())
        if let name = prices.first(where: { $0.1 == f.price_min && $0.2 == f.price_max })?.0, name != "Any price" { parts.append(name.lowercased()) }
        if let s = f.spread_max { parts.append("spread \(LabFormat.trim(s)) or less") }
        if let t = f.time, t != "any" { parts.append(label(t, in: times).lowercased()) }
        if let g = f.gary, g != "any" { parts.append(label(g, in: gary).lowercased()) }
        let sports = (f.sports ?? []).joined(separator: " ")
        if !sports.isEmpty { parts.append(sports) }
        return parts.joined(separator: " · ")
    }
}

struct SystemBuilderSheet: View {
    let date: String
    let existing: UserSystem?
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var filters: SystemFilters
    @State private var matches: [SystemMatch] = []
    @State private var previewing = false
    @State private var saving = false
    @State private var error: String?
    @State private var previewTask: Task<Void, Never>?

    init(date: String, existing: UserSystem?) {
        self.date = date; self.existing = existing
        _name = State(initialValue: existing?.name ?? "")
        _filters = State(initialValue: existing?.filters ?? SystemFilters())
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    TextField("Name your system", text: $name)
                        .font(GaryFonts.display(28)).foregroundStyle(GaryColors.warmWhite)
                        .padding(.vertical, 6)
                        .overlay(alignment: .bottom) { Rectangle().fill(GaryColors.gold.opacity(0.5)).frame(height: 1) }
                    rule("Sports") { sportsRow }
                    rule("Side") { choice(SystemWords.sides, selected: filters.side ?? "any_dog") { filters.side = $0 } }
                    rule("Market") { choice(SystemWords.markets, selected: filters.market ?? "moneyline") { filters.market = $0 } }
                    rule("Price") { priceRow }
                    rule("Spread") { spreadRow }
                    rule("Time") { choice(SystemWords.times, selected: filters.time ?? "any") { filters.time = $0 } }
                    rule("Gary") { choice(SystemWords.gary, selected: filters.gary ?? "any") { filters.gary = $0 } }
                    preview
                    if let error { Text(error).font(GaryFonts.ui(12, .medium)).foregroundStyle(GaryColors.loss) }
                    Color.clear.frame(height: 30)
                }
                .padding(18)
            }
            .background(GaryColors.ink.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.foregroundStyle(LabInk.dim) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving" : "Save") { save() }
                        .font(GaryFonts.ui(14, .semibold)).foregroundStyle(GaryColors.gold)
                        .disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .tint(GaryColors.gold)
        .onAppear { schedulePreview() }
        .onChange(of: filters) { _ in schedulePreview() }
    }

    private func rule<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label.uppercased()).font(GaryFonts.display(13)).tracking(1.4).foregroundStyle(LabInk.dim)
            content()
            LabHairline()
        }
    }

    private func choice(_ table: [(String, String)], selected: String, pick: @escaping (String) -> Void) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                ForEach(table, id: \.0) { key, label in
                    Button { pick(key) } label: {
                        VStack(spacing: 3) {
                            Text(label.uppercased()).font(GaryFonts.display(15)).tracking(1).foregroundStyle(selected == key ? GaryColors.gold : LabInk.dimmer)
                            Rectangle().fill(selected == key ? GaryColors.gold : .clear).frame(height: 2)
                        }
                    }.buttonStyle(.plain)
                }
            }
        }
    }

    private var sportsRow: some View {
        HStack(spacing: 16) {
            ForEach(["MLB", "NFL", "NCAAF"], id: \.self) { sport in
                let on = (filters.sports ?? []).contains(sport)
                Button {
                    var s = Set(filters.sports ?? [])
                    if on { s.remove(sport) } else { s.insert(sport) }
                    if s.isEmpty { s.insert(sport) }
                    filters.sports = ["MLB", "NFL", "NCAAF"].filter { s.contains($0) }
                } label: {
                    VStack(spacing: 3) {
                        Text(sport).font(GaryFonts.display(15)).tracking(1).foregroundStyle(on ? GaryColors.gold : LabInk.dimmer)
                        Rectangle().fill(on ? GaryColors.gold : .clear).frame(height: 2)
                    }
                }.buttonStyle(.plain)
            }
        }
    }

    private var priceRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                ForEach(SystemWords.prices, id: \.0) { label, lo, hi in
                    let on = filters.price_min == lo && filters.price_max == hi
                    Button { filters.price_min = lo; filters.price_max = hi } label: {
                        VStack(spacing: 3) {
                            Text(label.uppercased()).font(GaryFonts.display(15)).tracking(1).foregroundStyle(on ? GaryColors.gold : LabInk.dimmer)
                            Rectangle().fill(on ? GaryColors.gold : .clear).frame(height: 2)
                        }
                    }.buttonStyle(.plain)
                }
            }
        }
    }

    private var spreadRow: some View {
        HStack(spacing: 16) {
            ForEach(SystemWords.spreads, id: \.0) { label, value in
                let on = filters.spread_max == value
                Button { filters.spread_max = value } label: {
                    VStack(spacing: 3) {
                        Text(label.uppercased()).font(GaryFonts.display(15)).tracking(1).foregroundStyle(on ? GaryColors.gold : LabInk.dimmer)
                        Rectangle().fill(on ? GaryColors.gold : .clear).frame(height: 2)
                    }
                }.buttonStyle(.plain)
            }
        }
    }

    private var preview: some View {
        VStack(alignment: .leading, spacing: 8) {
            LabTitle(text: "Matches \(date == SupabaseAPI.todayEST() ? "tonight" : LabFormat.shortDateWords(date))", note: previewing ? "checking" : "\(matches.count)")
            if matches.isEmpty && !previewing {
                Text("No matches.").font(GaryFonts.ui(12.5, .medium)).foregroundStyle(LabInk.dim)
            }
            ForEach(matches) { m in
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(m.pick_text ?? "").font(GaryFonts.text(13.5, .semibold)).foregroundStyle(GaryColors.warmWhite)
                        Text("\(m.matchup ?? "") · \(LabFormat.timeET(m.commence_time))\(m.gary_pick.map { p in m.gary_agrees == true ? " · Gary agrees" : " · Gary has \(LabFormat.ticketBody(p))" } ?? "")")
                            .font(GaryFonts.ui(11.5)).foregroundStyle(LabInk.dim)
                    }
                    Spacer()
                    Text(LabFormat.price(m.odds)).font(GaryFonts.data(12, .semibold)).foregroundStyle(m.odds_estimated == true ? LabInk.dim : GaryColors.silver)
                }
                .padding(.vertical, 6)
                LabHairline()
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading).labPlate()
    }

    private func schedulePreview() {
        previewTask?.cancel()
        previewing = true
        let snapshot = filters
        previewTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }
            let list = (try? await SupabaseAPI.systemMatches(filters: snapshot, date: date)) ?? []
            guard !Task.isCancelled else { return }
            await MainActor.run { matches = list; previewing = false }
        }
    }

    private func save() {
        saving = true; error = nil
        Task {
            do {
                let id = try await SupabaseAPI.upsertSystem(id: existing?.id, name: name.trimmingCharacters(in: .whitespaces), filters: filters, active: true)
                _ = try? await SupabaseAPI.enterSystemBets(systemID: id, date: date)
                await MainActor.run { saving = false; dismiss() }
            } catch {
                await MainActor.run { saving = false; self.error = LabFormat.errorText(error) }
            }
        }
    }
}

struct LabSystemView: View {
    let system: UserSystem
    let date: String
    @State private var bets: [SystemBet] = []
    @State private var loading = true
    @State private var error: String?
    @State private var showBuilder = false
    @State private var confirmDelete = false
    @State private var showTalk = false
    @ObservedObject private var liveCache = LiveScoreCache.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            GaryColors.ink.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 14) {
                    hero
                    tonight
                    Color.clear.frame(height: 150)
                }
                .padding(.horizontal, GaryLayout.gutter).padding(.top, 8)
            }
        }
        .overlay(alignment: .bottom) {
            GaryTalkBar(prompt: "Ask Gary about \(system.name)") { showTalk = true }
                .padding(.horizontal, GaryLayout.gutter).padding(.bottom, 92)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Edit the rules") { showBuilder = true }
                    Button("Enter tonight's matches") { Task { await enter() } }
                    Button("Delete this system", role: .destructive) { confirmDelete = true }
                } label: { Image(systemName: "ellipsis").foregroundStyle(GaryColors.gold) }
            }
        }
        .tint(GaryColors.gold)
        .task { await load() }
        .sheet(isPresented: $showBuilder, onDismiss: { Task { await load() } }) { SystemBuilderSheet(date: date, existing: system) }
        .sheet(isPresented: $showTalk) {
            GaryTalkSheet(date: date, focusLabel: system.name, context: "The fan's system \"\(system.name)\": \(SystemWords.describe(system.filters ?? SystemFilters())). Record \(system.record?.line ?? "0-0"), \(LabFormat.unitsNet(system.record?.units?.value)).")
                .presentationDetents([.large])
        }
        .confirmationDialog("Delete \(system.name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { try? await SupabaseAPI.deleteSystem(id: system.id); await MainActor.run { dismiss() } } }
        }
    }

    private func load() async {
        do {
            let list = try await SupabaseAPI.systemBets(systemID: system.id, date: date)
            await MainActor.run { bets = list; loading = false; error = nil; liveCache.startIfNeeded() }
        } catch {
            await MainActor.run { loading = false; self.error = LabFormat.errorText(error) }
        }
    }
    private func enter() async {
        _ = try? await SupabaseAPI.enterSystemBets(systemID: system.id, date: date)
        await load()
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("YOUR SYSTEM").font(GaryFonts.display(13)).tracking(1.4).foregroundStyle(GaryColors.gold)
            Text(system.name.uppercased()).font(GaryFonts.display(38)).foregroundStyle(GaryColors.warmWhite).lineLimit(2).minimumScaleFactor(0.6)
            Text(SystemWords.describe(system.filters ?? SystemFilters())).font(GaryFonts.ui(12.5, .medium)).foregroundStyle(LabInk.dim)
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                Text(system.record?.line ?? "0-0").font(GaryFonts.display(30)).foregroundStyle(GaryColors.warmWhite)
                Text(LabFormat.unitsNet(system.record?.units?.value)).font(GaryFonts.display(22))
                    .foregroundStyle((system.record?.units?.value ?? 0) > 0.049 ? GaryColors.win : (system.record?.units?.value ?? 0) < -0.049 ? GaryColors.loss : GaryColors.silver)
                Spacer()
            }
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading).labPlate(radius: 16, edge: GaryColors.gold.opacity(0.4))
    }

    private var tonight: some View {
        VStack(alignment: .leading, spacing: 8) {
            LabTitle(text: date == SupabaseAPI.todayEST() ? "Tonight" : LabFormat.shortDateWords(date), note: bets.isEmpty ? nil : "\(bets.count) play\(bets.count == 1 ? "" : "s")")
            if loading && bets.isEmpty { HStack { Spacer(); ProgressView().tint(GaryColors.gold); Spacer() } }
            else if bets.isEmpty {
                Text("No plays.").font(GaryFonts.ui(12.5, .medium)).foregroundStyle(LabInk.dim)
            }
            ForEach(bets) { bet in betRow(bet) }
            if let error { Text(error).font(GaryFonts.ui(12, .medium)).foregroundStyle(GaryColors.loss) }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).labPlate()
    }

    @ViewBuilder
    private func betRow(_ bet: SystemBet) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text((bet.pick_text ?? "").uppercased()).font(GaryFonts.display(22)).foregroundStyle(GaryColors.warmWhite).lineLimit(2).minimumScaleFactor(0.7)
                    Text("\(bet.league ?? "") · \(bet.matchup ?? "") · \(LabFormat.timeET(bet.commence_time))").font(GaryFonts.ui(11.5)).foregroundStyle(LabInk.dim).lineLimit(1).minimumScaleFactor(0.7)
                }
                Spacer()
                Text(LabFormat.price(bet.odds)).font(GaryFonts.display(18)).foregroundStyle(bet.odds_estimated == true ? LabInk.dim : GaryColors.silver)
            }
            HStack(spacing: 10) {
                stateWord(bet)
                if let net = bet.units_net?.value, bet.status != "pending" {
                    Text(LabFormat.unitsNet(net)).font(GaryFonts.data(11.5, .semibold)).foregroundStyle(net > 0 ? GaryColors.win : net < 0 ? GaryColors.loss : GaryColors.silver)
                }
                Spacer()
            }
            if let gary = bet.gary, let pick = gary.pick_text {
                let agrees = LabFormat.ticketBody(pick).lowercased().split(separator: " ").first == LabFormat.ticketBody(bet.pick_text ?? "").lowercased().split(separator: " ").first
                if let id = gary.candidate_id {
                    NavigationLink(value: LabRoute.play(id)) { garyLine(pick: pick, agrees: agrees) }.buttonStyle(.plain)
                } else {
                    garyLine(pick: pick, agrees: agrees)
                }
            }
        }
        .padding(.vertical, 8)
        LabHairline()
    }

    private func garyLine(pick: String, agrees: Bool) -> some View {
        LabReceipt {
            Text(agrees ? "Gary: \(LabFormat.ticketBody(pick))" : "Gary went the other way: \(LabFormat.ticketBody(pick))")
                .font(GaryFonts.ui(12.5, .semibold)).foregroundStyle(agrees ? GaryColors.win : GaryColors.sweating)
        }
    }

    private func stateWord(_ bet: SystemBet) -> some View {
        let status = (bet.status ?? "pending").lowercased()
        if status == "won" { return LabStateWord(text: "Win", color: GaryColors.win, size: 15) }
        if status == "lost" { return LabStateWord(text: "Loss", color: GaryColors.loss, size: 15) }
        if status == "push" { return LabStateWord(text: "Push", color: GaryColors.silver, size: 15) }
        if let id = bet.game_id?.value, let n = Int(id), let live = liveCache.status(forGameId: n, league: bet.league), live.isLive {
            return LabStateWord(text: "Live", color: GaryColors.sweating, pulse: true, size: 15)
        }
        return LabStateWord(text: "Open", color: GaryColors.gold, size: 15)
    }
}
