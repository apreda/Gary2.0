# NFL prop settlement and retained Picks history — build 944

Adam authorized fixing missing NFL grades and preserving old research in the
app, provided history does not slow normal app use. There is no 24-hour expiry
or website-only cutoff. Stored original picks and research remain in Supabase;
the native app loads a selected week on demand.

## Corrections

- Yesterday now reads each game's saved dated research. CIN–HOU restores Joe
  Burrow and C.J. Stroud instead of “DATA FAILED / starter unverified.” This
  restores existing information; no predictions or quarterback evidence were
  regenerated. Historical game pages retain the original game-date scope.
- The date control opens a menu on a normal tap. NFL offers This Week,
  Yesterday and available prior weeks, with preseason identified separately.
  Selecting one week loads only that week's NFL picks, props, scores and grades.
  Research reads exact date/game pairs. Archive and research caches retain at
  most three scopes; archives do not run the live board's 90-second polling.
- Current-week NFL props remain beside Thursday's original pick and grades.
  Prop grades match sport, game, day, player, market, side and line. Confirmed
  finals without a grade say “FINAL · AWAITING STATS” rather than looking live.
- Complete NFL scoring-ledger parsing now handles observed interception and
  corroborated fumble-return touchdowns, an overtime final clock, an empty
  administrative 0–0 marker, and the provider's exact two-point safety shape.
  A duplicated defensive return credit leaves that returner unresolved, without
  discarding other independently reconciled players. Unknown scoring shapes,
  incomplete boxes and contradictory evidence remain ungraded.
- A missing receiver gets zero receiving yards/receptions only with exact-game
  positive nflverse offensive snaps, exact BDL player identity and a complete
  receiving box whose catches/yards reconcile to passing totals. This resolved
  Mike Gesicki's missing contributor row; missing players are never automatically
  treated as zero or DNP.

## Production evidence

All 47 September 20 NFL prop tickets have exact matching saved result rows;
the 11 initially missing tickets are now graded. The manual repair read back
46 refreshed rows. The existing Lamar Jackson zero-TD grade was retained:
the current provider ledger did not reconcile, so the repair correctly refused
to rewrite that row. See `repair.log` and `grades-readback.json`.

`20260921154817_read_nfl_props_window.sql` is applied in production and its local
version matches the migration ledger. This stable SECURITY INVOKER function
retains existing table RLS, filters NFL before returning JSON, and rejects
windows longer than seven days. An anonymous production read returned this
week's 51 props in 220 ms / 91,345 bytes, and Week 1's 64 props in 92 ms /
54,292 bytes. These are measured requests, not a promise for every connection.

NFL and MLB use the shared prop decision framework with sport-specific evidence.
Settlement remains the NFL Mac worker versus MLB cloud grading; this change
does not merge those execution lanes or alter Gary's decision prompts.

## Verification and delivery

Backend lint/typecheck, 4,635 backend tests in 435 files, 243 edge tests,
958 web tests in 91 files, web typecheck and the credential-free web fixture
smoke checks passed. Five isolated PostgreSQL cases verify the week bound,
NFL filtering, original ordering and inherited RLS. Native source membership,
the full Simulator build and focused post-label-change Swift tests passed.

Production-backed Simulator checks verified Week 1 NE–SEA's original pick,
prop grades and Maye/Darnold research, and Yesterday CIN–HOU's four prop grades
plus Burrow/Stroud research. Cache/race tests verify bounded loading, retained
last-good snapshots and rejection of stale week completions.

Evidence directory:
`/Users/adam.preda/Documents/ChatGPT/Gary/nfl-history-2026-09-21/`.
Release archive/upload and Apple processing are being verified before delivery
is reported. Target: TestFlight 2.26 (944).

The private local `GoogleService-Info.plist` remains uncommitted per AGENTS.md.
MLB's June engine, NBA's April prompts, injury handling and NFL agency prompts
are unchanged. The grading script is a fresh process on each scheduled run;
no scheduler restart is required.
