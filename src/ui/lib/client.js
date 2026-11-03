import {initialState,upsertJobs,saveProfile,makeResume,approve,nextItem,logEvent,demoJobs,demoProfile} from "./state.js";
import {planFacts} from "./llm.js";
export const isExtension=Boolean(globalThis.chrome?.runtime?.id);
export const isDesktop=globalThis.location?.protocol==="jobfit:"&&globalThis.location?.hostname==="app";
const storageKey="jobfit-preview-v1";
export async function api(action,data={}) {
  if(isDesktop){
    const response=await fetch("/api/jobfit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,data})});
    const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||"求职资料操作失败");
    return result.data;
  }
  if(isExtension) {
    const r=await chrome.runtime.sendMessage({action,data});if(!r?.ok)throw Error(r?.error||"扩展服务无响应");return r.data;
  }
  let s=JSON.parse(localStorage.getItem(storageKey)||"null")||initialState();
  switch(action){
    case "get":break;
    case "saveProfile":saveProfile(s,data);break;
    case "importJobs":upsertJobs(s,data);break;
    case "resume":makeResume(s,data.id);break;
    case "aiResume":{
      const j=s.jobs.find(j=>j.id===data.id);if(!j)throw Error("岗位不存在");
      makeResume(s,j.id,await planFacts(s.profile,j,s.model));break;
    }
    case "approve":approve(s,data.id);break;
    case "cancel":{const q=s.queue.find(q=>q.id===data.id);if(q&&q.status==="approved")q.status="cancelled";break;}
    case "model":s.model={...data,key:data.clearKey?"":data.key||s.model.key};break;
    case "start":{
      if(data.real)throw Error("浏览器预览不能执行真实投递，请安装扩展");
      s.automation.running=true;s.automation.dryRun=true;
      const q=nextItem(s);if(q){q.status="simulated";q.attemptAt=new Date().toISOString();q.note="演练完成，未发送任何消息或简历";s.automation.lastAttempt=Date.now();logEvent(s,"预览演练完成");}
      s.automation.running=false;break;
    }
    case "stop":s.automation.running=false;break;
    case "collect":throw Error("采集 BOSS 岗位需要先安装浏览器扩展，预览版可手动粘贴岗位");
    default:throw Error("不支持的操作");
  }
  localStorage.setItem(storageKey,JSON.stringify(s));
  return {...s,model:{...s.model,key:"",hasKey:Boolean(s.model.key)}};
}
export async function loadDemo() {
  await api("saveProfile",demoProfile());return api("importJobs",demoJobs);
}
