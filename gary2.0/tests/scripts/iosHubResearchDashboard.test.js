import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const native = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
function block(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing shipping declaration: ${marker}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed shipping declaration: ${marker}`);
}

describe('Hub 920 research dashboard components', () => {
  const dashboard = () => native('HubResearchDashboard.swift');
  const hub = () => native('HubView.swift');

  it('defines every component the Hub page references and wires the file into the Xcode project', () => {
    const source = dashboard();
    for (const marker of ['struct HubQuickResearchPage: Identifiable', 'struct HubResearchModule: Identifiable',
      'struct HubResearchDashboard: View', 'struct HubResearchModuleCard<Content: View>: View', 'struct HubBullpenChartSheet: View']) {
      expect(source).toContain(marker);
    }
    expect(block(source, 'extension Signal')).toContain('var researchLedger: BullpenResearchLedger?');
    const project = readFileSync(new URL('../../../ios/GaryApp/GaryApp.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
    expect(project).toContain('HubResearchDashboard.swift in Sources');
    expect(project.match(/HubResearchDashboard\.swift/g).length).toBe(project.match(/HubFrontPageSelection\.swift/g).length);
  });

  it('keeps the lead observation and quick list on quiet panels that open exact research', () => {
    const source = dashboard();
    const lead = block(source, 'struct HubResearchDashboard: View');
    expect(lead).toContain('fill: GaryColors.readingPanel');
    expect(lead).toContain('Text(lead.headline)');
    expect(lead).toContain('Text(lead.detail.trimmingCharacters');
    expect(lead).toContain('onCategory(page.id)');
    expect(lead).toContain('onSignal(');
    expect(lead).not.toContain('IN FOCUS');
    const page = block(hub(), '    @ViewBuilder private var frontPageBoards:');
    expect(page).toContain('HubResearchDashboard(lead: lead, pages: quickResearchPages(excluding: lead)');
    expect(page).toContain('onSignal: { openSignal($0) }');
  });

  it('gives every module card a 44-point toggle with expanded/collapsed accessibility state', () => {
    const card = block(dashboard(), 'struct HubResearchModuleCard<Content: View>: View');
    expect(card).toContain('fill: GaryColors.readingPanel');
    expect(card).toContain('minHeight: 44');
    expect(card).toMatch(/accessibilityValue\([^)]*expanded[^)]*collapsed/s);
    expect(card).toContain('open.contains(module.id)');
  });

  it('charts only dated relief workload and never asserts availability', () => {
    const source = dashboard();
    const sheet = block(source, 'struct HubBullpenChartSheet: View');
    expect(source).toContain('import Charts');
    expect(sheet).toContain('BarMark');
    expect(sheet).toContain('researchLedger');
    expect(sheet).toContain('.accessibilityAddTraits(.isModal)');
    expect(sheet).toMatch(/innings/i);
    expect(sheet).not.toMatch(/unavailable|gassed|tired|rested|fresh arm|should|will pitch/i);
    expect(block(source, 'func reliefInnings(')).toContain('/ 3');
  });

  it('routes the Fantasy watch and every former shelf section through the module workspace', () => {
    const source = hub();
    const content = block(source, '    private func researchModuleContent(');
    expect(content).toMatch(/case "fantasy":\s*return AnyView\(FantasyBriefingPage\(league: "MLB"/);
    expect(content).toContain('compact: true, embeddedInHub: true, openPlayer: openFantasyPlayer');
    expect(content).toContain('case "pulse":');
    expect(content).toContain('case "lastNight":');
    expect(block(source, '    private var researchModules:')).toContain('title: "League Pulse"');
    expect(block(source, '    private var hubLoadedContent:')).toContain('researchWorkspace');
    expect(source).toContain('HubBullpenChartSheet(signal: signal)');
    for (const retired of ['private var referenceShelf', 'private var beatsAndOverflow', 'private var signatureBoards',
      'private var streakWatchSection', 'struct HubLeadStory', 'struct HubBestOf', 'featuredStoryIDs', 'featured: Set<UUID>']) {
      expect(source).not.toContain(retired);
    }
    expect(source).toContain('private func beatRows(_ beat: Beat) -> [Signal]');
  });

  it('scrolls to the row that holds a research module, since row ids are direct page children', () => {
    const source = hub();
    expect(block(source, '    private var researchWorkspace:')).toContain('.id(Self.researchRowAnchor(index))');
    expect(block(source, '    private func researchScrollTarget(')).toContain('rows.firstIndex(where: { $0.contains(anchor) })');
    expect(source).toMatch(/let target = researchScrollTarget\(for: anchor\)\s*\n\s*withAnimation[^\n]*proxy\.scrollTo\(target, anchor: \.top\)/);
  });
});
