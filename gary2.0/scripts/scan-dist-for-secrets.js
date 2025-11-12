#!/usr/bin/env node
// Simple post-build scanner to fail CI if secrets are embedded in dist/
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '..', 'dist');
if (!existsSync(distDir)) {
  console.error('dist/ not found; did you run the build?');
  process.exit(1);
}

// Only look for actual secret token shapes to avoid false positives
const patterns = [
  'sk-[A-Za-z0-9_-]{10,}',            // OpenAI keys
  'pplx-[A-Za-z0-9_-]{10,}',          // Perplexity keys
];

const grepCmd = `grep -RIn --binary-files=without-match -E "${patterns.join('|')}" ${distDir}`;
try {
  const out = execSync(grepCmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  if (out && out.trim().length) {
    console.error('\nDetected potential secret strings in built assets:\n');
    console.error(out);
    process.exit(2);
  }
  console.log('✅ No secret patterns detected in dist/');
} catch (err) {
  // grep exits 1 when no matches are found, which is success for us
  if (err.status === 1) {
    console.log('✅ No secret patterns detected in dist/');
  } else {
    console.error('Error running grep:', err.message);
    process.exit(3);
  }
}


