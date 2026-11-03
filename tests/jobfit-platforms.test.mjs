import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {parseHTML} from 'linkedom';
import {canonicalJobUrl,platformOfJob} from '../src/ui/lib/platforms.js';
import {cleanJob,assess} from '../src/ui/lib/core.js';
import {demoProfile} from '../src/ui/lib/state.js';
const require=createRequire(import.meta.url),{createJobFitService}=require('../src/main/jobfit-service.cjs');
const {createPlatformController}=require('../src/main/jobfit-platforms.cjs');
const assets=fileURLToPath(new URL('../src/ui/',import.meta.url));
const url='https://www.nowcoder.com/jobs/detail/123456';
const job={title:'Python 实习生',company:'测试公司',city:'杭州',salary:'150元/天',description:'2028届本科在读实习，每周4天，最少3个月，Python',url,source:'nowcoder-detail'};
const folders=[],services=[];
async function service(controller={snapshot:()=>[],send:async()=>({verified:true,note:'模拟平台状态已变化'}),cancel(){}},extra={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'jobfit-jobfit-platforms-'));folders.push(directory);
  const s=await createJobFitService({directory,assets,platformController:controller,schedule:()=>null,unschedule(){},...extra});services.push(s);return s;
}
async function approved(s,input=job){
  await s.request('saveProfile',demoProfile());await s.request('executionSettings',{nowcoderResumeName:'测试简历.pdf'});
  const state=await s.request('importJobs',[input]);const id=state.jobs[0].id;await s.request('resume',{id});await s.request('approve',{id});return id;
}
const start=s=>s.request('start',{real:true,acknowledgement:'发送已审核岗位的平台简历'});
function dom(html,pageUrl=url){
  const {document,HTMLElement}=parseHTML('<html><body>'+html+'</body></html>');
  HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden],[style*="display:none"]')?[]:[{}];};
  const context=vm.createContext({document,location:new URL(pageUrl),getComputedStyle:()=>({visibility:'visible'})});
  vm.runInContext(fs.readFileSync(path.join(assets,'adapters/nowcoder.js'),'utf8'),context);
  return {document,api:context.JobFitNowcoder};
}
const detail=(button='立即申请')=>'<div class="job-detail-wrap"><h1 class="title">Python 实习生</h1><div class="salary">150元/天</div><div class="extra"><span class="el-tooltip">杭州</span>本科 4天/周 最少3个月</div><div class="job-detail-infos">岗位要求：2028届本科在读实习，Python</div><button>'+button+'</button></div><div class="company-card"><div class="fs-20">测试公司</div></div>';
const dialog=(name='测试简历.pdf')=>'<div class="el-dialog"><div>申请职位：Python 实习生</div><div class="delivery-resume-popup"><div class="resume-wrap"><div class="resume-item-info"><div class="resume-name">'+name+'</div></div></div><div class="deliver-btn-box"><button>投递简历</button></div></div></div>';

test('Nowcoder URLs retain stable job identity and reject lookalikes, credentials and unrelated paths',()=>{
  assert.equal(canonicalJobUrl(url+'?channel=abc'),url);assert.equal(cleanJob({...job,url:url+'?other=1'}).id,url);
  assert.equal(platformOfJob(job),'nowcoder');assert.equal(platformOfJob({url:'https://www.zhipin.com/job_detail/a.html'}),'boss');
  for(const value of ['https://www.nowcoder.com.evil.test/jobs/detail/123','https://user@www.nowcoder.com/jobs/detail/123','http://www.nowcoder.com/jobs/detail/123','https://www.nowcoder.com:444/jobs/detail/123','https://www.nowcoder.com/discuss/123'])assert.equal(canonicalJobUrl(value),'');
});
test('Nowcoder list collection keeps separate positions and detail collection includes the real constraints',()=>{
  const list=dom('<div class="job-card-item"><a href="'+url+'" class="job-message-boxs"><span class="job-name">Python 实习生</span><span class="job-salary">150元/天</span><span class="job-info-item">杭州</span></a><span class="company-name">测试公司</span></div>','https://www.nowcoder.com/jobs/intern/center');
  assert.equal(list.api.collect()[0].source,'nowcoder-list');assert.equal(list.api.collect()[0].company,'测试公司');
  const data=dom(detail()).api.collect()[0];assert.equal(data.source,'nowcoder-detail');assert.match(data.description,/4天\/周/);
  const assessment=assess(demoProfile(),data);assert.ok(assessment.reasons.includes('每周出勤符合'));assert.equal(assessment.status,'match');
});
test('Nowcoder will not apply to the wrong company, an external website or an already applied position',()=>{
  assert.throws(()=>dom(detail()).api.prepare({...job,company:'另一家公司'}),/不一致/);
  assert.throws(()=>dom(detail('绑定官网账号并投递')).api.prepare(job),/官网/);
  assert.throws(()=>dom(detail().replace('150元/天','官网闪投')).api.prepare(job),/官网/);
  assert.throws(()=>dom(detail('已投递')).api.prepare(job),/已有申请/);
});
test('Nowcoder requires a unique job dialog, exact selected resume and no required questions before clicking submit',()=>{
  for(const body of [detail()+dialog('其他简历.pdf'),detail()+dialog()+dialog(),detail()+dialog().replace('<div class="deliver-btn-box">','<input required><div class="deliver-btn-box">')]){
    const page=dom(body);let clicks=0;page.document.querySelectorAll('.deliver-btn-box button').forEach(b=>b.addEventListener('click',()=>clicks++));
    assert.throws(()=>page.api.submit(job,'测试简历.pdf'));assert.equal(clicks,0);
  }
  const page=dom(detail()+dialog());let clicks=0;page.document.querySelector('.deliver-btn-box button').addEventListener('click',()=>clicks++);
  page.api.submit(job,'测试简历.pdf');assert.equal(clicks,1);
});
test('Nowcoder does not treat a generic success toast or a recommendation as proof of submission',()=>{
  assert.equal(dom(detail()+'<p>投递成功</p><aside><button>已投递</button></aside>').api.verify(job),false);
  assert.equal(dom(detail('已投递').replace('<button>','<button disabled>')).api.verify(job),true);
  assert.throws(()=>dom(detail()+'<button class="loginRegisterBtn">登录</button>').api.prepare(job),/登录/);
});
test('a dry run never calls a platform sender and stops once the queue has finished',async()=>{
  let calls=0;const s=await service({snapshot:()=>[],send:()=>{calls++;}});await approved(s);
  await s.request('start',{real:false});await s.tick();const state=await s.request('get');
  assert.equal(calls,0);assert.equal(state.queue[0].status,'simulated');assert.equal(state.automation.running,false);
});
test('real execution requires explicit acknowledgement and captures the reviewed platform resume',async()=>{
  let seen;const s=await service({snapshot:()=>[],send:async(j,g,o)=>{seen=o;return {verified:true,note:'模拟已提交'};}});await approved(s);
  await assert.rejects(s.request('start',{real:true}),/确认/);await start(s);await s.tick();
  assert.equal(seen.nowcoderResumeName,'测试简历.pdf');assert.equal((await s.request('get')).queue[0].status,'sent');
});
test('unverified submission pauses and cannot be silently retried',async()=>{
  let calls=0;const s=await service({snapshot:()=>[],send:async()=>{calls++;return {verified:false};}});const id=await approved(s);
  await start(s);await s.tick();let state=await s.request('get');assert.equal(state.queue[0].status,'uncertain');assert.equal(state.automation.running,false);
  await assert.rejects(s.request('approve',{id}),/不能重复/);await s.tick();assert.equal(calls,1);
});
test('stop is responsive while the platform is awaiting a result, and concurrent ticks cannot run twice',async()=>{
  let release,entered;const gate=new Promise(r=>release=r),began=new Promise(r=>entered=r);let calls=0,signal;
  const s=await service({snapshot:()=>[],cancel(){},send:async(j,g,o,ctx)=>{calls++;signal=ctx.signal;entered();await gate;throw Error('模拟中断');}});
  await approved(s);await start(s);const running=s.tick();await began;await s.tick();
  const stopped=await s.request('stop');assert.equal(stopped.automation.running,false);assert.equal(signal.aborted,true);assert.equal(calls,1);release();await running;
  assert.equal((await s.request('get')).queue[0].status,'uncertain');
});
test('changing the selected resume revokes Nowcoder approvals and list summaries cannot execute',async()=>{
  const s=await service();await approved(s);await s.request('executionSettings',{nowcoderResumeName:'新简历.pdf'});
  assert.equal((await s.request('get')).queue[0].status,'needs_review');
  const list=await service();await approved(list,{...job,source:'nowcoder-list'});await assert.rejects(start(list),/详情/);
});
test('restarting after an interrupted send preserves uncertain status and stays paused',async()=>{
  const s=await service();await approved(s);const current=s.store.read();current.data.queue[0].status='sending';current.data.automation.running=true;s.store.write(current.data,current.revision);
  const restarted=await createJobFitService({directory:s.store.directory,assets});services.push(restarted);
  const state=await restarted.request('get');assert.equal(state.queue[0].status,'uncertain');assert.equal(state.automation.running,false);
});
test('a login failure before interacting can be reviewed again after logging in',async()=>{
  const s=await service({snapshot:()=>[],send:async()=>{const error=Error('请登录');error.preflightFailed=true;throw error;}});const id=await approved(s);
  await start(s);await s.tick();assert.equal((await s.request('get')).queue[0].status,'needs_review');
  assert.equal((await s.request('approve',{id})).queue[0].status,'approved');
});
test('a daily limit pauses a pending queue without calling the platform',async()=>{
  let calls=0;const s=await service({snapshot:()=>[],send:async()=>{calls++;return {verified:true};}});await approved(s);
  const current=s.store.read();current.data.queue.push(...Array.from({length:5},(_,i)=>({...current.data.queue[0],id:'history-'+i,status:'sent',attemptAt:new Date().toISOString()})));s.store.write(current.data,current.revision);
  await start(s);await s.tick();assert.equal(calls,0);assert.equal((await s.request('get')).automation.running,false);
});
test('platform windows have distinct persistent sessions, no preload and block arbitrary navigation',async()=>{
  const made=[];
  class FakeWindow{
    constructor(options){this.options=options;this.events={};this.webContents={getURL:()=>this.url,on:(name,cb)=>this.events[name]=cb,setWindowOpenHandler:cb=>this.popup=cb,session:{setPermissionRequestHandler(){}},executeJavaScriptInIsolatedWorld:async()=>null};made.push(this);}
    on(){}isDestroyed(){return false;}show(){}focus(){}async loadURL(url){this.url=url;}
  }
  const controller=await createPlatformController({BrowserWindow:FakeWindow,assets});controller.open('boss');controller.open('nowcoder');
  assert.notEqual(made[0].options.webPreferences.partition,made[1].options.webPreferences.partition);
  for(const w of made){assert.equal(w.options.webPreferences.nodeIntegration,false);assert.equal(w.options.webPreferences.preload,undefined);assert.equal(w.options.webPreferences.sandbox,true);}
  let prevented=false;made[1].events['will-navigate']({preventDefault(){prevented=true;}},'file:///C:/private');assert.equal(prevented,true);
  assert.throws(()=>controller.open('nowcoder','https://evil.test/jobs/detail/123'),/不受支持|不是受支持/);
  let html=detail();made[1].webContents.executeJavaScriptInIsolatedWorld=async(world,scripts)=>{
    assert.equal(world,991);const {document}=parseHTML('<html><body>'+html+'</body></html>');
    return vm.runInNewContext(scripts[0].code,{document,location:new URL(url),getComputedStyle:()=>({visibility:'visible'})});
  };
  controller.open('nowcoder',url);assert.equal((await controller.collect('nowcoder'))[0].company,'测试公司');
  html='';await assert.rejects(controller.collect('nowcoder'),/岗位详情/);
});
test.after(()=>{services.forEach(s=>s.close());for(const dir of folders){assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('jobfit-jobfit-platforms-'));fs.rmSync(dir,{recursive:true,force:true});}});
