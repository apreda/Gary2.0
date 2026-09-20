# Gary

Gary's production sources live in this repository: the local sports pipelines,
Supabase handlers, Next.js website and native iOS app. Start with the current
operating instructions in [AGENTS.md](AGENTS.md) and
[gary2.0/CLAUDE.md](gary2.0/CLAUDE.md).

- [Architecture and ownership](docs/maintenance/ARCHITECTURE.md)
- [Cleanup goal and delivery ledger](docs/maintenance/CLEANUP.md)
- [Historical handoff index](docs/maintenance/HISTORY.md)
- [Backend script operations](gary2.0/scripts/README.md)
- [Web instructions](web/AGENTS.md)

For a fresh checkout, `npm run setup` installs each package from its lockfile.
`npm run verify` runs incremental backend lint, backend and edge tests, web tests
and web type checking. `npm run smoke:web` runs credential-free fixture pages;
see AGENTS.md for its safety boundary and platform prerequisites.

The live checkout is `/Users/adam.preda/Gary2.0`. Tests alone do not establish
production parity. Run `node scripts/production-truth.js` inside `gary2.0`;
cloud changes also require deployment, and native releases require verified
TestFlight processing. Preserve private local configuration and never commit
production credentials.
