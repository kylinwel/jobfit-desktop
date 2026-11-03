const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {LocalStore}=require('./local-store.cjs');
async function createDailyDigest({directory,assets,readProfile,collectBoss,fetchPage=fetch,notify=()=>false,now=Date.now}){
  const model=await import(pathToFileURL(path.join(assets,'lib/digest.js')).href);
  const valid=s=>s&&s.version===1&&s.settings&&typeof s.settings.enabled==='boolean'&&Number.isInteger(s.settings.hour)&&s.settings.hour>=0&&s.settings.hour<24&&Number.isInteger(s.settings.minute)&&s.settings.minute>=0&&s.settings.minute<60&&s.settings.threshold===60&&Array.isArray(s.history)&&s.history.every(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.day))&&s.seen&&typeof s.seen==='object';
  const store=new LocalStore(directory,valid),reports=path.join(directory,'reports');fs.mkdirSync(reports,{recursive:true});
  let status='idle',progress='',active=null,timer=null,closed=false,retryAt=0;
  const initial=()=>({version:1,settings:{...model.digestDefaults},history:[],seen:{},notified:[]});
  const read=()=>store.read().data||initial();
  function save(s){const revision=store.read().revision,result=store.write(s,revision);if(result.status!==200)throw Error(result.body.error);}
  function report(day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw Error('日报日期无效');const data=read();if(!data.history.some(r=>r.day===day))return null;return JSON.parse(fs.readFileSync(path.join(reports,day+'.json'),'utf8'));}
  function snapshot(){const s=read();let latest=null;try{if(s.history[0])latest=report(s.history[0].day);}catch{}return {settings:s.settings,history:s.history.slice(0,60),latest:latest?{...latest,candidates:undefined}:null,status,progress,lastSuccessDay:s.lastSuccessDay||'',retryAt};}
  function configure(settings){const s=read();const next={...s.settings,...settings,threshold:60};if(!valid({...s,settings:next}))throw Error('日报时间或设置无效');s.settings=next;save(s);return snapshot();}
  async function run({notifyUser=false}={}){
    if(active)return active;if(closed)throw Error('日报服务已关闭');
    active=(async()=>{
      status='running';progress='正在读取公开岗位，在本机匹配简历';const time=now(),day=model.shanghaiDay(time),s=read();let previous=null;try{previous=report(day);}catch{}
      const since=previous?Date.parse(previous.since):Math.max(Date.parse(s.lastSuccessAt||'')||time-86400000,time-7*86400000);
      const profile=readProfile();if(!profile?.school||!profile?.major||!profile.skills?.length)throw Error('请先在真实经历中填写学校、专业及实际技能');
      const jobs=[],sources=[];
      for(const type of [2,1]){
        const name=type===2?'牛客实习':'牛客校招';progress='正在读取'+name+'公开岗位';
        try{const result=await model.fetchNowcoder(fetchPage,{type,maxPages:type===2?10:6,signal:AbortSignal.timeout(90000)});jobs.push(...result.jobs);sources.push({name,status:'ok',scanned:result.scanned,pages:result.pages,totalPage:result.totalPage,note:result.truncated?'只检查最新排序的前 '+result.pages+' 页，共 '+result.totalPage+' 页；并非全站覆盖':'已检查当前公开返回的全部页面'});}catch(e){sources.push({name,status:'error',scanned:0,note:e.message});}
      }
      progress='正在检查 BOSS 当前页面';
      try{const collected=collectBoss?await collectBoss():[];jobs.push(...collected);sources.push({name:'BOSS 直聘',status:collected.length?'partial':'unavailable',scanned:collected.length,note:'仅检查已打开的平台页面；无法核实发布时间的岗位单列，不计入新发日报'});}catch{sources.push({name:'BOSS 直聘',status:'unavailable',scanned:0,note:'未打开可采集的 BOSS 页面；本次未检查其新发岗位'});}
      const result=model.makeDigest({jobs,profile,since,time,seen:s.seen,previous:previous?.candidates||[]});
      const success=sources.some(source=>source.name.startsWith('牛客')&&source.status==='ok');
      const current=read();const output={day,since:new Date(since).toISOString(),generatedAt:new Date(time).toISOString(),threshold:60,status:success?'complete':'failed',rows:result.rows,unverified:result.unverified,candidates:result.candidates,sources,profileSummary:{skillCount:profile.skills.length,projectCount:profile.projects?.length||0},summary:success?'新发且匹配分达到60分，无硬性条件冲突':'公开来源采集失败，请查看来源状态；本次不代表没有匹配岗位'};
      // CSV and JSON are replaced atomically; report filenames derive only from the local calendar day.
      store.atomic(path.join(reports,day+'.json'),output);
      if(success){const csv=path.join(reports,day+'.csv'),temp=csv+'.tmp';fs.writeFileSync(temp,model.digestCsv(output),'utf8');fs.renameSync(temp,csv);}
      current.seen=result.seen;current.history=[{day,count:output.rows.length,status:output.status,generatedAt:output.generatedAt},...current.history.filter(r=>r.day!==day)];
      if(success){current.lastSuccessDay=day;current.lastSuccessAt=output.generatedAt;if(notifyUser)current.lastScheduledDay=day;retryAt=0;}else retryAt=now()+10*60000;
      const key=day+':'+output.status;
      if(notifyUser&&!current.notified.includes(key)){if(notify(output)!==false)current.notified=[...current.notified,key].slice(-60);}
      save(current);status=success?'ready':'error';progress=output.summary;return snapshot();
    })().catch(error=>{status='error';progress=error.message;retryAt=now()+10*60000;throw error;}).finally(()=>{active=null;});return active;
  }
  function check(){const s=read();if(!active&&now()>=retryAt&&model.digestDue(s.settings,s.lastScheduledDay,now()))void run({notifyUser:true}).catch(()=>{});}
  return {store,snapshot,report,configure,run,check,csv:day=>{const data=report(day);if(!data)throw Error('找不到日报');if(data.status==='failed')throw Error('采集失败，没有可导出的新日报');return model.digestCsv(data);},start(){if(timer)return;check();timer=setInterval(check,60000);timer.unref();},close(){closed=true;if(timer)clearInterval(timer);}};
}
module.exports={createDailyDigest};
