import { describe, expect, it } from 'vitest';
import { recentBattingSampleRepair } from '../../scripts/lib/recentBattingSampleRepair.js';

const today = '2026-09-08';
const row = (overrides = {}) => ({ id: 30438, date: today, league: 'MLB', category: 'heat_check', generated_by: 'insights-cli',
  result: null, graded_at: null, team_id: '8', game_id: '5059948', player_id: '410',
  headline: 'Rafael Devers: 1.398 OPS over the last 15 days',
  detail: 'The last 15 days sample runs 57 PA: a 1.398 OPS versus .856 for the season, 0.542 above his norm. He has 35 home runs on the season.',
  meta: { position: 'DH', research_copy_version: 'observed-research-v1',
    computed_detail: 'The last 15 days sample runs 57 PA: a 1.398 OPS versus .856 for the season, 0.542 above his norm. He has 35 home runs on the season.',
    read: 'The last 15 days sample runs 57 PA: a 1.398 OPS versus .856 for the season, 0.542 above his norm. He has 35 home runs on the season.',
    evidence: 'The last 15 days sample runs 57 PA: a 1.398 OPS versus .856 for the season, 0.542 above his norm. He has 35 home runs on the season.' },
  ...overrides });
// The provider's recent window carries at_bats only; plate_appearances is not a field.
const window = (overrides = {}) => ({ split_name: 'Last 15 Days', at_bats: 57, ops: 1.398, ...overrides });

describe('recent batting sample unit repair', () => {
  it('relabels a PA token as AB when the provider window has only at-bats and the count matches', () => {
    const original = structuredClone(row());
    const repair = recentBattingSampleRepair(row(), window(), today);
    expect(repair.reason).toBe('count_and_unit');
    expect(repair.patch.detail).toBe('The last 15 days sample runs 57 AB: a 1.398 OPS versus .856 for the season, 0.542 above his norm. He has 35 home runs on the season.');
    expect(repair.patch.meta.read).toBe(repair.patch.detail);
    expect(repair.patch.meta.evidence).toBe(repair.patch.detail);
    expect(repair.patch.meta.computed_detail).toBe(repair.patch.detail);
    expect(repair.patch.meta.position).toBe('DH');
    expect(repair.patch.meta.research_copy_version).toBe('observed-research-v1');
    expect(repair.patch.meta.recent_sample).toEqual({ count: 57, unit: 'AB', field: 'at_bats', window: 'Last 15 Days',
      source: 'balldontlie_mlb_player_splits' });
    expect(repair.patch.meta.recent_sample_repair).toMatchObject({ from_unit: 'PA', source_count_now: 57, verification: 'count_and_unit' });
    expect(row()).toEqual(original);
  });
  it('still relabels when the rolling window count has drifted, and says so', () => {
    const repair = recentBattingSampleRepair(row(), window({ at_bats: 53 }), today);
    expect(repair.reason).toBe('unit_schema');
    expect(repair.patch.detail).toContain('57 AB');
    expect(repair.patch.meta.recent_sample.count).toBe(57);
    expect(repair.patch.meta.recent_sample_repair).toMatchObject({ source_count_now: 53, verification: 'unit_schema' });
  });
  it('leaves a row alone when the provider window really reports plate appearances', () => {
    expect(recentBattingSampleRepair(row(), window({ plate_appearances: 57 }), today)).toEqual({ patch: null, reason: 'already_correct' });
    expect(recentBattingSampleRepair(row(), window({ plate_appearances: 60 }), today)).toEqual({ patch: null, reason: 'count_disagrees_with_source' });
  });
  it('does not touch a row whose text is already sealed or has no single sample token', () => {
    expect(recentBattingSampleRepair(row({ meta: { ...row().meta, recent_sample: { count: 57, unit: 'AB' } } }), window(), today).reason).toBe('already_sealed');
    expect(recentBattingSampleRepair(row({ detail: 'A 1.398 OPS with no sample.', meta: { ...row().meta, read: 'A 1.398 OPS with no sample.', evidence: 'A 1.398 OPS with no sample.' } }), window(), today).reason).toBe('no_single_sample_token');
    expect(recentBattingSampleRepair(row({ detail: '57 PA then 40 PA', meta: { ...row().meta, read: '57 PA then 40 PA', evidence: '57 PA then 40 PA' } }), window(), today).reason).toBe('no_single_sample_token');
  });
  it('relabels only the window sample in the matchup variant and keeps the vs-hand at-bat count', () => {
    const detail = "Jose Siri's .071 OPS over the last 15 days (26 PA) trails his .660 season mark, down 0.589. Tonight he draws LHP Patrick Sandoval — his weaker side: a .622 OPS vs LHP across 118 AB.";
    const repair = recentBattingSampleRepair(row({ category: 'cooling_off', detail, meta: { ...row().meta, computed_detail: detail, read: detail, evidence: detail } }), window({ at_bats: 26 }), today);
    expect(repair.reason).toBe('count_and_unit');
    expect(repair.patch.detail).toBe("Jose Siri's .071 OPS over the last 15 days (26 AB) trails his .660 season mark, down 0.589. Tonight he draws LHP Patrick Sandoval — his weaker side: a .622 OPS vs LHP across 118 AB.");
    expect(repair.patch.meta.recent_sample.count).toBe(26);
  });
  it('refuses rows outside today, ungraded MLB hot/cold scope or another window', () => {
    expect(recentBattingSampleRepair(row({ date: '2026-09-07' }), window(), today).reason).toBe('outside_current_date');
    expect(recentBattingSampleRepair(row({ graded_at: '2026-09-08T20:00:00Z' }), window(), today).reason).toBe('outside_ungraded_mlb');
    expect(recentBattingSampleRepair(row({ result: 'HIT' }), window(), today).reason).toBe('outside_ungraded_mlb');
    expect(recentBattingSampleRepair(row({ category: 'starter_form' }), window(), today).reason).toBe('outside_scope');
    expect(recentBattingSampleRepair(row({ player_id: null }), window(), today).reason).toBe('outside_scope');
    expect(recentBattingSampleRepair(row(), window({ split_name: 'Last 7 Days' }), today).reason).toBe('window_mismatch');
    expect(recentBattingSampleRepair(row(), null, today).reason).toBe('missing_source_window');
  });
});
