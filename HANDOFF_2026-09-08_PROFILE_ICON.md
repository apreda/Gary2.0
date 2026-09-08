# Profile icon refinement — September 8, 2026

Adam requested a sleeker profile icon from the attached native-header screenshot.
The shared `ProfileAvatar` in `ios/GaryApp/ProfileExperience.swift` now uses an
outlined person at 52% of avatar size, a continuous rounded-square shape, and a
subtle warm neutral fill and border. Gold remains the foreground accent.
Initials, selected symbols, profile actions, authentication and accessibility
labels are unchanged; the header retains its 44-point hit target.

Verification: the exact shared component passed iOS Simulator SDK typechecking.
A native SwiftUI component render was visually checked at 28pt and 56pt. The
three existing profile safety/private preference/Winners suites passed all five
tests. `git diff --check` passed. No new tests were needed for the visual change.

Preview: `/Users/adam.preda/Documents/ChatGPT/Gary/profile-icon-2026-09-08/profile-comparison.png`.
The preview renders the actual component using SwiftUI on macOS; it is not an
installed iPhone app screenshot. The typecheck separately uses the iOS SDK.

Delivery: source is ready for the next native build. This task did not mutate
simulator devices, rebuild shared release products, or upload to Apple because
other active tasks own the 915 simulator/archive and release acceptance. A build
made before this change still contains the old avatar. Include this file in the
next source freeze and signed archive before claiming the icon is in TestFlight.
