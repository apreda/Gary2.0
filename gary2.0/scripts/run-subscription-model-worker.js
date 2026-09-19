#!/usr/bin/env node
import '../src/loadEnv.js';
import { createClient } from '@supabase/supabase-js';
import { executeCloudModelJob } from '../src/services/cloudModelJob.js';
const db=createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
let stopping=false;
async function expireJobs(){
 const {error}=await db.from('subscription_model_jobs').update({status:'failed',error:'Subscription worker did not complete before the job deadline',request:{},completed_at:new Date().toISOString()}).in('status',['queued','running']).lt('expires_at',new Date().toISOString());
 if(error)console.error(`[Subscription worker expiry] ${error.message}`);
 // Keep diagnostic status/route, but erase completed scan/model payloads after a day.
 const {error:cleanupError}=await db.from('subscription_model_jobs').update({request:{},response:null}).in('status',['completed','failed']).lt('completed_at',new Date(Date.now()-86400000).toISOString()).not('response','is',null);
 if(cleanupError)console.error(`[Subscription worker cleanup] ${cleanupError.message}`);
}
await expireJobs();
setInterval(expireJobs,30000).unref();
process.on('SIGTERM',()=>{stopping=true;});
async function worker(){
 while(!stopping){
  try {
   const {data,error}=await db.rpc('claim_subscription_model_job');if(error)throw error;
   const job=data?.[0];
   if(!job){await new Promise(r=>setTimeout(r,1000));continue;}
   let update;
   try { const result=await executeCloudModelJob(job);update={status:'completed',...result}; }
   catch(error){update={status:'failed',error:error.message.slice(0,2400)};}
   const {data:saved,error:writeError}=await db.from('subscription_model_jobs').update({...update,request:{},completed_at:new Date().toISOString()}).eq('id',job.id).eq('status','running').gt('expires_at',new Date().toISOString()).select('id');
   if(writeError)throw writeError;
   if(!saved?.length){console.warn(`[Subscription worker] ${job.id}: late result discarded`);continue;}
   console.log(JSON.stringify({id:job.id,lane:job.lane,status:update.status,route:update.route,error:update.error}));
  }catch(error){console.error(`[Subscription worker] ${error.message}`);await new Promise(r=>setTimeout(r,5000));}
 }
}
// Bound concurrent subscription usage; the queue retains a separate deadline per job.
await Promise.all([worker(),worker()]);
