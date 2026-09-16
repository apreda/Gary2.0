# Billfold controls — September 16, 2026

Adam asked to replace the mismatched Bankroll/Pick history segment and mixed sport tabs/filter menus with compact, aligned controls matching the existing page.

## Change

`ios/GaryApp/BillfoldView.swift` now uses one horizontal row of native menus: History/Bankroll, Sport, Picks/Props, Period, and Winners/All picks. All share the gold label, font, chevron, baseline, page gutter and minimum 44-point hit height. The gray segmented control and separate underlined sport tabs are removed from Gary's history. The sport menu says Sports when all sports are selected; the period says All time instead of the ambiguous ALL.

Bankroll displays the same view dropdown by itself because its aggregate is all sports and markets since inception. History filters persist across mode switches. The You and Board scopes and underlying results/calculations are unchanged. Dynamic Type grows the labels; the row can scroll horizontally instead of compressing or stacking them. Each menu exposes a descriptive accessibility label and selected value.

## Verification

- Debug iPhone simulator build succeeded using Xcode, scheme GaryApp, on iPhone 17e / iOS 26.4.
- Installed and visually inspected the actual app. Selecting MLB and Last 7 days changed history totals; switching to Bankroll and back retained those filters. Bankroll's live aggregate loaded. Tested Winners/All picks and Picks/Props menus.
- At accessibility-extra-large text size, labels expanded in one horizontal row and the offscreen scope control remained reachable through accessibility, scrolling into view. Normal simulator text size was restored.
- Native regression suite: 53 files, 184 tests passed. Updated the existing Winners scope assertion to check the menu's scope binding after removing the obsolete label helper. No new data or betting logic.
- `git diff --check` passed.

## Delivery boundary

This is native source for the pending 2.26 (931) candidate, not an App Store or TestFlight update. The earlier bankroll work already failed archive signing with `errSecInternalComponent`; the current read-only keychain check still returns `SecKeychainCopySettings` authentication failure. Do not claim a signed archive/upload or request the user's password. Signing and Apple account access must be restored before building and delivering the latest candidate. See the bankroll handoff at `/Users/adam.preda/Documents/ChatGPT/Gary/HANDOFF_2026-09-16_WINNERS_BANKROLL.md` for prior release evidence and archive paths.

The production-truth check still finds the canonical scheduler and Winners worker running, but CLI edge parity/support checks remain unverified because the local Supabase CLI login is unavailable. No backend, cloud or web behavior was changed by this UI task. Keep the private `ios/GaryApp/GoogleService-Info.plist` untouched and uncommitted.
