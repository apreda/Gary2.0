import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';

const codex=vi.fn(), createSession=vi.fn(), send=vi.fn();
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js',()=>({codexCliOneShot:(...a)=>codex(...a)}));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/claudeCliSession.js',()=>({
  createClaudeCliSession:(...a)=>createSession(...a), sendToClaudeCliSession:(...a)=>send(...a)}));

const load=async()=>await import('../../../src/services/pickdesk/winnersCascade.js');

describe('the one Winners cascade',()=>{
 beforeEach(()=>{codex.mockReset();createSession.mockReset();send.mockReset();createSession.mockResolvedValue({});});

 it('is Sol first, then the game-pick cascade, and never the personal account',async()=>{
  const {WINNERS_CASCADE}=await load();
  expect(WINNERS_CASCADE).toEqual(['gpt-5.6-sol','claude-fable-5-1','codex-gpt-6-astra','claude-opus-5']);
  expect(WINNERS_CASCADE).not.toContain('claude-sonnet-5');
 });

 it('returns the first rung that answers and names the model that did',async()=>{
  const {cascadeRead}=await load();
  codex.mockResolvedValue({success:true,data:'{"a":1}',raw:'{"a":1}'});
  const r=await cascadeRead('p',{timeoutMs:480_000,systemPrompt:'s',breakerKey:'k'});
  expect(r).toMatchObject({success:true,model:'gpt-5.6-sol'});
  expect(codex).toHaveBeenCalledTimes(1);
  expect(codex.mock.calls[0][1]).toMatchObject({breakerKey:'k',allowPersonalAccount:false,model:'gpt-5.6-sol'});
 });

 // Sep 18 2026: sonnet-5 took AbortSignal.timeout(remaining) — the whole window —
 // so the rung behind it hit "time budget exhausted" and never ran. Every rung
 // but the last must hand the window behind it back.
 it('a hanging Claude rung cannot swallow the window the next rung needs',async()=>{
  const {cascadeRead,RUNG_RESERVE_MS}=await load();
  codex.mockResolvedValueOnce({success:false,error:'capped'});     // Sol
  send.mockRejectedValueOnce(new Error('aborted due to timeout')); // Fable hangs
  codex.mockResolvedValueOnce({success:false,error:'no login'});   // Astra
  send.mockResolvedValueOnce({content:'{"ok":true}'});             // Opus answers
  const r=await cascadeRead('p',{timeoutMs:480_000,systemPrompt:'s',breakerKey:'k'});
  expect(r).toMatchObject({success:true,model:'claude-opus-5',data:'{"ok":true}'});
  const claudeBudgets=createSession.mock.calls.map(c=>c[0].modelName);
  expect(claudeBudgets).toEqual(['claude-fable-5-1','claude-opus-5']);
  // the non-last Claude rung was capped, not handed the remainder
  expect(codex.mock.calls[0][1].timeoutMs).toBeLessThanOrEqual(480_000-RUNG_RESERVE_MS);
 });

 it('reports every rung that failed rather than only the first',async()=>{
  const {cascadeRead}=await load();
  codex.mockResolvedValue({success:false,error:'capped'});
  send.mockRejectedValue(new Error('empty'));
  const r=await cascadeRead('p',{timeoutMs:480_000,systemPrompt:'s',breakerKey:'k'});
  expect(r.success).toBe(false);
  for(const m of ['gpt-5.6-sol','claude-fable-5-1','codex-gpt-6-astra','claude-opus-5']) expect(r.error).toContain(m);
 });

 it('starts no rung it cannot give a real window',async()=>{
  const {cascadeRead}=await load();
  const r=await cascadeRead('p',{timeoutMs:1_000,systemPrompt:'s',breakerKey:'k'});
  expect(r.success).toBe(false);
  expect(r.error).toContain('time budget exhausted');
  expect(codex).not.toHaveBeenCalled();
  expect(createSession).not.toHaveBeenCalled();
 });
});
