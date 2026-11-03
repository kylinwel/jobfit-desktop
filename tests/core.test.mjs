import {test} from "node:test";
import assert from "node:assert/strict";
import {assess,tailor,skillPresent,cleanJob,validatePlan,factCatalog,markdown,resumeHTML} from "../src/ui/lib/core.js";
import {initialState,saveProfile,upsertJobs,makeResume,approve,nextItem,recoverInFlight,demoProfile,demoJobs} from "../src/ui/lib/state.js";
import {planFacts} from "../src/ui/lib/llm.js";
const profile=()=>demoProfile();
const job=()=>({...demoJobs[0],source:"manual"});
function ready(){
  const s=initialState();saveProfile(s,profile());upsertJobs(s,[job()]);makeResume(s,s.jobs[0].id);return s;
}
test("internship hard gates reject graduate-year, location, duration and degree mismatches",()=>{
  for(const overrides of [
    {city:"上海"},{description:"面向2027届本科在读生，每周4天，至少实习3个月"},
    {description:"面向2028届硕士及以上，至少实习6个月，每周5天"},
    {description:"面向2028届，每周6天，至少实习3个月"},
    {description:"面向2028届，本科，每周5天，需先缴纳培训费"}
  ])assert.equal(assess(profile(),{...job(),...overrides}).status,"blocked");
});
test("unknown requirements remain explicitly unknown",()=>{
  const a=assess(profile(),{...job(),description:"Python 实习，欢迎本科在校生",city:""});
  assert.equal(a.status,"review");assert.ok(a.unknowns.length>=3);
});
test("matching beginner Python is not upgraded to proficient",()=>{
  const p=profile(),j=job(),a=assess(p,j),r=tailor(p,j);
  assert.equal(a.status,"match");assert.equal(a.matched[0].level,"入门");
  assert.ok(a.cautions.some(t=>t.includes("熟练程度")));
  assert.match(markdown(r),/Python：入门/);
});
test("C, C++, Java and JavaScript are not confused",()=>{
  assert.equal(skillPresent("要求 C++ 和 JavaScript", "C"),false);
  assert.equal(skillPresent("要求 C++ 和 JavaScript", "Java"),false);
  assert.equal(skillPresent("要求 C++ 和 JavaScript", "C++"),true);
  assert.equal(skillPresent("React 前端", "C"),false);
});
test("unconfirmed projects never enter resume; confirmed bullets remain exact",()=>{
  const p=profile(),r=tailor(p,job());
  assert.equal(r.projects.length,1);assert.equal(r.projects[0].role,"跟随教程完成");
  assert.ok(!markdown(r).includes("高并发"));
  const facts=factCatalog(p);
  assert.deepEqual(r.projects.flatMap(p=>p.bullets).sort(),facts.map(f=>f.text).sort());
});
test("LLM cannot introduce facts through invented or repeated IDs",()=>{
  const facts=factCatalog(profile());
  assert.throws(()=>validatePlan({factIds:["invented:99"]},facts));
  assert.throws(()=>validatePlan({factIds:[facts[0].id,facts[0].id]},facts));
});
test("resume HTML treats untrusted content as text",()=>{
  const p=profile();p.name='<script>alert(1)</script>';p.projects[0].bullets[0]='<img src=x onerror="steal()">';
  const html=resumeHTML(tailor(p,job()));
  assert.ok(!html.includes("<script>"));assert.ok(!html.includes("<img "));
  assert.ok(html.includes("&lt;script&gt;"));
});
test("job URL tracking parameters do not defeat deduplication",()=>{
  const s=initialState();const j={...job(),url:"https://www.zhipin.com/job_detail/abc.html?lid=1"};
  upsertJobs(s,[j,{...j,url:j.url.replace("lid=1","lid=2")}]);assert.equal(s.jobs.length,1);
  assert.equal(cleanJob({...j,url:"javascript:alert(1)"}).url,"");
});
test("profile or JD changes invalidate generated resumes and approved items",()=>{
  const s=ready(),id=s.jobs[0].id;approve(s,id);saveProfile(s,{...s.profile,months:3});
  assert.equal(s.jobs[0].resume,null);assert.equal(s.queue[0].status,"needs_review");
  makeResume(s,id);approve(s,id);upsertJobs(s,[{...s.jobs[0],description:"新要求，至少实习6个月"}]);
  assert.equal(s.queue[0].status,"needs_review");assert.equal(s.jobs[0].resume,null);
});
test("cannot approve fake jobs or missing personal details",()=>{
  const s=ready();s.profile.name="";assert.throws(()=>approve(s,s.jobs[0].id),/姓名/);
  s.profile=profile();s.jobs[0].source="demo";assert.throws(()=>approve(s,s.jobs[0].id),/虚构/);
});
test("daily caps, delay and pause are enforced",()=>{
  const s=ready(),id=s.jobs[0].id,q=approve(s,id),now=Date.now();
  assert.equal(nextItem(s,now),null);
  s.automation.running=true;assert.equal(nextItem(s,now).id,q.id);
  s.automation.lastAttempt=now;assert.equal(nextItem(s,now+1000),null);
  s.automation.lastAttempt=0;s.automation.dailyLimit=1;q.attemptAt=new Date(now).toISOString();
  assert.equal(nextItem(s,now),null);
});
test("interrupted or uncertain sends are never automatically repeated",()=>{
  const s=ready(),id=s.jobs[0].id;approve(s,id);s.queue[0].status="sending";
  recoverInFlight(s);assert.equal(s.queue[0].status,"uncertain");assert.throws(()=>approve(s,id),/不能重复/);
  s.automation.running=true;assert.equal(nextItem(s),null);
});
test("LLM payload excludes contact fields and validates output IDs",async()=>{
  const p=profile(),id=factCatalog(p)[0].id;
  p.phone="18800001234";
  const ids=await planFacts(p,job(),{endpoint:"https://example.com/v1/chat/completions",model:"demo",key:"test-key"},async(url,opts)=>{
    assert.ok(!opts.body.includes(p.email));assert.ok(!opts.body.includes(p.phone));assert.ok(!opts.body.includes("test-key"));
    assert.equal(opts.redirect,"error");
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({factIds:[id]})}}]})};
  });assert.deepEqual(ids,[id]);
});
test("LLM failures are not silently converted into generated content",async()=>{
  await assert.rejects(planFacts(profile(),job(),{endpoint:"https://example.com/v1/chat/completions",model:"demo"},async()=>({ok:false,status:401})),/401/);
  await assert.rejects(planFacts(profile(),job(),{endpoint:"http://evil.example/v1/chat/completions",model:"demo"}),/HTTPS/);
});
