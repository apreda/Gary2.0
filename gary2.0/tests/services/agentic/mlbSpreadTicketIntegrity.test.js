import{describe,it,expect}from'vitest';
import{normalizePickFormat}from'../../../src/services/agentic/mlbJuneEra/responseParser.js';
describe('MLB selected-side ticket metadata',()=>{
 it.each([
 ['Cleveland Guardians','Athletics','Athletics +1.5 -102',-1.5,-118,1.5,-102],
 ['Colorado Rockies','San Diego Padres','Padres -1.5 -128',1.5,106,-1.5,-128],
 ['Los Angeles Dodgers','San Francisco Giants','Giants +1.5 +122',-1.5,-146,1.5,122],
 ])('keeps the written away ticket for %s vs %s',(home,away,pick,homeLine,homePrice,line,price)=>{
  const result=normalizePickFormat({pick,type:'spread',odds:price,rationale:'Dated matchup evidence supports this exact selected ticket and its saved price. '.repeat(20)},home,away,'baseball_mlb',{spread_home:homeLine,spread_home_odds:homePrice,spread_away_odds:price});
  expect(result).toMatchObject({pick,odds:price,spread:line,spreadOdds:price});
 });
});
