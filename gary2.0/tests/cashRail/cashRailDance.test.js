import { describe, expect, it } from 'vitest';
import { hasSwiftCompiler, runSwiftFixture } from '../helpers/swiftFixture.js';

const FILES = ['Home/CashRail/CashRailModel.swift', 'Home/CashRail/CashRailDance.swift'];

function swiftJSON(body) {
  const script = `import Foundation
func out(_ v: Any) { let d = try! JSONSerialization.data(withJSONObject: v, options: [.sortedKeys]); print(String(data: d, encoding: .utf8)!) }
func r(_ x: Double) -> Double { (x * 1000).rounded() / 1000 }
${body}`;
  return JSON.parse(runSwiftFixture(FILES, script).trim());
}

const bird = `let seq = [CashRailCelebration.Step(slug: "db1", hold: 420, move: ""), CashRailCelebration.Step(slug: "db2", hold: 230, move: "rise"),
  CashRailCelebration.Step(slug: "db3", hold: 230, move: "drop"), CashRailCelebration.Step(slug: "db2", hold: 230, move: "rise"),
  CashRailCelebration.Step(slug: "db5", hold: 1900, move: "air")]
let t = CashRailDance.Timeline(seq: seq)
`;

const cel = (key, price, readyAt) => `CashRailCelebration(play_key: "${key}", who: "W", market: "M", price: ${price}, when_label: nil, play: nil, kind: "td", dance: "bird", team: "GB", number: "85", ready_at: ${readyAt ? `"${readyAt}"` : 'nil'}, assets: .init(bg: "", frames: [:], seq: [], name: "N"))`;

describe.skipIf(!hasSwiftCompiler)('Gary\'s dance, frame by frame', () => {
  it('starts the routine after the backdrop lands and steps on each hold', () => {
    const r = swiftJSON(`${bird}
out([t.step(at: 0.1) == nil, t.step(at: 0.28)!, t.step(at: 0.699)!, t.step(at: 0.70)!, t.step(at: 9)!, r(t.lastStart), r(t.end)] as [Any])`);
    expect(r).toEqual([true, 0, 0, 1, 4, 1.39, 3.29]);
  });

  it('moves the way the approved mock moves: a hop lifts then settles, a side step ends off center', () => {
    const r = swiftJSON(`let h0 = CashRailDance.pose(move: "hop", progress: 0), h1 = CashRailDance.pose(move: "hop", progress: 1)
let l1 = CashRailDance.pose(move: "left", progress: 1), none = CashRailDance.pose(move: "", progress: 0.5)
let p = CashRailDance.pose(move: "pop", progress: 0.4)
out([r(h0.ty), r(h1.ty), r(l1.tx), r(none.sx), r(none.ty), r(p.sx)])`);
    expect(r).toEqual([-0.03, 0, -0.04, 1, 0, 1.05]);
  });

  it('springs past the mark with the mock\'s overshoot easing', () => {
    const r = swiftJSON(`let e = CashRailDance.Ease(0.3, 1.2, 0.5, 1)
out([r(e(0)), r(e(1)), (0..<100).map { e(Double($0) / 100) }.max()! > 1])`);
    expect(r).toEqual([0, 1, true]);
  });

  it('cross-fades each new frame in over 70ms while the old one fades out, and holds a repeated frame', () => {
    const r = swiftJSON(`${bird}
out([r(t.opacity("db1", at: 0.70)), r(t.opacity("db2", at: 0.70)), r(t.opacity("db2", at: 0.735)), r(t.opacity("db1", at: 0.80)), r(t.opacity("db5", at: 0.5))])`);
    expect(r).toEqual([1, 0, 0.5, 0, 0]);
  });

  it('keeps each frame\'s last move: a frame shown again restarts its own move', () => {
    const r = swiftJSON(`${bird}
let a = t.pose("db2", at: 0.70), b = t.pose("db2", at: 1.16)
out([r(a.ty), r(b.ty)])`);
    expect(r).toEqual([0.02, 0.02]);
  });
});

describe.skipIf(!hasSwiftCompiler)('which celebration plays', () => {
  it('plays the biggest fresh one not yet seen, and never one older than 20 minutes', () => {
    const r = swiftJSON(`let now = ISO8601DateFormatter().date(from: "2026-10-30T04:00:00Z")!
let rows = [${cel('a@1', 1100, '2026-10-30T03:45:39.873+00:00')}, ${cel('b@2', 1500, '2026-10-30T03:30:00+00:00')}, ${cel('c@3', 900, '2026-10-30T03:58:00.1+00:00')}, ${cel('d@4', 5000, null)}]
out([CashRailCelebration.next(rows, seen: [], now: now)?.play_key ?? "nil",
     CashRailCelebration.next(rows, seen: ["a@1"], now: now)?.play_key ?? "nil",
     CashRailCelebration.next(rows, seen: ["a@1", "c@3"], now: now)?.play_key ?? "nil"])`);
    expect(r).toEqual(['a@1', 'c@3', 'nil']);
  });

  it('finds the play a hit came from, but never for a game line', () => {
    const r = swiftJSON(`let td = CashRailHit(key: "935|first_td", who: "Kraft", market: "First TD", price: 1100, rungs: nil, elapsed: 592, when: "Q1 5:08", play: nil, gary: nil)
let gl = CashRailHit(key: "game|spread|home|-3.5", who: "Packers", market: "Spread", price: -102, rungs: nil, elapsed: 3600, when: "FINAL", play: nil, gary: true)
out([td.playKey ?? "nil", gl.playKey ?? "nil"])`);
    expect(r).toEqual(['935@592', 'nil']);
  });
});

describe.skipIf(!hasSwiftCompiler)('trimming Gary out of his canvas', () => {
  it('finds the figure\'s box and its center of mass, ignoring faint edge pixels', () => {
    const r = swiftJSON(`var a = [UInt8](repeating: 0, count: 10 * 10)
for y in 2...8 { for x in 3...5 { a[y * 10 + x] = 255 } }
a[9 * 10 + 9] = 20
a[8 * 10 + 6] = 255
let f = CashRailDance.figure(alpha: a, width: 10, height: 10)!
out([f.minX, f.minY, f.maxX, f.maxY, r(f.cx)])`);
    expect(r).toEqual([3, 2, 6, 8, 0.398]);
  });
});
