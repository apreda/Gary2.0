# Data boundaries

`gary2.0/src/contracts/boundaries.d.ts` describes the fields used by shipping
JavaScript boundaries. `npm --prefix gary2.0 run typecheck` checks those complete
modules with strict TypeScript and checks valid/invalid calls in `tests/types/`.
The root verification command and backend CI both run it. This is an incremental
boundary check, not a claim that the entire JavaScript application is typed.

- **Dates:** `DateKey` is a storage key shaped as YYYY-MM-DD. `ISOInstant` includes
  a time; these types cannot be substituted for each other. Actual parsing and
  calendar validity remain runtime responsibilities. `picks/calendar.js` delegates
  to the existing Eastern policies: NCAAF uses the 6 a.m. playing-date cutoff;
  MLB/NFL use Eastern calendar dates. A missing kickoff remains missing.
- **Identity:** stored IDs retain strings/numbers and do not become team names.
  Native `ExactGameIdentity` additionally rejects malformed, unsafe or conflicting
  provider IDs and impossible calendar dates. Historical backend settlement
  compatibility rules remain with their existing owners; they are not silently
  replaced by the stricter client decoder.
- **Tickets:** `GameTicketFields`/`PropTicketFields` are readonly accounting inputs.
  `pickdesk/ticketIdentity.js` owns their canonical identity; `winnersBook.js`
  re-exports the existing API. The exact stored date, ID, market/side, player,
  line and pick text remain attached. The historical identity helper checks date
  shape only; it is not a calendar validator. Published prices are never replaced
  with current market prices. Runtime storage constraints still enforce immutability.
- **Missing data:** market numbers return `number | null`; zero is a measurement.
  Response decoders accept `unknown` and return `unknown[]` or `object | null`.
  An explicit empty array is valid; a malformed success body throws. Envelope
  validation never claims to validate the schema of each game/player row.

The checked JavaScript retains the runtime entry points and existing behavior.
The only runtime edits required for narrowing are equivalent null/property
checks and market-key selection. Ticket function tokens are unchanged after
normalizing the moved helper names; see the maintenance evidence receipt.
The old unused `src/types/picks.ts` model was removed: its fields, status names
and confidence description did not describe current stored tickets.

`boundary-fixtures.json` is read by backend and web tests. The backend suite
also compiles the complete shipping native provider-identity file against the
same calendar examples and the stricter native ID cases. The examples cover
midnight, both DST transitions, the 6 a.m. cutoff, leap day, year rollover,
measured zero and malformed/missing provider bodies. Ticket and asynchronous
refresh behavior have separate tests against the actual shipping modules.
