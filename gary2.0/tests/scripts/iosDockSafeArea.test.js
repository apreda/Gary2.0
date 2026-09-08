import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const view = readFileSync(new URL('../../../ios/GaryApp/ContentView.swift', import.meta.url), 'utf8');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;
const start = view.indexOf('enum GaryDockLayout {');
const end = view.indexOf('\n}', start);
if (start < 0 || end < 0) throw new Error('Actual GaryDockLayout declaration is missing');
const layout = view.slice(start, end + 2);

describe('native dock physical screen clearance', () => {
  it.skipIf(!hasSwift)('executes the shipping layout for home-button, small-inset and home-indicator devices', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gary-dock-safe-area-'));
    try {
      const file = join(dir, 'DockFixture.swift');
      writeFileSync(file, `import Foundation
${layout}

let cases: [(CGFloat, CGFloat)] = [(0, 8), (1, 7), (4, 4), (8, 0), (13, -5), (14, -6), (21, -6), (34, -6)]
for (inset, expectedPadding) in cases {
    let padding = GaryDockLayout.bottomPadding(safeAreaInset: inset)
    precondition(padding == expectedPadding, "Unexpected padding for inset \\(inset): \\(padding)")
}
// The physical screen edge, rather than a particular device model, is the
// contract. Rotation and split-view insets must preserve the same clearance.
for halfPoints in 0...100 {
    let inset = CGFloat(halfPoints) / 2
    let padding = GaryDockLayout.bottomPadding(safeAreaInset: inset)
    precondition(inset + padding >= 8, "Dock clips the physical edge at inset \\(inset)")
    precondition(padding >= -6, "Dock overlaps the safe area farther than the existing design")
}
print("PASS actual Swift dock: 8 boundary cases and 101 physical-clearance checks")
`);
      expect(execFileSync('swift', ['-swift-version', '5', file], { encoding: 'utf8', timeout: 30000 }))
        .toContain('PASS actual Swift dock: 8 boundary cases and 101 physical-clearance checks');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 40000);
});
