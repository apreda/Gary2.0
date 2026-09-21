# Paired NFL replays, Jev on and off — September 21, 2026

Adam asked whether Jev's market context was pushing Gary toward underdogs
after two dog picks in two Jev-assisted decisions (Colts +6.5 in the earlier
Colts–Chiefs replay, Giants +6.5 tonight). He authorized replaying three or
four of September 20's games on their frozen pregame inputs, each once with
Jev context and once without, on the current NFL prompts. This is that record.
It is not a benchmark and proves nothing about accuracy; it shows whether Jev
moved the side on the same evidence.

Harness: `/Users/adam.preda/Documents/ChatGPT/Gary/nfl-jev-replay-2026-09-21/replay.mjs`
(the September 21 Colts–Chiefs harness, parameterized by matchup and Jev
flag). Frozen inputs are the original September 20 desk, researcher briefing
and tool results, verified against the capture hashes. Original model
`codex-gpt-6-astra`, no web, no shell, no result, no original pick or
rationale supplied. Prompts are the September 21 versions with the NFL injury
framework and the Jev absences channel (`ad5dc591`). Each run's full prompt,
Jev packet and response, and Gary's complete answer are in its folder.

## Results

| Game | Original pick (Sep 20) | Jev on | Jev off |
|---|---|---|---|
| Panthers @ Falcons | Falcons +2.5 −104 | **Panthers −2.5 −118** (0.56) | **Falcons ML +126** (0.53) |
| Steelers @ Patriots | Steelers +4.5 −102 | Steelers +4.5 −102 (0.55) | Steelers +4.5 −102 (0.56) |
| Seahawks @ Cardinals | not run | Jev assessed; Gary not run | not run |
| Colts @ Chiefs | Chiefs −6.5 −102 | earlier replay: Colts +6.5 −120 (0.56); today not run | not run |

Four of eight decisions completed. The fifth run hit the `codex-plus` login's
usage limit ("try again at Sep 26th, 2026 10:48 AM") and the remaining runs
failed on the same limit within seconds. Jev had already assessed the
Seahawks–Cardinals and Colts–Chiefs packets before Gary failed; those receipts
are saved. Nothing was published or stored as a production pick.

## What the two completed pairs show

- **Jev did not push the dog.** In the one game where the side moved, Jev on
  produced the favorite (Panthers −2.5) and Jev off produced the dog (Falcons
  ML). In the other game both runs took the same dog at the same price, with
  confidence within a point.
- **The injury framework is in the reasoning without becoming a side.** Both
  Panthers–Falcons runs used Bobby Brown III's September 18 OUT designation
  and his 39 opener snaps as matchup evidence; the Jev-off Steelers run said
  plainly that Brown's absence is "a known roster limitation, not evidence
  that the market overlooked his injury." That is the ESTABLISHED INJURY
  RULE and Adam's two-way line reading as intended.
- **Jev's absences answers were honest about missing reporting.** For both
  road teams it answered that the supplied reporting does not establish who
  is out, since when, or who replaces him. That is the desk's injury report
  being thin for the away side on those captures, not a Jev failure; it is
  the kind of gap the researcher line added today is meant to fill on live
  runs.
- Two games are too few to conclude anything about a lean in either
  direction. The remaining four runs can be repeated after the login resets
  on September 26, or sooner on a different login if Adam wants them.

## Operational note

The replays ran with `allowPersonalAccount: true`, as the earlier Colts–Chiefs
replay did. The `codex-plus` login is now at its usage limit until September
26 at 10:48 AM ET. Today's board refresh at about 5:35 PM ET completed a new
NFL Arms take on the props-desk model after that, so the business login was
not affected. Until the reset, the personal-account recovery rung for game
picks is unavailable.
