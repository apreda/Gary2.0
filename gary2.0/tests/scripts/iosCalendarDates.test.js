import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const read = name => readFileSync(new URL(`../../../ios/GaryApp/${name}.swift`, import.meta.url), 'utf8');
function block(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing shipping declaration: ${marker}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed shipping declaration: ${marker}`);
}

describe('native calendar calculations', () => {
  it('executes shipping rollover and Billfold dates across DST and device zones', () => {
    const api = read('SupabaseAPI');
    const directory = mkdtempSync(join(tmpdir(), 'gary-calendar-dates-'));
    try {
      const file = join(directory, 'Fixture.swift');
      writeFileSync(file, `import Foundation
enum SupabaseAPI {
${api.match(/static let slateRolloverHourET = \d+/)[0]}
${['static func todayEST(', 'private static func formatDateEST(', 'static func billfoldSnapshotWindowKey(', 'static func dayAfter('].map(m=>block(api,m)).join('\n')}
}
func date(_ iso: String) -> Date { ISO8601DateFormatter().date(from: iso)! }
for zone in ["UTC", "America/New_York", "America/Los_Angeles", "Asia/Tokyo"] {
  NSTimeZone.default = TimeZone(identifier: zone)!
  for (iso, expected) in [
    ("2026-03-08T10:59:00Z", "2026-03-07"),
    ("2026-03-08T11:00:00Z", "2026-03-08"),
    ("2026-11-01T11:59:00Z", "2026-10-31"),
    ("2026-11-01T12:00:00Z", "2026-11-01")
  ] {
    precondition(SupabaseAPI.billfoldSnapshotWindowKey(for: date(iso)) == expected, "Billfold boundary: \\(zone) \\(iso)")
  }
  precondition(SupabaseAPI.todayEST(now: date("2026-03-09T04:30:00Z")) == "2026-03-08")
  precondition(SupabaseAPI.todayEST(now: date("2026-11-01T10:59:00Z")) == "2026-10-31")
  precondition(SupabaseAPI.todayEST(now: date("2026-11-01T11:00:00Z")) == "2026-11-01")
}
print("PASS native date boundaries across four device zones")
`);
      const output = execFileSync('swift', ['-swift-version', '5', file], {encoding:'utf8',timeout:30000});
      expect(output).toContain('PASS native date boundaries across four device zones');
    } finally { rmSync(directory, {recursive:true,force:true}); }
  }, 40000);
});
