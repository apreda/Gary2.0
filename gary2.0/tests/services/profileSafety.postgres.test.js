import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const run = promisify(execFile);
const pgEnv = { ...process.env, LC_ALL: 'C' };
let bin = process.env.GARY_TEST_PG_BIN;
if (!bin) {
  try { bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim(); }
  catch { bin = ''; }
}
const missing = ['initdb', 'pg_ctl', 'psql', 'postgres'].filter(name => {
  try { accessSync(path.join(bin || '', name), constants.X_OK); return !bin; } catch { return true; }
});
const supported = missing.length === 0;
if (!supported) {
  const message = `Profile safety tests need PostgreSQL: ${missing.join(', ')}. Set GARY_TEST_PG_BIN.`;
  if (process.env.GARY_TEST_PG_BIN || ['true', '1'].includes(process.env.CI)) throw new Error(message);
  console.warn(`Skipping: ${message}`);
}
let directory, started = false;
const port = '55448';
const args = () => ['-h', directory, '-p', port, '-U', 'testadmin', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
const sql = source => execFileSync(`${bin}/psql`, [...args(), '-c', source], { env: pgEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }).trim();
const literal = value => `'${value.replaceAll("'", "''")}'`;
const uid = n => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const authenticated = (n, query) => `SET ROLE authenticated; SET request.jwt.claims=${literal(JSON.stringify({ sub: uid(n), role: 'authenticated' }))}; ${query}`;
const as = (n, query) => sql(authenticated(n, query));
const json = (n, query) => JSON.parse(as(n, query));
const board = (n, limit = 25, offset = 0) => json(n, `SELECT public.your_book_leaderboard_v3('30d','wins','all',${limit},${offset});`);
const card = (viewer, subject) => as(viewer, `SELECT public.profile_card('${uid(subject)}') IS NULL;`) === 't';
const block = (viewer, subject, value = true) => json(viewer, `SELECT public.set_profile_block('${uid(subject)}',${value});`);
const reportSQL = (subject, reason = 'harassment', details = '') => `SELECT public.report_profile('${uid(subject)}',${literal(reason)},${literal(details)});`;
const report = (viewer, subject, reason, details) => json(viewer, reportSQL(subject, reason, details));
const migration = new URL('../../supabase/migrations/20260908035634_profile_safety_controls.sql', import.meta.url);
const bootstrap = new URL('../../supabase/tests/user-experience/bootstrap.sql', import.meta.url);
function cleanup() {
  try { if (started) execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-m', 'immediate', '-w', '-t', '5', 'stop'], { env: pgEnv, stdio: 'ignore', timeout: 7000 }); }
  finally { started = false; if (directory) rmSync(directory, { recursive: true, force: true }); }
}
function seed() {
  sql(`SET request.jwt.claims='{"role":"service_role"}'; TRUNCATE auth.users CASCADE;
    INSERT INTO auth.users(id) SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,25) n;
    INSERT INTO public.public_profiles(user_id,display_name,handle,bio,leaderboard_visible)
      SELECT id,'Player'||right(id::text,2),'Player'||right(id::text,2),'Sports fan',true FROM auth.users;
    INSERT INTO public.user_bets(user_id,kind,game_date,pick_text,odds_american,stake_units,status,units_net,graded_by)
      SELECT u.id,'tail',(now() at time zone 'America/New_York')::date,'Fixture call '||n,150,2,
        CASE WHEN n<=26-right(u.id::text,2)::int THEN 'won' ELSE 'lost' END,
        CASE WHEN n<=26-right(u.id::text,2)::int THEN 3 ELSE -2 END,'system'
      FROM auth.users u CROSS JOIN generate_series(1,25) n;`);
}

describe.skipIf(!supported)('public profile safety on isolated PostgreSQL', () => {
  beforeAll(() => {
    directory = mkdtempSync('/tmp/gary-profile-safety-pg-');
    try {
      execFileSync(`${bin}/initdb`, ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale', '--no-sync'], { env: pgEnv, stdio: 'pipe', timeout: 20000 });
      execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p ${port} -c shared_buffers=8MB -c max_connections=20`, '-w', 'start'], { env: pgEnv, stdio: 'pipe', timeout: 15000 });
      started = true;
      execFileSync(`${bin}/psql`, [...args(), '-f', bootstrap.pathname], { env: pgEnv, stdio: 'pipe', timeout: 10000 });
      sql(readFileSync(migration, 'utf8'));
    } catch (error) { cleanup(); throw error; }
  }, 40000);
  afterAll(cleanup);
  beforeEach(seed);

  it('filters blocked profiles before pagination but preserves everyone’s global rank, counts and scores', () => {
    const before = board(25, 1);
    expect(before.rows[0].user_id).toBe(uid(1));
    expect(before.qualified_count).toBe(25);
    expect(block(25, 1)).toEqual({ ok: true, blocked: true });
    const after = board(25, 1);
    expect(after.rows[0].user_id).toBe(uid(2));
    expect(after.rows[0].rank).toBe(2);
    expect(after.qualified_count).toBe(25);
    expect(after.hidden_count).toBe(1);
    expect(after.me).toEqual(before.me);
    expect(after.has_more).toBe(true);
    expect(board(25, 1, 1).rows[0].user_id).toBe(uid(3));
    expect(board(24, 1).rows).toEqual(before.rows);
    expect(card(25, 1)).toBe(true);
    expect(card(24, 1)).toBe(false);
    expect(card(1, 1)).toBe(false);
    expect(sql('SELECT count(*) FROM public.user_bets;')).toBe('625');
    block(25, 1, false);
    expect(board(25, 1).rows).toEqual(before.rows);
  });

  it('honors blocks in both older leaderboard versions and the legacy lane board', () => {
    block(25, 1);
    for (const fn of ["your_book_leaderboard('30d')", "your_book_leaderboard_v2('30d')", "leaderboard('tail',30,5)"]) {
      expect(as(25, `SELECT count(*) FROM public.${fn} WHERE display_name='Player01';`)).toBe('0');
      expect(as(24, `SELECT count(*) FROM public.${fn} WHERE display_name='Player01';`)).toBe('1');
    }
    expect(as(25, "SELECT rank FROM public.leaderboard('tail',30,5) WHERE display_name='Player02';")).toBe('2');
  });

  it('keeps blocks private, authenticates writes and supports safe idempotent unblocking', () => {
    block(25, 1); block(25, 1);
    expect(json(25, 'SELECT public.my_blocked_profiles();')).toEqual([{ user_id: uid(1), display_name: 'Player01' }]);
    expect(json(24, 'SELECT public.my_blocked_profiles();')).toEqual([]);
    expect(json(25, `SELECT public.get_profile_safety('${uid(1)}');`).blocked).toBe(true);
    expect(json(24, `SELECT public.get_profile_safety('${uid(1)}');`).blocked).toBe(false);
    block(24, 1, false);
    expect(card(25, 1)).toBe(true);
    expect(() => block(25, 25)).toThrow();
    expect(() => block(25, 999)).toThrow();
    expect(() => block(999, 1)).toThrow();
    expect(() => as(25, `SELECT public.set_profile_block('${uid(1)}',null);`)).toThrow();
    expect(() => sql(`SET ROLE anon; SELECT public.set_profile_block('${uid(1)}',true);`)).toThrow();
    block(25, 1, false); block(25, 1, false);
    expect(json(25, 'SELECT public.my_blocked_profiles();')).toEqual([]);
  });

  it('stores only a public identity snapshot with each private, idempotent report', () => {
    const result = report(25, 1, 'spam', 'Fixture explanation');
    expect(Object.keys(result).sort()).toEqual(['ok', 'report_id']);
    expect(report(25, 1, 'other', 'Different text')).toEqual(result);
    const row = JSON.parse(sql('SELECT row_to_json(r) FROM profile_safety_private.reports r;'));
    expect(row.reporter_id).toBe(uid(25));
    expect(row.details).toBe('Fixture explanation');
    expect(Object.keys(row.profile_snapshot).sort()).toEqual(['avatar', 'bio', 'display_name', 'handle']);
    expect(row.status).toBe('open');
    expect(board(24).qualified_count).toBe(25);
    expect(card(24, 1)).toBe(false); // A report alone never removes a competitor.
    expect(report(24, 1).report_id).not.toBe(result.report_id);
    expect(() => report(25, 25)).toThrow();
    expect(() => report(25, 999)).toThrow();
    expect(() => report(25, 2, 'unknown')).toThrow();
    expect(() => report(25, 2, 'spam', 'x'.repeat(1001))).toThrow();
    sql(`UPDATE public.public_profiles SET leaderboard_visible=false WHERE user_id='${uid(3)}';`);
    expect(() => report(25, 3)).toThrow();
  });

// Add within the existing describe block. Uses only the disposable PG fixture.
// The wrapper preserves is_public's result but pauses after its snapshot read,
// allowing a concurrent privacy edit to commit at the vulnerable boundary.
it('never snapshots identity text written by a concurrent privacy opt-out', async () => {
  const helperDefinition = sql("SELECT pg_get_functiondef('profile_safety_private.is_public(uuid)'::regprocedure);");
  let attempt;
  try {
    sql(`ALTER FUNCTION profile_safety_private.is_public(uuid) RENAME TO race_original_is_public;
      CREATE FUNCTION profile_safety_private.is_public(p_user uuid)
      RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
      DECLARE allowed boolean;
      BEGIN
        allowed := profile_safety_private.race_original_is_public(p_user);
        PERFORM pg_sleep(1);
        RETURN allowed;
      END;
      $$;
      REVOKE ALL ON FUNCTION profile_safety_private.is_public(uuid) FROM public, anon, authenticated;`);
    // Attach rejection handling immediately: a repaired RPC is expected to reject.
    attempt = run(`${bin}/psql`, [...args(), '-c', authenticated(25, reportSQL(1))], { env: pgEnv, timeout: 10000 })
      .then(value => ({ value }), error => ({ error }));
    let reachedBarrier = false;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      reachedBarrier = sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event='PgSleep' AND query LIKE '%SELECT public.report_profile(%';") === '1';
      if (reachedBarrier) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(reachedBarrier).toBe(true);
    sql(`UPDATE public.public_profiles SET leaderboard_visible=false, bio='Never public new bio' WHERE user_id='${uid(1)}';`);
    const outcome = await attempt;
    if (outcome.error) {
      expect(String(outcome.error.stderr)).toMatch(/profile is not available for reporting/);
      expect(sql('SELECT count(*) FROM profile_safety_private.reports;')).toBe('0');
    } else {
      // Also permits a future implementation that atomically locks/captures the
      // earlier, genuinely public identity snapshot instead of rejecting.
      expect(sql("SELECT profile_snapshot->>'bio' FROM profile_safety_private.reports;")).toBe('Sports fan');
    }
    expect(sql(`SELECT leaderboard_visible FROM public.public_profiles WHERE user_id='${uid(1)}';`)).toBe('f');
  } finally {
    if (attempt) await attempt;
    sql(`DROP FUNCTION IF EXISTS profile_safety_private.is_public(uuid);
      ALTER FUNCTION profile_safety_private.race_original_is_public(uuid) RENAME TO is_public;`);
    // Rename restores the original OID, body, grants and function configuration.
    expect(sql("SELECT pg_get_functiondef('profile_safety_private.is_public(uuid)'::regprocedure);")).toBe(helperDefinition);
  }
}, 15000);

  it('serializes duplicate submissions and the per-account hourly report limit', async () => {
    const duplicate = await Promise.all(Array.from({ length: 4 }, () => run(`${bin}/psql`, [...args(), '-c', authenticated(25, reportSQL(1))], { env: pgEnv, timeout: 10000 })));
    expect(new Set(duplicate.map(r => JSON.parse(r.stdout.trim()).report_id)).size).toBe(1);
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => run(`${bin}/psql`, [...args(), '-c', authenticated(25, reportSQL(i + 2))], { env: pgEnv, timeout: 10000 })));
    expect(attempts.filter(r => r.status === 'fulfilled')).toHaveLength(4);
    expect(sql(`SELECT count(*) FROM profile_safety_private.reports WHERE reporter_id='${uid(25)}';`)).toBe('5');
    expect(report(25, 1).ok).toBe(true);
    expect(() => report(25, 24)).toThrow(/report limit reached/);
  });

  it('enforces the separate daily limit after hourly cooldowns', () => {
    for (let n = 1; n <= 20; n++) {
      if (n > 1 && (n - 1) % 5 === 0) sql("UPDATE profile_safety_private.reports SET created_at=created_at-interval '2 hours';");
      report(25, n);
    }
    sql("UPDATE profile_safety_private.reports SET created_at=created_at-interval '2 hours';");
    expect(() => report(25, 21)).toThrow(/report limit reached/);
    sql("UPDATE profile_safety_private.reports SET created_at=created_at-interval '1 day';");
    expect(report(25, 21).ok).toBe(true);
  });

  it('filters public identity text through every existing write RPC and leaves private notes alone', () => {
    for (const phrase of ['kill yourself', 'h.e.i.l h.i.t.l.e.r', 'visit https://spam.invalid', 'email@spam.invalid', 'n1gg3r', 'free porn', 'FuckYou', 'FuckingLoser', 'n.u.d.e.s']) {
      expect(() => as(25, `SELECT public.save_my_profile(p_bio=>${literal(phrase)});`)).toThrow(/profile text is not allowed/);
    }
    expect(as(25, "SELECT (public.claim_handle('SkillAlliance')).display_name;")).toBe('SkillAlliance');
    expect(() => as(25, "SELECT public.claim_handle('N1gg3r');")).toThrow();
    expect(json(25, "SELECT public.update_my_profile(p_bio=>'kill yourself');")).toMatchObject({ ok: false });
    expect(as(25, "SELECT public.get_my_profile()->'profile'->>'bio';")).toBe('Sports fan');
    expect(as(25, "SELECT public.save_my_profile(p_bio=>'Cubs fan. Sports should be fun.') ->> 'ok';")).toBe('true');
    expect(as(25, `SELECT public.save_my_profile(p_bio=>${literal('Cubs fan.\nSports should be fun.')}) ->> 'ok';`)).toBe('true');
    expect(as(25, "INSERT INTO public.user_bets(user_id,kind,game_date,pick_text,odds_american,stake_units,notes) VALUES(auth.uid(),'manual',current_date,'Private fixture',150,1,'https://my-notes.invalid') RETURNING notes;")).toBe('https://my-notes.invalid');
  });

  it('hides preexisting unsafe text from all public reads without deleting history', () => {
    sql(`ALTER TABLE public.public_profiles DISABLE TRIGGER profile_identity_safety;
      UPDATE public.public_profiles SET bio='kill yourself' WHERE user_id='${uid(1)}';
      ALTER TABLE public.public_profiles ENABLE TRIGGER profile_identity_safety;`);
    expect(card(25, 1)).toBe(true);
    expect(card(1, 1)).toBe(false);
    expect(board(25).rows.some(r => r.user_id === uid(1))).toBe(false);
    expect(as(25, "SELECT count(*) FROM public.leaderboard('tail',30,5) WHERE display_name='Player01';")).toBe('0');
    expect(json(1, "SELECT public.save_my_profile(p_leaderboard_visible=>false,p_unit_value=>25);")).toMatchObject({ profile: { leaderboard_visible: false, bio: 'kill yourself' }, preferences: { unit_value: 25 } });
    expect(card(25, 1)).toBe(true);
    as(1, "SELECT public.save_my_profile(p_bio=>'Updated safe bio',p_leaderboard_visible=>true);");
    expect(card(25, 1)).toBe(false);
    expect(sql('SELECT count(*) FROM public.user_bets;')).toBe('625');
  });

  it('supports audited human hide/restore without letting edits override moderation or expose reporter identity', () => {
    const result = report(25, 1);
    const review = (action, id = result.report_id) => sql(`SET ROLE service_role; SELECT public.review_profile_safety('${uid(1)}','${action}','Fixture review','Local test operator',${literal(id)});`);
    expect(JSON.parse(review('hide'))).toEqual({ ok: true });
    expect(card(24, 1)).toBe(true);
    expect(card(1, 1)).toBe(false);
    expect(json(1, `SELECT public.get_profile_safety('${uid(1)}');`).my_profile_hidden).toBe(true);
    expect(board(1).profile_hidden).toBe(true);
    expect(board(24).profile_hidden).toBe(false);
    expect(json(24, `SELECT public.get_profile_safety('${uid(1)}');`).my_profile_hidden).toBe(false);
    as(1, "SELECT public.save_my_profile(p_bio=>'Changed safe bio',p_leaderboard_visible=>true);");
    expect(card(24, 1)).toBe(true);
    expect(() => review('hide')).toThrow(/not open/);
    expect(sql('SELECT status FROM profile_safety_private.reports;')).toBe('actioned');
    sql(`SET ROLE service_role; SELECT public.review_profile_safety('${uid(1)}','restore','Appeal checked','Local test operator');`);
    expect(card(24, 1)).toBe(false);
    expect(sql('SELECT count(*) FROM profile_safety_private.review_log;')).toBe('2');
    expect(sql('SELECT count(*) FROM public.user_bets;')).toBe('625');
  });

  it('denies all client private-table access and moderation functions, even with misleading user metadata', () => {
    report(25, 1); block(25, 2);
    for (const role of ['anon', 'authenticated']) {
      for (const table of ['reports', 'blocks', 'moderation', 'review_log']) {
        expect(() => sql(`SET ROLE ${role}; SELECT * FROM profile_safety_private.${table};`)).toThrow();
        expect(sql(`SELECT has_table_privilege('${role}','profile_safety_private.${table}','SELECT');`)).toBe('f');
        expect(sql(`BEGIN; GRANT USAGE ON SCHEMA profile_safety_private TO ${role}; GRANT SELECT ON profile_safety_private.${table} TO ${role}; SET ROLE ${role}; SELECT count(*) FROM profile_safety_private.${table}; ROLLBACK;`)).toBe('0');
      }
      expect(() => sql(`SET ROLE ${role}; SELECT public.review_profile_safety('${uid(1)}','hide','note','operator');`)).toThrow();
    }
    expect(() => sql(`SET ROLE authenticated; SET request.jwt.claims='{"sub":"${uid(25)}","role":"authenticated","user_metadata":{"role":"service_role"}}'; SELECT public.review_profile_safety('${uid(1)}','hide','note','operator');`)).toThrow();
    expect(sql('SET ROLE service_role; SELECT count(*) FROM profile_safety_private.reports;')).toBe('1');
  });

  it('keeps direct profile reads owner-only and direct writes denied by existing RLS', () => {
    block(25, 1);
    expect(as(25, 'SELECT count(*) FROM public.public_profiles;')).toBe('1');
    expect(as(25, `SELECT count(*) FROM public.public_profiles WHERE user_id='${uid(1)}';`)).toBe('0');
    expect(as(1, 'SELECT bio FROM public.public_profiles;')).toBe('Sports fan');
    expect(() => as(25, "UPDATE public.public_profiles SET bio='Owner edit' WHERE user_id=auth.uid();")).toThrow();
    expect(() => as(25, "INSERT INTO public.public_profiles(user_id,display_name) VALUES(auth.uid(),'OwnerName');")).toThrow();
    expect(() => sql('SET ROLE anon; SELECT * FROM public.public_profiles;')).toThrow();
    // Exercise the trigger under a future owner-write policy without weakening
    // the real contract. Temporary grants/policies roll back in this call.
    expect(sql(`BEGIN;
      GRANT INSERT,UPDATE ON public.public_profiles TO authenticated;
      CREATE POLICY fixture_owner_update ON public.public_profiles FOR UPDATE TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
      ${authenticated(25, "UPDATE public.public_profiles SET bio='Owner edit' WHERE user_id=auth.uid(); SELECT bio FROM public.public_profiles;")}
      ROLLBACK;`)).toBe('Owner edit');
    expect(() => sql(`BEGIN;
      GRANT INSERT,UPDATE ON public.public_profiles TO authenticated;
      CREATE POLICY fixture_owner_update ON public.public_profiles FOR UPDATE TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
      ${authenticated(25, "UPDATE public.public_profiles SET bio='FuckYou' WHERE user_id=auth.uid();")}
      ROLLBACK;`)).toThrow(/profile text is not allowed/);
    expect(as(25, 'SELECT bio FROM public.public_profiles;')).toBe('Sports fan');
    expect(sql(`BEGIN;
      INSERT INTO auth.users(id) VALUES('${uid(26)}');
      GRANT INSERT ON public.public_profiles TO authenticated;
      CREATE POLICY fixture_owner_insert ON public.public_profiles FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
      ${authenticated(26, "INSERT INTO public.public_profiles(user_id,display_name,bio) VALUES(auth.uid(),'NewPlayer','Sports fan') RETURNING bio;")}
      ROLLBACK;`)).toBe('Sports fan');
    expect(() => sql(`BEGIN;
      INSERT INTO auth.users(id) VALUES('${uid(26)}');
      GRANT INSERT ON public.public_profiles TO authenticated;
      CREATE POLICY fixture_owner_insert ON public.public_profiles FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
      ${authenticated(26, "INSERT INTO public.public_profiles(user_id,display_name,bio) VALUES(auth.uid(),'NewPlayer','FuckYou');")}
      ROLLBACK;`)).toThrow(/profile text is not allowed/);
  });

  it('cascades reporter and subject deletions without retaining identity snapshots', () => {
    report(25, 1); report(24, 1); block(25, 1); block(24, 1);
    sql(`SET ROLE service_role; SELECT public.review_profile_safety('${uid(1)}','hide','Fixture decision','Local test operator');`);
    sql(`DELETE FROM auth.users WHERE id='${uid(25)}';`);
    expect(sql('SELECT count(*) FROM profile_safety_private.reports;')).toBe('1');
    expect(sql('SELECT count(*) FROM profile_safety_private.blocks;')).toBe('1');
    sql(`DELETE FROM auth.users WHERE id='${uid(1)}';`);
    expect(sql('SELECT count(*) FROM profile_safety_private.reports;')).toBe('0');
    expect(sql('SELECT count(*) FROM profile_safety_private.blocks;')).toBe('0');
    expect(sql('SELECT count(*) FROM profile_safety_private.moderation;')).toBe('0');
    expect(sql('SELECT count(*) FROM profile_safety_private.review_log;')).toBe('0');
    expect(() => report(1, 2)).toThrow(/not signed in/);
  });
});
