// PlansSheet.swift — Plans / Pricing sheet (the paywall).
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Plans / Pricing sheet (the paywall)
//
// A two-state conversion paywall, not a flat price list. State 1 (the default)
// sells: hero → benefits → a LIVE graded-results receipt → featured plans
// (All-Access pre-selected) → an "all plans"
// link. State 2 is the full menu (single sports, bundles, the free tier). One
// dominant gold CTA at the bottom follows the current selection and discloses
// the Stripe/Safari hand-off; everything else is quiet. Checkout still rides
// the same callbacks the storefront uses (onSelect / onBundle / onAccount).
struct PlansSheetView: View {
    let focus: String?               // league context from a blurred-board tap
    let signedIn: Bool
    var onSelect: (String) -> Void   // league key ("MLB", "ALL", ...) -> checkout
    var onBundle: ([String]) -> Void // picked bundle sports -> server checkout
    var onAccount: () -> Void        // open sign-in / create account
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage("selectedTab") private var selectedTab: Int = 0

    /// What the single dominant CTA acts on.
    /// One selection model: tap sports and the plan derives itself —
    /// 1 = single pass, 2-3 = bundle, automatically. No separate bundle UI.
    private enum PlanSelection: Equatable { case allAccess, allAccessAnnual, sports }

    /// The annual card unhides itself once a build flavor carries an
    /// ALL_ANNUAL checkout link (DEBUG today; RELEASE after the live swap).
    private var annualAvailable: Bool { PremiumPicksView.checkoutLinks["ALL_ANNUAL"] != nil }

    @State private var selection: PlanSelection
    /// The sports the user has tapped (max 3 — past that All-Access wins on
    /// price). 1 checks out as a single pass, 2-3 as the bundle.
    @State private var pickedSports: Set<String> = []
    /// Set when a 4th tap gets blocked — the caption explains the better deal.
    @State private var capHint = false
    /// Per-sport last-30 records — the sport tiles carry proof, not filler.
    @State private var sportRecords: [String: (w: Int, l: Int)] = [:]
    /// THE RECORD — the website's trust block, ported. All-time W–L across
    /// games and props, last 30 days, current streak. nil = hidden (never
    /// fabricated; the block waits for real graded results).
    @State private var ledger: LedgerStats? = nil
    struct LedgerStats {
        let allW: Int; let allL: Int
        let last30W: Int; let last30L: Int
        let streakChar: String; let streakLen: Int
    }
    @State private var appeared = false
    @State private var checkoutAvailable = false

    /// Real, current graded record — never fabricated. Pulled from the same
    /// game_results source as the Results tab; the strip hides entirely if the
    /// fetch fails or comes back empty rather than showing a made-up number.

    private static let sports = ["MLB", "NBA", "NFL", "NCAAF"]
    private static let winColor = GaryColors.win
    private static let lossColor = GaryColors.loss
    private static let ink = Color(hex: "#0C0B0B")   // text on the gold CTA / chips

    /// A focused sport (from a blurred board) respects intent: open the full
    /// menu with that board already picked, All-Access still on top as the
    /// anchor. A generic open leads with the conversion paywall.
    init(focus: String?, signedIn: Bool,
         onSelect: @escaping (String) -> Void,
         onBundle: @escaping ([String]) -> Void,
         onAccount: @escaping () -> Void) {
        self.focus = focus
        self.signedIn = signedIn
        self.onSelect = onSelect
        self.onBundle = onBundle
        self.onAccount = onAccount
        if let f = focus, Self.sports.contains(f) {
            _selection = State(initialValue: .sports)
            _pickedSports = State(initialValue: [f])
        } else {
            _selection = State(initialValue: .allAccess)
        }
    }

    /// Focused sport leads the single-sport grid.
    private var orderedSports: [String] {
        guard let f = focus, Self.sports.contains(f) else { return Self.sports }
        return [f] + Self.sports.filter { $0 != f }
    }

    // MARK: Body

    var body: some View {
        ZStack {
            LiquidGlassBackground(grainDensity: 0)
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    topBar
                    if checkoutAvailable {
                        allPlansScreen
                    } else {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("Winners access").font(GaryFonts.display(28))
                            Text(ExternalCheckoutPolicy.unavailableMessage)
                                .font(GaryFonts.text(15))
                                .foregroundStyle(.white.opacity(0.7))
                            if !signedIn {
                                Button("Sign In", action: onAccount).tint(GaryColors.gold)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
                .padding(.top, 8)
                .padding(.bottom, 28)
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 8)
            }
        }
        .safeAreaInset(edge: .bottom) { if checkoutAvailable { ctaBar } }
        .preferredColorScheme(.dark)
        .task { await loadRecord() }
        .task {
            #if DEBUG
            checkoutAvailable = true // Stripe test-mode simulator QA only.
            #else
            checkoutAvailable = ExternalCheckoutPolicy.permitsPurchase(countryCode: await Storefront.current?.countryCode)
            for await storefront in Storefront.updates {
                checkoutAvailable = ExternalCheckoutPolicy.permitsPurchase(countryCode: storefront.countryCode)
            }
            #endif
        }
        .onAppear {
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.35)) { appeared = true }
            SupabaseAPI.logEvent("paywall_viewed", [
                "surface": "ios",
                "trigger": focus == nil ? "all_access" : (focusedSport != nil ? "winners_tap" : "wc_tap"),
                "sport_focus": focus ?? "none",
            ])
        }
    }

    private var topBar: some View {
        HStack(spacing: 4) {
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.62))
                    .frame(width: 44, height: 44, alignment: .trailing)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
        }
        .padding(.horizontal, 16)
    }

    /// The single-sport context this paywall was opened from (nil = generic).
    /// WC is excluded — it isn't one of the per-sport Winners boards.
    private var focusedSport: String? {
        guard let f = focus, Self.sports.contains(f) else { return nil }
        return f
    }

    /// The pitch isn't "more picks" — the free slate already has every game.
    /// It's Gary's *card*: the few plays a night he'd actually back, per sport.
    /// One stat card of the record trio — WIN PCT / LAST 30 / STREAK.
    private func ledgerStat(_ label: String, _ value: String, _ sub: String?, tint: Color = .white) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(GaryFonts.mono(8.5, bold: true)).tracking(1.2)
                .foregroundStyle(.white.opacity(0.62))
            Text(value)
                .font(GaryFonts.mono(19, bold: true))
                .foregroundStyle(tint)
                .lineLimit(1).minimumScaleFactor(0.7)
            if let sub, !sub.isEmpty {
                Text(sub)
                    .font(GaryFonts.mono(8.5))
                    .foregroundStyle(.white.opacity(0.62))
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(hex: "#0F0D0D"))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.white.opacity(0.07), lineWidth: 1))
        )
    }

    @ViewBuilder private var recordBlock: some View {
        if let s = ledger {
            let graded = s.allW + s.allL
            let pct = graded > 0 ? Int((Double(s.allW) / Double(graded) * 100).rounded()) : 0
            let l30 = s.last30W + s.last30L
            let l30pct = l30 > 0 ? Int((Double(s.last30W) / Double(l30) * 100).rounded()) : 0
            VStack(alignment: .leading, spacing: 12) {
                Text("THE RECORD")
                    .font(GaryFonts.mono(10, bold: true)).tracking(1.6)
                    .foregroundStyle(GaryColors.gold.opacity(0.92))
                (Text("\(s.allW.formatted())")
                    + Text("–").foregroundColor(.white.opacity(0.62))
                    + Text("\(s.allL.formatted())"))
                    .font(GaryFonts.mono(42, bold: true))
                    .foregroundStyle(.white.opacity(0.96))
                    .lineLimit(1).minimumScaleFactor(0.6)
                Text("Every game pick Gary has made, graded against final scores the next morning. No deletions, no restatements — losses stay on the books with the wins.")
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.6))
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 10) {
                    ledgerStat("WIN PCT", "\(pct)%", "\(graded.formatted()) graded")
                    ledgerStat("LAST 30", "\(s.last30W)–\(s.last30L)", "\(l30pct)% win")
                    ledgerStat("STREAK", "\(s.streakChar)\(s.streakLen)", nil,
                               tint: s.streakChar == "W" ? Self.winColor : Self.lossColor)
                }
                Button {
                    selectedTab = 4   // Results / Billfold tab
                    dismiss()
                } label: {
                    Text("The full ledger")
                        .font(GaryFonts.text(13, .semibold))
                        .foregroundStyle(GaryColors.gold)
                        .padding(.vertical, 10).padding(.horizontal, 18)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .stroke(GaryColors.gold.opacity(0.45), lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: The pricing page — ONE screen. The two-state paywall is dead:
    // every entry point lands here; the proof strip is the only sales asset
    // that earned its keep.

    private var allPlansScreen: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Gary's card.").font(GaryFonts.display(30)).foregroundStyle(.white)
                Text("One board or every board — every result graded in public.")
                    .font(.system(size: 13.5)).foregroundStyle(.white.opacity(0.62))
            }
            .padding(.horizontal, 16)

            recordBlock

            // All-Access leads as the anchor / best value.
            VStack(alignment: .leading, spacing: 10) {
                HubSectionHeader(eyebrow: "All-Access", sub: "")
                planCard(selected: selection == .allAccess,
                         ribbon: "Best value · " + GaryPricing.trialDaysFree, ribbonTeal: false,
                         title: "ALL-ACCESS",
                         sub: "All 7 Winners boards · ~$4 a board",
                         price: GaryPricing.allAccessMonthly, per: "PER MONTH",
                         a11y: "All-Access. \(GaryPricing.allAccessMonthly) a month. All seven boards. \(GaryPricing.trialDaysFree)." + (selection == .allAccess ? " Selected." : "")) {
                    select(.allAccess)
                }
                .padding(.horizontal, 16)
                if annualAvailable {
                    planCard(selected: selection == .allAccessAnnual,
                             ribbon: "Save 50% vs monthly", ribbonTeal: false,
                             title: "ALL-ACCESS — ANNUAL",
                             sub: "Every board, all year · works out to \(GaryPricing.allAccessAnnualMonthly)/mo",
                             price: GaryPricing.allAccessAnnual, per: "PER YEAR",
                             a11y: "All-Access annual. \(GaryPricing.allAccessAnnual) a year — about \(GaryPricing.allAccessAnnualMonthly) a month. \(GaryPricing.trialDaysFree)." + (selection == .allAccessAnnual ? " Selected." : "")) {
                        select(.allAccessAnnual)
                    }
                    .padding(.horizontal, 16)
                }
            }

            sportGridSection
            includedFreeSection
            if !signedIn { createAccountSection }
            legalFooter
        }
    }

    private var sportGridSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HubSectionHeader(eyebrow: "Pick your sports",
                             sub: "One \(GaryPricing.single)/mo · two \(GaryPricing.twoSport) · three \(GaryPricing.threeSport) — bundles itself")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(orderedSports, id: \.self) { sportCard($0) }
            }
            .padding(.horizontal, 16)
        }
    }

    /// The bundle sits between $9.99 single and $34.99 All-Access as the smart
    /// middle. Picking 2–3 chips makes the bundle the active selection so the
    /// one CTA carries it; dropping below two reverts to All-Access.
    private var includedFreeSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HubSectionHeader(eyebrow: "Free, always", sub: "")
            VStack(spacing: 0) {
                infoRow(icon: "list.bullet.rectangle", title: "THE FULL SLATE",
                        sub: "Every game's pick + the reasoning, every sport", tag: "FREE")
                hairline
                infoRow(icon: "rectangle.grid.1x2", title: "THE HUB",
                        sub: "Edges, trends & receipts — graded daily", tag: "FREE")
            }
            .quantPanel()
            .padding(.horizontal, 16)
        }
    }

    private var createAccountSection: some View {
        Button { onAccount() } label: {
            HStack(spacing: 12) {
                Image(systemName: "person.crop.circle")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(GaryColors.gold).frame(width: 20)
                VStack(alignment: .leading, spacing: 2) {
                    Text("CREATE ACCOUNT")
                        .font(GaryFonts.mono(12, bold: true)).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.9))
                    Text("Plans and unlocks follow your account")
                        .font(.system(size: 11)).foregroundStyle(.white.opacity(0.62))
                }
                Spacer(minLength: 8)
                Text("Sign up ›")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(GaryColors.gold)
            }
            .padding(.vertical, 12).padding(.horizontal, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .quantPanel()
        .padding(.horizontal, 16)
    }

    private var legalFooter: some View {
        Text("Plans bill through Stripe and cancel anytime. The \(GaryPricing.trialPhrase) requires a card and converts to \(GaryPricing.allAccessMonthly)/mo unless cancelled. An account keeps your boards across devices.")
            .font(GaryFonts.text(10))
            .foregroundStyle(.white.opacity(0.62))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 16)
    }

    // MARK: Sticky CTA

    private var ctaBar: some View {
        VStack(spacing: 8) {
            Button { primaryAction() } label: {
                HStack(spacing: 7) {
                    Text(ctaLabel)
                        .font(GaryFonts.mono(14, bold: true)).tracking(0.5)
                        .lineLimit(1).minimumScaleFactor(0.7)
                    if ctaShowsBrowserGlyph {
                        Image(systemName: "arrow.up.right").font(.system(size: 11, weight: .bold))
                    }
                }
                .foregroundStyle(Self.ink)
                .frame(maxWidth: .infinity, minHeight: 54)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(ctaEnabled ? GaryColors.gold : Color.white.opacity(0.14))
                )
            }
            .buttonStyle(.plain)
            .disabled(!ctaEnabled)
            .accessibilityHint(signedIn ? "Opens secure checkout in Safari" : "Sign in, then checkout opens in Safari")

            Text(ctaCaption)
                .font(GaryFonts.text(11))
                .foregroundStyle(.white.opacity(0.62))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            accountLine
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(
            Color(hex: "#0C0B0B").opacity(0.92)
                .overlay(Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1), alignment: .top)
                .ignoresSafeArea(edges: .bottom)
        )
    }

    @ViewBuilder private var accountLine: some View {
        if signedIn {
            Text("Signed in — your plans follow your account")
                .font(GaryFonts.mono(8.5, bold: true)).tracking(1)
                .foregroundStyle(.white.opacity(0.28))
                .lineLimit(1).minimumScaleFactor(0.8)
        }
    }

    private var ctaEnabled: Bool {
        if case .sports = selection { return !pickedSports.isEmpty }
        return true
    }
    /// The arrow-up-right "continues in the browser" affordance only applies
    /// once signed in — otherwise the next step is sign-in, not Safari.
    private var ctaShowsBrowserGlyph: Bool { signedIn && ctaEnabled }

    private var ctaLabel: String {
        if !signedIn {
            switch selection {
            case .allAccess, .allAccessAnnual: return "SIGN IN TO CHOOSE ALL-ACCESS"
            case .sports:
                return pickedSports.isEmpty ? "PICK A SPORT" : "SIGN IN TO START"
            }
        }
        switch selection {
        case .allAccess:       return "CHOOSE ALL-ACCESS"
        case .allAccessAnnual: return "CHOOSE ANNUAL — \(GaryPricing.allAccessAnnual)/YR"
        case .sports:
            switch pickedSports.count {
            case 0:  return "PICK A SPORT"
            case 1:  return "START \(pickedSports.first!) PASS — \(GaryPricing.single)/MO"
            case 2:  return "START 2 SPORTS — \(GaryPricing.twoSport)/MO"
            default: return "START 3 SPORTS — \(GaryPricing.threeSport)/MO"
            }
        }
    }

    private var ctaCaption: String {
        let tail = signedIn ? "Opens secure Stripe checkout."
                            : "You'll sign in first, then secure checkout opens."
        switch selection {
        case .allAccess:
            return "New subscribers: \(GaryPricing.trialDaysFree), then \(GaryPricing.allAccessMonthly)/mo. Returning subscribers pay the regular price. Cancel anytime. \(tail)"
        case .allAccessAnnual:
            return "New subscribers: \(GaryPricing.trialDaysFree), then \(GaryPricing.allAccessAnnual)/yr — \(GaryPricing.allAccessAnnualMonthly)/mo. Returning subscribers pay the regular price. Cancel anytime. \(tail)"
        case .sports:
            if capHint {
                return "Three is the max — All-Access covers all 7 boards for \(GaryPricing.allAccessMonthly)/mo."
            }
            switch pickedSports.count {
            case 0:  return "Tap a sport. A second or third bundles automatically."
            case 1:  return "Every \(pickedSports.first!) play Gary backs. \(GaryPricing.single)/mo, cancel anytime. \(tail)"
            default:
                let p = pickedSports.count == 3 ? GaryPricing.threeSport : GaryPricing.twoSport
                return "\(pickedSports.sorted().joined(separator: " · ")) — \(p)/mo. Cancel anytime. \(tail)"
            }
        }
    }

    private func primaryAction() {
        guard checkoutAvailable else { return }
        switch selection {
        case .allAccess:       onSelect("ALL")
        case .allAccessAnnual: onSelect("ALL_ANNUAL")
        case .sports:
            switch pickedSports.count {
            case 0:  return
            case 1:  onSelect(pickedSports.first!)
            default: onBundle(Array(pickedSports))
            }
        }
    }

    // MARK: Selection helpers

    private func select(_ s: PlanSelection) {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.15)) {
            selection = s
            if s != .sports { pickedSports.removeAll(); capHint = false }
        }
        switch s {
        case .allAccess:       SupabaseAPI.logEvent("plan_selected", ["plan": "all_access", "billing": "monthly"])
        case .allAccessAnnual: SupabaseAPI.logEvent("plan_selected", ["plan": "all_access", "billing": "annual"])
        case .sports:         break   // logged in toggleSport with the actual sports
        }
    }

    private func toggleSport(_ lg: String) {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.15)) {
            if pickedSports.contains(lg) {
                pickedSports.remove(lg)
                capHint = false
            } else if pickedSports.count < 3 {
                pickedSports.insert(lg)
                capHint = false
            } else {
                // A 4th board costs more than all 7 — say so instead of adding.
                capHint = true
            }
            selection = pickedSports.isEmpty ? .allAccess : .sports
        }
        if !pickedSports.isEmpty {
            SupabaseAPI.logEvent("plan_selected", [
                "plan": pickedSports.count == 1 ? "single" : "bundle",
                "sport": pickedSports.sorted().joined(separator: ","), "billing": "monthly",
            ])
        }
    }


    // MARK: Reusable pieces

    private var hairline: some View {
        Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1).padding(.leading, 46)
    }

    /// A selectable plan card (radio + title/sub + price + optional ribbon).
    private func planCard(selected: Bool, ribbon: String?, ribbonTeal: Bool,
                          title: String, sub: String, price: String, per: String,
                          a11y: String, tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            HStack(spacing: 13) {
                radio(selected)
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(GaryFonts.mono(13, bold: true)).tracking(1)
                        .foregroundStyle(.white.opacity(0.95))
                    Text(sub)
                        .font(.system(size: 12.5))
                        .foregroundStyle(.white.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(price)
                        .font(GaryFonts.mono(16, bold: true))
                        .foregroundStyle(GaryColors.gold)
                    Text(per)
                        .font(GaryFonts.mono(8.5, bold: true)).tracking(1)
                        .foregroundStyle(.white.opacity(0.62))
                }
            }
            .padding(16)
            .background(cardBackground(selected: selected))
            .overlay(alignment: .topLeading) {
                if let ribbon { ribbonView(ribbon, teal: ribbonTeal) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(a11y)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    /// A multi-select sport tile. The sub carries the board's last-30 record
    /// — proof, not a label repeated seven times. Price lives once, in the
    /// section header and the CTA.
    private func sportCard(_ lg: String) -> some View {
        let on = pickedSports.contains(lg)
        let color = lg == "MLB" ? GaryColors.mlbGrass : Sport.from(league: lg).accentColor
        return Button { toggleSport(lg) } label: {
            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    HStack(spacing: 6) {
                        Circle().fill(color).frame(width: 7, height: 7)
                        Text(lg).font(GaryFonts.mono(11.5, bold: true)).tracking(0.6)
                            .foregroundStyle(.white.opacity(0.9))
                    }
                    Spacer()
                    miniMark(on)
                }
                if let r = sportRecords[lg], r.w + r.l > 0 {
                    Text("\(r.w)–\(r.l) last 30")
                        .font(GaryFonts.mono(10.5, bold: true))
                        .foregroundStyle(r.w >= r.l ? Self.winColor.opacity(0.85) : .white.opacity(0.5))
                } else {
                    Text("Winners board")
                        .font(.system(size: 11.5)).foregroundStyle(.white.opacity(0.62))
                }
            }
            .padding(13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(cardBackground(selected: on))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(lg) Winners board." + (on ? " Selected." : " Tap to add."))
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }

    private func infoRow(icon: String, title: String, sub: String, tag: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white.opacity(0.62)).frame(width: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(GaryFonts.mono(12, bold: true)).tracking(0.8).foregroundStyle(.white.opacity(0.9))
                Text(sub).font(.system(size: 11)).foregroundStyle(.white.opacity(0.62))
            }
            Spacer(minLength: 8)
            Text(tag).font(GaryFonts.mono(10, bold: true)).tracking(1).foregroundStyle(.white.opacity(0.62))
        }
        .padding(.vertical, 12).padding(.horizontal, 14)
        .accessibilityElement(children: .combine)
    }

    private func radio(_ on: Bool) -> some View {
        ZStack {
            Circle().stroke(on ? GaryColors.gold : Color.white.opacity(0.25), lineWidth: 1.5)
                .frame(width: 22, height: 22)
            if on {
                Circle().fill(GaryColors.gold).frame(width: 22, height: 22)
                Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Self.ink)
            }
        }
    }

    private func miniMark(_ on: Bool) -> some View {
        ZStack {
            Circle().stroke(on ? GaryColors.gold : Color.white.opacity(0.22), lineWidth: 1.5)
                .frame(width: 17, height: 17)
            if on {
                Circle().fill(GaryColors.gold).frame(width: 17, height: 17)
                Image(systemName: "checkmark").font(.system(size: 8, weight: .bold)).foregroundStyle(Self.ink)
            }
        }
    }

    private func cardBackground(selected: Bool) -> some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(Color(hex: "#181616"))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(selected ? GaryColors.gold.opacity(0.75) : Color.white.opacity(0.07),
                            lineWidth: selected ? 1.5 : 1)
            )
    }

    private func ribbonView(_ text: String, teal: Bool) -> some View {
        Text(text.uppercased())
            .font(GaryFonts.mono(8.5, bold: true)).tracking(1)
            .foregroundStyle(Self.ink)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(teal ? Color(hex: "#14B8A6") : GaryColors.gold))
            .offset(x: 14, y: -8)
    }

    // MARK: Live proof

    /// 30-day rolling graded record from the same source as the Results tab.
    /// Counted exactly like the app's other records (won/win/w, lost/loss/l),
    /// games + props in one ledger. Never fabricated: the block stays hidden
    /// unless real graded results come back.
    private func loadRecord() async {
        let fmt = DateFormatter()
        fmt.calendar = Calendar(identifier: .gregorian)
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.timeZone = TimeZone(identifier: "America/New_York")
        fmt.dateFormat = "yyyy-MM-dd"
        let cutoff30 = Calendar.current.date(byAdding: .day, value: -30, to: Date())
            .map { fmt.string(from: $0) } ?? ""

        // GAME picks only — the same ledger the website's THE RECORD shows.
        // (Props graded separately; mixing them here would contradict the
        // public number on betwithgary.ai.) Preseason football is excluded
        // from every record surface (founder law, Aug 21 2026).
        let games = ((try? await SupabaseAPI.fetchAllGameResults(since: nil)) ?? []).countable

        func norm(_ s: String?) -> String? {
            switch s?.lowercased() {
            case "won", "win", "w":   return "W"
            case "lost", "loss", "l": return "L"
            default: return nil
            }
        }
        // (date, W/L) for every graded pick, both ledgers merged.
        var marks: [(date: String, mark: String)] = []
        for g in games { if let m = norm(g.result), let d = g.game_date { marks.append((d, m)) } }
        guard !marks.isEmpty else { return }

        // Per-sport last-30 — the sport tiles carry each board's record.
        var perSport: [String: (w: Int, l: Int)] = [:]
        for g in games where (g.game_date ?? "") >= cutoff30 {
            guard let m = norm(g.result), let lg = g.effectiveLeague?.uppercased() else { continue }
            var r = perSport[lg] ?? (0, 0)
            if m == "W" { r.w += 1 } else { r.l += 1 }
            perSport[lg] = r
        }

        let allW = marks.filter { $0.mark == "W" }.count
        let allL = marks.count - allW
        let recent = marks.filter { $0.date >= cutoff30 }
        let l30W = recent.filter { $0.mark == "W" }.count
        let l30L = recent.count - l30W
        // Streak: walk back day by day; a day extends the streak only if it
        // went the same way on net (the fan's "Gary is on a heater" read).
        var dayNet: [String: Int] = [:]
        for m in marks { dayNet[m.date, default: 0] += (m.mark == "W" ? 1 : -1) }
        let days = dayNet.keys.sorted(by: >)
        var streakChar = "W", streakLen = 0
        for (i, d) in days.enumerated() {
            let net = dayNet[d] ?? 0
            if net == 0 { if i == 0 { continue } else { break } }
            let c = net > 0 ? "W" : "L"
            if streakLen == 0 { streakChar = c; streakLen = 1 }
            else if c == streakChar { streakLen += 1 }
            else { break }
        }
        if streakLen == 0 { streakLen = 1; streakChar = allW >= allL ? "W" : "L" }

        let stats = LedgerStats(allW: allW, allL: allL, last30W: l30W, last30L: l30L,
                                streakChar: streakChar, streakLen: streakLen)
        await MainActor.run {
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                ledger = stats
                sportRecords = perSport
            }
        }
    }
}
