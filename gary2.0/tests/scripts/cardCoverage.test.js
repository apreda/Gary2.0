import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const watch = readFileSync(new URL('../../scripts/check-card-coverage.js', import.meta.url), 'utf8');
const coverage = readFileSync(new URL('../../scripts/lib/cardCoverage.js', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../../run-insight-connections.js', import.meta.url), 'utf8');
const hub = readFileSync(new URL('../../../ios/GaryApp/HubView.swift', import.meta.url), 'utf8');

// Founder, Sep 4 2026: "if i click a players name the player card should show
// up ... and then even if a player card does pop up its very light on info or
// none at all. please fix that and see that will work each day without me
// having to check it."
describe('the player card reaches every named row', () => {
  it('writes packs that survive a repeated player id', () => {
    // One duplicate used to fail the WHOLE batch, which is why college cards
    // never once reached the table.
    // The storage helper's behavioral suite verifies deduplication, conflict
    // identity and failed writes; this checks the runner uses that helper.
    expect(runner).toContain('return upsertPlayerCards({');
    expect(runner).toContain('rows, client: axios, url: CARDS_REST_URL, headers: restHeaders');
  });

  it('builds from the whole day, not just the pass that happens to run', () => {
    expect(runner).toContain('async function storedConnectionPlayers(date, league)');
    expect(runner).toContain('const stored = await storedConnectionPlayers(date, league);');
    // A lane that stamps an MLBAM id instead of the provider's still gets its
    // player a pack, through the headline name.
    expect(runner).toContain("String(row?.headline || '').split(/[:(,/·—]/)[0].trim()");
  });

  it('keeps authoritative team rows outside player-name routing', () => {
    const open = hub.slice(hub.indexOf('private func openSignal('), hub.indexOf('static func signalPlayerName('));
    // The executable openSignal suite covers name collisions with team and
    // head-to-head metadata. This guard must surround the card lookup itself.
    expect(open).toContain('s.reg?.day != "tomorrow"');
    expect(open).toContain('s.playerId != nil || (s.teamId == nil && s.h2h == nil),');
    expect(open).toContain('if s.playerId == nil, s.teamId != nil || s.h2h != nil {');
    expect(open).toContain('teamCardSignal = s');
  });

  it('opens a scoped prefetched card with the full original read and preserves a missing-card fallback', () => {
    const open = hub.slice(hub.indexOf('private func openSignal('), hub.indexOf('static func signalPlayerName('));
    // Identity and date behavior run as Swift assertions in the routing and
    // player-scope suites. Here verify the sheet receives that exact result.
    expect(open).toContain('HubStoryIdentity.playerCardIndex(');
    expect(open).toContain('playerName: Self.signalPlayerName(s), gameID: s.gameId');
    expect(open).toContain('loadedDate: loadedDate, currentDate: SupabaseAPI.todayEST()');
    expect(open).toContain('playerRead = PlayerRead(signal: s, card: intelCards[index])');
    expect(hub).toContain('.sheet(item: $playerRead) { PlayerInsightSheet(signal: $0.signal, prefetched: $0.card) }');
    expect(open).not.toContain('if sel == .nfl || sel == .ncaaf {');
    expect(open).toContain('if s.playerId != nil { selectedSignal = s; return }');
    expect(open).toContain('else { selectedSignal = s }');
  });

  it('reads the player out of a lane headline without splitting a hyphenated name', () => {
    const fn = hub.slice(hub.indexOf('static func signalPlayerName('), hub.indexOf('static func signalPlayerName(') + 400);
    expect(fn).toContain('CharacterSet(charactersIn: ":(,/·—")');
    expect(fn).not.toContain('-"');
  });

  it('the watch fails loudly when a league has rows and no cards', () => {
    // Behavior and executable Swift parity live in cardCoverageMonitor.test.
    expect(coverage).toContain('row(s) on the board and NO cards at all');
    expect(coverage).toContain('every card is thin (no rendered stats and data)');
    expect(watch).toContain('process.exitCode = await runCardWatch()');
    expect(watch).toContain('auditCardCoverage(');
    expect(watch).toContain("readCoverageRows(sb, 'player_insight_cards', CARD_COLUMNS, date)");
  });
});
