import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = readFileSync(new URL('../../../ios/GaryApp/PickDetailSections.swift', import.meta.url), 'utf8');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;

describe('native pick formatting work', () => {
  it.skipIf(!hasSwift)('preserves schools, Unicode, markets and prices without compiling patterns on warm renders', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-format-performance-'));
    try {
      const start = source.indexOf('    static func splitPickAndOdds(');
      // Execute the shipping formatter family. Only the platform feature flag
      // and the regex constructor are wrapped to count actual compilation.
      const functions = source.slice(start, source.indexOf('\n}', start))
        .replace(/\bprivate /g, '')
        .replaceAll('NSRegularExpression(pattern:', 'compile(');
      const script = `import Foundation
import Dispatch
var compilationCount = 0
func compile(_ pattern: String, options: NSRegularExpression.Options = []) throws -> NSRegularExpression {
    compilationCount += 1
    return try NSRegularExpression(pattern: pattern, options: options)
}
enum AppFlags {
    static var storeSafe = false
    static func bridgePickText(_ value: String) -> String { "Bridged" }
}
enum Formatters { ${functions} }
let cases: [(String?, String, String)] = [
    (nil, "", ""), ("", "", ""),
    ("New York Yankees ML -110", "Yankees ML", "-110"),
    ("Boston College +3.5 -115", "Boston College +3.5", "-115"),
    ("Celtics -7.5", "Celtics -7.5", ""),
    ("Toronto Blue Jays -1.5 +150", "Blue Jays -1.5", "+150"),
    ("TOTAL under 54.5 -110", "TOTAL under 54.5", "-110")
]
for (input, pick, odds) in cases {
    precondition(Formatters.splitPickAndOdds(input) == (pick, odds))
}
for school in ["Washington State", "Boston College", "Tennessee Tech", "Jacksonville State", "San José State"] {
    precondition(Formatters.shortenTeamNamesInPick(school + " +7.5") == school + " +7.5")
}
precondition(compilationCount > 0)
let coldCompilations = compilationCount
DispatchQueue.concurrentPerform(iterations: 500) { _ in
    for (input, pick, odds) in cases {
        precondition(Formatters.splitPickAndOdds(input) == (pick, odds))
    }
}
precondition(compilationCount == coldCompilations, "Warm renders must reuse compiled patterns")
AppFlags.storeSafe = true
precondition(Formatters.splitPickAndOdds("Yankees ML -110") == ("Bridged", ""))
print("Formatting passed: 3,500 concurrent warm calls; zero additional compilations")
`;
      const path = join(directory, 'fixture.swift'), binary = join(directory, 'fixture');
      writeFileSync(path, script);
      execFileSync('swiftc', ['-O', '-swift-version', '5', path, '-o', binary], { encoding: 'utf8', timeout: 60_000 });
      expect(execFileSync(binary, [], { encoding: 'utf8', timeout: 20_000 })).toContain('zero additional compilations');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 90_000);
});
