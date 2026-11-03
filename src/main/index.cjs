const {app,BrowserWindow,Menu,protocol,net,shell,ipcMain,Notification,dialog}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {createJobFitService}=require('./jobfit-service.cjs');
const {createPlatformController}=require('./jobfit-platforms.cjs');
const {assetPath,trustedSender,externalUrl}=require('./routing.cjs');
app.setName('JobFit');
if(process.platform==='win32')app.setAppUserModelId('io.github.kylinwel.jobfit');
const userData=path.join(app.getPath('appData'),'JobFitDesktop');fs.mkdirSync(userData,{recursive:true});
app.setPath('userData',userData);
protocol.registerSchemesAsPrivileged([{scheme:'jobfit',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
let window,service;const notices=new Set();const assets=path.join(__dirname,'../ui');
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function openExternal(value){const url=externalUrl(value);if(url)void shell.openExternal(url);}
async function handle(request){
  try{
    const url=new URL(request.url);if(url.hostname!=='app')return json({ok:false,error:'无效的应用地址'},403);
    if(url.pathname==='/api/jobfit'){
      if(request.method!=='POST')return json({ok:false,error:'仅支持 POST'},405);
      const origin=request.headers.get('Origin');if(origin&&origin!=='jobfit://app')return json({ok:false,error:'无效的请求来源'},403);
      const raw=await request.text();if(Buffer.byteLength(raw)>2e6)return json({ok:false,error:'资料超过 2MB'},413);
      let body;try{body=JSON.parse(raw);}catch{return json({ok:false,error:'JSON 格式错误'},400);}
      if(!body||typeof body.action!=='string')return json({ok:false,error:'缺少操作类型'},400);
      try{return json({ok:true,data:await service.request(body.action,body.data)});}catch(error){return json({ok:false,error:error.message},400);}
    }
    if(request.method!=='GET')return new Response('Method not allowed',{status:405});
    const target=assetPath(assets,url.pathname);if(!target)return new Response('Forbidden',{status:403});
    const response=await net.fetch(pathToFileURL(target).href);const headers=new Headers(response.headers);
    headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' about:; object-src 'none'; base-uri 'self'; form-action 'none'");
    headers.set('X-Content-Type-Options','nosniff');return new Response(response.body,{status:response.status,headers});
  }catch{return json({ok:false,error:'无法加载应用资源'},500);}
}
function notifyDigest(report){
  if(!Notification.isSupported())return false;
  const notice=new Notification({title:'JobFit · 岗位日报',body:report.status==='complete'?report.rows.length+' 个新发岗位达到 60 分，点击查看表格':'岗位来源采集未完成，点击查看状态'});
  notices.add(notice);notice.on('close',()=>notices.delete(notice));notice.on('failed',()=>notices.delete(notice));
  notice.on('click',()=>{if(window&&!window.isDestroyed()){window.show();if(window.isMinimized())window.restore();window.focus();window.webContents.send('jobfit:digest');}});
  notice.show();return true;
}
async function createWindow(){
  window=new BrowserWindow({width:1280,height:860,minWidth:900,minHeight:680,title:'JobFit · 求职工作台',show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  window.webContents.setWindowOpenHandler(({url})=>{
    if(url.startsWith('jobfit://app/print.html?'))return {action:'allow',overrideBrowserWindowOptions:{parent:window,width:900,height:850,autoHideMenuBar:true,webPreferences:{preload:undefined,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}}};
    openExternal(url);return {action:'deny'};
  });
  window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('jobfit://app/')){event.preventDefault();openExternal(url);}});
  window.webContents.on('did-create-window',child=>child.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('jobfit://app/print.html')){event.preventDefault();openExternal(url);}}));
  window.on('page-title-updated',event=>event.preventDefault());
  window.on('closed',()=>{service?.close();app.quit();});
  await window.loadURL('jobfit://app/index.html?embedded=1');window.show();service.startDigest();
}
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(window&&!window.isDestroyed()){window.show();if(window.isMinimized())window.restore();window.focus();}});
  app.whenReady().then(async()=>{
    Menu.setApplicationMenu(null);
    app.on('web-contents-created',(_event,contents)=>contents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false)));
    const data=path.join(app.getPath('userData'),'data');
    const platformController=await createPlatformController({BrowserWindow,assets});
    service=await createJobFitService({directory:data,assets,platformController,digestFetch:(url,options)=>net.fetch(url,options),digestNotify:notifyDigest,digestOpenFolder:()=>shell.openPath(path.join(data,'digest','reports'))});
    protocol.handle('jobfit',handle);
    ipcMain.handle('jobfit:open-data',event=>{if(!trustedSender(event,window?.webContents))throw Error('不受信任的请求');return shell.openPath(data);});
    await createWindow();
  }).catch(error=>{dialog.showErrorBox('JobFit 无法启动',error.message);app.quit();});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>{service?.close();for(const notice of notices)notice.close();notices.clear();});
}
