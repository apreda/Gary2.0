# Jul 27 — Sol-only cleanup + deployed audit + Hub/Fantasy/Home overhaul

Founder plan (voice, Jul 27 AM), executed INLINE, no subagents, in order.
Context: first full new-system day went 7–6. All-Sol confirmed as the only
direction — "no other arms, not testing anything, no more Gemini."

## 1. Sol-only cleanup (code)
No Gemini and no old-generation arms anywhere in the ACTIVE MLB paths
(game picks + props). Orchestrator banner/config stops advertising Gemini
lanes for MLB; verify plain-rationale + verdict + search are Sol; confirm
nothing MLB-reachable imports the research assistant or old props mode.
Other sports' pipelines stay on disk per the Jul 2 revival policy — but
NFL relaunch (Sep 9) will be desk-pattern, flag for founder.

## 2. Deployed-state + app-population audit
- FOUNDER GATE (cannot run from here): `railway up` — prod still runs the
  Jul 26 11:47 AM build; TAPE swap + pitch-type truncation fix + props desk
  lane are repo-only until deployed. Before ~1:05 PM ET = live for today.
- DB truth: today's daily_picks coverage as windows fire, prop_picks shape,
  pick_desks snapshots, rationale_plain + model tags present, grading
  freshness, hub/fantasy tables populated + fresh.

## 3. Hub insight quality — evidence + Gary's today-read
HR threats / regression / hot-hitter style lists: every item carries
(a) the evidence from the data and (b) Gary elaborating on TODAY's
situation (that pitcher, that lineup, that park) when tonight's context
exists — never a bare "xERA worse than ERA → regression" mechanical line.
Generation on Sol, same no-steering surface philosophy as picks.

## 4. Hub data validity + tap-through cards + dropdowns
- Streak/records windows must be real and chosen for signal (not
  everything-in-last-8); verify streak watch numbers against BDL.
- EVERY player name tap opens the player card (Langeliers-class misses =
  name-resolution bug to find and fix).
- Team name taps open the team card everywhere on the hub.
- Pattern: signal line + dropdown detail (what happened on the streak +
  Gary's read on tonight).

## 5. Matchup section redesign
Kill the green fill bar. Full redesign, my call, per app design language.

## 6. NRFI/YRFI build-out
Much richer: more useful data, more fun, a real section for that bettor.

## 7. Fantasy corner
- Write-ups per player/situation (benchmark Rotowire + ESPN Fantasy for
  length/language/usefulness first).
- Remove sub-captions under headers (no "who gets the 9th tonight", no
  "roster spots you can take back", no "arm stat").
- Fix grey-on-black readability throughout.

## 8. Home "Tonight" section polish
- Team abbreviations instead of full names.
- Team names in the header display font (the TONIGHT/WINNERS font — check
  DesignSystem GaryFonts; never mono).
- Countdown container: remove "Pick 5:40 PM" line entirely, shrink height.
- Remove per-row "pick 1:05" labels; one line top-right of the Tonight
  header row: picks drop 90 minutes before first pitch.

## Standing
- Props desk live test fires via Monitor when SEA@TEX lineups post.
- iOS files carry founder's uncommitted work: edit but NEVER commit iOS
  files — they ride his batch. Backend commits explicit-path only.
