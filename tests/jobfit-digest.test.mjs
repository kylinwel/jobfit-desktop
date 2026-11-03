import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {digestDue,shanghaiDay,nowcoderJob,fetchNowcoder,makeDigest,digestCsv} from '../src/ui/lib/digest.js';
import {demoProfile} from '../src/ui/lib/state.js';
import {assess} from '../src/ui/lib/core.js';
const require=createRequire(import.meta.url),{createDailyDigest}=require('../src/main/jobfit-digest.cjs');
const assets=fileURLToPath(new URL('../src/ui/',import.meta.url));
const time=Date.parse('2026-11-03T01:00:00Z'),since=time-86400000;
const raw=(id='123',changes={})=>({id,status:0,jobName:'Python 实习生',jobCity:'杭州',createTime:time-3600000,updateTime:time,refreshTime:time,recruitType:2,eduLevel:5000,graduationYear:'2028届',durationDays:4,durationMonths:3,salaryMin:150,salaryMax:200,salaryType:1,ext:JSON.stringify({infos:'参与 Python 测试与文档整理',requirements:'2028届在读本科生'}),recommendInternCompany:{companyName:'测试公司'},...changes});
const response=(rows=[])=>({ok:true,status:200,text:async()=>JSON.stringify({code:0,data:{datas:rows,totalPage:1,currentPage:1,totalCount:rows.length}})});
const folders=[],engines=[];
async function engine(extra={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'jobfit-digest-'));folders.push(directory);
  const e=await createDailyDigest({directory,assets,readProfile:()=>demoProfile(),fetchPage:async()=>response([raw()]),now:()=>time,...extra});engines.push(e);return e;
}
test('daily 09:00 schedule uses Shanghai time and catches up on a later app startup',()=>{
  const settings={enabled:true,hour:9,minute:0,threshold:60};
  assert.equal(digestDue(settings,'',time-1),false);assert.equal(digestDue(settings,'',time),true);
  assert.equal(digestDue(settings,'',time+10*3600000),true);assert.equal(digestDue(settings,'2026-11-03',time),false);
  assert.equal(shanghaiDay(Date.parse('2026-11-02T16:00:00Z')),'2026-11-03');assert.equal(digestDue({...settings,enabled:false},'',time),false);
});
test('Nowcoder normalization uses creation time rather than refresh time and preserves degree requirements',()=>{
  const j=nowcoderJob(raw('123',{createTime:time-3*86400000,eduLevel:6000}));
  assert.equal(j.publishedAt,new Date(time-3*86400000).toISOString());assert.match(j.description,/硕士及以上/);
  assert.equal(j.company,'测试公司');assert.equal(j.url,'https://www.nowcoder.com/jobs/detail/123');assert.equal(nowcoderJob(raw('123',{status:1})),null);
});
test('new published jobs and unverified first discoveries stay in separate lists',()=>{
  const old=nowcoderJob(raw('old',{id:'111',createTime:time-3*86400000})),fresh=nowcoderJob(raw()),unknown={...fresh,id:'unused',url:'https://www.zhipin.com/job_detail/a.html',source:'boss-detail',publishedAt:null};
  const result=makeDigest({jobs:[old,fresh,unknown],profile:demoProfile(),since,time});
  assert.deepEqual(result.rows.map(r=>r.id),[fresh.id]);assert.equal(result.unverified.length,1);assert.equal(result.unverified[0].source,'BOSS 直聘');
});
test('60 is inclusive, but a hard constraint excludes a numerically high match',()=>{
  const profile={...demoProfile(),skills:[{name:'Python',level:'入门'}],targets:['软件测试']};
  const exact=nowcoderJob(raw('125',{graduationYear:'',ext:JSON.stringify({infos:'协助接口开发',requirements:'在读本科，了解 Python、C++、Java'})}));
  assert.equal(assess(profile,exact).score,60);assert.equal(makeDigest({jobs:[exact],profile,since,time}).rows.length,1);
  const job=nowcoderJob(raw('124',{eduLevel:6000}));const assessment=assess(demoProfile(),job);
  assert.ok(assessment.score>=60);assert.equal(assessment.status,'blocked');
  assert.equal(makeDigest({jobs:[job],profile:demoProfile(),since,time}).rows.length,0);
});
test('same-day refreshes deduplicate links and retain the earlier matching rows',()=>{
  const job=nowcoderJob(raw()),first=makeDigest({jobs:[job,job],profile:demoProfile(),since,time});
  const next=makeDigest({jobs:[],profile:demoProfile(),since,time:time+1000,seen:first.seen,previous:first.candidates});
  assert.equal(first.rows.length,1);assert.equal(next.rows.length,1);assert.equal(next.rows[0].firstSeenAt,first.rows[0].firstSeenAt);
});
test('the public collector never transmits resume data, location preferences or cookies',async()=>{
  const requests=[];const fetchPage=async(url,options)=>{requests.push({url,...options});return response([raw()]);};
  const result=await fetchNowcoder(fetchPage);assert.equal(result.jobs.length,1);
  assert.equal(requests[0].credentials,'omit');assert.equal(requests[0].redirect,'error');
  assert.deepEqual([...new URLSearchParams(requests[0].body).keys()].sort(),['order','page','pageSize','recruitType','requestFrom'].sort());
  assert.ok(!decodeURIComponent(requests[0].body).includes('杭州'));
});
test('pagination does not silently reuse page one and source failures are explicit',async()=>{
  await assert.rejects(fetchNowcoder(async()=>({ok:true,text:async()=>JSON.stringify({code:0,data:{datas:[raw()],currentPage:1,totalPage:3}})})),/分页不一致/);
  await assert.rejects(fetchNowcoder(async()=>({ok:true,text:async()=>'<html>登录验证</html>'})),/验证/);
});
test('CSV has a Chinese UTF-8 marker, complete application URLs and formula-safe cells',()=>{
  const job=nowcoderJob(raw()),result=makeDigest({jobs:[job],profile:demoProfile(),since,time});result.rows[0].company='=HYPERLINK("evil")';
  const csv=digestCsv(result);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes(job.url));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('匹配分'));
});
test('the scheduled run persists its CSV and only requests one notification for the day',async()=>{
  let notifications=0;const e=await engine({notify:()=>{notifications++;return true;}});e.configure({enabled:true,hour:9,minute:0});
  await e.run({notifyUser:true});const s=e.snapshot();assert.equal(s.latest.status,'complete');assert.equal(s.latest.rows.length,1);
  assert.ok(fs.existsSync(path.join(e.store.directory,'reports','2026-11-03.csv')));
  await e.run({notifyUser:true});assert.equal(notifications,1);assert.equal(e.snapshot().latest.rows.length,1);
});
test('a collector failure is not reported as a normal empty successful table',async()=>{
  const e=await engine({fetchPage:async()=>{throw Error('模拟断网');}});await e.run();
  assert.equal(e.snapshot().latest.status,'failed');assert.equal(e.snapshot().latest.sources[0].status,'error');
  assert.ok(!fs.existsSync(path.join(e.store.directory,'reports','2026-11-03.csv')));assert.throws(()=>e.csv('2026-11-03'),/采集失败/);
});
test('configuration survives restart and historical report paths cannot escape their folder',async()=>{
  const e=await engine();e.configure({enabled:true,hour:9,minute:0});await e.run();
  const reopened=await createDailyDigest({directory:e.store.directory,assets,readProfile:()=>demoProfile(),now:()=>time});engines.push(reopened);
  assert.equal(reopened.snapshot().settings.hour,9);assert.equal(reopened.report('2026-11-03').rows.length,1);assert.throws(()=>reopened.report('../workspace'),/日期无效/);
});
test('manual runs before 09:00 do not consume the morning scheduled run',async()=>{
  const e=await engine({now:()=>time-3600000});e.configure({enabled:true,hour:9,minute:0});await e.run({notifyUser:false});
  assert.ok(digestDue(e.snapshot().settings,e.store.read().data.lastScheduledDay,time));
});
test.after(()=>{engines.forEach(e=>e.close());for(const dir of folders){assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('jobfit-digest-'));fs.rmSync(dir,{recursive:true,force:true});}});
