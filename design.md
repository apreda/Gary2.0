# Gary design rules

Rules Adam has set explicitly, each with its date. There is no other standing
style guide; everything else follows his current request.

## Never

- **No filled oval bubbles.** Never use capsule pills (filled or bordered
  ovals) for filters, tabs, chips, tags or badges. Adam, Sep 21 2026:
  "I fucking hate these oval filled in bubbles... I never want those used
  again ever." Filters and tabs are text: mono uppercase, gold with a thin
  gold underline when active, dim when not. No fill, no border. A primary
  action button is not a filter; this rule is about selectors and chips.
- **No internal tags in reader copy.** Book names, market states and
  pipeline vocabulary ("FANDUEL · SAME BOOK", "PRE-KICK") never reach a
  screen. Adam, Sep 21 2026.
- **No machine dates in reader copy.** Never "2026-09-20", "current-2026" or
  "through 2026-09-16" in anything a fan reads. Dates are plain words:
  "Sep 20", "Week 1", "the last 15 days". Adam, Sep 21 2026.

## Always

- **One design per component across sports.** A Hub, a pick page, a card or
  a filter looks the same on MLB, NFL and NCAAF; only the words and numbers
  are the sport's. MLB is the reference implementation. Adam, Sep 21 2026:
  "it shouldn't matter from sport to sport how things look."
- **The nav bar floats.** No solid bar surface; the page fades into the ink
  under the five destinations. Adam, Sep 21 2026.
- **No ellipsis. Ever.** No text in the app may show "…". Adam, Sep 21 2026:
  "make a rule that I never want to see ... EVER. No text should have that
  ever. If there isn't space just let the words cut off." Give the words the
  lines and the scale they need first; when they truly cannot fit, clip at
  the edge. Never `lineLimit` without a `minimumScaleFactor` that makes the
  text fit, and never a truncation mode that draws an ellipsis.
