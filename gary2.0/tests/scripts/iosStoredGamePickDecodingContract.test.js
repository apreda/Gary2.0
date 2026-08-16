import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../../../ios/GaryApp/SupabaseAPI.swift', import.meta.url), 'utf8');
const views = readFileSync(new URL('../../../ios/GaryApp/Views.swift', import.meta.url), 'utf8');

const normalizer = api.slice(
  api.indexOf('private static func normalizeStoredGamePickPayload'),
  api.indexOf('static func parsePicksRow'),
);
const parser = api.slice(
  api.indexOf('static func parsePicksRow'),
  api.indexOf('private static func validateStoredGamePicks'),
);
const homeJoin = views.slice(
  views.indexOf('private static func homeBoardPick(_ pick: GaryPick, league:'),
  views.indexOf('private func sheetStoredOutcome'),
);

describe('iOS stored game-pick decoding', () => {
  it('canonicalizes the existing numeric/string betting fields before strict decoding', () => {
    expect(normalizer).toContain('["spread", "moneylineHome", "moneylineAway"]');
    expect(normalizer).toContain('["spread_odds", "ml"]');
    expect(normalizer).toContain('Double(text.trimmingCharacters(in: .whitespacesAndNewlines))');
    expect(normalizer).toContain('number.doubleValue > 0 ? "+\\(text)" : text');
    expect(normalizer).toContain('value > 0 && !trimmed.hasPrefix("+") ? "+\\(trimmed)" : trimmed');
    expect(normalizer).toContain('books[bookIndex][key] = canonical');
    expect(parser).toContain('let normalized = try normalizeStoredGamePickPayload(data)');
    expect(parser).toContain('try JSONDecoder().decode([GaryPick].self, from: normalized)');
  });

  it('routes direct arrays through the same canonical representation', () => {
    expect(parser).toContain('if let arr = picks.asArray');
    expect(parser).toContain('data = try JSONEncoder().encode(arr)');
    expect(parser).not.toContain('if let arr = picks.asArray { return arr }');
    expect(parser.match(/normalizeStoredGamePickPayload\(data\)/g)).toHaveLength(1);
  });

  it('keeps malformed payloads fail-closed instead of lossy-decoding individual picks', () => {
    expect(normalizer).toContain('Stored picks payload is not an object array');
    expect(parser).not.toContain('compactMap');
    expect(api).toContain('try validateStoredGamePicks(decoded, source: "daily_picks")');
    expect(api).toContain('picks.allSatisfy(\\.hasValidStoredPayload)');
  });
});

describe('Home MLB board identity', () => {
  it('continues to join a posted call to its slate row by exact provider game id', () => {
    expect(homeJoin).toContain('if let gameID, let pickID = pick.game_id');
    expect(homeJoin).toContain('return gameID == pickID');
    expect(views).toContain('let calls = todayPicks.filter { Self.homeBoardPick($0, matches: g) }');
  });
});
