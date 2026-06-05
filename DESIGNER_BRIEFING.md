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

## Where the rest lives

- **Facts** (palette, type stack, sizes, result colors) → tokens in code: `GaryColors` / `GaryFonts` in `Views.swift`. One source of truth — reference them, don't recite them.
- **Component anatomy + current screens** (how it's built right now) → `IMPLEMENTATION_STATE.md`. A reference for lookup, *not* a place to get ideas.
- **Accessibility "definition of done"** (contrast, min sizes, Dynamic Type, Reduce Motion, VoiceOver) → `IMPLEMENTATION_STATE.md`. The checklist you run *after* designing — non-negotiable.
- **Marketing / voice / assets** → `CLAUDE_MARKETING.md`.
