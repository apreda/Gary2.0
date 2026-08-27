import SwiftUI

// ─────────────────────────────────────────────────────────────────────────────
// HOME ADDITIONS (Jul 26 2026, founder green-light): the modules that join
// the front page — the Wire mini-feed and its fun-stuff doors. Every module
// is self-fetching, cancellation-safe (never latches an empty async result),
// and renders NOTHING when its data is absent — Home never shows an empty
// frame.
// ─────────────────────────────────────────────────────────────────────────────

// (THE RECEIPTS LINE removed Aug 4 2026 — founder: "needs to be removed".
// The proof-of-post claim lives on in the Winners day card's manifest.)

// (YOUR NIGHT removed Aug 27 2026 — founder: the board's YOU lane is where
// the user's open action lives on Home; the strip duplicated it.)

// ── FANTASY CORNER TEASER ───────────────────────────────────────────────────
// ── THE WIRE MINI ───────────────────────────────────────────────────────────
// The fun-stuff doors + three wire headlines in ONE container (founder,
// Aug 26: "combine these to one container") — the doors row sits inside the
// card the Wire already wears, split by hairlines instead of three separate
// chips. The doors render on every day-state; the wire rows join beneath a
// divider whenever the day's items exist.
struct HomeWireMini: View {
    struct Door {
        let title: String
        let sub: String
        let act: () -> Void
    }
    let doors: [Door]
    let items: [SupabaseAPI.WireItem]
    var onOpen: () -> Void

    var body: some View {
            // Dashboard container (Aug 3): the Wire wears the board's chrome
            // and the shared act-head grammar — no more naked list.
            VStack(alignment: .leading, spacing: 10) {
                // Nameless rule — the rows' own LINE MOVE / INJURY / RESULT
                // chips already say what this is.
                HomeSectionRule()
                VStack(spacing: 0) {
                    HStack(spacing: 0) {
                        ForEach(Array(doors.enumerated()), id: \.offset) { i, door in
                            Button {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { door.act() }
                            } label: {
                                VStack(spacing: 3) {
                                    Text(door.title.uppercased())
                                        .font(.system(size: 12, weight: .semibold).monospacedDigit()).tracking(1.2)
                                        .foregroundStyle(GaryColors.gold)
                                    HStack(spacing: 3) {
                                        Text(door.sub)
                                            .font(.system(size: 13, weight: .bold).monospacedDigit())
                                            .foregroundStyle(.white.opacity(0.85))
                                        Image(systemName: "chevron.right")
                                            .font(.system(size: 7, weight: .bold))
                                            .foregroundStyle(.white.opacity(0.62))
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 11)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if i < doors.count - 1 {
                                Rectangle().fill(Color.white.opacity(0.07)).frame(width: 1, height: 30)
                            }
                        }
                    }
                    if !items.isEmpty {
                        Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                    }
                    ForEach(Array(items.prefix(3).enumerated()), id: \.offset) { i, item in
                        Button(action: onOpen) {
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                // Raw tokens never reach the page ("LINE_MOVE"
                                // wrapped as "LINE_MO VE" — Aug 3). One line,
                                // always: the mono helper floors at 12pt, so
                                // the column is sized for its real render.
                                Text((item.kind ?? "wire").replacingOccurrences(of: "_", with: " ").uppercased())
                                    .font(GaryFonts.mono(8, bold: true)).tracking(0.6)
                                    .foregroundStyle(.white.opacity(0.45))
                                    .lineLimit(1).minimumScaleFactor(0.85)
                                    .frame(width: 76, alignment: .leading)
                                // NO lineLimit — the headline wraps to whatever
                                // it needs (the 2-line cap printed "…", the
                                // hard-law violation, Aug 3 loop 2).
                                Text(item.headline ?? "")
                                    .font(GaryFonts.text(12.5))
                                    .foregroundStyle(.white.opacity(0.85))
                                    .multilineTextAlignment(.leading)
                                    .fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 14).padding(.vertical, 9)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if i < min(items.count, 3) - 1 {
                            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1).padding(.leading, 14)
                        }
                    }
                }
                .padding(.vertical, 3)
                .garyPanel(radius: 12)
                .pageGutter()
            }
    }
}
