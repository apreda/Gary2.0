#!/usr/bin/env node
// Invoked AFTER the existing heartbeat policy by its existing 120s watchdog.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { runMorningWatch } from './lib/morningWatch.js';
const controller = new AbortController();
const stop = () => controller.abort(new Error('Morning health wrapper stopped'));
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
try {
  const result = await runMorningWatch({
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    markerPath: resolve(homedir(), 'Library/Logs/Gary2.0/morning-health-last.json'),
    signal: controller.signal,
  });
  if (!result.skipped) console.log(`[7am-health] ${JSON.stringify(result)}`);
  process.exitCode = result.exit_code ? 1 : 0;
} catch (error) {
  console.error(`[7am-health] Failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
}
