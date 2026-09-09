import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// THE LINE (Sep 9 2026): the iOS contract for the ladder under the pick card
// and THE BOARD IS MOVING in The Hub — the reads they call, where they mount,
// and the words they never use.
const swift = (name) => readFileSync(new URL(`../../../ios/GaryApp/${name}`, import.meta.url), 'utf8');

describe('iOS line ladder and movers board', () => {
  it('reads the two ledger functions and decodes every rung field', () => {
    const src = swift('LineLadder.swift');
    expect(src).toContain('rest/v1/rpc/line_ladder');
    expect(src).toContain('rest/v1/rpc/line_movers');
    for (const key of ['spread_home', 'spread_home_odds', 'spread_away', 'spread_away_odds', 'ml_home', 'ml_away', 'total', 'total_over_odds', 'total_under_odds', 'seen_at']) {
      expect(src).toContain(`let ${key}:`);
    }
    expect(src).toContain('let open_total_seen: String?');
  });

  it('mounts under the football pick card and on the Hub front page, and is registered in the project', () => {
    expect(swift('FootballGameIntelView.swift')).toContain('lineLadderModule');
    const hub = swift('HubView.swift');
    // Sep 9 2026 (founder correction via the peer): the movers ride a 128pt aside beside the lead card; the full board is a sheet.
    expect(hub).toContain('HubLineMoversAside(league: sel.label, sportKey: sportKey)');
    expect(hub).toContain('.sheet(item: $ladderSel)');
    const pbx = swift('GaryApp.xcodeproj/project.pbxproj');
    expect(pbx).toContain('LineLadder.swift in Sources');
    expect(pbx).toContain('HubLineMovers.swift in Sources');
  });

  it('keeps every market open at the first rung that carries it and names a late total', () => {
    const src = swift('LineLadder.swift');
    expect(src).toContain('var totalOpen: LineRung? { ladder.rungs.first { $0.total != nil } }');
    expect(src).toContain('FIRST SEEN');
  });

  it('speaks in numbers and times only', () => {
    const text = `${swift('LineLadder.swift')}\n${swift('HubLineMovers.swift')}`.toLowerCase();
    for (const banned of ['sharp', 'steam', 'smart money', 'edge', 'clv', 'expected value']) {
      expect(text).not.toContain(`"${banned}`);
    }
  });
});
