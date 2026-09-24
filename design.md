# Gary design rules

Rules Adam has set explicitly, each with its date. There is no other standing
style guide; everything else follows his current request.

## Never

- **No filled oval bubbles.** Never use capsule pills (filled or bordered
  ovals) for filters, tabs, chips, tags or badges. Adam, Sep 21 2026:
  "I fucking hate these oval filled in bubbles... I never want those used
  again ever." Filters and tabs are text: uppercase, gold when active, dim
  when not. No fill, no border, and no bar under the active one (Adam, Sep
  22 2026: "I don't want those gold bars under the tab category. You can
  already tell which one you're on because it changes to gold."). A primary
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
- **Every word is whole. Ever.** No text in the app may show "…", and no
  word may be cut off or broken across lines ("Seahawk / s"). Adam, Sep 21
  2026: "I never want to see ... EVER." Sep 22 2026: "I don't want to ever
  see words cut off with '...'. How does that help anybody? It doesn't.
  Make the words be there." Names and labels wrap to a second line at a word
  break or the layout gives them the width; a column that cannot hold a word
  is the layout's bug. No `lineLimit(1)` on names, no truncation mode.
  Sep 24 2026: "I never want things to revert to '...'. If it has to cut
  off just let it cut off. No '...'." Fit or wrap first; a line that truly
  cannot fit is cut clean at its edge with `.clipsWithoutEllipsis()`
  (DesignSystem.swift), never shown with "…".
- **Say it once.** A table row carries the name and the one fact; it never
  repeats what the section or tab already says, and never codes it ("100 ×2"
  under a 100-yard tab). Adam, Sep 22 2026: "He's on a 2-game streak of going
  for 100 yards. That's all you have to say."
- **Only Winners is sealed.** Nothing else in the app says sealed or hides
  behind a wrapper. Adam, Sep 22 2026.
- **Darts are tables, not pick cards.** A category is a table of names and
  prices, no reasons; categories sit side by side and swipe. Adam, Sep 22
  2026: "This should just be in a table... I don't want all this scrolling."
- **Not everything is vertical.** Use tables, side-by-side tiles and
  horizontal swipes where they read faster than a long column. Adam, Sep 22
  2026.
- **A split-flap cell is always a tile.** The space between words is an
  empty tile that looks exactly like a lettered one, never a darker gap.
  Adam, Sep 22 2026.
- **Every pick card in a list is the same size, game or prop.** The pick
  sits on one line at the list's type size; a long one drops the first name
  or the city ("VALDEZ 5.5 STRIKEOUTS", "DODGERS -1.5") before it would ever
  scale, and the direction and price lie flat beside the result instead of
  stacking, with no box around them. Every row of the card has a fixed
  height, and a sealed pack takes the same body height, so no card on the
  list can differ from another. Adam, Sep 24 2026: "The length and width
  of the prop cards on the winners page need to be the same as they are for
  the game picks... standardized so it can't change across these picks."
- **A yardstick fills its width.** However few marks a stat has (home runs'
  1, 2, 3), the ruler spreads them across the full width, on every sport.
  Adam, Sep 24 2026: "It doesn't have this error where it gets really small
  just because we're using fewer numbers."
