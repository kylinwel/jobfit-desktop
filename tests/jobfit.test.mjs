import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createJobFitService}=require('../src/main/jobfit-service.cjs');
const assets=fileURLToPath(new URL('../src/ui/',import.meta.url));
const {demoProfile}=await import('../src/ui/lib/state.js');
const folders=[];
async function make(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'jobfit-jobfit-'));folders.push(directory);
  return createJobFitService({directory,assets});
}
const job={company:'测试公司',title:'Python 实习生',city:'杭州',description:'面向2028届本科在读生，每周至少4天，至少实习3个月，接触Python即可。',source:'manual'};
test('JobFit disk persistence survives a service restart and retains real skill levels',async()=>{
  const service=await make();await service.request('saveProfile',demoProfile());
  const s=await service.request('importJobs',[job]);await service.request('resume',{id:s.jobs[0].id});
  const restarted=await createJobFitService({directory:service.store.directory,assets});
  const result=await restarted.request('get');
  assert.equal(result.jobs.length,1);assert.equal(result.jobs[0].resume.skills[0].level,'入门');
  assert.ok(result.jobs[0].resume.projects.every(p=>!p.title.includes('尚未学习')));
  assert.ok(service.store.list().length>=2);
});
test('concurrent imports are serialized without losing jobs',async()=>{
  const service=await make();
  await Promise.all(Array.from({length:12},(_,i)=>service.request('importJobs',[{...job,company:'公司'+i}])));
  assert.equal((await service.request('get')).jobs.length,12);
});
test('desktop requires an explicitly connected platform controller for sending and collection',async()=>{
  const service=await make();
  await assert.rejects(service.request('start',{real:true}),/不直接发送/);
  await assert.rejects(service.request('collect'),/浏览器/);
  assert.equal((await service.request('get')).automation.running,false);
});
test('model secrets are omitted from responses and exported backups',async()=>{
  const service=await make();
  const result=await service.request('model',{endpoint:'https://example.com/chat',model:'example',key:'test-only-secret'});
  assert.equal(result.model.key,'');assert.equal(result.model.hasKey,true);
  const backup=await service.request('backup');
  assert.ok(!JSON.stringify(backup).includes('test-only-secret'));
  await service.request('restore',backup);
  assert.equal((await service.request('get')).model.hasKey,false);
});
test('restoring a backup cancels automatic execution approval',async()=>{
  const service=await make();await service.request('saveProfile',demoProfile());
  let s=await service.request('importJobs',[job]);const id=s.jobs[0].id;
  await service.request('resume',{id});await service.request('approve',{id});
  const backup=await service.request('backup');
  s=await service.request('restore',backup);
  assert.equal(s.queue[0].status,'needs_review');assert.equal(s.automation.running,false);
});
test('corrupt data is preserved and further writes fail clearly',async()=>{
  const service=await make();await service.request('get');
  fs.writeFileSync(service.store.file,'broken-json');
  await assert.rejects(service.request('importJobs',[job]),/无法读取/);
  assert.equal(fs.readFileSync(service.store.file,'utf8'),'broken-json');
});
test('failed requests do not block later valid requests',async()=>{
  const service=await make();
  await assert.rejects(service.request('saveProfile',{}));
  assert.equal((await service.request('saveProfile',demoProfile())).profile.degree,'本科');
});

test.after(()=>{
  for(const dir of folders){
    // Test-created directories only; verify the boundary before recursive removal.
    assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('jobfit-jobfit-'));
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
