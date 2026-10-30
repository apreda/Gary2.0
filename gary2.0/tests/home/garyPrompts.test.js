import { describe, it, expect } from 'vitest';
import { hasSwiftCompiler, runSwiftFixture } from '../helpers/swiftFixture.js';

const MODEL = ['Home/HomeGaryPrompts.swift'];

/** Runs a Swift body against the shipping prompt model and returns what it printed as JSON. */
function swiftJSON(body) {
  const script = `import Foundation
func out(_ v: Any) { let d = try! JSONSerialization.data(withJSONObject: v, options: [.sortedKeys]); print(String(data: d, encoding: .utf8)!) }
func row(_ p: GaryPrompt?) -> Any {
  guard let p else { return NSNull() }
  return ["spot": p.spot.rawValue, "key": p.key ?? NSNull(), "kicker": p.kicker, "newKicker": p.newKicker ?? NSNull(),
          "news": p.news, "hook": p.hook ?? NSNull(), "hookWins": p.hookWins] as [String: Any]
}
typealias D = GaryPrompts.Dart
${body}`;
  return JSON.parse(runSwiftFixture(MODEL, script).trim());
}

describe.skipIf(!hasSwiftCompiler)('Gary prompts around Home', () => {
  it('darts: up for the night until one hits, then the biggest hit by name', () => {
    const r = swiftJSON(`
let up = [D(id: 1, player: "Toumani Camara", kind: "threes", prop: "threes 2.5", bet: "over", odds: 117, result: nil),
          D(id: 2, player: "Tucker Kraft", kind: "td", prop: "anytime_td 0.5", bet: "over", odds: 170, result: nil),
          D(id: 3, player: "Zion Williamson", kind: "ast", prop: "assists 3.5", bet: "under", odds: -172, result: nil)]
var hit = up
hit[0] = D(id: 1, player: "Toumani Camara", kind: "threes", prop: "threes 2.5", bet: "over", odds: 117, result: "hit")
var two = hit
two[1] = D(id: 2, player: "Tucker Kraft", kind: "td", prop: "anytime_td 0.5", bet: "over", odds: 170, result: "hit")
out([row(GaryPrompts.darts(date: "2026-10-29", today: up, yesterdayHits: [])),
     row(GaryPrompts.darts(date: "2026-10-29", today: hit, yesterdayHits: [])),
     row(GaryPrompts.darts(date: "2026-10-29", today: two, yesterdayHits: [])),
     row(GaryPrompts.darts(date: "2026-10-30", today: [], yesterdayHits: [two[0], two[1]])),
     row(GaryPrompts.darts(date: "2026-10-30", today: [], yesterdayHits: []))])`);
    expect(r[0]).toEqual({ spot: 'pocket', key: 'darts-up:2026-10-29', kicker: 'DARTS', newKicker: 'JUST IN',
      news: '3 DARTS\nUP TONIGHT', hook: 'LONGEST +170', hookWins: false });
    expect(r[1]).toMatchObject({ key: 'darts-hit:2026-10-29:1', kicker: 'A DART HIT', news: 'CAMARA\n3+ THREES', hook: '+117', hookWins: true });
    expect(r[2]).toMatchObject({ key: 'darts-hit:2026-10-29:2', kicker: '2 DARTS HIT', news: 'KRAFT\nSCORED', hook: '+170' });
    // The morning before the new darts: last night's hits, never news.
    expect(r[3]).toMatchObject({ key: null, kicker: 'LAST NIGHT', news: '2 DARTS\nHIT', hook: '+170', hookWins: true });
    expect(r[4]).toBeNull();
  });

  it('parlay: coming, just in, legs landing, hit; a miss is not news', () => {
    const r = swiftJSON(`
let p = { (result: String?, landed: Int) in GaryPrompts.Parlay(odds: 442, result: result, landed: landed, legs: 3) }
out([row(GaryPrompts.parlay(date: "2026-10-29", today: nil, yesterday: nil)),
     row(GaryPrompts.parlay(date: "2026-10-29", today: p(nil, 0), yesterday: nil)),
     row(GaryPrompts.parlay(date: "2026-10-29", today: p(nil, 2), yesterday: nil)),
     row(GaryPrompts.parlay(date: "2026-10-29", today: p("won", 3), yesterday: nil)),
     row(GaryPrompts.parlay(date: "2026-10-29", today: p("lost", 1), yesterday: nil)),
     row(GaryPrompts.parlay(date: "2026-10-30", today: nil, yesterday: p("won", 3)))])`);
    expect(r[0]).toMatchObject({ spot: 'cigar', key: null, kicker: 'COMING TONIGHT', news: 'PARLAY OF\nTHE DAY', hook: null });
    expect(r[1]).toMatchObject({ key: 'parlay:2026-10-29', kicker: 'PARLAY', newKicker: 'JUST IN', hook: '+442', hookWins: false });
    expect(r[2]).toMatchObject({ key: 'parlay-legs:2026-10-29:2', kicker: '2 OF 3 IN', hook: '+442' });
    expect(r[3]).toMatchObject({ key: 'parlay-won:2026-10-29', kicker: 'IT HIT', hook: '+442', hookWins: true });
    expect(r[4]).toMatchObject({ key: null, kicker: 'PARLAY', hook: '+442', hookWins: false });
    expect(r[5]).toMatchObject({ key: null, kicker: 'LAST NIGHT', news: 'THE PARLAY\nHIT', hook: '+442', hookWins: true });
  });

  it('picks: the slate until Gary picks, then new again with every pick that lands', () => {
    const r = swiftJSON(`
out([row(GaryPrompts.picks(date: "2026-10-30", picks: 0, games: 11)),
     row(GaryPrompts.picks(date: "2026-10-30", picks: 3, games: 11)),
     row(GaryPrompts.picks(date: "2026-10-30", picks: 11, games: 11)),
     row(GaryPrompts.picks(date: "2026-10-30", picks: 0, games: 0))])`);
    expect(r[0]).toMatchObject({ spot: 'shoe', key: null, kicker: 'PICKS', news: '11 GAMES\nTONIGHT', hook: null });
    expect(r[1]).toMatchObject({ key: 'picks:2026-10-30:3', kicker: 'PICKS', newKicker: 'JUST IN', news: "GARY'S PICKS\nARE IN", hook: '3 OF 11 GAMES' });
    expect(r[2]).toMatchObject({ key: 'picks:2026-10-30:11', hook: 'ALL 11 GAMES' });
    expect(r[3]).toBeNull();
  });
});
