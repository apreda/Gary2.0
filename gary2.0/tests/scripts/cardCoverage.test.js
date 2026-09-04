import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const watch = readFileSync(new URL('../../scripts/check-card-coverage.js', import.meta.url), 'utf8');
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
    expect(runner).toContain('const key = `${row.date}|${row.league}|${row.player_id}`;');
    expect(runner).toContain('resolution=merge-duplicates');
  });

  it('builds from the whole day, not just the pass that happens to run', () => {
    expect(runner).toContain('async function storedConnectionPlayers(date, league)');
    expect(runner).toContain('const stored = await storedConnectionPlayers(date, league);');
    // A lane that stamps an MLBAM id instead of the provider's still gets its
    // player a pack, through the headline name.
    expect(runner).toContain("String(row?.headline || '').split(/[:(,/·—]/)[0].trim()");
  });

  it('sends a team row to the team card before any name lookup', () => {
    const open = hub.slice(hub.indexOf('private func openSignal('), hub.indexOf('static func signalPlayerName('));
    const teamFirst = open.indexOf('if s.playerId == nil, s.teamId != nil || s.h2h != nil {');
    const nameLookup = open.indexOf('if let row = intelCard(for: Self.signalPlayerName(s))');
    expect(teamFirst).toBeGreaterThan(-1);
    expect(teamFirst).toBeLessThan(nameLookup);
  });

  it('opens a card by NAME when the row carries no player id', () => {
    const open = hub.slice(hub.indexOf('private func openSignal('), hub.indexOf('static func signalPlayerName('));
    expect(open).toContain('if let row = intelCard(for: Self.signalPlayerName(s))');
    expect(open).toContain('namedCard = row');
    // The old football gate — a tap with no pack fell straight to the overlay
    // and could never reach a card — is gone.
    expect(open).not.toContain('if sel == .nfl || sel == .ncaaf {');
    // An empty player card is never the answer: no pack means the overlay.
    expect(open).toContain('else { selectedSignal = s }');
  });

  it('reads the player out of a lane headline without splitting a hyphenated name', () => {
    const fn = hub.slice(hub.indexOf('static func signalPlayerName('), hub.indexOf('static func signalPlayerName(') + 400);
    expect(fn).toContain('CharacterSet(charactersIn: ":(,/·—")');
    expect(fn).not.toContain('-"');
  });

  it('the watch fails loudly when a league has rows and no cards', () => {
    expect(watch).toContain('row(s) on the board and NO cards at all');
    expect(watch).toContain('every card is thin (identity only, no numbers)');
    expect(watch).toContain('process.exit(1)');
    // It counts the name path too, because that is the one football rides,
    // and it uses the APP's resolver so it never reports a miss the app opens.
    expect(watch).toContain('function resolvesByName(name, cards)');
    expect(watch).toContain('n.includes(k) || k.includes(n)');
    // Team rows are not player rows and must not inflate the denominator.
    expect(watch).toContain('const withPlayer = leagueSignals.filter((s) => s.player_id != null);');
  });
});
