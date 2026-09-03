import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const ios = (file) => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const picksTab = ios('PicksTab.swift');
const propRows = ios('PropRows.swift');
const scoutTrio = ios('ScoutTrio.swift');
const models = ios('Models.swift');
const viewsShared = ios('ViewsShared.swift');
const homeView = ios('HomeView.swift');

/** One declaration's body, from its line to the next top-level member. */
function sliceMember(source, declaration) {
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`declaration not found: ${declaration}`);
  const rest = source.slice(start + declaration.length);
  const next = rest.search(/\n {4}(?:private |@ViewBuilder |static )?(?:var|func) /);
  return next < 0 ? rest : rest.slice(0, next);
}

// The home run is a PICK CARD (founder, Sep 3 2026): four cards a game — two
// props, the game pick, and the long shot. It rides its game's carousel, and
// it still never counts anywhere.
describe('the long shot rides the Picks page', () => {
  it('keeps the HR lane in the day groups the game pages read', () => {
    expect(sliceMember(picksTab, 'private var filteredTodayProps: [PropPick] {'))
      .not.toContain('isHomeRunProp');
    expect(sliceMember(picksTab, 'private var filteredYesterdayProps: [PropPick] {'))
      .not.toContain('isHomeRunProp');
    expect(sliceMember(picksTab, 'private var filteredProps: [PropPick] {'))
      .not.toContain('isHomeRunProp');
  });

  it('routes every MLB HR row to the MLB chip, so no HR tab can appear', () => {
    const key = sliceMember(picksTab, 'private func propSportKey(_ p: PropPick) -> String {');
    expect(key).toContain('key == "MLB HR" ? "MLB" : key');
    expect(picksTab).toContain('s.remove("MLB HR")');
  });

  it('puts the long shot last in its game\'s carousel, one per game', () => {
    const top = sliceMember(scoutTrio, 'private var topProps: [PropPick] {');
    expect(top).toContain('filter { !$0.isHRLane }');
    expect(top).toContain('Array(core.prefix(5)) + Array(longShots.prefix(1))');
  });

  it('names the lane on the card and keeps the league token a league', () => {
    expect(propRows).toContain('prop.isHRLane ? "THE LONG SHOT" : "GARY\'S PICK"');
    expect(propRows).toContain('raw == "MLB HR" ? "MLB" : raw');
  });

  it('still keeps the fun lane out of the free showcase and Home', () => {
    expect(sliceMember(picksTab, 'private var topProps: [PropPick] {'))
      .toContain('filter { !isHomeRunProp($0) }');
    expect(sliceMember(picksTab, 'private var freshShowcaseProp: PropPick? {'))
      .toContain('filter { !isHomeRunProp($0) }');
    expect(homeView).toContain('guard !p.isHRLane else { return false }');
  });

  it('still keeps the fun lane out of every record', () => {
    // The lane stamp remains the one source of truth, and the Billfold's MLB
    // record still excludes HR rows.
    expect(models).toContain('var isHRLane: Bool {');
    expect(viewsShared).toContain('$0.effectiveLeague ?? "") == "MLB" && !$0.isHRResult');
  });
});
