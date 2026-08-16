// Node entrypoint for the same dependency-free kickoff contract bundled with
// the live-score Edge Function. Keeping one implementation prevents the app
// board and scheduler from disagreeing about a date-only NFL fixture.
export {
  NFL_KICKOFF_STATUS,
  nflSlateDateForKickoff,
  resolveNflKickoff,
} from '../../supabase/functions/_shared/nflKickoff.js';
