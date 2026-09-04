import {describe,it,expect} from 'vitest';
import {footballCaseSnapshot} from '../../scripts/lib/footballCaseSnapshot.js';
const home='Oklahoma Sooners',away='UTEP Miners';
const section=(team,body)=>`## CASE FOR ${team.toUpperCase()} COVERING THE SPREAD:\n${body}\n`;
describe('football original case storage',()=>{
  it.each([true,false])('preserves both exact cases without the final ticket, home first %s',homeFirst=>{
    const h=section(home,'Original home cover case with its unresolved assumption.');
    const a=section(away,'Original away cover case and opposing evidence.');
    const result={_fullAssistantNarrative:`${homeFirst?h+a:a+h}\nINVESTIGATION COMPLETE\n\nFinal decision and rationale.`};
    expect(footballCaseSnapshot(result,home,away)).toEqual({path_home:'Original home cover case with its unresolved assumption.',path_away:'Original away cover case and opposing evidence.'});
  });
  it('keeps the latest complete original pair and never synthesizes missing cases',()=>{
    const old=section(home,'Old home draft.')+section(away,'Old away draft.')+'\nINVESTIGATION COMPLETE\n';
    const latest=section(home,'Revised original home case.')+section(away,'Revised original away case.')+'\nINVESTIGATION COMPLETE\n';
    expect(footballCaseSnapshot({_context:{fullAssistantNarrative:old+latest}},home,away)).toEqual({path_home:'Revised original home case.',path_away:'Revised original away case.'});
    expect(footballCaseSnapshot({_fullAssistantNarrative:section(home,'Only one case.')+'INVESTIGATION COMPLETE'},home,away)).toEqual({path_home:null,path_away:null});
    expect(footballCaseSnapshot({rationale:'A persuasive final card without saved cases.'},home,away)).toEqual({path_home:null,path_away:null});
  });
  it('preserves cases already returned by the orchestrator',()=>{
    expect(footballCaseSnapshot({path_home:'H',path_away:'A'},home,away)).toEqual({path_home:'H',path_away:'A'});
  });
});
