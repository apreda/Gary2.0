# Legacy provider path

`index.js` re-exports the production service from `../ballDontLieService.js`.
There is no second live provider or cache behind this entry point.

The unused `bdlPlayers.js` and `bdlInjuries.js`, and their `bdlCore.js` dependency,
are retained under the injury-code lock in `gary2.0/CLAUDE.md`. They are not
runtime entry points. Do not import them or add functionality here. Their
removal needs the separately required injury-code authorization.

New endpoint work belongs in `../bdl/`; see that directory's ownership map.
