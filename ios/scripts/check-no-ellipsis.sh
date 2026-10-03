#!/bin/sh
# Never "…" (design.md; founder Oct 2 2026, "16 PENALT…": "i never want it to
# do that again"). A line limit or truncation mode is how SwiftUI ends text in
# "…", so the build fails on any outside DesignSystem.swift, whose helpers
# cannot: .fitsOneLine(), .fitsLines(n), .fieldLines(a...b), and
# .clipsWithoutEllipsis(). Everything else wraps.
# Runs as the GaryApp target's first build phase.
src="${SRCROOT:-$(cd "$(dirname "$0")/../GaryApp" && pwd)}"
hits=$(cd "$src" && grep -rnE '\.lineLimit\(|\.truncationMode\(' --include='*.swift' . | grep -v '^\./DesignSystem\.swift:')
[ -z "$hits" ] && exit 0
echo "$hits" | while IFS= read -r hit; do
  file=${hit%%:*}; rest=${hit#*:}; line=${rest%%:*}
  echo "$src/${file#./}:$line: error: this can end text in \"…\". Let it wrap, or use .fitsOneLine(), .fitsLines(n) or .fieldLines(a...b) (design.md)."
done
exit 1
