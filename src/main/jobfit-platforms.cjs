const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const WORLD=991;
async function createPlatformController({BrowserWindow,assets}){
  const {platforms,platformOfJob,canonicalJobUrl}=await import(pathToFileURL(path.join(assets,'lib/platforms.js')).href);
  const entries=new Map();
  const config=id=>{const c=platforms.find(p=>p.id===id);if(!c)throw Error('不支持的招聘平台');return c;};
  function allowed(id,value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(id==='boss'?['www.zhipin.com','login.zhipin.com']:['www.nowcoder.com','passport.nowcoder.com']).includes(u.hostname);}catch{return false;}}
  const snapshot=()=>platforms.map(p=>{const e=entries.get(p.id),open=Boolean(e?.window&&!e.window.isDestroyed());return {id:p.id,name:p.name,open,state:open?e.state:'closed',note:open?e.note:'尚未打开平台窗口'};});
  function open(id,url){
    const p=config(id);if(url&&(!allowed(id,url)||!canonicalJobUrl(url)))throw Error('不是受支持的岗位链接');
    let e=entries.get(id);
    if(!e?.window||e.window.isDestroyed()){
      const window=new BrowserWindow({width:1120,height:820,minWidth:850,minHeight:650,title:'JobFit · '+p.name,autoHideMenuBar:true,webPreferences:{partition:'persist:jobfit-jobfit-'+id,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
      e={window,state:'unknown',note:'请在平台窗口登录，JobFit 不读取密码和验证码'};entries.set(id,e);
      const gate=(event,target)=>{if(!allowed(id,target)){event.preventDefault();e.state='attention';e.note='链接离开招聘平台，请在系统浏览器处理企业官网网申';}};
      window.webContents.on('will-navigate',gate);window.webContents.on('will-redirect',gate);
      window.webContents.setWindowOpenHandler(({url:target})=>{if(allowed(id,target))void window.loadURL(target).catch(()=>{});else{e.state='attention';e.note='企业官网或第三方登录需要手动处理';}return {action:'deny'};});
      window.webContents.on('did-fail-load',(_event,code)=>{if(code!==-3){e.state='attention';e.note='平台页面加载失败，请检查网络并重新打开';}});
      window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
      window.on('closed',()=>{e.state='closed';});void window.loadURL(url||p.home).catch(()=>{});
    }else if(url)void e.window.loadURL(url).catch(()=>{});
    e.window.show();e.window.focus();return snapshot();
  }
  function windowFor(id){config(id);const e=entries.get(id);if(!e?.window||e.window.isDestroyed())throw Error('请先打开并登录对应平台窗口');return e.window;}
  async function invoke(id,action,args=[]){
    const window=windowFor(id),url=window.webContents.getURL();
    if(!allowed(id,url)||new URL(url).hostname!==(id==='boss'?'www.zhipin.com':'www.nowcoder.com'))throw Error('请先完成登录，返回平台岗位或会话页面');
    const scripts=id==='boss'?['boss-dom.js','boss.js']:['nowcoder.js'];
    const code=scripts.map(f=>fs.readFileSync(path.join(assets,'adapters',f),'utf8')).join('\n')+'\n;(async()=>{try{return {ok:true,value:await globalThis.'+(id==='boss'?'JobFitBoss':'JobFitNowcoder')+'['+JSON.stringify(action)+'](...'+JSON.stringify(args)+')}}catch(error){return {ok:false,error:error.message||String(error)}}})()';
    const result=await window.webContents.executeJavaScriptInIsolatedWorld(WORLD,[{code}]);if(!result?.ok)throw Error(result?.error||'平台页面无法执行此操作');return result.value;
  }
  async function refresh(id){config(id);try{Object.assign(entries.get(id),await invoke(id,'status'));}catch(e){const entry=entries.get(id);if(entry){entry.state='attention';entry.note=e.message;}}return snapshot();}
  async function collect(id){config(id);return invoke(id,'collect');}
  async function cancel(){for(const e of entries.values())if(!e.window.isDestroyed())e.window.webContents.executeJavaScriptInIsolatedWorld(WORLD,[{code:'globalThis.JobFitAbort=true;'}]).catch(()=>{});}
  async function send(job,greeting,options,{signal}={}){
    let interacted=false;try{
    const id=platformOfJob(job);config(id);const window=windowFor(id);
    const check=()=>{if(signal?.aborted)throw Error('执行已暂停，请核对当前岗位是否已提交');if(window.isDestroyed())throw Error('平台窗口已关闭');};
    check();await window.webContents.executeJavaScriptInIsolatedWorld(WORLD,[{code:'globalThis.JobFitAbort=false;'}]);window.show();window.focus();
    if(id==='boss'){if(!job.chatId)throw Error('BOSS 首次沟通请先在岗位页面完成，打开会话后重新采集');check();await invoke(id,'preflight',[job]);check();interacted=true;return await invoke(id,'send',[job,greeting]);}
    const url=canonicalJobUrl(job.url);if(!url||job.source!=='nowcoder-detail')throw Error('请先采集完整的牛客岗位详情，再重新审核');
    if(window.webContents.getURL().split(/[?#]/)[0]!==url)await window.loadURL(url);
    check();await delay(900);check();await invoke(id,'preflight',[job]);check();interacted=true;await invoke(id,'prepare',[job]);await delay(850);check();
    const selected=await invoke(id,'selectResume',[job,options.nowcoderResumeName]);
    if(!selected.selected){await delay(350);check();await invoke(id,'chooseResume',[job,options.nowcoderResumeName]);await delay(350);}
    check();await invoke(id,'submit',[job,options.nowcoderResumeName]);
    for(let i=0;i<16;i++){await delay(400);check();if(await invoke(id,'verify',[job]))return {verified:true,note:'已验证牛客当前岗位的申请状态；平台简历：'+options.nowcoderResumeName};}
    throw Error('已点击提交，尚未验证岗位状态变化，请人工核对；不会自动重试');
    }catch(error){error.preflightFailed=!interacted;throw error;}
  }
  return {open,refresh,collect,send,cancel,snapshot,close(){void cancel();}};
}
module.exports={createPlatformController};
