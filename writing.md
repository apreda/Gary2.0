# Gary writing rules

Rules for anything a fan reads: Hub reads, pick rationale, the Wire, the
tomorrow board, recaps, cards, posts. Like design.md, this is the whole
standing guide. Adam, Sep 21 2026: "I hate those dashes. They are big-time
AI slop errors." The catalog below is not ours; it is the consensus of four
public sources, cut down to what applies to short sports copy:
Wikipedia's "Signs of AI writing" (the editors' catalog), the blader
humanizer skill built on it, the sloptells frequency database (how many
times more often than humans a model writes a phrase) and slopdetector's
thresholds. `src/services/copy/writingRules.js` carries the prompt block and
the guard; a read that trips the guard does not ship, the computed line does.

## Never

- **Dashes as punctuation.** No em dash, no en dash, no spaced hyphen
  joining clauses. Models write em dashes 17 times more often than people
  and put spaces around them. A hyphen inside a word or a score (2-6,
  right-hander, 10-for-32) is fine. Use a period, a comma or a colon.
- **Arrows in prose.** "→" belongs in a line-move cell, never a sentence.
- **Not X but Y.** "Not just X, but Y", "it's not X, it's Y", "not because
  X, because Y", "X rather than Y" (4 to 5 times human rate). These stage a
  contrast against an objection nobody raised. Say what it is.
- **Closing disclaimers and one-line closers.** "Read it as context, not a
  forecast", "treat it as", "this is not a prediction", "the lesson?",
  "let that sink in". A read that needs a warning label is not a read.
- **Hedge padding.** "That said" (10x), "worth noting / worth watching"
  (19x), "genuinely" (19x), "in practice" (10x), "feels like" (27x), "it's
  important to note", "could be driving it", "still,", "even so", "to be
  fair". "Small sample" once, as a fact with the number, never as a refrain.
- **Sayings that sound deep.** "The real question is", "at its core",
  "what really matters", "the heart of the matter", "X is the Y of Z".
- **Staged run-ups and arguing with no one.** "Here's the thing", "let's
  break it down", "honestly?", "to be clear", "don't get me wrong", "I'm not
  saying", "some might say... but".
- **Inflated significance and sales words.** "Pivotal", "crucial",
  "testament", "underscores", "highlights", "landscape", "tapestry",
  "vibrant", "boasts", "robust", "showcase", "stands as", "serves as",
  "plays a key role", "sets the stage".
- **Vague association.** "Linked to", "tied to", "associated with" when the
  fact sheet states the actual relationship.
- **Shallow -ing riders.** "..., highlighting his consistency",
  "..., underscoring the gap", "..., reflecting a trend". If the rider
  says something true, make it a sentence with a number.
- **Forced triads.** Three adjectives or three clauses where two carried
  the meaning.
- **Formal connectors as openers.** "Additionally", "Furthermore",
  "Moreover", "Ultimately".
- **Restating the headline.** The headline already states the number.
- **Rhetorical questions, exclamation marks, emojis, bold, headers in copy.**
- **Internal vocabulary.** Book names, market states and pipeline words
  ("SAME BOOK", "PRE-KICK", "current-2026") never reach a screen.
- **Machine dates.** "Sep 20", "Week 1", "the last 15 days", never
  "2026-09-20".
- **Performed voice.** No manufactured catchphrases, no "the sweat is on",
  no line that would sit in an ad. Adam, Jul 15 2026.
- **Chatbot residue.** "I hope this helps", "great question", "let me
  know", "as of my knowledge", "while details are limited".

## Always

- **Write it the way you would say it.** The spoken test (Adam, Jul 5
  2026): every sentence is something a person would say out loud to a
  friend who follows the league.
- **Fewer sentences when the facts are thin.** One true sentence beats four
  that circle it. A fact sheet with one number gets one sentence.
- **Vary the sentence length.** Models write sentences of the same length;
  people do not. A short one after a long one.
- **Simple verbs.** Is, has, allows, runs. Not "serves as", "represents",
  "functions as".
- **Numbers come from the fact sheet only,** and every number the read
  uses is on that item's own sheet.
- **Plain words for plain things.** Right-hander, not RHP, in prose.
  Season, not campaign. Games, not contests.
- **State the point, then stop.** No summary sentence, no "so what" that
  repeats the read.

Sources: Wikipedia:Signs of AI writing; github.com/blader/humanizer;
sloptells.com; slopdetector.org/blog/signs-of-ai-writing.
