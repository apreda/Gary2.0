import {afterEach,it,expect,vi} from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it('Savant numeric IDs never fall through to a surname match; full names resolve exactly',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,text:async()=> '"last_name, first_name",player_id,year,pa,ba,est_ba\n"Garcia, Luis",11,2026,100,.250,.267\n"Garcia, Yimi",22,2026,100,.210,.233\n'}));
 const {getPlayerXStats,getBatchXStats}=await import('../../src/services/baseballSavantService.js');
 expect((await getPlayerXStats('pitcher','Luis Garcia',2026)).player_id).toBe(11);
 expect(await getPlayerXStats('pitcher','Garcia',2026)).toBeNull();
 expect(await getPlayerXStats('pitcher',99,2026)).toBeNull();
 expect((await getBatchXStats('pitcher',['Yimi Garcia'],2026))['Yimi Garcia'].player_id).toBe(22);
});
