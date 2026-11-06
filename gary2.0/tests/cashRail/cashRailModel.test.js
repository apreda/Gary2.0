import { describe, expect, it } from 'vitest';
import { hasSwiftCompiler, runSwiftFixture } from '../helpers/swiftFixture.js';

const MODEL = ['Home/CashRail/CashRailModel.swift'];

/** Runs a Swift body against the shipping model and returns what it printed as JSON. */
function swiftJSON(body) {
  const script = `import Foundation
func out(_ v: Any) { let d = try! JSONSerialization.data(withJSONObject: v, options: [.sortedKeys]); print(String(data: d, encoding: .utf8)!) }
${body}`;
  return JSON.parse(runSwiftFixture(MODEL, script).trim());
}

const board = `
let boardJSON = """
{"league":"NFL","game_id":"1392323","status":"live","possession":"GB","situation":"2ND & 11 · CAR 21","elapsed_s":1100,"clock":"Q2 0:00",
 "hits":[
  {"key":"sanders|first_td","who":"Ja'Tavion Sanders","market":"First TD scorer","price":2200,"elapsed":205,"when":"Q1 11:35","play":"14-yd TD catch"},
  {"key":"kraft|anytime_td","who":"Tucker Kraft","market":"Anytime TD","price":250,"elapsed":520,"when":"Q1 6:20","play":"9-yd TD catch"},
  {"key":"reed|receiving_yards","who":"Jayden Reed","market":"Rec yards","price":185,"rungs":[{"label":"O 52.5","price":-115},{"label":"70+","price":185}],"elapsed":1060,"when":"Q2 12:20","play":"24-yd catch · 68 yds","gary":true}
 ]}
"""
let b = try! JSONDecoder().decode(CashRailBoard.self, from: Data(boardJSON.utf8))
`;

describe.skipIf(!hasSwiftCompiler)('Cash Rail board model', () => {
  it('formats prices with a true minus sign', () => {
    const r = swiftJSON(`out([CashRailFormat.price(2200), CashRailFormat.price(-115), CashRailFormat.price(100)])`);
    expect(r).toEqual(['+2200', '−115', '+100']);
  });

  it('formats what $10 would have paid', () => {
    const r = swiftJSON(`out([CashRailFormat.payout10(-115), CashRailFormat.payout10(1100), CashRailFormat.payout10(100), CashRailFormat.payout10(-110), CashRailFormat.payout10(250)])`);
    expect(r).toEqual(['$18.70', '$120', '$20', '$19.09', '$35']);
  });

  it('puts the latest landing in the hero and ranks the rest by price', () => {
    const r = swiftJSON(`${board}
out(["hero": b.hero!.key, "ranked": b.ranked.map { $0.key }, "count": b.cashedCount] as [String: Any])`);
    expect(r).toEqual({ hero: 'reed|receiving_yards', ranked: ['sanders|first_td', 'kraft|anytime_td'], count: 3 });
  });

  it('once the game is final, the hero is the night\'s biggest hit, not the last one to settle', () => {
    const r = swiftJSON(`${board}
let f = CashRailBoard(league: b.league, game_id: b.game_id, status: "final", possession: nil, situation: nil, elapsed_s: 3600, clock: "FINAL", hits: b.hits + [CashRailHit(key: "game|spread|home|-3.5", who: "Packers", market: "Spread", price: -102, rungs: nil, elapsed: 3600, when: "FINAL", play: nil, gary: true)])
out([f.hero!.key, f.ranked.first!.key])`);
    expect(r).toEqual(['sanders|first_td', 'kraft|anytime_td']);
  });

  const celebrationKit = `
func hit(_ key: String, _ price: Int, _ elapsed: Int) -> CashRailHit {
  CashRailHit(key: key, who: "x", market: "m", price: price, rungs: nil, elapsed: elapsed, when: "Q1", play: nil, gary: nil)
}
func cele(_ key: String, _ kind: String, _ price: Int, _ ready: String) -> CashRailCelebration {
  CashRailCelebration(play_key: key, who: "x", market: "m", price: price, when_label: nil, play: nil, kind: kind, dance: "d", team: nil, number: nil, ready_at: ready,
                      assets: .init(bg: "b", frames: [:], seq: [], name: "n"))
}
let now = ISO8601DateFormatter().date(from: "2026-11-06T04:00:00Z")!
`;

  it('on a touchdown play the hero is the touchdown, even when another bet on that play paid more', () => {
    const r = swiftJSON(`${celebrationKit}
let live = CashRailBoard(league: "NFL", game_id: "1", status: "live", possession: nil, situation: nil, elapsed_s: 1742, clock: "Q2 0:58",
  hits: [hit("1057|longest_reception", 445, 1742), hit("1057|anytime_td|1", 170, 1742), hit("1057|receiving_yards", -114, 1742), hit("42|passing_yards", 900, 1000)])
out([live.hero!.key])`);
    expect(r).toEqual(['1057|anytime_td|1']);
  });

  it('a hit replays a celebration only when its own bet earned it, never a yardage bet on the same touchdown', () => {
    const r = swiftJSON(`${celebrationKit}
let known = ["518@3165": cele("518@3165", "td", 575, "2026-11-06T03:56:00Z"), "33@2350": cele("33@2350", "big", 1720, "2026-11-06T03:18:00Z")]
func replays(_ h: CashRailHit) -> String { h.celebration(in: known)?.play_key ?? "none" }
out([replays(hit("518|anytime_td|1", 575, 3165)), replays(hit("518|first_td", 600, 3165)), replays(hit("518|rushing_yards", 3200, 3165)), replays(hit("518|longest_rush", 186, 3165)),
     replays(hit("33|receiving_yards", 1720, 2350)), replays(hit("33|receptions", 198, 2350)),
     replays(hit("9|anytime_td|1", 200, 100)), replays(hit("game|ml|home", 900, 3600))])`);
    expect(r).toEqual(['518@3165', '518@3165', 'none', 'none', '33@2350', 'none', 'none', 'none']);
  });

  it('plays only the latest play on its own, and only while it is news; older ones wait for a tap', () => {
    const r = swiftJSON(`${celebrationKit}
let older = cele("7@100", "big", 3200, "2026-11-06T03:59:30Z")
let latest = cele("8@900", "td", 170, "2026-11-06T03:59:00Z")
let stale = cele("8@900", "td", 170, "2026-11-06T03:54:59Z")
func next(_ rows: [CashRailCelebration], _ seen: Set<String> = []) -> String { CashRailCelebration.next(rows, seen: seen, now: now)?.play_key ?? "none" }
out([next([older, latest]), next([older, latest], ["8@900"]), next([older, stale]), next([])])`);
    expect(r).toEqual(['8@900', 'none', 'none', 'none']);
  });

  it('decodes a celebration with its dance routine', () => {
    const json = JSON.stringify({ play_key: '935@592', who: 'Tucker Kraft', market: 'First TD scorer', price: 1100, when_label: 'Q1 5:08', play: '12-yd TD catch', kind: 'td', dance: 'bird', team: 'GB', number: '85', ready_at: '2026-10-30T03:45:39Z',
      assets: { bg: 'https://x/bg.webp', name: 'THE DIRTY BIRD', frames: { db1: 'https://x/1.webp', db2: 'https://x/2.webp' }, seq: [['db1', 420, ''], ['db2', 230, 'rise']] } });
    const r = swiftJSON(`let j = #"${json}"#
let c = try! JSONDecoder().decode(CashRailCelebration.self, from: Data(j.utf8))
let d = try! JSONDecoder().decode(CashRailCelebration.Assets.self, from: Data(#"{"bg":"b","frames":{},"seq":[],"name":"THE GOALPOST DUNK","prop":"goalpost"}"#.utf8))
out([c.id, c.assets.seq.count, c.assets.seq[1].slug, c.assets.seq[1].hold, c.assets.seq[1].move, c.assets.frames.count, c.assets.name, c.assets.prop ?? "none", d.prop ?? "none"] as [Any])`);
    expect(r).toEqual(['935@592', 2, 'db2', 230, 'rise', 2, 'THE DIRTY BIRD', 'none', 'goalpost']);
  });

  it('shows a rung strip only once two rungs have cashed', () => {
    const r = swiftJSON(`${board}
let one = CashRailHit(key: "m", who: "McMillan", market: "Rec yards", price: -115, rungs: [CashRailRung(label: "O 58.5", price: -115)], elapsed: 900, when: "Q1 0:00", play: nil, gary: nil)
out([b.hits[2].showsStrip, one.showsStrip, b.hits[0].showsStrip])`);
    expect(r).toEqual([true, false, false]);
  });

  it('an over and a milestone at the same mark are one rung (O 0.5 is 1+), so a ladder with nothing to climb draws no strip', () => {
    const r = swiftJSON(`
func h(_ rungs: [(String, Int)]) -> CashRailHit {
  CashRailHit(key: "k", who: "Maxey", market: "Blocks", price: rungs.last!.1, rungs: rungs.map { CashRailRung(label: $0.0, price: $0.1) }, elapsed: 60, when: "Q1 7:19", play: nil, gary: nil)
}
let blocks = h([("O 0.5", 127), ("1+", 128)])
let catches = h([("O 2.5", -111), ("3+", -118), ("4+", 194), ("5+", 400)])
out([blocks.climb.map(\\.label), [blocks.showsStrip], catches.climb.map(\\.label), catches.climb.map(\\.price), [blocks.displayMarket]] as [Any])`);
    expect(r).toEqual([['1+'], [false], ['3+', '4+', '5+'], [-118, 194, 400], ['Blocks 1+']]);
  });

  it('Gary\'s bet on the scoreboard tracks live: winning or losing by how much, then won or lost', () => {
    const r = swiftJSON(`
func g(_ pick: String, _ a: Int?, _ h: Int?, final: Bool = false) -> [Any] {
  guard let b = CashRailFormat.garyBet(pick: pick, away: "Knicks", home: "76ers", awayScore: a, homeScore: h, final: final) else { return ["nil"] }
  return [b.label, b.status ?? "none", b.tone]
}
out([g("76ers +1.5", 23, 33), g("Knicks \\u{2212}3.5", 23, 33), g("Philadelphia 76ers -1.5", 30, 31), g("76ers ML", 23, 33),
     g("Over 227.5", 100, 110), g("Over 227.5", 120, 110), g("Under 227.5", 100, 110),
     g("76ers +1.5", 110, 108, final: true), g("Knicks -2", 110, 108, final: true), g("Knicks -3.5", 110, 108, final: true),
     g("76ers +1.5", nil, nil), g("", 1, 2), g("\u{2191} 227.5", 100, 110), g("76ERS ML -130", 23, 33)])`);
    expect(r).toEqual([
      ['76ERS +1.5', 'WINNING BY 11.5', 1],
      ['KNICKS −3.5', 'LOSING BY 13.5', -1],
      ['76ERS −1.5', 'LOSING BY 0.5', -1],
      ['76ERS ML', 'WINNING BY 10', 1],
      ['OVER 227.5', 'NEEDS 18 MORE', 0],
      ['OVER 227.5', 'CASHED', 1],
      ['UNDER 227.5', '17.5 TO SPARE', 1],
      ['76ERS +1.5', 'LOST', -1],
      ['KNICKS −2', 'PUSH', 0],
      ['KNICKS −3.5', 'LOST', -1],
      ['76ERS +1.5', 'none', 0],
      ['nil'],
      ['OVER 227.5', 'NEEDS 18 MORE', 0],
      ['76ERS ML', 'WINNING BY 10', 1],
    ]);
  });

  it('names a ladder by its top cashed rung', () => {
    const r = swiftJSON(`${board}
let over = CashRailHit(key: "m", who: "McMillan", market: "Rec yards", price: -115, rungs: [CashRailRung(label: "O 58.5", price: -115)], elapsed: 900, when: "Q1 0:00", play: nil, gary: nil)
out([b.hits[2].displayMarket, over.displayMarket, b.hits[0].displayMarket])`);
    expect(r).toEqual(['Rec yards 70+', 'Rec yards over 58.5', 'First TD scorer']);
  });

  it('bills prime-time NFL games by night and everything else as NFL', () => {
    const r = swiftJSON(`let iso = ISO8601DateFormatter()
out([CashRailFormat.billing(league: "NFL", commence: iso.date(from: "2026-10-30T00:15:00Z")),
     CashRailFormat.billing(league: "NFL", commence: iso.date(from: "2026-11-02T01:20:00Z")),
     CashRailFormat.billing(league: "NFL", commence: iso.date(from: "2026-11-03T01:15:00Z")),
     CashRailFormat.billing(league: "NFL", commence: iso.date(from: "2026-11-01T18:00:00Z")),
     CashRailFormat.billing(league: "nfl", commence: nil)])`);
    expect(r).toEqual(['THURSDAY NIGHT FOOTBALL', 'SUNDAY NIGHT FOOTBALL', 'MONDAY NIGHT FOOTBALL', 'NFL', 'NFL']);
  });

  it('turns NFL, NBA and college big games into the scoreboard, and bills each by name', () => {
    const r = swiftJSON(`out([CashRailFormat.hasScoreboard("NFL"), CashRailFormat.hasScoreboard("nba"), CashRailFormat.hasScoreboard("NCAAF"),
     CashRailFormat.hasScoreboard("NHL"), CashRailFormat.hasScoreboard(nil), CashRailFormat.billing(league: "NBA", commence: nil),
     CashRailFormat.billing(league: "NCAAF", commence: nil)])`);
    expect(r).toEqual([true, true, true, false, false, 'NBA', 'COLLEGE FOOTBALL']);
  });

  it('an empty board has no hero and counts nothing', () => {
    const r = swiftJSON(`let e = CashRailBoard(league: "NFL", game_id: "1", status: "live", possession: nil, situation: nil, elapsed_s: 0, clock: nil, hits: [])
out([e.hero == nil, e.ranked.isEmpty, e.cashedCount == 0])`);
    expect(r).toEqual([true, true, true]);
  });
});
