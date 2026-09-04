#!/usr/bin/env node
/**
 * Production truth — one command that proves what production actually is.
 *
 *   node scripts/production-truth.js
 *
 * Prints: the pick daemon's real launch folder (from the live process), this
 * repo's git state, the prompt eras a fresh run from this folder will stamp,
 * the model overrides launchd injects, and the eras stamped on today's stored
 * picks. Exits 1 if the daemon is running from a different folder than this
 * repo — the exact split that ran unnoticed Jul 29 – Aug 12 2026.
 */

import '../src/loadEnv.js';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { diskEras, gitStamp, PROJECT_DIR } from './lib/eraTruth.js';

const line = (label, value) => console.log(`${label.padEnd(22)} ${value}`);
let failed = false;

console.log('\n═══ PRODUCTION TRUTH ═══\n');

// 1. The daemon — what folder is ACTUALLY launching picks right now.
let daemonDir = null;
try {
  const procs = execSync("pgrep -fl 'scripts/scheduler.js' || true", { shell: '/bin/bash' })
    .toString().trim().split('\n').filter(Boolean)
    .filter(l => !l.includes('caffeinate'));
  if (procs.length === 0) {
    line('Scheduler', '❌ NOT RUNNING');
    failed = true;
  } else {
    for (const p of procs) {
      const m = p.match(/(\/\S+)\/scripts\/scheduler\.js/);
      daemonDir = m ? m[1] : '(path not visible)';
      const pid = p.split(' ')[0];
      line('Scheduler', `PID ${pid} @ ${daemonDir}`);
    }
    if (procs.length > 1) { line('', '🚨 MORE THAN ONE SCHEDULER — one writer only'); failed = true; }
    if (daemonDir && daemonDir !== PROJECT_DIR) {
      line('', `🚨 DAEMON FOLDER ≠ THIS REPO (${PROJECT_DIR})`);
      failed = true;
    }
  }
} catch (e) { line('Scheduler', `(check failed: ${e.message})`); }

// 2. This repo — the code that folder holds.
line('Repo', PROJECT_DIR);
line('Commit', gitStamp());

// 3. The eras a fresh pick run from here will stamp.
try {
  const eras = diskEras();
  line('Game era (disk)', eras.game);
  line('Props era (disk)', eras.props);
} catch (e) { line('Eras', `(unavailable: ${e.message})`); }
// The June engine's own era — the full dossier surface (Aug 19: this is
// the stamp MLB game picks actually carry while the engine is armed).
try {
  const { junePromptSha } = await import('../src/services/agentic/orchestrator/junePromptSha.js');
  line('June era (disk)', junePromptSha());
} catch (e) { line('June era (disk)', `(unavailable: ${e.message})`); }

// 4. Model overrides launchd injects (the plist, not this shell's env).
try {
  const plist = execSync('plutil -p ~/Library/LaunchAgents/com.gary.scheduler.plist', { shell: '/bin/bash' }).toString();
  const grab = (k) => (plist.match(new RegExp(`"${k}" => "([^"]+)"`)) || [])[1] || '(unset)';
  line('Game model (plist)', grab('GARY_MODEL_OVERRIDE'));
  line('Props model (plist)', grab('GARY_PROPS_MODEL_OVERRIDE'));
  line('MLB model (plist)', grab('GARY_MLB_BRAIN_MODEL'));
} catch (e) { line('Plist envs', `(unavailable: ${e.message})`); }

// Winners is an independent worker: review availability cannot delay picks.
try {
  const status = execSync(`launchctl print gui/${process.getuid()}/com.gary.winners`).toString();
  const pid = status.match(/\bpid = (\d+)/)?.[1];
  const running = /state = running/.test(status);
  line('Winners worker', running ? `PID ${pid || '?'} · running` : '❌ NOT RUNNING');
  if (!running) failed = true;
} catch { line('Winners worker', '❌ NOT LOADED'); failed = true; }

// 5. What today's STORED picks actually carry.
try {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabase = createClient(url, key);
  const etToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const { data: dp } = await supabase.from('daily_picks').select('picks').eq('date', etToday).maybeSingle();
  const picks = dp?.picks || [];
  const eras = [...new Set(picks.map(p => p?.prompt_sha).filter(Boolean))];
  const models = [...new Set(picks.map(p => p?.model).filter(Boolean))];
  line(`Stored (${etToday})`, picks.length === 0 ? 'no game picks yet' : `${picks.length} picks · eras [${eras.join(', ')}] · models [${models.join(', ')}]`);
} catch (e) { line('Stored picks', `(unavailable: ${e.message})`); }

// 6. DEPLOY PARITY (founder law, Aug 24 2026: "if we change something here I
//    assume it was changed in production too — that needs to be the case at
//    the end of each session"). For every edge function: compare the last
//    LOCAL change (latest git commit touching its folder — or _shared/ when
//    the function imports from it — plus any uncommitted edits, which always
//    count as newer) against the DEPLOYED version's updated_at from the
//    Supabase API. Local newer than deployed = the repo is lying about
//    production → the whole check fails.
console.log('\n─── DEPLOY PARITY (edge functions) ───');
try {
  const { readdirSync, readFileSync, existsSync, statSync } = await import('fs');
  const { join } = await import('path');
  const fnRoot = join(PROJECT_DIR, 'supabase', 'functions');
  const deployed = JSON.parse(execSync(
    'npx supabase functions list --project-ref xuttubsfgdcjfgmskcol -o json',
    { shell: '/bin/bash', cwd: PROJECT_DIR, timeout: 60_000 },
  ).toString());
  const deployedBySlug = new Map(deployed.map((f) => [f.slug, f]));

  const gitLastMs = (relPath) => {
    try {
      const out = execSync(`git log -1 --format=%ct -- ${JSON.stringify(relPath)}`, { cwd: PROJECT_DIR }).toString().trim();
      return out ? Number(out) * 1000 : 0;
    } catch { return 0; }
  };
  const isDirty = (relPath) => {
    try {
      return execSync(`git status --porcelain -- ${JSON.stringify(relPath)}`, { cwd: PROJECT_DIR }).toString().trim().length > 0;
    } catch { return false; }
  };
  const sharedLastMs = gitLastMs('supabase/functions/_shared');
  const sharedDirty = isDirty('supabase/functions/_shared');

  const localFns = readdirSync(fnRoot).filter((name) => {
    if (name.startsWith('_') || name.startsWith('.')) return false;
    try { return statSync(join(fnRoot, name)).isDirectory() && existsSync(join(fnRoot, name, 'index.ts')); }
    catch { return false; }
  });

  for (const fn of localFns) {
    const rel = `supabase/functions/${fn}`;
    const usesShared = (() => {
      try {
        return readdirSync(join(fnRoot, fn))
          .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
          .some((f) => readFileSync(join(fnRoot, fn, f), 'utf8').includes('_shared/'));
      } catch { return false; }
    })();
    const dirty = isDirty(rel) || (usesShared && sharedDirty);
    const localMs = Math.max(gitLastMs(rel), usesShared ? sharedLastMs : 0);
    const row = deployedBySlug.get(fn);
    if (!row) {
      line(fn, '🚨 NEVER DEPLOYED (no remote function with this slug)');
      failed = true;
      continue;
    }
    const deployedMs = Number(row.updated_at || 0);
    if (dirty) {
      line(fn, `🚨 UNCOMMITTED LOCAL EDITS — deployed copy is behind by definition`);
      failed = true;
    } else if (localMs > deployedMs + 30 * 60_000) {
      // 30-min tolerance: the historical workflow deploys first and commits
      // minutes later — that ordering is parity, not drift.
      line(fn, `🚨 LOCAL NEWER THAN DEPLOYED (local ${new Date(localMs).toISOString()} > deployed ${new Date(deployedMs).toISOString()}) — deploy it`);
      failed = true;
    } else {
      line(fn, `✅ deployed ${new Date(deployedMs).toISOString().slice(0, 16)}Z (v${row.version})`);
    }
  }
} catch (e) {
  line('Edge parity', `⚠️ UNVERIFIED (${String(e.message).slice(0, 120)}) — do not claim parity without this check`);
}

// 7. Git truth: uncommitted work and unpushed commits are drift too.
try {
  const dirtyCount = execSync('git status --porcelain', { cwd: PROJECT_DIR }).toString().trim().split('\n').filter(Boolean).length;
  line('Working tree', dirtyCount === 0 ? '✅ clean' : `⚠️ ${dirtyCount} uncommitted change(s)`);
  const unpushed = execSync('git rev-list --count @{u}..HEAD', { cwd: PROJECT_DIR }).toString().trim();
  if (unpushed !== '0') { line('Unpushed', `⚠️ ${unpushed} commit(s) not on origin`); }
  else line('Unpushed', '✅ none');
} catch (e) { line('Git truth', `(unavailable: ${e.message})`); }

console.log(`\n${failed ? '🚨 PRODUCTION IS NOT THIS REPO — see flags above' : '✅ Production is this repo.'}\n`);
process.exit(failed ? 1 : 0);
