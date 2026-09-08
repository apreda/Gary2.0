import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hasSwift = spawnSync('swiftc', ['--version']).status === 0;
const root = fileURLToPath(new URL('../../../', import.meta.url));
const cases = [
  ['UsefulSessionMeasurement', 'USEFUL_SESSION_MEASUREMENT_OK'],
  ['PrivacyPreferences', 'Privacy preferences:'],
];
describe('native optional reading measurement', () => {
  for (const [name, receipt] of cases) {
    // Both production and fixture geometry use CoreGraphics. Verify runs that
    // case on macOS; the Foundation-only privacy case still runs on Linux.
    const requiresAppleSDK = name === 'UsefulSessionMeasurement';
    it.skipIf(!hasSwift || (requiresAppleSDK && process.platform !== 'darwin'))(`executes production ${name} with offline fixtures`, () => {
      const directory = mkdtempSync(join(tmpdir(), 'gary-reading-test-'));
      try {
        const binary = join(directory, 'fixture');
        execFileSync('swiftc', ['-parse-as-library', '-O',
          join(root, 'ios/GaryApp', `${name}.swift`),
          join(root, 'ios/Tests', `${name}Tests.swift`), '-o', binary], { encoding: 'utf8', timeout: 30000 });
        expect(execFileSync(binary, [], { encoding: 'utf8', timeout: 5000 })).toContain(receipt);
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }, 40000);
  }
});
