import SwiftUI

/// A receipt stays readable after lock. Only personal annotations remain editable.
struct UserBetDetailSheet: View {
    let bet: UserBet
    var onUpdate: (UserBet) -> Void
    var onDelete: () -> Void
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var auth = AuthManager.shared
    @State private var favorite = false
    @State private var notes = ""
    @State private var bookmaker = ""
    @State private var busy = false
    @State private var error: String?
    @State private var confirmDelete = false
    @State private var descriptionText = ""
    @State private var oddsText = ""
    @State private var stakeText = ""
    @State private var betDate = Date()

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(bet.pick_text).font(.headline).fixedSize(horizontal: false, vertical: true)
                    LabeledContent("Date (Eastern)", value: bet.game_date)
                    LabeledContent("Source", value: bet.isVerified ? "Verified · \(bet.kind.capitalized)" : "Your plays · Self-graded")
                    LabeledContent("Stake", value: BookMoney.stake(bet.stake_units))
                    LabeledContent("Odds", value: bet.odds_american.map { ($0 > 0 ? "+" : "") + String($0) } ?? "Not recorded")
                    LabeledContent("Result", value: bet.status.capitalized)
                    if !bet.isPending { LabeledContent("Net", value: BookMoney.net(bet.units_net ?? 0)) }
                    if bet.odds_estimated == true { Text("The original market price was unavailable; this receipt uses estimated -110 odds.").font(.caption).foregroundStyle(.secondary) }
                } header: { Text("Your receipt") }
                Section {
                    Toggle("Favorite", isOn: $favorite)
                    TextField("Sportsbook (optional)", text: $bookmaker)
                        .onChange(of: bookmaker) { value in bookmaker = String(value.prefix(80)) }
                    TextField("Private notes", text: $notes, axis: .vertical)
                        .lineLimit(3...8)
                        .onChange(of: notes) { value in notes = String(value.prefix(2000)) }
                    Button("Save details") { saveDetails() }.disabled(busy)
                } header: { Text("Only you can see this") }
                  footer: { Text("Favorites bookmark any bet. They do not affect your ranked streak.") }
                if bet.isVerified {
                    Section {
                        if bet.canChangeStreak {
                            Button(bet.streak_pick == true ? "Remove streak designation" : "Make this my streak pick") {
                                busy = true; error = nil
                                Task {
                                    defer { busy = false }
                                    if await UserBookAPI.setStreakPick(id: bet.id, gameDate: bet.game_date, star: bet.streak_pick != true) {
                                        dismiss()
                                    } else { error = "That choice couldn't be saved. Your current streak pick is unchanged. Refresh and check whether the game has started." }
                                }
                            }.disabled(busy)
                        } else {
                            Label(bet.streak_pick == true ? "Your locked streak pick" : "This receipt is locked", systemImage: "lock.fill")
                        }
                    } header: { Text("The streak") }
                      footer: { Text("Choose one verified pick per Eastern date before it starts. Wins build the run; a loss resets it. Pushes, voids and skipped days preserve it. Once your chosen game starts, that day's choice is final.") }
                } else {
                    Section("Edit your entry") {
                        TextField("Your bet", text: $descriptionText, axis: .vertical)
                            .onChange(of: descriptionText) { value in descriptionText = String(value.prefix(300)) }
                        TextField("American odds", text: $oddsText).keyboardType(.numbersAndPunctuation)
                        TextField("Stake in dollars", text: $stakeText).keyboardType(.decimalPad)
                        DatePicker("Date (Eastern)", selection: $betDate, displayedComponents: .date)
                            .environment(\.timeZone, TimeZone(identifier: "America/New_York")!)
                        Button("Save entry correction") { editEntry() }.disabled(busy)
                    }
                    Section {
                        ForEach(["won", "lost", "push", "void", "pending"], id: \.self) { status in
                            Button(status == "pending" ? "Reopen this bet" : "Mark as \(status)") { settle(status) }
                                .disabled(busy || bet.status == status)
                        }
                    } header: { Text(bet.isPending ? "Record your result" : "Correct your result") }
                      footer: { Text("Your own entries never contribute to public rankings. A void returns the stake; reopening removes the result from your totals.") }
                }
                if bet.kind == "manual" || bet.canChangeStreak {
                    Section {
                        Button("Delete this bet", role: .destructive) { confirmDelete = true }.disabled(busy)
                    }
                }
                if let error { Section { Text(error).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently) } }
            }
            .navigationTitle("Bet details").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .tint(GaryColors.gold)
            .onAppear {
                favorite = bet.is_favorite == true; notes = bet.notes ?? ""; bookmaker = bet.bookmaker ?? ""
                descriptionText = bet.pick_text; oddsText = bet.odds_american.map(String.init) ?? ""
                stakeText = String(format: "%.2f", bet.stake_units * BookMoney.unitDollars)
                betDate = Self.dateFormatter.date(from: bet.game_date) ?? Date()
            }
            .confirmationDialog("Delete this bet from your book?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete bet", role: .destructive) {
                    busy = true; error = nil
                    Task {
                        defer { busy = false }
                        if await UserBookAPI.deleteBet(id: bet.id) { onDelete(); dismiss() }
                        else { error = "This bet couldn't be deleted. A verified receipt is locked when its game starts." }
                    }
                }
            }
        }
        .onChange(of: auth.currentUser?.id) { _ in dismiss() }
        .interactiveDismissDisabled(busy)
    }

    private func saveDetails() {
        busy = true; error = nil
        Task {
            defer { busy = false }
            do {
                let updated = try await UserBookAPI.updateDetails(id: bet.id, favorite: favorite, notes: notes, bookmaker: bookmaker)
                onUpdate(updated); dismiss()
            } catch { self.error = error.localizedDescription }
        }
    }

    private static var dateFormatter: DateFormatter {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: "America/New_York")
        return f
    }

    private func editEntry() {
        guard let odds = Int(oddsText), let dollars = Double(stakeText), dollars.isFinite else {
            error = "Enter American odds and your stake in dollars."; return
        }
        busy = true; error = nil
        Task {
            defer { busy = false }
            do {
                let updated = try await UserBookAPI.editManual(id: bet.id, description: descriptionText, odds: odds,
                    stake: dollars / BookMoney.unitDollars, gameDate: Self.dateFormatter.string(from: betDate))
                onUpdate(updated); dismiss()
            } catch { self.error = error.localizedDescription }
        }
    }

    private func settle(_ status: String) {
        busy = true; error = nil
        Task {
            defer { busy = false }
            let net = UserBookAPI.manualUnits(status: status, stake: bet.stake_units, odds: bet.odds_american)
            if await UserBookAPI.gradeManual(id: bet.id, status: status, unitsNet: net) { dismiss() }
            else { error = "Your result couldn't be saved. Please try again." }
        }
    }
}

enum BookExport {
    /// Quoting protects CSV structure; a leading apostrophe prevents spreadsheet formulas.
    static func cell(_ raw: String) -> String {
        let dangerous = raw.trimmingCharacters(in: .whitespacesAndNewlines).first.map { "=+-@".contains($0) } ?? false
        let value = (dangerous ? "'" : "") + raw
        return "\"" + value.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }

    static func csv(_ bets: [UserBet]) -> URL {
        let header = "Date,Source,League,Pick,American odds,Stake units,Status,Net units,Streak pick,Favorite,Sportsbook,Private notes"
        let rows = bets.map { b in
            [cell(b.game_date), cell(b.kind), cell(b.league ?? ""), cell(b.pick_text),
             b.odds_american.map(String.init) ?? "", String(b.stake_units), cell(b.status),
             b.units_net.map { String($0) } ?? "", b.streak_pick == true ? "true" : "false",
             b.is_favorite == true ? "true" : "false", cell(b.bookmaker ?? ""), cell(b.notes ?? "")].joined(separator: ",")
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("Gary-my-bets.csv")
        try? ([header] + rows).joined(separator: "\r\n").write(to: url, atomically: true, encoding: .utf8)
        return url
    }
}
