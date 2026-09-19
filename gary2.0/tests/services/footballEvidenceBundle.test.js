import {describe,it,expect,vi}from'vitest';
import{footballEvidenceBundle,formatFootballEvidence}from'../../src/services/footballEvidenceBundle.js';
import{formatNcaafTeamStats}from'../../src/services/agentic/scoutReport/sports/ncaaf.js';
import{formatNflTeamStats}from'../../src/services/agentic/scoutReport/sports/nfl.js';
describe('guaranteed football defensive context',()=>{
 it('keeps source failures visible and preserves available NFL samples',async()=>{const loaders={DEFENSIVE_EPA:vi.fn(async()=>({source:'nflverse',season:2026,games:2,epa:-.13})),PRESSURE_RATE:vi.fn(async()=>{throw Error('PFR charting unavailable');}),RED_ZONE_DEFENSE:vi.fn(async()=>({source:'nflverse',opportunities:4}))};const b=await footballEvidenceBundle({league:'NFL',home:{id:1},away:{id:2},season:2026,loaders});expect(b.DEFENSIVE_EPA.epa).toBe(-.13);expect(b.PRESSURE_RATE).toEqual({unavailable:true,reason:'PFR charting unavailable'});expect(formatFootballEvidence(b)).toContain('Missing charting is not zero');});
 it.each([formatNcaafTeamStats,formatNflTeamStats])('does not print null measurements as zero',fn=>{const output=fn('Home','Away',{season:2026,games:2,seasonStats:{passing_yards_per_game:null,passing_interceptions:null,opp_passing_yards:null}},{season:2026,games:2,seasonStats:{passing_yards_per_game:null,passing_interceptions:null,opp_passing_yards:null}});expect(output).not.toMatch(/Passing[^\n]*\b0\.0\b/i);expect(output).toContain('—');});
});
