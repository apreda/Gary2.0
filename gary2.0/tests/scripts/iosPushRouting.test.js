import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = name => readFileSync(new URL(`../../../ios/GaryApp/${name}`, import.meta.url), 'utf8');
const api = source('SupabaseAPI.swift');
const content = source('ContentView.swift');
const picks = source('PicksTab.swift');
const navigation = source('GaryPushNavigation.swift');
const hasSwift = process.platform === 'darwin' && spawnSync('swiftc', ['--version']).status === 0;
// The subprocesses retain their 60s compile / 10s execution limits. Allow the
// enclosing test to include both, including cold compilation on a busy runner.
const fixtureTimeout = 75000;
function block(text, declaration) {
  const start = text.indexOf(declaration);
  if (start < 0) throw new Error(`Missing ${declaration}`);
  let depth = 0;
  for (let i = text.indexOf('{', start); i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Unclosed ${declaration}`);
}
const dateMethods = `${block(api, 'static func todayEST(')}\n${block(api, 'private static func formatDateEST(')}`;
function execute(files) {
  const dir = mkdtempSync(join(tmpdir(), 'gary-push-route-'));
  try {
    const paths = Object.entries(files).map(([name, text]) => {
      const path = join(dir, name); writeFileSync(path, text); return path;
    });
    const executable = join(dir, 'fixture');
    const compile = spawnSync('swiftc', ['-O', '-parse-as-library', '-Xfrontend', '-enable-actor-data-race-checks', ...paths, '-o', executable], { encoding: 'utf8', timeout: 60000 });
    expect(compile.status, compile.stdout + compile.stderr).toBe(0);
    const run = spawnSync(executable, [], { encoding: 'utf8', timeout: 10000 });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    return run.stdout;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe('native notification routing', () => {
  it.skipIf(!hasSwift)('executes typed payload, cold-launch, exact account and real 6 AM/DST policies', () => {
    const result = execute({
      'Router.swift': source('GaryPushRouter.swift'),
      'Dates.swift': `import Foundation\nenum SupabaseAPI { static let slateRolloverHourET = 6\n${dateMethods}\n}`,
      'Fixture.swift': readFileSync(new URL('../fixtures/ios/GaryPushRouterFixture.swift', import.meta.url), 'utf8'),
    });
    expect(result).toContain('Gary push router assertions passed');
  }, fixtureTimeout);

  it.skipIf(!hasSwift)('executes the actual Picks date/loading guard and exact missing-target feedback', () => {
    const result = execute({
      'Router.swift': source('GaryPushRouter.swift'),
      'Fixture.swift': `import Foundation
enum SupabaseAPI {
 static var clock = ISO8601DateFormatter().date(from: "2026-09-10T09:59:59Z")!
 static let slateRolloverHourET = 6
 ${dateMethods.replace('now: Date = Date()', 'now: Date = clock')}
}
@MainActor final class FocusState {
 var focusGame: String?; var focusLeague: String?; var focusGameID: Int?
 var focusDate: String?; var focusRefresh = false; var focusRequestID = UUID()
 ${block(content, 'func focus(game:')}
 ${block(content, 'func clearGameFocus()')}
}
@MainActor final class GaryPushNavigation {
 static let shared = GaryPushNavigation()
 var payloads: [[AnyHashable: Any]] = []; var missing: GaryPushGame?
 func receive(_ payload: [AnyHashable: Any], requestID: String) { payloads.append(payload) }
 func missingGame(_ game: GaryPushGame) { missing = game }
}
@MainActor final class Store {
 var loadedDate = "2026-09-09"; var loading = false; var loads = 0; var forced = false
 func loadIfNeeded(forceRefresh: Bool) async {
  loads += 1; forced = forceRefresh; loadedDate = SupabaseAPI.todayEST(); loading = false
 }
}
@MainActor final class Probe {
 var focusState = FocusState(); var store = Store(); var selectedTab = 3
 var pushFocusLoadInFlight = false; var notificationFocusGameID: Int?
 var sport = "NFL"; var ncaafConference = "SEC"; static let ncaafRankedFilter = "RANKED"
 var rebuilt = 0; var consumed = 0
 func rebuildMemo() { rebuilt += 1 }
 func consumeFocus() { consumed += 1 }
 ${block(picks, 'private func preparePushFocusIfNeeded()')}
 ${block(picks, 'private func reportMissingPushFocus()')}
 func prepare() -> Bool { preparePushFocusIfNeeded() }
 func reportMissing() { reportMissingPushFocus() }
}
@main struct Fixture {
 @MainActor static func main() async {
  let probe = Probe()
  probe.focusState.focus(game: "A @ B", league: "NFL", gameID: 42, date: "2026-09-09")
  precondition(probe.prepare() && probe.store.loads == 0)
  probe.selectedTab = 0
  precondition(!probe.prepare() && probe.focusState.focusGameID == 42)
  probe.selectedTab = 3
  SupabaseAPI.clock = ISO8601DateFormatter().date(from: "2026-09-10T10:00:00Z")!
  precondition(!probe.prepare() && probe.focusState.focusGame == nil)
  precondition(GaryPushNavigation.shared.payloads.last?["game_date"] as? String == "2026-09-09")
  probe.focusState.focus(game: "A @ B", league: "NFL", gameID: 42, date: "2026-09-10")
  precondition(!probe.prepare()); precondition(!probe.prepare())
  while probe.pushFocusLoadInFlight { await Task.yield() }
  precondition(probe.store.loads == 1 && probe.prepare() && probe.consumed == 1)
  probe.store.loading = true; precondition(!probe.prepare()); probe.store.loading = false
  probe.focusState.focus(game: "A @ B", league: "NFL", gameID: 42, date: "2026-09-10", refresh: true)
  precondition(!probe.prepare())
  while probe.pushFocusLoadInFlight { await Task.yield() }
  precondition(probe.store.loads == 2 && probe.store.forced && !probe.focusState.focusRefresh)
  probe.reportMissing()
  precondition(GaryPushNavigation.shared.missing == GaryPushGame(league: "NFL", gameID: 42, date: "2026-09-10", matchup: "A @ B"))
  probe.sport = "NCAAF"
  probe.focusState.focus(game: "C @ D", league: "NCAAF", gameID: 99, date: "2026-09-10")
  precondition(probe.prepare() && probe.notificationFocusGameID == 99 && probe.ncaafConference == "RANKED")
  print("Actual Picks date guard passed")
 }
}`,
    });
    expect(result).toContain('Actual Picks date guard passed');
  }, fixtureTimeout);

  it.skipIf(!hasSwift)('executes queued feedback, account-safe resumption and latest-tap supersession', () => {
    const model = block(navigation, 'final class GaryPushNavigation: ObservableObject')
      .replace(block(navigation, 'static var systemPresentationBlocksNavigation:'), 'static var systemPresentationBlocksNavigation: Bool { false }');
    const result = execute({
      'Router.swift': source('GaryPushRouter.swift'),
      'Fixture.swift': `import Foundation
import Combine
enum SupabaseAPI { static func todayEST(now: Date = Date()) -> String { "2026-09-09" } }
@MainActor final class PicksFocusState {
 static let shared = PicksFocusState(); var focusDate: String?
 func clearGameFocus() { focusDate = nil }
}
@MainActor ${model}
@main struct Fixture {
 @MainActor static func main() {
  let nav = GaryPushNavigation.shared
  let a = UUID(); let b = UUID()
  nav.requireBookAccount(a)
  precondition(nav.notice == nil && nav.queuedNotice != nil)
  nav.resumeBookIfMatching(b); precondition(nav.router.pending == nil)
  nav.presentQueuedNotice(); precondition(nav.notice != nil && nav.queuedNotice == nil)
  nav.resumeBookIfMatching(a)
  precondition(nav.notice == nil && nav.router.pending == .yourBook(accountID: a))
  precondition(nav.router.takeIfReady(shellReady: true, identityReady: true, currentAccountID: a, now: Date()) == .yourBook)
  let oldAction = nav.actionID
  nav.missingGame(.init(league: "NFL", gameID: 42, date: "2026-09-09", matchup: "A @ B"))
  precondition(nav.notice == nil && nav.queuedNotice != nil)
  PicksFocusState.shared.focusDate = "2026-09-09"
  nav.receive(["destination": "picks", "league": "MLB", "game_id": "43", "game_date": "2026-09-09"], requestID: "new")
  precondition(nav.queuedNotice == nil && PicksFocusState.shared.focusDate == nil)
  nav.openFailed(URL(string: "https://www.betwithgary.ai/archive")!, actionID: oldAction)
  precondition(nav.queuedNotice == nil)
  nav.openFailed(URL(string: "https://www.betwithgary.ai/archive")!, actionID: nav.actionID)
  precondition(nav.notice == nil && nav.queuedNotice != nil)
  nav.setModalBlocked(true, owner: "hub-read"); precondition(nav.modalBlockers.contains("hub-read"))
  nav.setModalBlocked(false, owner: "hub-read"); precondition(nav.modalBlockers.isEmpty)
  _ = nav.router.takeIfReady(shellReady: true, identityReady: true, currentAccountID: nil, now: Date())
  nav.requireBookAccount(a)
  nav.finishAuthenticationAttempt(nil, actionID: nav.actionID)
  nav.resumeBookIfMatching(a)
  precondition(nav.router.pending == nil, "Cancelled sign-in must not resume at a later unrelated login")
  nav.requireBookAccount(a)
  let cancelledAttempt = nav.actionID
  nav.receive(["destination": "book", "book_scope": "you", "account_id": b.uuidString], requestID: "new-book")
  _ = nav.router.takeIfReady(shellReady: true, identityReady: true, currentAccountID: nil, now: Date())
  nav.requireBookAccount(b)
  nav.finishAuthenticationAttempt(nil, actionID: cancelledAttempt)
  nav.resumeBookIfMatching(b)
  precondition(nav.router.pending == .yourBook(accountID: b), "Old-sheet dismissal cannot cancel a newer alert")
  _ = nav.router.takeIfReady(shellReady: true, identityReady: true, currentAccountID: b, now: Date())
  nav.requireBookAccount(a)
  nav.finishAuthenticationAttempt(b, actionID: nav.actionID)
  precondition(nav.router.pending == nil && nav.queuedNotice != nil)
  nav.resumeBookIfMatching(a)
  precondition(nav.router.pending == .yourBook(accountID: a), "Wrong-account guidance retains only the expected account")
  print("Actual push navigation state passed")
 }
}`,
    });
    expect(result).toContain('Actual push navigation state passed');
  }, fixtureTimeout);
});
