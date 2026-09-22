import SwiftUI
import Charts
import PhotosUI

/// Inline unit-size ask — appears the first time a signed-in user lands on
/// their book without one set. Save drops them right back where they were.
struct UnitSizeSheet: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("userUnitDollars") private var userUnitDollars = 0.0
    @State private var amountText = ""
    @State private var saving = false
    @State private var errorText: String?
    private let quick: [Double] = [10, 25, 50, 100]

    var body: some View {
        ZStack {
            Color(hex: "#1C1A1A").ignoresSafeArea()
            unitForm
        }
        .presentationDetents([.medium])
        .onAppear { if BookMoney.isSet { amountText = String(format: "%.2f", BookMoney.unitDollars) } }
    }

    private var unitForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("WHAT'S A UNIT WORTH TO YOU?")
                .font(GaryFonts.mono(12, bold: true)).tracking(1.2)
                .foregroundStyle(GaryColors.gold)
            Text("Your book records bets in units and converts them using this amount. Changing it updates dollar displays across your history. Until you set one, we use a hypothetical $100 per unit.")
                .font(GaryFonts.text(13))
                .foregroundStyle(.white.opacity(0.65))
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 16) {
                ForEach(quick, id: \.self) { amt in
                    let isOn = amountText == String(format: "%.0f", amt)
                    Button {
                        amountText = String(format: "%.0f", amt)
                    } label: {
                        Text("$\(Int(amt))")
                            .font(GaryFonts.mono(12, bold: true))
                            .foregroundStyle(isOn ? GaryColors.gold : .white.opacity(0.6))
                            .fixedSize()
                    }
                    .buttonStyle(.plain)
                }
            }
            HStack(spacing: 10) {
                Text("$")
                    .font(GaryFonts.mono(14, bold: true))
                    .foregroundStyle(.white.opacity(0.6))
                TextField("25", text: $amountText)
                    .keyboardType(.decimalPad)
                    .font(GaryFonts.mono(15, bold: true))
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
            Button {
                guard let value = Double(amountText), value.isFinite, value > 0, value <= 100000 else {
                    if amountText.isEmpty { dismiss() } else { errorText = "Enter an amount between $0.01 and $100,000." }
                    return
                }
                saving = true; errorText = nil
                Task {
                    defer { saving = false }
                    do {
                        let current = try await ProfileIdentityAPI.mine()
                        let saved = try await ProfileIdentityAPI.save(handle: current.profile?.name ?? "",
                            avatar: current.profile?.avatar ?? "initials", bio: current.profile?.bio ?? "",
                            visible: current.profile?.isPublic ?? false, sports: current.preferences?.favorite_sports ?? [], unitValue: value)
                        ProfileIdentityAPI.cache(saved)
                        userUnitDollars = value
                        NotificationCenter.default.post(name: .userBookChanged, object: nil)
                        dismiss()
                    } catch { errorText = error.localizedDescription }
                }
            } label: {
                Text(Double(amountText).map { $0 > 0 } == true ? "Save" : "Keep $100 for now")
                    .font(GaryFonts.mono(12, bold: true)).tracking(0.5)
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(RoundedRectangle(cornerRadius: 8).fill(GaryColors.gold))
            }
            .buttonStyle(.plain).disabled(saving)
            if let errorText { Text(errorText).font(GaryFonts.text(12)).foregroundStyle(GaryColors.loss) }
        }
        .padding(20)
    }
}

/// Once per app session — an inline ask, never a nag.

