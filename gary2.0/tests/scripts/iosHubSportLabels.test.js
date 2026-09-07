import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { toSnakeCase } from '../../src/services/insights/shared.js';

const read = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const shared = read('HubShared.swift');
const modules = read('HubModules.swift');
const picks = read('PicksTab.swift');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;

function activeProducerCategories() {
  const registry = readFileSync(new URL('../../src/services/insights/generateInsightConnections.js', import.meta.url), 'utf8');
  const paths = new Map([...registry.matchAll(/import \{ ([^}]+) \} from '(\.\/computers\/[^']+)';/g)]
    .flatMap(([, names, path]) => names.split(',').map(name => [name.trim(), path])));
  const registered = [...registry.matchAll(/const (?:MLB|NBA|FOOTBALL|NFL|NCAAF)_COMPUTERS = \[([\s\S]*?)\];/g)]
    .flatMap(([, list]) => list.replace(/\/\/[^\n]*/g, '').match(/compute\w+/g) || []);
  const names = new Set([...registered, 'computeNflNextSlate', 'computeNcaafNextSlate']);
  const categories = new Set();
  for (const name of names) {
    const path = paths.get(name);
    if (!path) throw new Error(`Missing producer import for ${name}`);
    const source = readFileSync(new URL(`../../src/services/insights/${path}`, import.meta.url), 'utf8');
    for (const [, category] of source.matchAll(/category:\s*['"]([A-Za-z_ ]+)['"]/g)) categories.add(toSnakeCase(category));
  }
  return [...categories].sort();
}

function block(source, declaration) {
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`Missing declaration ${declaration}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed declaration ${declaration}`);
}

describe('Hub sport-aware evidence labels', () => {
  it.skipIf(!hasSwift)('decodes actual NBA storage categories into honest labels while preserving the other sports', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-hub-sport-labels-'));
    try {
      // Use the shipping category decoder, enum labels and shared chip function.
      // The enum's SwiftUI icon/color properties are irrelevant to this contract.
      const kindCases = shared.slice(shared.indexOf('enum SignalKind {'), shared.indexOf('    var icon: String {', shared.indexOf('enum SignalKind {')));
      const categories = activeProducerCategories();
      expect(categories.length).toBeGreaterThan(30);
      const script = `import Foundation
${block(shared, 'enum HubLeagueSel {')}
${kindCases}
${block(shared, '    var chip: String {')}
}
${block(modules, 'extension SignalKind {')}
${block(picks, 'func signalChipLabel(')}
for category in ${JSON.stringify(categories)} {
    precondition(SignalKind.from(category) != nil, "Active producer category dropped by native decoding: " + category)
}
let expected: [(String, String)] = [("owned", "SEASON SERIES"), ("rest_fatigue", "REST & SCHEDULE"),
                                    ("beneficiary", "AVAILABILITY"), ("streak", "STREAK")]
for (category, label) in expected {
    guard let kind = SignalKind.from(category) else { fatalError("NBA producer category must decode") }
    precondition(signalChipLabel(kind: kind, league: .nba) == label)
}
precondition(signalChipLabel(kind: .batterVsArm, league: .mlb) == "VS THIS ARM")
precondition(signalChipLabel(kind: .situational, league: .mlb) == "SITUATIONAL")
precondition(signalChipLabel(kind: .injury, league: .mlb) == "REPLACEMENT")
for league in [HubLeagueSel.nfl, .ncaaf] {
    precondition(signalChipLabel(kind: .injury, league: league) == "AVAILABILITY")
    precondition(signalChipLabel(kind: .quarterback, league: league) == "QUARTERBACKS")
    precondition(signalChipLabel(kind: .trenches, league: league) == "THE TRENCHES")
}
precondition(signalChipLabel(kind: .ballpark, league: .wc) == "VENUE")
precondition(signalChipLabel(kind: .ballpark, league: .mlb) == "BALLPARK")
precondition(signalChipLabel(kind: .batterVsArm, league: nil) == SignalKind.batterVsArm.chip)
precondition(signalChipLabel(kind: .regression, league: .nba) == SignalKind.regression.chip)
print("Hub sport label regressions passed")
`;
      const path = join(directory, 'labels.swift');
      writeFileSync(path, script);
      const result = spawnSync('swift', [path], { encoding: 'utf8', timeout: 30_000 });
      expect(result.status, result.stderr + result.stdout).toBe(0);
      expect(result.stdout).toContain('Hub sport label regressions passed');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 40_000);
});
