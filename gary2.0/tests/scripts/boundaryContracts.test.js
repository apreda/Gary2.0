import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { pickGameDate } from '../../scripts/lib/picks/calendar.js';
import { decodeBdlRows, decodeBdlSdkRows } from '../../src/services/bdlResponse.js';
import { finiteMarketNumber } from '../../src/services/marketTruth.js';
import { gameTicketIdentity, propTicketIdentity } from '../../src/services/pickdesk/ticketIdentity.js';
import { hasSwiftCompiler, runSwiftFixture } from '../helpers/swiftFixture.js';

const fixture = JSON.parse(readFileSync(new URL('../../../contracts/boundary-fixtures.json', import.meta.url), 'utf8'));

describe('shared boundary examples', () => {
  it.each(fixture.calendar)('keeps calendar and slate ownership distinct at $instant', row => {
    expect(pickGameDate('MLB', row.instant)).toBe(row.easternDate);
    expect(pickGameDate('NFL', row.instant)).toBe(row.easternDate);
    expect(pickGameDate('NCAAF', row.instant)).toBe(row.slateDate);
  });
  it.each(fixture.marketNumbers)('keeps missing market measurements separate from $input', row => {
    expect(finiteMarketNumber(row.input)).toBe(row.expected);
  });
  it.each(fixture.envelopes)('validates the response envelope: $input', row => {
    for (const decode of [decodeBdlRows, decodeBdlSdkRows]) {
      if (row.error) expect(() => decode(row.input)).toThrow(/invalid response shape/);
      else expect(decode(row.input)).toEqual(row.expected);
    }
  });
  it('retains exact ticket dimensions, including zero lines and historical formatting', () => {
    const game = Object.freeze({ game_date: '2026-09-19', league: 'MLB', game_id: 123, pick_text: 'Away ML +120' });
    const prop = Object.freeze({ game_date: '2026-09-19', sport: 'NFL', game_id: 123, player_name: 'Player', prop_type: 'passing_yards', line_value: 0, bet: 'over' });
    expect(gameTicketIdentity(game)).toBe('["2026-09-19","mlb","123","away ml +120"]');
    expect(propTicketIdentity(prop)).toBe('["2026-09-19","nfl","123","player","passing_yards",0,"over"]');
    for (const change of [{ game_id: 124 }, { game_date: '2026-09-20' }, { pick_text: 'Away ML +125' }]) {
      expect(gameTicketIdentity({ ...game, ...change })).not.toBe(gameTicketIdentity(game));
    }
    for (const change of [{ game_id: 124 }, { line_value: 0.5 }, { bet: 'under' }, { player_name: 'Other' }]) {
      expect(propTicketIdentity({ ...prop, ...change })).not.toBe(propTicketIdentity(prop));
    }
    expect(propTicketIdentity({ ...prop, line_value: null })).toBeNull();
    expect(propTicketIdentity({ ...prop, bet: 'yes' })).toBeNull();
    // Preserve the historical shape-only rule; exact calendar validation is a separate boundary.
    expect(gameTicketIdentity({ ...game, game_date: '2026-02-31' })).not.toBeNull();
  });
  it.skipIf(!hasSwiftCompiler)('runs the same calendar and identity examples through the complete native decoder', () => {
    const script = `import Foundation
let document = #"""
${JSON.stringify(fixture)}
"""#
let fixtures = try! JSONSerialization.jsonObject(with: Data(document.utf8)) as! [String: Any]
for row in fixtures["calendar"] as! [[String: String]] {
    let instant = ISO8601DateFormatter().date(from: row["instant"]!)!
    precondition(ExactGameIdentity.easternDate(of: instant) == row["easternDate"])
}
for item in fixtures["providerIdentity"] as! [[String: Any]] {
    let row = item["row"] as! [String: Any]
    do {
        let identity = try ExactGameIdentity.canonicalProviderID(in: row)
        precondition(item["error"] as? Bool != true)
        if item["expected"] is NSNull { precondition(identity == nil) }
        else { precondition(identity == (item["expected"] as! NSNumber).intValue) }
    } catch { precondition(item["error"] as? Bool == true) }
}
precondition(ExactGameIdentity(date: "2026-02-31", gameID: 123) == nil)
precondition(ExactGameIdentity(date: "2028-02-29", gameID: 123) != nil)
print("Shared native calendar and provider identity examples passed")
`;
    expect(runSwiftFixture(['Models/ProviderIdentity.swift'], script)).toContain('Shared native calendar and provider identity examples passed');
  }, 70_000);
});
