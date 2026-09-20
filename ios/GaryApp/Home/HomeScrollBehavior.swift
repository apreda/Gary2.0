import SwiftUI

/// Scope the direction lock to Home's containing vertical scroll view. Card
/// rails are descendants/siblings of this probe, so their gestures stay intact.
struct HomeScrollDirectionLock: UIViewRepresentable {
    final class Probe: UIView {
        override func didMoveToWindow() {
            super.didMoveToWindow()
            applyWhenAttached()
        }

        func applyWhenAttached() {
            DispatchQueue.main.async { [weak self] in
                var ancestor = self?.superview
                while let view = ancestor {
                    if let scroll = view as? UIScrollView {
                        scroll.isDirectionalLockEnabled = true
                        scroll.alwaysBounceHorizontal = false
                        return
                    }
                    ancestor = view.superview
                }
            }
        }
    }

    func makeUIView(context: Context) -> Probe {
        let view = Probe()
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: Probe, context: Context) {
        view.applyWhenAttached()
    }
}

struct HomeHorizontalBounceBehavior: ViewModifier {
    @ViewBuilder func body(content: Content) -> some View {
        if #available(iOS 16.4, *) {
            content.scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        } else {
            content
        }
    }
}
