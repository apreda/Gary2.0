import{describe,it,expect}from'vitest';
import{propQuoteReceipt,selectionMatchesQuote}from'../../src/services/propQuoteReceipt.js';
const source={id:9,game_id:123,player_id:456,vendor:'draftkings',prop_type:'pitcher_earned_runs',line_value:'0.5',updated_at:'2026-09-18T22:00:00Z',market:{type:'over_under',over_odds:-187,under_odds:140}};
const market=()=>({player_id:456,game_id:123,prop_type:'pitcher_earned_runs',line:0.5,over_odds:-187,over_vendor:'draftkings',over_source_market:structuredClone(source)});
describe('immutable prop quote receipts',()=>{
 it('preserves the original exact book, side, line, price and provider row when the menu changes',()=>{const m=market(),r=propQuoteReceipt(m,'over');m.over_odds=-400;m.over_source_market.market.over_odds=-400;expect(r).toMatchObject({odds:-187,line:0.5,side:'over',bookmaker:'draftkings',provider_market_id:9,provider_updated_at:source.updated_at,market_phase:'pregame'});expect(r.source_market.market.over_odds).toBe(-187);expect(r.quote_id).toMatch(/^[a-f0-9]{64}$/);});
 it.each(['vendor','price','player','game'])('rejects mismatched %s provenance',kind=>{const m=market();if(kind==='vendor')m.over_vendor='fanduel';if(kind==='price')m.over_odds=-400;if(kind==='player')m.player_id=1;if(kind==='game')m.game_id=1;expect(propQuoteReceipt(m,'over')).toBeNull();});
 it('cannot silently change the price selected by the model',()=>{const q=propQuoteReceipt(market(),'over');expect(selectionMatchesQuote({odds:-187},q)).toBe(true);expect(selectionMatchesQuote({odds:-400},q)).toBe(false);expect(selectionMatchesQuote({},q)).toBe(false);});
});
