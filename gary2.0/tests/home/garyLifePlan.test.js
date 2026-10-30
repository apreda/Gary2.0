import { describe, it, expect } from 'vitest';
import { hasSwiftCompiler, runSwiftFixture } from '../helpers/swiftFixture.js';

/** Runs a Swift body against Gary's clip plan and returns what it printed as JSON. */
function swiftJSON(body) {
  const script = `import Foundation
func out(_ v: Any) { let d = try! JSONSerialization.data(withJSONObject: v, options: []); print(String(data: d, encoding: .utf8)!) }
typealias C = GaryLifePlan.Clip
${body}`;
  return JSON.parse(runSwiftFixture(['Home/GaryLifePlan.swift'], script).trim());
}

describe.skipIf(!hasSwiftCompiler)('Gary\'s life on Home', () => {
  it('never plays one of the last two clips again, and still plays when only one is left', () => {
    const r = swiftJSON(`
let clips = [C(name: "a", good: 1, bad: 1), C(name: "b", good: 1, bad: 1), C(name: "c", good: 1, bad: 1)]
let rolls = stride(from: 0.0, to: 1.0, by: 0.05).map { $0 }
out([Set(rolls.compactMap { GaryLifePlan.next(from: clips, recent: ["a", "b"], mood: nil, roll: $0) }).sorted(),
     Set(rolls.compactMap { GaryLifePlan.next(from: clips, recent: ["b"], mood: nil, roll: $0) }).sorted(),
     [GaryLifePlan.next(from: [C(name: "a", good: 1, bad: 1)], recent: ["a"], mood: nil, roll: 0.5) ?? "nil"],
     [GaryLifePlan.next(from: [], recent: [], mood: nil, roll: 0.5) ?? "nil"]])`);
    expect(r).toEqual([['c'], ['a', 'c'], ['a'], ['nil']]);
  });

  it('last night tilts the odds: a good night leans to the good-night clips, a bad one to the others', () => {
    const r = swiftJSON(`
let clips = [C(name: "cigar", good: 9, bad: 1), C(name: "paper", good: 1, bad: 9)]
out([GaryLifePlan.next(from: clips, recent: [], mood: "GaryFire", roll: 0.85) ?? "nil",
     GaryLifePlan.next(from: clips, recent: [], mood: "GaryDoomsday", roll: 0.15) ?? "nil",
     GaryLifePlan.next(from: clips, recent: [], mood: nil, roll: 0.4) ?? "nil"])`);
    expect(r).toEqual(['cigar', 'paper', 'cigar']);
  });

  it('a rare clip (the fourth-wall phone) only comes up when allowed, and then like any other', () => {
    const r = swiftJSON(`
let clips = [C(name: "a", good: 1, bad: 1), C(name: "phone", good: 1, bad: 1, rare: true)]
let rolls = stride(from: 0.0, to: 1.0, by: 0.05).map { $0 }
out([Set(rolls.compactMap { GaryLifePlan.next(from: clips, recent: [], mood: nil, roll: $0, rareAllowed: false) }).sorted(),
     Set(rolls.compactMap { GaryLifePlan.next(from: clips, recent: [], mood: nil, roll: $0, rareAllowed: true) }).sorted(),
     [GaryLifePlan.rareAllowed(first: true, lastRareDay: nil, today: "2026-10-30"),
      GaryLifePlan.rareAllowed(first: false, lastRareDay: nil, today: "2026-10-30"),
      GaryLifePlan.rareAllowed(first: false, lastRareDay: "2026-10-30", today: "2026-10-30"),
      GaryLifePlan.rareAllowed(first: false, lastRareDay: "2026-10-29", today: "2026-10-30")]])`);
    expect(r).toEqual([['a'], ['a', 'phone'], [false, true, false, true]]);
  });

  it('stands a beat on arrival, then a few seconds between clips', () => {
    const r = swiftJSON(`out([GaryLifePlan.stand(first: true, roll: 0), GaryLifePlan.stand(first: true, roll: 0.999),
     GaryLifePlan.stand(first: false, roll: 0), GaryLifePlan.stand(first: false, roll: 0.999)])`);
    expect(r[0]).toBeCloseTo(1.5, 2);
    expect(r[1]).toBeCloseTo(3, 2);
    expect(r[2]).toBeCloseTo(2.5, 2);
    expect(r[3]).toBeCloseTo(7, 2);
  });
});
