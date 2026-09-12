import test from "node:test";
import assert from "node:assert/strict";
import { selectAudiencePicks, audienceEvidence, audienceCap, audienceDeadlineOutcomes } from "./audience.ts";
import { socialRunHealth } from "./health.js";
import { marqueeScore } from "./marquee.ts";
import { publicationKey } from "./pickSources.js";
const day = "2026-09-19";
const at = (time: string, date = day) => Date.parse(`${date}T${time}:00-04:00`);
const pick = (id: number, time: string, league = "NCAAF", other: any = {}) => ({
  game_id: id, pick: `Away ${id} ML`, awayTeam: `Away ${id}`, homeTeam: `Home ${id}`,
  league, commence_time: new Date(at(time)).toISOString(), ...other,
});
const slate = (p: any) => ({ bdl_game_id: p.game_id, league: p.league, away_team: p.awayTeam, home_team: p.homeTeam,
  commence_time: p.commence_time, away_ranking: p.awayRanking, home_ranking: p.homeRanking });
const receipt = (p: any, time: string) => ({ post_date: day, posted_at: new Date(at(time)).toISOString(),
  pick_text: p.pick, league: p.league, slot: p.audience_selection?.cell.split(":")[1] ?? "morning",
  audience_selection: p.audience_selection, publication_key: publicationKey(p), thread_format: "standard" });

test("college audience uses exact school identity and rankings, never baseball mascots or confidence", () => {
  const big = pick(1,"12:00","NCAAF",{awayTeam:"Ohio State Buckeyes",homeTeam:"Texas Longhorns",awayRanking:1,homeRanking:3,confidence:0});
  assert.ok(marqueeScore(big) > marqueeScore(pick(2,"12:00","NCAAF",{confidence:100})));
  assert.equal(marqueeScore(pick(2,"12:00","NCAAF",{awayTeam:"Oregon State Beavers"})),2);
  assert.equal(marqueeScore({...big,confidence:100}),marqueeScore(big));
});
test("a 60-game mixed day gets 12 roots and reserves every sport/day-part before research arrives", () => {
  const games = Array.from({length:60},(_,i)=>pick(i,["12:00","15:30","19:30","22:00"][i%4],i<45?"NCAAF":"MLB"));
  const r = selectAudiencePicks(games.slice(0,1),games.map(slate),[],[],at("10:00"));
  assert.equal(r.target,12); assert.equal(r.cap,12);
  assert.equal(r.plan.length,8); assert.ok(r.plan.every(c=>c.quota>=1));
  assert.equal(r.plan.reduce((n,c)=>n+c.quota,0),12);
  assert.ok(r.queue.length<=1);
});
test("15-game baseball-only day targets six and a lone game can post", () => {
  const games=Array.from({length:15},(_,i)=>pick(i,"19:10","MLB"));
  assert.equal(selectAudiencePicks(games,games.map(slate),[],[],at("17:10")).target,6);
  assert.equal(selectAudiencePicks([games[0]],[slate(games[0])],[],[],at("17:10")).queue.length,1);
});
test("the best scheduled audience can wait for research, then a real alternate fills at T-45", () => {
  const big=pick(1,"12:00","NCAAF",{awayTeam:"Ohio State Buckeyes",homeTeam:"Texas Longhorns",awayRanking:1,homeRanking:3});
  const small=pick(2,"12:00");
  const board=[big,small].map(slate);
  assert.equal(selectAudiencePicks([small],board,[],[],at("10:00")).queue.length,0);
  const fill=selectAudiencePicks([small],board,[],[],at("11:15")).queue[0];
  assert.equal(fill.pick,small.pick); assert.equal(fill.audience_selection.basis,"missing_pick_window_fill");
  assert.equal(selectAudiencePicks([big,small],board,[],[],at("10:00")).queue[0].pick,big.pick);
});
test("30-minute spacing and a five-minute hard deadline, including late and next-day games", () => {
  const a=pick(1,"12:00"),b=pick(2,"12:00");
  const logs=[receipt(a,"10:00")];
  assert.equal(selectAudiencePicks([b],[a,b].map(slate),logs,[],at("10:15")).reason,"30-minute spacing");
  for(const time of ["11:56","12:00","12:30"]) assert.equal(selectAudiencePicks([b],[slate(b)],[],[],at(time)).queue.length,0);
  const tomorrow={...b,commence_time:new Date(at("00:30","2026-09-20")).toISOString()};
  assert.equal(selectAudiencePicks([tomorrow],[slate(tomorrow)],[],[],at("23:00")).queue.length,0);
});
test("cancelled, duplicate and high-confidence picks cannot bypass selection", () => {
  const p=pick(1,"12:00");
  assert.equal(selectAudiencePicks([p],[{...slate(p),game_status:"cancelled"}],[],[],at("10:00")).queue.length,0);
  assert.equal(selectAudiencePicks([p],[slate(p)],[receipt(p,"09:00")],[],at("10:00")).queue.length,0);
});
test("completed early games do not shrink the day denominator or consume late reservations", () => {
  const games=Array.from({length:30},(_,i)=>pick(i,i<15?"12:00":"22:00",i%2?"MLB":"NCAAF"));
  const board=games.map(p=>({...slate(p),game_status:p.game_id<15?"final":"scheduled"}));
  const r=selectAudiencePicks(games.slice(15),board,[],[],at("20:00"));
  assert.equal(r.target,12); assert.ok(r.plan.filter(p=>p.cell.endsWith("late")).every(p=>p.quota>=1));
});
test("mature measured response influences priority; tiny, missing and immature samples do not", () => {
  const p=pick(1,"12:00","MLB",{awayTeam:"Chicago Cubs",homeTeam:"Brewers"});
  const row=(i:number,views:any,team:string)=>({league:"MLB",slot:"morning",thread_format:"standard",impressions:views,
    profile_clicks:3,pick_text:`${team} ML -110`,posted_at:new Date(at("10:00","2026-09-15")+i*1000).toISOString()});
  const others=Array.from({length:20},(_,i)=>row(i,100,"Royals"));
  const good=Array.from({length:8},(_,i)=>row(i,2000,"Cubs"));
  assert.ok(audienceEvidence(p,[...others,...good],at("10:00")).team_adjustment>0);
  assert.equal(audienceEvidence(p,[...others,...good.slice(0,4)],at("10:00")).team_adjustment,0);
  assert.equal(audienceEvidence(p,good.map(r=>({...r,impressions:null})),at("10:00")).team_posts,0);
  assert.equal(audienceEvidence(p,good.map(r=>({...r,posted_at:new Date(at("09:00")).toISOString()})),at("10:00")).team_posts,0);
});
test("only the transition date has room beyond twelve",()=>{
  assert.equal(audienceCap("2026-09-12"),16);assert.equal(audienceCap("2026-09-13"),12);
});

test("intentional omissions stay healthy while an attempted post missing its deadline is reported",()=>{
  const a=pick(1,"12:00"),b=pick(2,"12:00"),c=pick(3,"12:00");
  const intentional=audienceDeadlineOutcomes([a,b,c],[receipt(c,"10:00")],[],at("12:00"));
  assert.deepEqual(intentional,{missed:[],skipped_pregame:[a.pick,b.pick]});
  assert.equal(socialRunHealth(intentional).status,"ok");
  const attempted=audienceDeadlineOutcomes([a,b,c],[receipt(c,"10:00")],[{publication_key:publicationKey(a),state:"expired"}],at("12:00"));
  assert.deepEqual(attempted,{missed:[a.pick],skipped_pregame:[b.pick]});
  assert.ok(socialRunHealth(attempted).issues.includes("MISSED_PREGAME_POSTS"));
});

test("an older matchup-key receipt cannot reserve a second slot through the provider game ID",()=>{
  const posted=pick(1,"12:00","NCAAF",{game_id:null,awayTeam:"Ohio State Buckeyes",homeTeam:"Texas Longhorns",awayRanking:1,homeRanking:3});
  const next=pick(2,"12:00");
  const board=[{...slate(posted),bdl_game_id:1},slate(next)];
  const r=selectAudiencePicks([next],board,[receipt(posted,"09:00")],[],at("10:00"),[posted,next]);
  assert.ok(r.plan.every(c=>!c.preferred.some(name=>name.includes("Ohio State"))));
  assert.equal(r.queue.length,0); // two-game day already has its one feature
});

test("missing profile metrics do not count as zero measured visits",()=>{
  const p=pick(1,"12:00","MLB",{awayTeam:"Chicago Cubs"});
  const rows=Array.from({length:20},(_,i)=>({league:"MLB",slot:"morning",thread_format:"standard",impressions:100,
    profile_clicks:i<10?null:10,pick_text:i<10?"Cubs ML":"Royals ML",posted_at:new Date(at("10:00","2026-09-15")).toISOString()}));
  assert.equal(audienceEvidence(p,rows,at("10:00")).team_adjustment,0);
});

test("a complete mixed-sport day keeps twelve posts spaced and covers all four day-parts",()=>{
  const games=Array.from({length:60},(_,i)=>pick(i,["12:00","15:30","19:30","22:00"][i%4],i<45?"NCAAF":"MLB"));
  const logs:any[]=[];
  for(let now=at("08:00");now<=at("23:00");now+=15*60_000){
    // Research arrives at T-120, after the schedule has already reserved space.
    const published=games.filter(p=>Date.parse(p.commence_time)-now<=120*60_000);
    const r=selectAudiencePicks(published,games.map(slate),logs,[],now);
    for(const p of r.queue){
      const lead=(Date.parse(p.commence_time)-now)/60_000;
      assert.ok(lead>=5&&lead<=120);
      if(logs.length)assert.ok(now-Date.parse(logs.at(-1).posted_at)>=30*60_000);
      logs.push({...receipt(p,"08:00"),posted_at:new Date(now).toISOString()});
    }
  }
  assert.equal(logs.length,12);
  assert.equal(new Set(logs.map(l=>l.publication_key)).size,12);
  assert.equal(new Set(logs.map(l=>l.audience_selection.cell)).size,8);
});

test("today's ten inherited posts leave one place in each remaining sport and day-part",()=>{
  const date="2026-09-12", shift=(p:any)=>({...p,commence_time:new Date(Date.parse(p.commence_time)-7*86400_000).toISOString()});
  const early=Array.from({length:10},(_,i)=>shift(pick(i,"12:00",i<9?"NCAAF":"MLB")));
  const future=Array.from({length:50},(_,i)=>shift(pick(i+10,["15:30","19:30","22:00"][i%3],i<36?"NCAAF":"MLB")));
  const logs=early.map(p=>({...receipt(p,"10:00"),post_date:date,posted_at:new Date(at("10:00",date)).toISOString()}));
  const r=selectAudiencePicks(future,[...early,...future].map(slate),logs,[],at("12:00",date),[...early,...future]);
  assert.equal(r.target,16);
  assert.equal(r.plan.reduce((n,c)=>n+c.quota,0),16);
  assert.ok(r.plan.filter(c=>!c.cell.endsWith("morning")).every(c=>c.quota===1));
});
