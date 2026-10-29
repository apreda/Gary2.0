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
    expect(r).toEqual({ hero: 'reed|receiving_yards', ranked: ['sanders|first_td', 'kraft|anytime_td'], count: 4 });
  });

  it('shows a rung strip only once two rungs have cashed', () => {
    const r = swiftJSON(`${board}
let one = CashRailHit(key: "m", who: "McMillan", market: "Rec yards", price: -115, rungs: [CashRailRung(label: "O 58.5", price: -115)], elapsed: 900, when: "Q1 0:00", play: nil, gary: nil)
out([b.hits[2].showsStrip, one.showsStrip, b.hits[0].showsStrip])`);
    expect(r).toEqual([true, false, false]);
  });

  it('an empty board has no hero and counts nothing', () => {
    const r = swiftJSON(`let e = CashRailBoard(league: "NFL", game_id: "1", status: "live", possession: nil, situation: nil, elapsed_s: 0, clock: nil, hits: [])
out([e.hero == nil, e.ranked.isEmpty, e.cashedCount == 0])`);
    expect(r).toEqual([true, true, true]);
  });
});
