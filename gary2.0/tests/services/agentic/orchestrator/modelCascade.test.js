import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';

const codex=vi.fn(), createSession=vi.fn(), send=vi.fn();
vi.mock('../../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js',()=>({codexCliOneShot:(...a)=>codex(...a)}));
vi.mock('../../../../src/services/agentic/orchestrator/providerAdapters/claudeCliSession.js',()=>({
  createClaudeCliSession:(...a)=>createSession(...a), sendToClaudeCliSession:(...a)=>send(...a)}));
const deepseek=vi.fn();
vi.mock('../../../../src/services/agentic/orchestrator/providerAdapters/deepseekSession.js',()=>({
  deepseekOneShot:(...a)=>deepseek(...a), deepseekConfigured:()=>Boolean(process.env.DEEPSEEK_API_KEY),
  DEEPSEEK_RUNG:'deepseek'}));

const load=async()=>await import('../../../../src/services/agentic/orchestrator/modelCascade.js');

describe('the one model cascade',()=>{
 beforeEach(()=>{codex.mockReset();createSession.mockReset();send.mockReset();createSession.mockResolvedValue({});});

 it('is Sol first, then the game-pick cascade, and never the personal account',async()=>{
  const {HEAVY_CASCADE}=await load();
  expect(HEAVY_CASCADE).toEqual(['gpt-5.6-sol','claude-fable-5-1','codex-gpt-6-astra','claude-opus-5']);
  expect(HEAVY_CASCADE).not.toContain('claude-sonnet-5');
 });

 // Founder, Sep 18 2026: "for the parts that might be like Sonnet then dont do
 // astra do Terra for the GPT fallback".
 it('gives the Sonnet-class lanes Terra, and the decision lanes Astra',async()=>{
  const {cascadeFor}=await load();
  expect(cascadeFor('gpt-5.6-sol','light')).toEqual(['gpt-5.6-sol','codex-gpt-5.6-terra','claude-fable-5-1']);
  expect(cascadeFor('gpt-5.6-sol','heavy')).toEqual(['gpt-5.6-sol','claude-fable-5-1','codex-gpt-6-astra','claude-opus-5']);
  expect(cascadeFor('gpt-5.6-sol','light')).not.toContain('codex-gpt-6-astra');
  // a lane keeps whatever model it leads with
  expect(cascadeFor('gpt-5.6-luna','light')[0]).toBe('gpt-5.6-luna');
 });

 // "we have 2 GPT accounts you can use for the fallback a plus and a pro."
 // Gary's own login answers first; Pro is only ever a fallback's last resort.
 it('spends the personal Pro login only on a fallback rung',async()=>{
  const {cascadeRead}=await load();
  codex.mockResolvedValueOnce({success:false,error:'capped'});
  codex.mockResolvedValueOnce({success:true,data:'{"a":1}'});
  await cascadeRead('p',{timeoutMs:480_000,systemPrompt:'s',breakerKey:'k',
    cascade:['gpt-5.6-sol','codex-gpt-5.6-terra']});
  expect(codex.mock.calls[0][1].allowPersonalAccount).toBe(false);
  expect(codex.mock.calls[1][1].allowPersonalAccount).toBe(true);
 });

 // Founder, Sep 18 2026: "lets do a final deepseek fail back." It is the only
 // METERED rung, so it sits below every free one — and adding it changes
 // nothing at all until a key exists.
 it('adds no rung until DeepSeek is configured',async()=>{
  delete process.env.DEEPSEEK_API_KEY;
  const {cascadeFor}=await load();
  expect(cascadeFor('gpt-5.6-sol','heavy')).toEqual(['gpt-5.6-sol','claude-fable-5-1','codex-gpt-6-astra','claude-opus-5']);
  expect(cascadeFor('gpt-5.6-sol','light')).toEqual(['gpt-5.6-sol','codex-gpt-5.6-terra','claude-fable-5-1']);
 });

 it('puts DeepSeek dead last in both tiers once a key exists',async()=>{
  process.env.DEEPSEEK_API_KEY='k';
  try {
   const {cascadeFor}=await load();
   expect(cascadeFor('gpt-5.6-sol','heavy').at(-1)).toBe('deepseek');
   expect(cascadeFor('gpt-5.6-sol','light').at(-1)).toBe('deepseek');
   expect(cascadeFor('gpt-5.6-sol','heavy')).toHaveLength(5);
  } finally { delete process.env.DEEPSEEK_API_KEY; }
 });

 it('reaches DeepSeek only after every free rung has failed',async()=>{
  process.env.DEEPSEEK_API_KEY='k';
  try {
   const {cascadeRead}=await load();
   codex.mockResolvedValue({success:false,error:'capped'});
   send.mockRejectedValue(new Error('Fable limit'));
   deepseek.mockResolvedValue({success:true,data:'{"a":1}',model:'deepseek'});
   const r=await cascadeRead('p',{timeoutMs:900_000,systemPrompt:'s',breakerKey:'k',
     cascade:['gpt-5.6-sol','claude-fable-5-1','codex-gpt-6-astra','claude-opus-5','deepseek']});
   expect(r).toMatchObject({success:true,model:'deepseek'});
   expect(codex).toHaveBeenCalledTimes(2);
   expect(createSession).toHaveBeenCalledTimes(2);
   expect(deepseek).toHaveBeenCalledTimes(1);
  } finally { delete process.env.DEEPSEEK_API_KEY; }
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
