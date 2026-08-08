#!/bin/sh

# Refuse to create a Release/TestFlight artifact with the redacted Firebase
# placeholder. Debug builds remain usable without Firebase, and GaryApp.swift
# independently guards launch at runtime, but a distributable build must have
# working sign-in/push configuration.

set -eu

if [ "${CONFIGURATION:-}" != "Release" ]; then
    exit 0
fi

PLIST_PATH="${SRCROOT}/GoogleService-Info.plist"

fail() {
    echo "error: Invalid GoogleService-Info.plist for Release: $1"
    exit 1
}

[ -f "$PLIST_PATH" ] || fail "file is missing"

API_KEY=$(/usr/libexec/PlistBuddy -c "Print :API_KEY" "$PLIST_PATH" 2>/dev/null || true)
BUNDLE_ID=$(/usr/libexec/PlistBuddy -c "Print :BUNDLE_ID" "$PLIST_PATH" 2>/dev/null || true)
APP_ID=$(/usr/libexec/PlistBuddy -c "Print :GOOGLE_APP_ID" "$PLIST_PATH" 2>/dev/null || true)
CLIENT_ID=$(/usr/libexec/PlistBuddy -c "Print :CLIENT_ID" "$PLIST_PATH" 2>/dev/null || true)

[ "${#API_KEY}" -eq 39 ] || fail "API_KEY is missing or redacted"
case "$API_KEY" in
    AIza*) ;;
    *) fail "API_KEY has the wrong format" ;;
esac
[ "$BUNDLE_ID" = "${PRODUCT_BUNDLE_IDENTIFIER}" ] || fail "BUNDLE_ID does not match the app target"
case "$APP_ID" in
    1:*) ;;
    *) fail "GOOGLE_APP_ID is missing or malformed" ;;
esac
case "$CLIENT_ID" in
    *.apps.googleusercontent.com) ;;
    *) fail "CLIENT_ID is missing or malformed" ;;
esac

echo "Validated Firebase configuration for Release (values not printed)"
