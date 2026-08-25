import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getPassRushAndCoverage, getQbPressureProfile, _clearNflverseCache
} from '../../src/services/nflverseService.js';

/**
 * PRESSURE AND COVERAGE — and the column-spelling trap.
 *
 * PRESSURE_RATE used to decline with "QB hits and true pressure rate are
 * charted products. No feed we hold publishes them." That was wrong about
 * where to look, not about what it wanted: nflverse mirrors Pro Football
 * Reference's charting as a free CSV carrying pressures, hurries, QB
 * knockdowns, blitz counts, pocket time — and per-defender COVERAGE, which is
 * the only individual defensive weakness in any feed we hold.
 *
 * THE TRAP THIS FILE EXISTS FOR. The two PFR files spell the team column
 * DIFFERENTLY: the defensive file uses `tm`, the passing file uses `team`.
 * Cross-reading them returns undefined, not an error — every team matches
 * nothing, every lane goes quiet, and the pipeline reports itself healthy.
 * That is the same silent-blank failure as the ten NFL fetchers reading
 * nonexistent BDL fields, arriving by a different road.
 */

const DEF_CSV = [
  'season,player,pfr_id,tm,age,pos,g,gs,int,tgt,cmp,cmp_percent,yds,yds_cmp,yds_tgt,td,rat,dadot,air,yac,bltz,hrry,qbkd,sk,prss,comb,m_tkl,m_tkl_percent,loaded,bats',
  '2025,Zach Allen,AllZa00,DEN,28,DL,17,17,0,3,2,0.667,18,9,6,0,95.8,2.1,10,8,1,7,32,7,50,60,4,0.062,,3',
  '2025,Pat Surtain,SurPa00,DEN,26,CB,16,16,3,62,28,0.452,410,14.6,6.6,2,58.1,11.8,300,110,2,0,0,0,0,55,3,0.052,,1',
  '2025,Bench Guy,BenGu00,DEN,24,CB,4,0,0,6,4,0.667,70,17.5,11.7,1,140.0,9.0,50,20,0,0,0,0,0,7,1,0.125,,0',
  '2024,Zach Allen,AllZa00,DEN,27,DL,17,17,0,2,1,0.5,9,9,4.5,0,80,1.0,5,4,0,5,20,5,35,52,3,0.055,,2'
].join('\n');

const PASS_CSV = [
  'player,team,pass_attempts,throwaways,spikes,drops,drop_pct,bad_throws,bad_throw_pct,season,pfr_id,pocket_time,times_blitzed,times_hurried,times_hit,times_pressured,pressure_pct,batted_balls,on_tgt_throws,on_tgt_pct,rpo_plays,rpo_yards,rpo_pass_att,rpo_pass_yards,rpo_rush_att,rpo_rush_yards,pa_pass_att,pa_pass_yards,intended_air_yards,intended_air_yards_per_pass_attempt,completed_air_yards,completed_air_yards_per_completion,completed_air_yards_per_pass_attempt,pass_yards_after_catch,pass_yards_after_catch_per_completion,scrambles,scramble_yards_per_attempt',
  'Shedeur Sanders,CLE,212,8,2,14,0.07,38,0.18,2025,SanSh00,2.6,53,34,45,85,0.403,3,130,0.65,20,90,10,60,10,30,44,300,1600,7.5,900,9.5,4.2,700,7.4,18,5.1',
  'Dillon Gabriel,CLE,185,6,1,10,0.055,26,0.14,2025,GabDi00,2.3,59,20,17,37,0.2,2,120,0.68,15,70,8,45,7,25,38,260,1200,6.5,700,8.9,3.8,600,7.6,12,4.4',
  'Punter Guy,CLE,1,0,0,0,0,0,0,2025,PunGu00,2.8,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,10,0,0,0,0,0,0,0'
].join('\n');

function fakeFetch(byAsset, counter = { n: 0 }) {
  return async (url) => {
    counter.n += 1;
    for (const [asset, body] of Object.entries(byAsset)) {
      if (url.includes(asset)) {
        if (typeof body === 'number') return { ok: false, status: body };
        return { ok: true, status: 200, text: async () => body };
      }
    }
    return { ok: false, status: 404 };
  };
}

beforeEach(() => _clearNflverseCache());
afterEach(() => _clearNflverseCache());

describe('the team column is read per file, never assumed', () => {
  it('resolves a team from the DEFENSIVE file, which spells it "tm"', async () => {
    const r = await getPassRushAndCoverage('Denver Broncos', 2025, {
      fetchImpl: fakeFetch({ advstats_season_def: DEF_CSV })
    });
    expect(r.unavailable).toBeUndefined();
    expect(r.pass_rush[0].player).toBe('Zach Allen');
  });

  it('resolves a team from the PASSING file, which spells it "team"', async () => {
    const r = await getQbPressureProfile('Cleveland Browns', 2025, {
      fetchImpl: fakeFetch({ advstats_season_pass: PASS_CSV })
    });
    expect(r.unavailable).toBeUndefined();
    expect(r.quarterbacks[0].player).toBe('Shedeur Sanders');
  });

  it('SAYS SO if the column is renamed upstream, instead of matching nothing', async () => {
    // Rename tm -> team in the defensive file: every row would silently fail
    // to match, and the lane would report "no charting rows" forever.
    const renamed = DEF_CSV.replace('pfr_id,tm,age', 'pfr_id,team,age');
    const r = await getPassRushAndCoverage('Denver Broncos', 2025, {
      fetchImpl: fakeFetch({ advstats_season_def: renamed })
    });
    expect(r.unavailable).toBe(true);
    expect(r.reason).toMatch(/no longer has a "tm" column/);
  });
});

describe('pass rush', () => {
  it('ranks by pressures, which sacks alone do not capture', async () => {
    const r = await getPassRushAndCoverage('Denver Broncos', 2025, {
      fetchImpl: fakeFetch({ advstats_season_def: DEF_CSV })
    });
    const allen = r.pass_rush.find((p) => p.player === 'Zach Allen');
    // 32 QB hits against 7 sacks: a rush that is winning without finishing.
    expect(allen.qb_hits).toBe(32);
    expect(allen.sacks).toBe(7);
    expect(allen.pressures).toBe(50);
    expect(allen.blitzes).toBe(1);
  });

  it('reads only the requested season', async () => {
    const r = await getPassRushAndCoverage('Denver Broncos', 2024, {
      fetchImpl: fakeFetch({ advstats_season_def: DEF_CSV })
    });
    expect(r.pass_rush.find((p) => p.player === 'Zach Allen').qb_hits).toBe(20);
  });
});

describe('coverage', () => {
  it('reports passer rating allowed per defender', async () => {
    const r = await getPassRushAndCoverage('Denver Broncos', 2025, {
      fetchImpl: fakeFetch({ advstats_season_def: DEF_CSV })
    });
    const surtain = r.coverage.find((c) => c.player === 'Pat Surtain');
    expect(surtain.targets).toBe(62);
    expect(surtain.passer_rating_allowed).toBe(58.1);
    expect(surtain.average_depth_of_target).toBe(11.8);
  });

  it('drops defenders with too few targets to describe', async () => {
    const r = await getPassRushAndCoverage('Denver Broncos', 2025, {
      fetchImpl: fakeFetch({ advstats_season_def: DEF_CSV })
    });
    // A 140.0 rating allowed over six targets is noise, and printing it beside
    // a 62-target line invites exactly the wrong comparison.
    expect(r.coverage.map((c) => c.player)).not.toContain('Bench Guy');
  });
});

describe('failures are stated', () => {
  it('an unknown team is named, not silently empty', async () => {
    const r = await getPassRushAndCoverage('Some Fake Team', 2025, {
      fetchImpl: fakeFetch({ advstats_season_def: DEF_CSV })
    });
    expect(r.unavailable).toBe(true);
    expect(r.reason).toMatch(/No nflverse team code/);
  });

  it('a season PFR has not charted yet is stated as such', async () => {
    const r = await getPassRushAndCoverage('Denver Broncos', 2099, {
      fetchImpl: fakeFetch({ advstats_season_def: DEF_CSV })
    });
    expect(r.unavailable).toBe(true);
    expect(r.reason).toMatch(/no 2099 defensive charting rows/);
  });

  it('a failed fetch is not an empty result', async () => {
    const r = await getQbPressureProfile('Cleveland Browns', 2025, {
      fetchImpl: async () => { throw new Error('network down'); }
    });
    expect(r.unavailable).toBe(true);
    expect(r.quarterbacks).toBeUndefined();
  });

  it('caches, so both PFR lanes cost one request each per process', async () => {
    const counter = { n: 0 };
    const fetchImpl = fakeFetch({ advstats_season_def: DEF_CSV }, counter);
    await getPassRushAndCoverage('Denver Broncos', 2025, { fetchImpl });
    await getPassRushAndCoverage('Denver Broncos', 2025, { fetchImpl });
    expect(counter.n).toBe(1);
  });
});
