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

  it('puts the spread and Gary\'s pick under the team names', () => {
    const r = swiftJSON(`out([
  CashRailFormat.marketLine(oddsLine: "CAR +130 · GB -155 · O/U 46.5 · RL GB -2.5", pickLine: "Packers -2.5") ?? "nil",
  CashRailFormat.marketLine(oddsLine: "CAR +130 · GB -155 · O/U 46.5 · RL GB -2.5", pickLine: nil) ?? "nil",
  CashRailFormat.marketLine(oddsLine: "O/U 46.5", pickLine: "Over 46.5") ?? "nil",
  CashRailFormat.marketLine(oddsLine: nil, pickLine: nil) ?? "nil"])`);
    expect(r).toEqual(['GB −2.5 · GARY PACKERS −2.5', 'GB −2.5', 'O/U 46.5 · GARY OVER 46.5', 'nil']);
  });

  it('falls back to the board\'s frozen spread when the slate row has none', () => {
    const r = swiftJSON(`out([
  CashRailFormat.marketLine(oddsLine: "O/U 46.5", pickLine: "Packers -3.5", spread: "GB -3.5") ?? "nil",
  CashRailFormat.marketLine(oddsLine: "RL GB -2.5", pickLine: nil, spread: "GB -3.5") ?? "nil"])`);
    expect(r).toEqual(['GB −3.5 · GARY PACKERS −3.5', 'GB −2.5']);
  });

  it('an empty board has no hero and counts nothing', () => {
    const r = swiftJSON(`let e = CashRailBoard(league: "NFL", game_id: "1", status: "live", possession: nil, situation: nil, elapsed_s: 0, clock: nil, hits: [])
out([e.hero == nil, e.ranked.isEmpty, e.cashedCount == 0])`);
    expect(r).toEqual([true, true, true]);
  });
});
