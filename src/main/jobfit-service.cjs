const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {LocalStore}=require('./local-store.cjs');
const {createDailyDigest}=require('./jobfit-digest.cjs');
async function createJobFitService({directory,assets,platformController=null,schedule=setTimeout,unschedule=clearTimeout,now=Date.now,digestFetch,digestNotify,digestOpenFolder}){
  const lib=await import(pathToFileURL(path.join(assets,'lib/state.js')).href);
  const core=await import(pathToFileURL(path.join(assets,'lib/core.js')).href);
  const {platformOfJob}=await import(pathToFileURL(path.join(assets,'lib/platforms.js')).href);
  const {planFacts}=await import(pathToFileURL(path.join(assets,'lib/llm.js')).href);
  function valid(s){try{core.validateProfile(s.profile);return s.version===1&&Array.isArray(s.jobs)&&s.jobs.length<=2000&&s.jobs.every(j=>j.id&&core.cleanJob(j))&&Array.isArray(s.queue)&&s.queue.length<=2000&&s.queue.every(q=>typeof q.id==='string'&&typeof q.jobId==='string'&&typeof q.status==='string'&&typeof q.greeting==='string')&&Array.isArray(s.events)&&s.events.length<=100&&s.model&&['endpoint','model','key'].every(k=>typeof s.model[k]==='string')&&s.automation&&typeof s.automation.running==='boolean'&&typeof s.automation.dryRun==='boolean'&&Number.isInteger(s.automation.dailyLimit)&&s.automation.dailyLimit>=1&&s.automation.dailyLimit<=50&&Number.isFinite(s.automation.intervalSeconds)&&s.automation.intervalSeconds>=60&&Number.isFinite(s.automation.lastAttempt);}catch{return false;}}
  const store=new LocalStore(directory,valid);let serial=Promise.resolve(),timer=null,active=null,closed=false;
  const locked=fn=>{const next=serial.then(fn);serial=next.catch(()=>{});return next;};
  function initial(){return lib.initialState();}
  function write(s,revision){const result=store.write(s,revision);if(result.status!==200)throw Error(result.body.error);}
  const digest=await createDailyDigest({directory:path.join(directory,'digest'),assets,readProfile:()=> (store.read().data||initial()).profile,collectBoss:async()=>{if(!platformController?.snapshot().some(p=>p.id==='boss'&&p.open))throw Error('BOSS 页面未打开');return platformController.collect('boss');},fetchPage:digestFetch,notify:digestNotify,now});
  const saved=store.read();if(saved.data&&(saved.data.automation.running||saved.data.queue.some(q=>q.status==='sending'))){saved.data.automation.running=false;lib.recoverInFlight(saved.data);write(saved.data,saved.revision);}
  const publicState=s=>({...s,platforms:platformController?.snapshot()||[],model:{endpoint:s.model.endpoint,model:s.model.model,key:'',hasKey:Boolean(s.model.key)}});
  function stop(){if(timer!==null)unschedule(timer);timer=null;active?.abort();void platformController?.cancel?.();}
  function arm(ms=0){if(closed)return;if(timer!==null)unschedule(timer);timer=schedule(()=>{timer=null;void tick().catch(()=>{});},ms);timer?.unref?.();}
  async function tick(){
    if(closed||active)return;let work;
    await locked(()=>{if(active||closed)return;const current=store.read(),s=current.data;if(!s?.automation.running)return;const q=lib.nextItem(s,now());if(!q){const pending=s.queue.some(item=>item.status==='approved'),date=new Date(now()).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),attempts=s.queue.filter(item=>item.attemptAt&&new Date(item.attemptAt).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})===date).length;if(!pending||attempts>=s.automation.dailyLimit){s.automation.running=false;if(pending)lib.logEvent(s,'已达到今日投递次数，队列已暂停');write(s,current.revision);}else arm(Math.max(1000,s.automation.lastAttempt+s.automation.intervalSeconds*1000-now()));return;}
      const job=s.jobs.find(j=>j.id===q.jobId);if(!job||!job.resume||core.assess(s.profile,job).status==='blocked'){q.status='needs_review';q.note='岗位或资料需要重新审核';s.automation.running=false;write(s,current.revision);return;}
      q.attemptAt=new Date(now()).toISOString();s.automation.lastAttempt=now();
      if(s.automation.dryRun){q.status='simulated';q.note='演练完成，未发送消息或简历';s.automation.running=s.queue.some(item=>item.status==='approved');lib.logEvent(s,'演练：'+job.company);write(s,current.revision);arm(60000);return;}
      active=new AbortController();q.status='sending';write(s,current.revision);work={id:q.id,job:structuredClone(job),greeting:q.greeting,options:{nowcoderResumeName:q.resumeName||''},controller:active};
    });
    if(!work)return;
    let result,error;try{result=await platformController.send(work.job,work.greeting,work.options,{signal:work.controller.signal});if(!result?.verified)throw Error('未获得平台提交结果，请人工核对');}catch(e){error=e;}
    await locked(()=>{const current=store.read(),s=current.data,q=s?.queue.find(q=>q.id===work.id);if(q?.status==='sending'){
      q.status=error?(error.preflightFailed?'needs_review':'uncertain'):'sent';q.note=error?error.message:result.note;q.finishedAt=new Date(now()).toISOString();
      if(error||!s.queue.some(item=>item.status==='approved'))s.automation.running=false;lib.logEvent(s,(error?'暂停，待人工核对：':'已验证提交：')+work.job.company);write(s,current.revision);
    }active=null;if(s?.automation.running)arm(60000);});
  }
  async function handle(action,data={}){
    const current=store.read(),s=current.data||initial();
    if(['saveProfile','importJobs','resume','aiResume','restore','executionSettings'].includes(action)&&active){stop();s.automation.running=false;}
    switch(action){
      case 'digestGet':return digest.snapshot();
      case 'digestConfigure':{const settings=digest.configure(data);digest.check();return {...settings,status:digest.snapshot().status};}
      case 'digestRun':void digest.run({notifyUser:false}).catch(()=>{});return digest.snapshot();
      case 'digestReport':return digest.report(data.day);
      case 'digestCsv':return {filename:'JobFit-岗位日报-'+data.day+'.csv',content:digest.csv(data.day)};
      case 'digestFolder':if(!digestOpenFolder)throw Error('请在 JobFit 桌面版打开报表目录');await digestOpenFolder();return {opened:true};
      case 'digestOpenJob':{const report=digest.report(data.day),row=[...(report?.rows||[]),...(report?.unverified||[])].find(j=>j.id===data.id);if(!row||!platformController)throw Error('找不到日报岗位');platformController.open(platformOfJob(row),row.url);return {opened:true};}
      case 'get':if(current.data)return publicState(s);break;
      case 'platformOpen':if(!platformController)throw Error('平台账号窗口仅在 JobFit 桌面版可用');platformController.open(data.platform);return publicState(s);
      case 'platformStatus':if(!platformController)throw Error('请使用 JobFit 桌面版');await platformController.refresh(data.platform);return publicState(s);
      case 'openJob':{const job=s.jobs.find(j=>j.id===data.id);if(!job||!platformController)throw Error('找不到可打开的岗位');platformController.open(platformOfJob(job),job.url);return publicState(s);}
      case 'saveProfile':lib.saveProfile(s,data);break;
      case 'importJobs':lib.upsertJobs(s,data);break;
      case 'collect':if(!platformController)throw Error('请在浏览器扩展或 JobFit 平台窗口采集');lib.upsertJobs(s,await platformController.collect(data.platform));break;
      case 'resume':lib.makeResume(s,data.id);break;
      case 'aiResume':{const job=s.jobs.find(j=>j.id===data.id);if(!job)throw Error('岗位不存在');lib.makeResume(s,job.id,await planFacts(s.profile,job,s.model));break;}
      case 'approve':{const q=lib.approve(s,data.id);q.resumeName=s.automation.nowcoderResumeName||'';break;}
      case 'cancel':{const q=s.queue.find(q=>q.id===data.id);if(q?.status==='approved'){q.status='cancelled';q.note='已取消';}break;}
      case 'executionSettings':{
        if(typeof data.nowcoderResumeName!=='string'||data.nowcoderResumeName.length>200)throw Error('牛客简历名称无效');
        if((s.automation.nowcoderResumeName||'')!==data.nowcoderResumeName.trim())for(const q of s.queue)if(q.status==='approved'&&platformOfJob(s.jobs.find(j=>j.id===q.jobId)||{})==='nowcoder'){q.status='needs_review';q.note='平台简历名称改变，请重新审核';}
        s.automation.nowcoderResumeName=data.nowcoderResumeName.trim();break;
      }
      case 'model':if(['endpoint','model','key'].some(k=>data[k]!==undefined&&(typeof data[k]!=='string'||data[k].length>5000)))throw Error('模型设置格式无效');s.model={endpoint:String(data.endpoint||'').trim(),model:String(data.model||'').trim(),key:data.clearKey?'':(String(data.key||'')||s.model.key)};break;
      case 'start':{
        if(active)throw Error('队列正在执行，请先暂停');
        if(data.real){
          if(!platformController)throw Error('JobFit 内置版尚未连接平台窗口，不直接发送');
          if(data.acknowledgement!=='发送已审核岗位的平台简历')throw Error('请先确认队列和平台简历');
          const approved=s.queue.filter(q=>q.status==='approved');if(!approved.length)throw Error('没有已审核的待投岗位');
          for(const q of approved){const j=s.jobs.find(j=>j.id===q.jobId),platform=platformOfJob(j||{});if(!platform||j.source==='demo')throw Error('队列包含无法自动投递的来源');if(platform==='boss'&&!j.chatId)throw Error('BOSS 岗位请先完成首次沟通，再采集对应会话');if(platform==='nowcoder'&&(!q.resumeName||j.source!=='nowcoder-detail'))throw Error('牛客岗位请先采集详情、填写平台简历名称并重新审核');}
        }
        s.automation.running=true;s.automation.dryRun=!data.real;break;
      }
      case 'stop':stop();s.automation.running=false;break;
      case 'backup':return {kind:'jobfit-backup',version:1,state:{...s,model:{...s.model,key:''}}};
      case 'restore':{
        if(data.kind!=='jobfit-backup'||data.version!==1||!valid(data.state))throw Error('求职备份格式无效');stop();const restored=structuredClone(data.state);restored.model.key='';restored.automation.running=false;restored.automation.dryRun=true;
        for(const q of restored.queue)if(['approved','sending'].includes(q.status)){q.status='needs_review';q.note='备份恢复后请重新审核';}
        lib.logEvent(restored,'从求职备份恢复资料（不包含密钥或平台登录会话）');write(restored,current.revision);return publicState(restored);
      }
      default:throw Error('不支持的求职操作');
    }
    write(s,current.revision);if(action==='start')arm();return publicState(s);
  }
  return {store,request:(action,data)=>locked(()=>handle(action,data)),tick,startDigest:()=>digest.start(),close(){closed=true;stop();digest.close();platformController?.close?.();}};
}
module.exports={createJobFitService};
