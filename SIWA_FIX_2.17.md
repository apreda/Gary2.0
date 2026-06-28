# Sign in with Apple — Rejection Fix (2.17 build 5)

**Rejection:** Guideline 2.1(a) — "The 'Sign in with Apple' button was unresponsive." Reviewed Jun 28 2026, iPad Air 11-inch (M3), iPadOS 26.5. This was the **second** rejection for the same thing.

## Root cause (verified, high confidence)

The app was **missing the `com.apple.developer.applesignin` entitlement** at every layer:
- `GaryApp.entitlements` held only `aps-environment`.
- `project.yml` (the XcodeGen source of truth that regenerates the entitlements file) declared only `aps-environment`.
- The committed `.xcodeproj` had zero Sign-in-with-Apple capability entries.

Without the entitlement in the signed binary, `ASAuthorizationController.performRequests()` fails the entitlement check **before** the presentation anchor is ever consulted → routes to `didCompleteWithError`, which only did `print(...)` → Apple's sheet never appears → the button reads as "unresponsive."

**Why the previous fix (commit `ba2f56f9`) failed:** it only swapped the SwiftUI button for a manual `ASAuthorizationController` + explicit presentation anchor (a *presentation-anchor* theory). The anchor is downstream of the entitlement check that's actually failing, so it could never have resolved the rejection. The entitlement was never added; build 4 shipped without it; the identical rejection recurred.

> **Simulator trap:** the iOS Simulator does **not** enforce this entitlement and will present the Apple sheet using the Mac's Apple ID even when it's missing. That's why prior testing looked fine while Apple's on-device review failed. **All verification below must be on a REAL iPad.**

## What was fixed in code (done — in this commit)

1. **`ios/GaryApp/GaryApp.entitlements`** — added `com.apple.developer.applesignin = ["Default"]`.
2. **`ios/GaryApp/project.yml`** — mirrored the same key under `targets.GaryApp.entitlements.properties` so a future `xcodegen generate` never wipes it.
3. **`ios/GaryApp/AuthView.swift`** — `AppleSignInCoordinator` now surfaces failures to a visible `errorMessage` banner (and stops swallowing the token-exchange error with `try?`), so a future mis-config can never again look like a dead button.
4. **Build number → 5** across `project.yml`, `project.pbxproj`, and `Info.plist` (marketing version stays 2.17). A new binary is required — see "Do NOT accept build 4" below.

## What YOU must do (console actions I can't perform)

### 1. Apple Developer portal — REQUIRED before the next build signs
developer.apple.com → Certificates, IDs & Profiles → Identifiers → App ID **`ai.betwithgary.app`**
- Enable the **Sign in with Apple** capability (configure as a **primary App ID**). Save.
- This is a hard prerequisite: with `CODE_SIGN_STYLE = Automatic`, if the entitlement is in the binary but the App ID lacks the capability, the build fails provisioning ("profile doesn't include the applesignin entitlement").

### 2. Supabase — the most likely NEXT rejection if skipped
Dashboard → project **`xuttubsfgdcjfgmskcol`** → Authentication → Providers → **Apple**
(https://supabase.com/dashboard/project/xuttubsfgdcjfgmskcol/auth/providers)
- Ensure the **Apple provider is ENABLED**.
- In **Authorized Client IDs**, add the native bundle id **`ai.betwithgary.app`**.
  - The app uses the native flow: `POST /auth/v1/token?grant_type=id_token` with `provider=apple`. The Apple identity token's `aud` claim = the bundle id. If `ai.betwithgary.app` isn't in the allow-list, Supabase returns **400 "Unacceptable audience in id_token"** *after* the Apple sheet succeeds — sign-in still fails → another 2.1 rejection.
  - Also confirm the Apple sign-in key is registered (Services ID / Team ID `SFBTX6KPLM` / Key ID / `.p8` secret).

### 3. Do NOT accept Apple's offer to approve build 4
Apple offered to approve build 4 now if it contains bug fixes. **Decline / ignore that** — build 4 lacks the entitlement, so approving it ships a still-broken Sign in with Apple. Upload the new **build 5** instead.

## How to verify BEFORE resubmitting (so it doesn't recur a third time)

1. **Signed binary carries the entitlement:**
   `codesign -d --entitlements :- <path>/GaryApp.app` → confirm `com.apple.developer.applesignin` is present in the **signed product** (not just the source file).
2. **Embedded profile carries it:**
   `security cms -D -i <App>/embedded.mobileprovision` → Entitlements dict includes `com.apple.developer.applesignin` (proves the portal capability + automatic-signing profile are correct).
3. **On a REAL iPad** (ideally iPad Air 11-inch M3 / iPadOS 26.x — iPhone-compat mode since `TARGETED_DEVICE_FAMILY=1`), tap **Sign in with Apple** → the system Apple sheet must actually appear. **Not the simulator.**
4. **Complete the flow with a fresh Apple ID** (reviewers have no prior session) → app reaches signed-in state. This proves the Supabase `grant_type=id_token` exchange returns 200.
5. **Ship via TestFlight** and test Sign in with Apple on a physical iPad TestFlight install before resubmitting (TestFlight uses the distribution-signed binary the reviewer runs).

## Lower-priority follow-ups (not part of this rejection)

- **OAuth redirect scheme:** Google/Facebook use `ASWebAuthenticationSession` with `callbackURLScheme: "com.gary.app"` (doesn't match bundle id `ai.betwithgary.app`). `ASWebAuthenticationSession` intercepts the scheme without needing `CFBundleURLTypes`, so it can work — but confirm `com.gary.app://auth-callback` is in Supabase's redirect allow-list, and consider tapping Google/Facebook in review too.
