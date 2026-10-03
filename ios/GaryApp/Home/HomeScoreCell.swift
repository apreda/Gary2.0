import SwiftUI

func homeScoreCell(_ value: String, _ label: String, _ color: Color) -> some View {
    VStack(spacing: 3) {
        Text(value)
            .font(GaryFonts.mono(24, bold: true))
            .foregroundStyle(color)
            .fitsOneLine()
        Text(label)
            .font(.system(size: 10, weight: .semibold))
            .tracking(0.8)
            .foregroundStyle(.white.opacity(0.62))
    }
    .frame(maxWidth: .infinity)
}
