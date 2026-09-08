import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { legacyResearchUpgradeDecision, legacyResearchUpgradePatch, backupLegacyResearchRow, hasVisibleResearchRecommendation } from '../../scripts/lib/legacyHubResearch.js';
import { HUB_RESEARCH_COPY_VERSION } from '../../src/services/insights/researchCopyPolicy.js';
import { researchCopyCasArguments, saveResearchReceipt } from '../../scripts/lib/researchCopyStorage.js';

const date = '2026-09-08';
const measured = 'The last 15 days sample runs 57 PA: a 1.398 OPS versus .856 for the season, 0.542 above his norm. He has 35 home runs on the season. His total-bases line tonight: 1.5.';
const original = () => ({ id: 123, date, league: 'MLB', generated_by: 'insights-cli', category: 'heat_check', result: null,
  headline: 'Fixture Hitter: 1.398 OPS in Last 15 Days', detail: 'I like his chances of clearing 1.5 total bases.',
  meta: { computed_detail: measured, computed_as_of: '2026-09-08T10:00:00Z',
    read: 'Old read.', evidence: 'Old voice evidence.', position: '3B', judgment: { revision: 'original' } } });
const tmp = [];
afterEach(async () => { for (const dir of tmp.splice(0)) await rm(dir, { recursive: true, force: true }); });

describe('bounded original Hub research restoration', () => {
  it('restores the source verbatim across all renderable copy, preserves provenance, and does not mutate the input', () => {
    const row = original(), before = structuredClone(row);
    const patch = legacyResearchUpgradePatch(row, date, '2026-09-08T21:00:00Z');
    expect(patch.detail).toBe(measured);
    expect(patch.meta.read).toBe(measured);
    expect(patch.meta.evidence).toBe(measured);
    expect(patch.meta.computed_as_of).toBe('2026-09-08T10:00:00Z');
    expect(patch.meta.judgment).toEqual({ revision: 'original' });
    expect(patch.meta.research_copy_version).toBe(HUB_RESEARCH_COPY_VERSION);
    expect(patch.meta.research_copy_source).toBe('original_computed_detail');
    expect(patch.meta.research_copy_upgraded_at).toBe('2026-09-08T21:00:00Z');
    expect(row).toEqual(before);
    expect(JSON.stringify(patch)).not.toContain('I like his chances');
    expect(legacyResearchUpgradePatch({ ...row, ...patch }, date)).toBeNull();
  });

  it.each([
    { date: '2026-09-07' }, { league: 'NFL' }, { league: 'NCAAF' }, { result: 'win' }, { result: undefined },
    { id: null }, { id: true }, { graded_at: '2026-09-08T10:00:00Z' }, { category: 'gary_hr_threats' }, { category: 'fantasy_pickups' }, { generated_by: 'fantasy_briefing_v1' },
  ])('preserves history, graded rows, football, unknown identity and independent decisions (%j)', change => {
    expect(legacyResearchUpgradePatch({ ...original(), ...change }, date)).toBeNull();
  });

  it.each([
    { source: 'fantasy_briefing_v1' }, { kind: 'fantasy_pickups' }, { source: 'daily_picks' }, { source_pick_id: 9 },
    { pick_id: 9 }, { research_copy_version: 'future-version' }, { computed_detail: undefined }, { computed_detail: {} },
  ])('preserves protected or missing metadata provenance (%j)', change => {
    const row = original(); row.meta = { ...row.meta, ...change };
    expect(legacyResearchUpgradePatch(row, date)).toBeNull();
  });

  it.each([
    'He has a 1.80 ERA over 20 IP, and that is where most lines still price him.',
    'He has 3 strikeouts, but the season line is doing a lot of work for him right now.',
    'The 0.95 ERA makes him a different pitcher than his season line says.',
    'The team is 7-4 against them — a revenge spot.',
    'They scored 1 time in 10 games; the first inning has been a free pass.',
    'The wind is 10 mph. That wind knocks down anything hit in the air.',
    'I like his chances of clearing 1.5 total bases.',
    'His xERA is 2.50 over 20 IP.',
    'The pitcher is likely unavailable after 40 pitches.',
  ])('does not promote collector interpretation to measured evidence (%s)', computed => {
    const row = original(); row.meta.computed_detail = computed; row.detail = 'A separate old interpretation.';
    expect(legacyResearchUpgradeDecision(row, date)).toMatchObject({ eligible: false, reason: 'original_contains_interpretation' });
  });

  it('leaves already literal source copy alone without adding a version tag', () => {
    const row = original(); row.detail = measured;
    expect(legacyResearchUpgradePatch(row, date)).toBeNull();
  });

  it('keeps allowed expected batting measurements and their sample', () => {
    const row = original(); row.category = 'regression_watch';
    row.meta.computed_detail = 'Over 548 plate appearances he has a .308 AVG versus a .257 xBA, and a .307 wOBA versus .261 xwOBA.';
    expect(legacyResearchUpgradePatch(row, date)?.detail).toBe(row.meta.computed_detail);
  });

  it('excludes legacy ballpark innings formatting even when the prose otherwise looks factual', () => {
    const row = original(); row.category = 'ballpark_shift';
    row.meta.computed_detail = 'Fixture Pitcher has a 4.63 ERA on a 44.7-inning baseline elsewhere.';
    expect(legacyResearchUpgradePatch(row, date)).toBeNull();
  });

  it('omits only the known terminal starter assertion while preserving historical records exactly', () => {
    const row = original(); row.category = 'starter_team_record';
    row.meta.computed_detail = "Fixture Club are 1-7 in Fixture Pitcher's last 8 starts this season. He starts tonight.";
    const patch = legacyResearchUpgradePatch(row, date);
    expect(patch.detail).toBe("Fixture Club are 1-7 in Fixture Pitcher's last 8 starts this season.");
    expect(patch.meta.computed_detail).toBe(row.meta.computed_detail);
    expect(patch.meta.research_copy_omission).toBe('unconfirmed_starter_sentence');
    row.category = 'heat_check';
    expect(legacyResearchUpgradePatch(row, date)).toBeNull();
    row.category = 'starter_team_record';
    row.meta.computed_detail += ' He also has 10 strikeouts.';
    expect(legacyResearchUpgradePatch(row, date)).toBeNull();
  });

  it('backs up original text and all metadata outside the public row, preserving repeated and changed snapshots', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gary-research-backup-')); tmp.push(directory);
    const row = original();
    const first = await backupLegacyResearchRow(row, directory);
    expect(JSON.parse(await readFile(first, 'utf8'))).toEqual(row);
    expect(await backupLegacyResearchRow(row, directory)).toBe(first);
    const changed = { ...row, meta: { ...row.meta, judgment: { revision: 'new' } } };
    const second = await backupLegacyResearchRow(changed, directory);
    expect(second).not.toBe(first);
    expect(JSON.parse(await readFile(first, 'utf8'))).toEqual(row);
  });

  it('reports explicit leftover recommendations without marking a stated uncertainty as a prediction', () => {
    expect(hasVisibleResearchRecommendation(original())).toBe(true);
    expect(hasVisibleResearchRecommendation({ detail: 'I expect another quiet opening tonight.' })).toBe(true);
    expect(hasVisibleResearchRecommendation({ detail: 'Those figures do not establish who will control the bases tonight.' })).toBe(false);
  });

  it('sends the complete source metadata and explicit nullable identity in the RPC body', () => {
    const row = original(); row.meta.large_source = 'evidence'.repeat(8000);
    const patch = legacyResearchUpgradePatch(row, date);
    const args = researchCopyCasArguments(row, patch);
    expect(args.p_expected_meta).toEqual(row.meta);
    expect(args.p_expected_detail).toBe(row.detail);
    expect(args.p_patch).toBe(patch);
    expect(args.p_player_id).toBeNull();
    expect(args.p_team_id).toBeNull();
    expect(args.p_game_id).toBeNull();
    expect(JSON.stringify(args).length).toBeGreaterThan(48000);
    expect(() => researchCopyCasArguments({ ...row, graded_at: 'now' }, patch)).toThrow();
    for (const field of ['headline', 'value', 'tone', 'spark', 'team_id']) {
      expect(() => researchCopyCasArguments(row, { ...patch, [field]: 'extra' })).toThrow();
    }
  });

  it('atomically replaces receipts while retaining independent immutable originals', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gary-receipt-')); tmp.push(directory);
    const row = original(), backup = await backupLegacyResearchRow(row, directory);
    const path = join(directory, 'receipt.json');
    await saveResearchReceipt(path, { applied: [] });
    await saveResearchReceipt(path, { applied: [row.id] });
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ applied: [row.id] });
    expect(JSON.parse(await readFile(backup, 'utf8'))).toEqual(row);
  });
});
