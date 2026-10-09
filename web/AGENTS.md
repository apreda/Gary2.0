<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Approved website implementation

The website is drawn as the iOS app (founder, Oct 9 2026: "the app is the golden standard, the website is what needs to be brought up so it matches the app"). Home leads with Gary's free pick of the day on the app's Winners ticket, then one tracked way to the App Store; hero 04 and the marketing home sections are retired. See README.md for the shared components and publishing checks. Preserve the native app pick-card design and behavior through components/picks; do not restore the retired web card layouts or old brand assets. Every App Store link uses `AppStoreButton` (a tracked `/c/web_<place>` campaign).
