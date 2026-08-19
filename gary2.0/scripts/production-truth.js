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
} catch (e) { line('Plist envs', `(unavailable: ${e.message})`); }

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

console.log(`\n${failed ? '🚨 PRODUCTION IS NOT THIS REPO — see flags above' : '✅ Production is this repo.'}\n`);
process.exit(failed ? 1 : 0);
