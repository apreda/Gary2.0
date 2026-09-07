import { describe, expect, it, vi } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { auditCardCoverage, resolvePlayerCard, readCoverageRows, isNativeCardDecodable, isThinPack, HUB_CATEGORIES, HUB_LEAGUES } from '../../scripts/lib/cardCoverage.js';
import { runCardWatch } from '../../scripts/check-card-coverage.js';

const date = '2026-09-07';
const card = (extra = {}) => ({ id: 1, date, league: 'MLB', player_id: '700', player_name: 'Pete Crow-Armstrong',
  game_id: '2002', payload: { name: 'Pete Crow-Armstrong', season: { line1: '.270 AVG' } }, ...extra });
const story = (extra = {}) => ({ id: 1, date, league: 'MLB', category: 'heat_check', player_id: '700',
  game_id: '2002', headline: 'Pete Crow-Armstrong: recent form', ...extra });
const candidate = (extra = {}) => ({ league: 'MLB', playerID: '700', gameID: '2002', name: 'Pete Crow-Armstrong', hasPayload: true, ...extra });
const query = (extra = {}) => ({ league: 'MLB', slateDate: date, loadedDate: date, currentDate: date,
  playerID: '700', playerName: 'Pete Crow-Armstrong', gameID: '2002', candidates: [candidate()], ...extra });
const page = (data, count = data.length) => ({ data, count, error: null });

function fakeClient(pages) {
  const requests = [];
  return { requests, from(table) {
    const request = { table }; requests.push(request);
    const builder = {
      select(columns, options) { Object.assign(request, { columns, options }); return builder; },
      eq(key, value) { request.filter = [key, value]; return builder; },
      order(key, options) { request.order = [key, options]; return builder; },
      range(from, to) { request.range = [from, to]; return builder; },
      abortSignal(signal) { request.signal = signal; return Promise.resolve(pages[table].shift()); },
    };
    return builder;
  } };
}

const source = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const hasSwift = spawnSync('swift', ['--version']).status === 0;
function block(text, start) {
  const begin = text.indexOf(start);
  if (begin < 0) throw new Error(`Missing declaration ${start}`);
  let depth = 0;
  for (let i = text.indexOf('{', begin); i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}' && --depth === 0) return text.slice(begin, i + 1);
  }
  throw new Error(`Unclosed declaration ${start}`);
}
function swiftJSON(program) {
  const directory = mkdtempSync(join(tmpdir(), 'gary-card-watch-parity-'));
  const path = join(directory, 'parity.swift');
  try {
    writeFileSync(path, program);
    return JSON.parse(execFileSync('swift', [path], { encoding: 'utf8', timeout: 30_000 }));
  } finally { unlinkSync(path); rmdirSync(directory); }
}

describe('card watch and native routing parity', () => {
  const queries = [query(), query({ gameID: '2001' }), query({ gameID: '02002' }), query({ playerID: 'missing' }),
    query({ candidates: [candidate({ league: 'NFL' })] }), query({ candidates: [candidate({ league: null })] }),
    query({ candidates: [candidate({ league: ' mlb ' })] }), query({ candidates: [candidate({ gameID: null })] }),
    query({ candidates: [candidate({ hasPayload: false })] }), query({ candidates: [candidate(), candidate({ hasPayload: false })] }),
    query({ candidates: [candidate({ gameID: '2001' }), candidate()] }),
    query({ gameID: null, candidates: [candidate({ gameID: '2001' }), candidate()] }),
    query({ slateDate: null }), query({ slateDate: '2026-09-06' }), query({ loadedDate: '2026-09-06' }), query({ currentDate: '2026-09-08' }),
    query({ playerID: null }), query({ playerID: null, playerName: 'P. Crow-Armstrong' }),
    query({ playerID: null, playerName: 'Crow-Armstrong' }), query({ playerID: null, playerName: 'Pete Crow-Arm' }),
    query({ playerID: null, playerName: 'P. Crow-Armstrong', candidates: [candidate(), candidate({ name: 'Paul Crow-Armstrong' })] }),
    query({ playerID: null, playerName: 'Jose Ramirez', candidates: [candidate({ name: 'José Ramírez' })] }),
    query({ playerID: null, playerName: 'J. de la Cruz', candidates: [candidate({ name: 'Juan de la Cruz' })] }),
  ];

  it('keeps IDs authoritative and refuses missing, empty or ambiguous card matches', () => {
    expect(queries.map(input => resolvePlayerCard(input).index)).toEqual([
      0, null, null, null, null, null, 0, null, null, null, 1, null, null, null, null, null,
      0, 0, null, null, null, 0, 0,
    ]);
  });

  it.skipIf(!hasSwift)('matches the actual shipping Foundation resolver on the same identity fixtures', () => {
    const encoded = Buffer.from(JSON.stringify(queries)).toString('base64');
    const result = swiftJSON(`${source('HubStoryIdentity.swift')}
struct Card: Decodable { let league: String?; let playerID: String?; let gameID: String?; let name: String?; let hasPayload: Bool }
struct Input: Decodable {
 let league: String; let slateDate: String?; let loadedDate: String; let currentDate: String
 let playerID: String?; let playerName: String?; let gameID: String?; let candidates: [Card]
}
let inputs = try JSONDecoder().decode([Input].self, from: Data(base64Encoded: "${encoded}")!)
let result: [Int?] = inputs.map { q in
 HubStoryIdentity.playerCardIndex(league: q.league, slateDate: q.slateDate, playerID: q.playerID,
  playerName: q.playerName, gameID: q.gameID, loadedDate: q.loadedDate, currentDate: q.currentDate,
  candidates: q.candidates.map { .init(league: $0.league, playerID: $0.playerID, gameID: $0.gameID, name: $0.name, hasPayload: $0.hasPayload) })
}
print(String(data: try JSONEncoder().encode(result), encoding: .utf8)!)`);
    expect(result).toEqual(queries.map(input => resolvePlayerCard(input).index));
  }, 40_000);

  it.skipIf(!hasSwift)('detects malformed packs the same way the real native model decodes them', () => {
    const rows = [card(), card({ payload: null }), card({ payload: {} }), card({ payload: [] }), card({ player_id: 700 }),
      card({ payload: { season: { line1: 42 } } }), card({ payload: { formRows: [null] } }),
      card({ payload: { pitchMatchup: [{ usagePct: 0.4, whiffPct: 0 }] } }),
      card({ payload: { props: [{ line: 1.5 }] } }), card({ payload: { strengths: ['Observed role'], extra: 42 } })];
    const encoded = Buffer.from(JSON.stringify(rows)).toString('base64');
    const models = source('Models.swift');
    const result = swiftJSON(`import Foundation
${block(models, 'struct PlayerInsightPack:')}
${block(models, 'struct PlayerInsightCardRow:')}
let rows = try JSONSerialization.jsonObject(with: Data(base64Encoded: "${encoded}")!) as! [Any]
let result = rows.map { row in
 let data = try! JSONSerialization.data(withJSONObject: row)
 return (try? JSONDecoder().decode(PlayerInsightCardRow.self, from: data)) != nil
}
print(String(data: try JSONEncoder().encode(result), encoding: .utf8)!)`);
    expect(result).toEqual(rows.map(isNativeCardDecodable));
  }, 40_000);
});

describe('coverage reporting', () => {
  it('tracks the native supported league and category routing contract', () => {
    const native = source('HubModules.swift').split('extension SignalKind {')[1].split('extension HubLeagueSel {')[0];
    const categories = [...native.matchAll(/^\s*case (.*?): return/gm)].flatMap(match => [...match[1].matchAll(/"([^"]+)"/g)].map(item => item[1]));
    expect(HUB_CATEGORIES).toEqual(categories);
    expect(source('AppFlags.swift')).toContain(`static let insightLeagues: [String] = [${HUB_LEAGUES.map(league => `"${league}"`).join(', ')}]`);
    const report = auditCardCoverage({ date, signals: [story({ category: 'not_a_native_category' })], cards: [card()] });
    expect(report.rows[0]).toMatchObject({ player_rows: 0, excluded: { unknown_category: 1 } });
    expect(report.warnings[0]).toContain('cannot render');
  });
  it('reports partial fallback honestly and escalates it only in strict mode', () => {
    const input = { date, signals: [story(), story({ id: 2, game_id: '2001' })], cards: [card()] };
    const report = auditCardCoverage(input);
    expect(report.rows[0]).toMatchObject({ player_rows: 2, reachable: 1 });
    expect(report.rows[0].gaps[0]).toMatchObject({ game_id: '2001', reason: 'player_game_not_found' });
    expect(report.failures).toEqual([]);
    expect(report.warnings).toHaveLength(1);
    expect(report.complete).toBe(false);
    expect(auditCardCoverage({ ...input, strict: true }).failures).toHaveLength(1);
  });

  it('does not turn team, ranking or dedicated Fantasy rows into missing player cards', () => {
    const report = auditCardCoverage({ date, cards: [card()], signals: [
      story({ player_id: null, team_id: 'team' }), story({ player_id: null, meta: { kind: 'h2h' } }),
      story({ league: 'NCAAF', meta: { source: 'balldontlie_ncaaf_rankings' } }),
      story({ league: 'NFL', generated_by: 'fantasy_briefing_v1' }),
      story({ league: 'NFL', meta: { source: 'fantasy_briefing_v1' } }),
      story({ player_id: null }),
    ] });
    expect(report.failures).toEqual([]);
    expect(report.rows.find(row => row.league === 'MLB')).toMatchObject({ player_rows: 0, name_only_reachable: 1, excluded: { team: 2 } });
    expect(report.rows.find(row => row.league === 'NFL')).toMatchObject({ player_rows: 0, cards: 0, excluded: { fantasy_briefing: 2 } });
  });

  it('fails zero reachable coverage even when unrelated cards exist', () => {
    const report = auditCardCoverage({ date, signals: [story()], cards: [card({ player_id: 'unrelated' })] });
    expect(report.failures[0]).toContain('none of 1 player row(s)');
    expect(auditCardCoverage({ date, signals: [story()], cards: [] }).failures[0]).toContain('NO cards at all');
  });

  it('invalidates a malformed native collection and refuses wrong-date packs', () => {
    const report = auditCardCoverage({ date, signals: [story()], cards: [card(), card({ id: 2, payload: [] })] });
    expect(report.malformed_card_ids).toEqual([2]);
    expect(report.rows[0].reachable).toBe(0);
    expect(report.failures[0]).toContain('native card collection');
    expect(auditCardCoverage({ date, signals: [story()], cards: [card({ date: '2026-09-06' })] }).rows[0].reachable).toBe(0);
  });

  it('measures rendered stats instead of unknown fields or empty dictionaries', () => {
    expect(isThinPack({ name: 'Player', season: {}, usage: { snaps: 44 }, lastGames: [1] })).toBe(true);
    expect(isThinPack({ formRows: [{ label: 'LAST GAME' }] })).toBe(true);
    expect(isThinPack({ pitchMatchup: [{ usagePct: 0 }] })).toBe(false);
    expect(isThinPack(card().payload)).toBe(false);
    expect(auditCardCoverage({ date, signals: [], cards: [card({ payload: {} })] }).failures[0]).toContain('every card is thin');
  });
});

describe('complete bounded read-only collections', () => {
  it('uses exact counts to continue after a server-capped short page', async () => {
    const sb = fakeClient({ cards: [page([card()], 2), page([card({ id: 2 })], 2)] });
    expect(await readCoverageRows(sb, 'cards', 'id,date,payload', date)).toHaveLength(2);
    expect(sb.requests.map(request => request.range)).toEqual([[0, 499], [1, 500]]);
    expect(sb.requests.every(request => request.options.count === 'exact' && request.order[0] === 'id')).toBe(true);
  });

  it('bounds requests even if the server returns just one row per page', async () => {
    const sb = fakeClient({ cards: [page([card()], 3), page([card({ id: 2 })], 3)] });
    await expect(readCoverageRows(sb, 'cards', 'id,date', date, { maxPages: 2 })).rejects.toThrow('request audit bound');
    expect(sb.requests).toHaveLength(2);
  });

  it.each([
    [[page([card()], 2), page([], 2)], 'truncated'],
    [[page([card()], 2), page([card()], 2)], 'repeated'],
    [[page([card()], 2), page([card({ id: 2 })], 3)], 'changed'],
    [[{ data: [], count: null }], 'complete row/count'],
    [[{ error: { message: 'transport failed' } }], 'transport failed'],
    [[page([card({ date: '2026-09-06' })])], 'outside'],
    [[page([], 20_001)], 'audit bound'],
  ])('fails rather than auditing a partial collection: %s', async (pages, message) => {
    await expect(readCoverageRows(fakeClient({ cards: pages }), 'cards', 'id,date', date)).rejects.toThrow(message);
  });

  it('uses public reads and does not print universal success with partial gaps', async () => {
    const sb = fakeClient({ insight_connections: [page([story(), story({ id: 2, game_id: '2001' })])], player_insight_cards: [page([card()])] });
    const clientFactory = vi.fn(() => sb); const log = vi.fn();
    const env = { VITE_SUPABASE_URL: 'https://example.invalid', VITE_SUPABASE_ANON_KEY: 'public-fixture', SUPABASE_SERVICE_ROLE_KEY: 'server-fixture' };
    expect(await runCardWatch({ argv: [], env, now: new Date('2026-09-07T20:00:00Z'), clientFactory, log })).toBe(0);
    expect(clientFactory.mock.calls[0][1]).toBe('public-fixture');
    expect(log.mock.calls.flat().join('\n')).toContain('coverage limitations');
    expect(log.mock.calls.flat().join('\n')).not.toContain('✅');
  });

  it('refuses to report yesterday as current when the read crosses ET midnight', async () => {
    const sb = fakeClient({ insight_connections: [page([story()])], player_insight_cards: [page([card()])] });
    const now = vi.fn().mockReturnValueOnce(new Date('2026-09-08T03:59:59Z')).mockReturnValue(new Date('2026-09-08T04:00:01Z'));
    await expect(runCardWatch({ argv: [], now, env: { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'public-fixture' },
      clientFactory: () => sb, log: vi.fn() })).rejects.toThrow('Slate date changed');
  });
});
