# Anti-AI-Slop Design Guide
Extracted from a design critique session on Gary (dark-UI iOS sports betting app). Use as standing design rules.

---

## 1. The AI Design Tells (what gives it away)

### The blue cast
- LLMs default to Tailwind's `slate` and `zinc` gray ramps. These grays have **blue mixed into them** — slate-900 is not black, it's a desaturated navy.
- Stack a slate background + slate cards + slate dividers and the whole screen takes on a faint cold blue cast. This is the single most recognizable AI-design fingerprint.
- **Test:** pull the hex values of your dark surfaces and check the RGB channels. If B (blue) is the highest channel, that's the cast.

### The default bordered chip
- Tinted background + 1px border in the same hue + rounded corners + semantic red/green = the exact chip every LLM generates for status indicators.
- The border is the tell. Human designers on dark UI almost never outline a filled chip in its own color — they use fill contrast or weight to differentiate.
- Ten identical bordered pills in a row = instant AI look.

### Redundancy with no hierarchy
- AI design stuffs every available stat into a card because it doesn't know which one matters — the same dataset rendered four ways (e.g., chips showing 6L-4W, "40% win rate," "-2.4u net," a "W4" pill) all at roughly equal visual weight.
- A human designer decides the headline and demotes everything else. **One hero number per card, ever.**

### No point of view
- A card that signals contradictory stories at once (red ledger + green streak badge) and makes the user resolve it is a dashboard, not editorial design.
- Find the actual story in the data ("rough start, heating up") and design the card to tell it.

### No chronology cue
- AI spaces everything uniformly. Humans use fade, scale, opacity, or an anchor to show time direction and recency.
- If a sequence reads left-to-right in time, the design should make that self-evident (e.g., opacity fading toward the older end).

### Semantic color used as decoration
- Red and green at full saturation everywhere. When everything is colored, nothing is.
- Pro dark UIs reserve the accent for the one number the eye should land on.
- Pure full-saturation semantic red/green is the stock look — nudge them toward your brand palette.

---

## 2. The Fixes (what to ship instead)

### Palette
- **Swap the gray ramp.** Move from slate/zinc to true neutral or, better, a warm dark — something with a touch of brown/yellow (think `#161412` territory instead of `#0f1117`). Even a 2–3 point shift toward warm changes the entire feel.
- **Put the brand accent on repeated elements.** The most-repeated element on screen (e.g., monospace all-caps category labels) should carry the brand accent color, not gray. This one change ties a screen to the rest of the app and kills most of the generic feel.
- **Soften semantic colors toward the palette.** Nudge green warmer, nudge red toward the brand red. They stop looking like defaults.

### Hierarchy
- Pick the headline. One hero number/statement per card; everything else is a quiet secondary line.
- Kill bordered chips. Replace record chips with small unbordered dots/ticks — wins filled, losses hollow or dimmed — with opacity fading toward the older end so recency is self-evident.
- Cut redundant elements once another element does the job (a W4 pill is redundant next to four bright dots at the recent edge).
- One accent color per state. If net is negative, the units get red and that's the only red on the card.
- Tighten copy — don't label the same thing twice ("Last 10 graded picks" + "NET · LAST 10").

### Consistency
- **One grading vocabulary across the entire app.** Not "WON" on one screen, "L" on another, "HIT/MISS" on a third. Three screens, three systems = no system.
- Wins and losses get equal visual treatment. If wins get a full green word and losses get a small red letter, the card celebrates wins and mumbles losses — backwards for trust. Bettors trust transparent losers.

### Detail-level polish
- Show the **settling stat**, not orphaned context. For a prop bet, "he went 1-for-4" is the number that matters, not the final game score.
- Do the math for the user. "28 of 46" is honest, but 61% is the headline stat — put it on screen.
- Equal spacing around dividers. Uneven vertical rhythm around a divider is the thing that separates "clean" from "polished."

---

## 3. What Human Design Looks Like (positive signals)

From the screens that passed review:
- A single outlined **hero element** (the bet pill) that everything else supports.
- **Monospace type** for data/context lines, giving them a distinct functional voice.
- **Weight differentiation** encoding real information (road vs. home team).
- Warm palette elements (gold accents, warm pill borders) pulling the screen toward brand territory.
- Decisions that **encode information** rather than duplicate it.

---

## 4. Quick Checklist Before Shipping a Screen

1. Check the blue channel on every dark surface hex — warm or neutral only.
2. Zero bordered same-hue chips.
3. One hero number per card. Everything else demoted.
4. Every use of red/green earns its place; saturation pulled toward brand palette.
5. One consistent win/loss vocabulary app-wide, equal weight for both states.
6. Recency/chronology visually self-evident.
7. Brand accent present on the screen's most-repeated element.
8. No stat the user has to compute themselves.
9. Spacing symmetric around dividers.
10. Ask: does this screen say [your brand], or does it say shadcn?
