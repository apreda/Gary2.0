import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const read = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;
function declaration(source, start, indent = '') {
  const begin = source.indexOf(start);
  if (begin < 0) throw new Error(`Missing actual Swift declaration: ${start}`);
  const end = source.indexOf(`\n${indent}}`, begin);
  if (end < 0) throw new Error(`Unclosed actual Swift declaration: ${start}`);
  return source.slice(begin, end + indent.length + 2);
}

describe('native exact game identity', () => {
  it.skipIf(!hasSwift)('executes actual pick models/parsers and lineup HTTP reads for doubleheaders, historical dates and weekly NFL aliases', () => {
    const models = read('Models.swift'), api = read('SupabaseAPI.swift');
    const actualModels = ['ExactGameIdentity', 'StoredProviderGameID', 'PicksValue', 'WeeklyNFLPicksRow', 'SportsbookOdds', 'GaryPick', 'StatData', 'StatValues', 'TeamInjuries', 'PlayerInjury'].map(name =>
      declaration(models, `${name === 'PicksValue' ? 'enum' : 'struct'} ${name}`),
    ).join('\n');
    const lineupModels = api.slice(api.indexOf('    struct MLBFieldLineupRow:'), api.indexOf('    // MARK: - Weekly NFL Picks'));
    const actualAPI = ['    static func fetchMlbFieldLineup(', '    private static func normalizeStoredGamePickPayload(', '    static func parsePicksRow(', '    private static func validateStoredGamePicks('].map(start => declaration(api, start, '    ')).join('\n');
    const fixture = readFileSync(new URL('../../../ios/Tests/ExactGameIdentityTests.swift', import.meta.url), 'utf8');
    const directory = mkdtempSync(join(tmpdir(), 'gary-game-identity-'));
    try {
      const path = join(directory, 'Fixture.swift');
      writeFileSync(path, `import Foundation
import CoreFoundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
${actualModels}
enum SupabaseAPI {
  private static func buildURL(table: String, query: [URLQueryItem]) -> URL {
    var url = URLComponents(string: "https://fixture.invalid/rest/v1/" + table)!
    url.queryItems = query
    return url.url!
  }
  private static func makeRequest(url: URL) -> URLRequest { URLRequest(url: url) }
  ${lineupModels}
  ${actualAPI}
}
${fixture}`);
      const output = execFileSync('swift', ['-swift-version', '5', path], { encoding: 'utf8', timeout: 30000 });
      expect(output).toContain('PASS 53 actual Swift identity checks');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 40000);

  it('passes the selected game identity and commencement date to the field without a today/matchup fallback', () => {
    const page = read('ScoutTrio.swift'), field = read('MLBGameIntelView.swift');
    expect(page).toContain('MLBGameIntelView(gameID: bdlGameId, gameDate: ExactGameIdentity.easternDate(of: group.commence)');
    const load = declaration(field, '    private func loadRealLineup()', '    ');
    expect(load).not.toContain('todayEST');
    expect(load).not.toContain('homeTeam:');
    expect(load).toContain('guard !Task.isCancelled, let row else { return }');
    expect(field).toContain('.task(id: lineupIdentity) { await loadRealLineup() }');
  });
});
