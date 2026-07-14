# Gary A.I. — Designer Brief

> The whole brief is the anti-slop card below. **Facts live in code** (`GaryColors` / `GaryFonts`), not here — don't recite hexes. Component anatomy, the accessibility "definition of done," and tech-debt live in `IMPLEMENTATION_STATE.md`. Marketing / voice / asset canon: `CLAUDE_MARKETING.md`.

## What is Gary?

An AI sports-betting app (NBA, NFL, NHL, NCAAB, NCAAF, MLB, 2026 World Cup). A research AI investigates every game; "Gary" — a 30-year-veteran-bettor character, a confident bear who owns his losses — makes the pick against the spread, props, and DFS. Tagline: *"Every Game. Everyday. Always Free."* · @BetwithGary · betwithgary.ai

## Gary's anti-slop guardrails

The only thing to read before designing. Seven boundaries that kill the lazy default and leave *how to be great* wide open.

1. **No Apple-default fonts as a "choice."** Route text through `GaryFonts` — never raw `.system(.serif / .monospaced)`.
2. **Build hierarchy with weight, space, and elevation** — never glow or neon borders.
3. **Ration the gold** — one hero per screen. If everything's gold, nothing is.
4. **No wide-tracked uppercase labels** — sentence case; let the number carry it. (Uppercase mono eyebrows are terminal-surface only.)
5. **One control style ≠ every control** — primary nav and filters must look different.
6. **The bear is a character with a world, not a floating logo** — ground it, let it breathe, let it talk.
7. **Zone it** — Home is the warm front door; Winners / Picks are the terminal. *The bear hosts; the data closes.*

**North star:** *"Would a thoughtful human have chosen this, or is it just the first thing the tool reached for?"* If the latter, change it.

## The four horsemen — specific tells to kill (Jun 2026)

Four recurring slop tells called out on the Home/Hub redesigns. Hard "don't"s — the fix is listed for each. Applies to Home, Hub, and any new surface.

1. **Glowing accent edges/borders.** We had colored bars on the left edge of every score card *plus* a glowing gold outline on the featured card — that glow-border combo is the #1 tell. Drop the outer glow: replace any `box-shadow: 0 0 Npx gold` / SwiftUI `.shadow(color: gold/accent, radius:)` with a flat card — `border: 1px solid rgba(255,255,255,0.06)` + a subtle background lift instead. Keep **at most one accent moment per card**: the left-edge state bar **or** a colored value — not both, and never plus a glow.
2. **Letter-spacing on uppercase — the worst offender.** All-caps + tracked-out copy ("TOP 7 · COVERING", "BOT 5 · TRAILING", and especially Wire blurbs like "NEW YORK TOOK A 2-0 SERIES LEAD…") is hard to read and screams AI. Cap letter-spacing at ~0.04em and **only on short eyebrow labels** (the "MLB · LIVE" tags). **Never all-caps on sentence-length text** — Wire copy and headlines are sentence case at normal tracking.
3. **Glowing status dots.** Green/red dots next to "MLB · LIVE" are the "Live pill" cliché — one is fine, one on every row is slop. Use one consistent state system: color the status *text* (green "Covering", red "Trailing") and either drop the dots or make them small + static. **Kill all pulse/glow animation on dots.**
4. **Gradient glows / radial haze.** No radial-gradient haze behind the hero/featured card. We dodged purple — gold-on-black is ours; the slop was never the color, it's the GLOW. Flat or near-flat backgrounds only.

## Where the rest lives

- **Facts** (palette, type stack, sizes, result colors) → tokens in code: `GaryColors` / `GaryFonts` in `Views.swift`. One source of truth — reference them, don't recite them.
- **Component anatomy + current screens** (how it's built right now) → `IMPLEMENTATION_STATE.md`. A reference for lookup, *not* a place to get ideas.
- **Accessibility "definition of done"** (contrast, min sizes, Dynamic Type, Reduce Motion, VoiceOver) → `IMPLEMENTATION_STATE.md`. The checklist you run *after* designing — non-negotiable.
- **Marketing / voice / assets** → `CLAUDE_MARKETING.md`.
