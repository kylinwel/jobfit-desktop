import {mountDigest} from "./digest-view.js";
import {platforms,platformOfJob} from "./lib/platforms.js";
import {api,isExtension,isDesktop,loadDemo} from "./lib/client.js";
import {assess,escapeHtml as e,markdown,resumeHTML,validateProfile,greeting} from "./lib/core.js";
let state,selected=null,tab="analysis",view="jobs",busy=false;
if(globalThis.location&&new URL(location.href).searchParams.get("embedded")==="1")document.body.classList.add("embedded");
const $=s=>document.querySelector(s);
const labels={match:"条件符合",review:"需确认",blocked:"条件冲突",approved:"待执行",needs_review:"需重新审核",sending:"发送中",sent:"已验证提交",simulated:"已演练",uncertain:"待人工核对",cancelled:"已取消"};
let noticeTimer;
function notice(text,error=false){clearTimeout(noticeTimer);const n=$("#notice");n.textContent=text;n.className="notice"+(error?" error":"");n.hidden=false;if(!error)noticeTimer=setTimeout(()=>{n.hidden=true;},4500);}
async function run(fn){
  if(busy)return;busy=true;document.body.setAttribute("aria-busy","true");
  try{await fn();}catch(err){notice(err.message||String(err),true);}finally{busy=false;document.body.removeAttribute("aria-busy");}
}
async function mutate(action,data,message){state=await api(action,data);render();if(message)notice(message);}
function download(name,body,type="application/json"){
  const url=URL.createObjectURL(new Blob([body],{type})),a=document.createElement("a");
  a.href=url;a.download=name.replace(/[\\/:*?"<>|]/g,"_");a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const digestView=mountDigest(api,download,notice);
function render(){
  $("#profile-badge").textContent=state.profile.school?state.profile.graduationYear+"届 · "+state.profile.cities.join("/"):"资料待完善";
  const a=state.jobs.map(j=>assess(state.profile,j));
  $("#summary").innerHTML="<span><strong>"+a.length+"</strong> 个岗位</span><span><strong>"+a.filter(x=>x.status==="match").length+"</strong> 条件符合</span><span><strong>"+a.filter(x=>x.status==="review").length+"</strong> 需确认</span><span><strong>"+a.filter(x=>x.status==="blocked").length+"</strong> 条件冲突</span>";
  const search=$("#search").value.trim().toLowerCase(),filter=$("#filter").value,source=$("#source-filter").value;
  const jobs=state.jobs.map(j=>({j,a:assess(state.profile,j)})).filter(({j,a})=>(filter==="all"||filter===a.status)&&(source==="all"||platformOfJob(j)===source)&&[j.company,j.title,j.description].join(" ").toLowerCase().includes(search)).sort((a,b)=>b.a.score-a.a.score);
  if(!jobs.some(({j})=>j.id===selected))selected=jobs[0]?.j.id||null;
  $("#job-list").innerHTML=jobs.length?jobs.map(({j,a})=>'<button class="job-card '+(selected===j.id?"selected":"")+'" data-job="'+e(j.id)+'"><p class="company">'+e(j.company)+'</p><h3>'+e(j.title)+'</h3><div class="meta">'+e(j.city||"城市待确认")+' · '+e(j.salary||"薪资未填写")+'</div><div class="card-bottom"><span class="status '+a.status+'">'+labels[a.status]+'</span><span class="score">'+a.score+' / 100</span></div></button>').join(""):'<div class="empty"><span>暂无岗位</span><p>从 BOSS / 牛客采集，或粘贴岗位要求。</p></div>';
  renderDetail();if(view==="queue")renderQueue();if(view==="settings")renderSettings();if(view==="accounts")renderAccounts();
}
function group(title,items,cls=""){
  return items.length?'<div class="analysis-block '+cls+'"><h3>'+e(title)+'</h3><ul>'+items.map(t=>'<li>'+e(t)+'</li>').join("")+'</ul></div>':"";
}
function renderDetail(){
  const j=state.jobs.find(j=>j.id===selected);if(!j){$("#job-detail").innerHTML='<div class="empty"><span>从一个岗位开始</span><p>导入岗位，查看条件是否匹配，再准备对应简历。</p></div>';return;}
  const a=assess(state.profile,j);
  let html='<div class="detail-kicker"><span>'+e(j.source==="demo"?"虚构演示岗位 · 不能投递":j.source==="manual"?"手动录入":j.source||"本地岗位")+'</span><span class="score">匹配排序 '+a.score+' / 100</span></div><h2>'+e(j.title)+'</h2><p>'+e(j.company)+'</p><div class="detail-meta">'+e(j.city||"城市未明确")+' / '+e(j.salary||"薪资未明确")+(j.url?' / <a href="'+e(j.url)+'" target="_blank" rel="noreferrer">打开岗位 ↗</a>':"")+'</div><div class="detail-tabs"><button data-tab="analysis" class="'+(tab==="analysis"?"active":"")+'">匹配分析</button><button data-tab="jd" class="'+(tab==="jd"?"active":"")+'">原始岗位要求</button><button data-tab="resume" class="'+(tab==="resume"?"active":"")+'">岗位简历</button></div>';
  if(tab==="analysis"){
    html+=group("硬性条件冲突",a.blockers,"danger")+group("符合项",a.reasons)+group("投递前需要确认",a.unknowns,"warning")+group("能力与要求差距",a.cautions.concat(a.gaps.length?["简历中尚未记录："+a.gaps.join("、")]:[]),"warning")
      +'<p class="muted" style="margin-top:18px">分数是可解释规则的排序结果，不是录取概率；公司背景、岗位有效性和实际带教需另行核实。</p>';
  }else if(tab==="jd"){html+='<div class="jd">'+e(j.description||"未导入完整要求。列表摘要不代表完整 JD，请打开详情再导入。")+'</div>';}
  else{
    html+='<div class="detail-actions"><button class="primary" data-action="resume">生成岗位简历</button><button data-action="aiResume">用模型选择经历</button></div>';
    if(j.resume)html+='<p class="muted">'+e(j.resume.method)+' · '+j.resume.factIds.length+' 条真实素材</p><div class="detail-actions"><button data-action="download-md">下载 Markdown</button><button data-action="download-html">下载 HTML</button><button data-action="print">打印 / 存为 PDF</button></div><iframe class="resume-frame" title="岗位简历预览" sandbox=""></iframe><p class="fact-list">来源引用：'+e(j.resume.factIds.join("、")||"尚无已确认项目素材")+'</p>';
    else html+='<p class="muted" style="margin-top:20px">先在「真实经历」中保存资料，并确认你实际完成的项目内容。</p>';
  }
  if(isDesktop&&platformOfJob(j))html+='<div class="detail-actions"><button data-action="open-platform">在平台窗口打开此岗位</button><span class="muted">'+e(platforms.find(p=>p.id===platformOfJob(j))?.name||'')+'</span></div>';
  html+='<div class="detail-actions"><button data-action="approve" '+(a.status==="blocked"||j.source==="demo"?"disabled":"")+'>审核简历与招呼，加入队列</button></div>';
  $("#job-detail").innerHTML=html;
  const frame=$("#job-detail iframe");if(frame)frame.srcdoc=resumeHTML(j.resume);
}
function showView(next){
  view=next;document.querySelectorAll(".view").forEach(el=>{el.hidden=el.id!=="view-"+view;});
  document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  $("#page-title").textContent=({jobs:"岗位工作台",profile:"真实经历与求职条件",queue:"沟通队列",settings:"模型设置",accounts:"招聘平台账号",digest:"每日岗位表"})[view];
  if(view==="profile")renderProfile();else if(view==="queue")renderQueue();else if(view==="settings")renderSettings();else if(view==="accounts")renderAccounts();else if(view==="digest")void digestView.load().catch(e=>notice(e.message,true));
}
const fields=[
  ["name","姓名","text"],["school","学校","text"],["major","专业","text"],["email","邮箱","email"],["phone","电话","text"],["degree","学历","text"],
  ["graduationYear","毕业年份","number"],["daysPerWeek","每周可到岗天数","number"],["months","可实习月数（上限）","number"],["cities","意向城市（逗号分隔）","text"],["targets","目标方向关键词（逗号分隔）","text"]
];
function renderProfile(){
  const p=state.profile;
  $("#profile-fields").innerHTML=fields.map(([k,l,t])=>'<label>'+l+'<input name="'+k+'" type="'+t+'" value="'+e(Array.isArray(p[k])?p[k].join("，"):p[k])+'" '+(t==="number"?'min="1" step="1"':"")+'></label>').join("")+'<label class="check"><input type="checkbox" name="strictCity" '+(p.strictCity?"checked":"")+'> 城市不符时排除</label>';
  $("#skills").value=p.skills.map(s=>s.name+" | "+s.level).join("\n");
  $("#projects").innerHTML=p.projects.map(projectEditor).join("")||'<p class="muted" id="no-project">尚未添加项目素材。没有实际完成的项目，可以先留空。</p>';
}
function projectEditor(p){
  return '<div class="project-editor" data-id="'+e(p.id)+'"><button type="button" class="remove">移除</button><div class="form-grid"><label>项目名称<input class="p-title" value="'+e(p.title)+'"></label><label>真实职责 / 参与程度<input class="p-role" value="'+e(p.role)+'" placeholder="如：跟随教程、参与测试"></label></div><label>实际完成的内容（每行一条）<textarea class="p-bullets" rows="4">'+e(p.bullets.join("\n"))+'</textarea></label><label class="check"><input type="checkbox" class="p-confirmed" '+(p.confirmed?"checked":"")+'> 我确认这些描述符合自己的实际参与情况</label></div>';
}
function readProfile(){
  const form=$("#profile-form"),p={...state.profile};
  for(const [k,,t] of fields)p[k]=t==="number"?Number(form.elements[k].value):form.elements[k].value.trim();
  for(const k of ["cities","targets"])p[k]=p[k].split(/[,，]/).map(s=>s.trim()).filter(Boolean);
  p.strictCity=form.elements.strictCity.checked;
  p.skills=$("#skills").value.split("\n").filter(s=>s.trim()).map(line=>{const [name,level]=line.split(/[|｜]/).map(s=>s.trim());return{name,level};});
  p.projects=[...document.querySelectorAll(".project-editor")].map(el=>({id:el.dataset.id,title:el.querySelector(".p-title").value.trim(),role:el.querySelector(".p-role").value.trim(),bullets:el.querySelector(".p-bullets").value.split("\n").map(s=>s.trim()).filter(Boolean),confirmed:el.querySelector(".p-confirmed").checked}));
  return validateProfile(p);
}
function renderAccounts(){
  const names={closed:"未打开",ready:"页面就绪",login_required:"需要登录",attention:"需要处理",unknown:"窗口已打开"};
  $("#platform-list").innerHTML=platforms.map(p=>{const status=state.platforms?.find(s=>s.id===p.id);return '<article class="platform-row"><div><h3>'+e(p.name)+' <small>'+e(names[status?.state||"closed"])+'</small></h3><p>'+e(p.note)+'</p><p class="muted">'+e(status?.note||"请先打开平台窗口")+'</p></div><div class="actions"><button data-platform-open="'+p.id+'">打开 / 登录</button><button data-platform-refresh="'+p.id+'">刷新状态</button><button data-platform-collect="'+p.id+'">采集当前页</button></div></article>';}).join("");
  $("#execution-form").elements.nowcoderResumeName.value=state.automation.nowcoderResumeName||"";
}
$("#platform-list").addEventListener("click",ev=>run(async()=>{
  const b=ev.target.closest("button");if(!b)return;
  if(!isDesktop)throw Error("平台账号窗口请在 JobFit 桌面版使用");
  if(b.dataset.platformOpen)await mutate("platformOpen",{platform:b.dataset.platformOpen});
  else if(b.dataset.platformRefresh)await mutate("platformStatus",{platform:b.dataset.platformRefresh});
  else if(b.dataset.platformCollect)await mutate("collect",{platform:b.dataset.platformCollect},"已采集当前平台页面");
}));
$("#execution-form").addEventListener("submit",ev=>{ev.preventDefault();run(()=>mutate("executionSettings",{nowcoderResumeName:ev.target.elements.nowcoderResumeName.value},"投递设置已保存；简历名称更改后需重新审核牛客队列"));});
function renderQueue(){
  $("#queue-status").textContent=state.automation.running?(state.automation.dryRun?"正在演练":"正在执行投递")+" · 每分钟最多一项 / 每日最多五次":"队列已暂停";
  $("#real-run").disabled=Boolean(state.automation.running);$("#dry-run").disabled=Boolean(state.automation.running);
  $("#queue-list").innerHTML=state.queue.length?state.queue.map(q=>{
    const j=state.jobs.find(j=>j.id===q.jobId);
    return '<div class="queue-row"><div class="section-heading"><h3>'+e(j?.company||"岗位已移除")+' / '+e(j?.title||"")+'</h3><span class="status '+e(q.status)+'">'+e(labels[q.status]||q.status)+'</span></div><p>'+e(q.note||"")+'</p><p class="draft">'+e(q.greeting)+'</p>'+(q.status==="approved"?'<button data-cancel="'+e(q.id)+'">取消此项</button>':"")+'</div>';
  }).join(""):'<div class="empty"><span>队列为空</span><p>检查岗位简历和招呼内容，再加入队列。</p></div>';
  $("#events").innerHTML=state.events.map(ev=>'<div class="event"><time>'+e(new Date(ev.time).toLocaleString("zh-CN"))+'</time>'+e(ev.message)+'</div>').join("");
}
function renderSettings(){
  const f=$("#model-form");f.elements.endpoint.value=state.model.endpoint;f.elements.model.value=state.model.model;f.elements.key.value="";f.elements.clearKey.checked=false;
  $("#key-status").textContent=state.model.hasKey?"已保存密钥，界面不回显。":"尚未保存密钥。";
}
document.querySelectorAll("nav button").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
$("#search").addEventListener("input",render);$("#filter").addEventListener("change",render);$("#source-filter").addEventListener("change",render);$("#go-accounts").onclick=()=>showView("accounts");
$("#job-list").addEventListener("click",ev=>{const b=ev.target.closest("[data-job]");if(b){selected=b.dataset.job;tab="analysis";render();}});
$("#job-detail").addEventListener("click",ev=>run(async()=>{
  const t=ev.target.closest("[data-tab]");if(t){tab=t.dataset.tab;renderDetail();return;}
  const action=ev.target.closest("[data-action]")?.dataset.action;if(!action)return;
  const j=state.jobs.find(j=>j.id===selected);if(!j)return;
  if(action==="open-platform"){await mutate("openJob",{id:j.id});return;}
  if(["resume","aiResume"].includes(action)){await mutate(action,{id:j.id},"已从真实经历生成此岗位简历");return;}
  if(action==="approve"){
    const preview=document.createElement("dialog");preview.innerHTML='<h2>加入沟通队列</h2><p>请确认已检查岗位简历。队列实际发送 BOSS 当前在线简历，不会自动上传此岗位的专属附件。</p><p class="draft"></p><div class="actions"><button data-confirm>确认加入</button><button data-close>取消</button></div>';
    preview.querySelector("p").textContent=platformOfJob(j)==="nowcoder"?"即将使用牛客平台简历："+(state.automation.nowcoderResumeName||"尚未设置，请先到平台账号填写")+"。请确认岗位和实际平台简历内容。":"队列向 BOSS 会话发送招呼及平台当前在线简历。岗位专属附件需要先自行上传并选择。";
    preview.querySelector(".draft").textContent=platformOfJob(j)==="nowcoder"?j.company+" / "+j.title:greeting(state.profile,j);
    document.body.append(preview);preview.showModal();
    preview.querySelector("[data-close]").onclick=()=>preview.close();
    preview.querySelector("[data-confirm]").onclick=()=>run(async()=>{await mutate("approve",{id:j.id},"已加入队列，尚未发送");preview.close();});
    preview.addEventListener("close",()=>preview.remove());return;
  }
  if(!j.resume)throw Error("请先生成简历");
  const name=(state.profile.name||"简历")+"-"+j.company+"-"+j.title;
  if(action==="download-md")download(name+".md",markdown(j.resume),"text/markdown;charset=utf-8");
  if(action==="download-html")download(name+".html",resumeHTML(j.resume),"text/html;charset=utf-8");
  if(action==="print")window.open("print.html?id="+encodeURIComponent(j.id),"_blank");
}));
$("#collect").addEventListener("click",()=>run(()=>mutate("collect",{platform:$("#collect-platform").value},"已采集平台当前页面；投递前请采集完整岗位详情")));
$("#import-job").onclick=()=>$("#job-dialog").showModal();$("#close-dialog").onclick=()=>$("#job-dialog").close();
$("#job-form").addEventListener("submit",ev=>{ev.preventDefault();run(async()=>{const data=Object.fromEntries(new FormData(ev.target));await mutate("importJobs",[{...data,source:"manual"}],"已导入并分析岗位");ev.target.reset();$("#job-dialog").close();});});
$("#profile-form").addEventListener("submit",ev=>{ev.preventDefault();run(()=>mutate("saveProfile",readProfile(),"资料已保存，已有简历与审核已失效，请重新生成与审核"));});
$("#add-project").onclick=()=>{$("#no-project")?.remove();$("#projects").insertAdjacentHTML("beforeend",projectEditor({id:crypto.randomUUID(),title:"",role:"",bullets:[],confirmed:false}));};
$("#projects").addEventListener("click",ev=>{if(ev.target.closest(".remove"))ev.target.closest(".project-editor").remove();});
$("#export-profile").onclick=()=>run(async()=>download(isDesktop?"jobfit-backup.json":"jobfit-profile.json",JSON.stringify(isDesktop?await api("backup"):state.profile,null,2)));
$("#import-profile").onclick=()=>$("#profile-file").click();
$("#profile-file").addEventListener("change",ev=>run(async()=>{
  const f=ev.target.files[0];if(!f)return;if(f.size>500000)throw Error("资料文件不能大于 500 KB");
  const parsed=JSON.parse(await f.text());
  if(isDesktop&&parsed.kind==="jobfit-backup"){
    if(!confirm("将恢复备份中的求职资料和岗位。现有资料会自动留一份本机备份，密钥不会从文件导入。继续？"))return;
    await mutate("restore",parsed,"已恢复求职备份，密钥需重新配置");
  }else await mutate("saveProfile",parsed,"已导入个人资料");
  renderProfile();ev.target.value="";
}));
$("#model-form").addEventListener("submit",ev=>{
  ev.preventDefault();const data=Object.fromEntries(new FormData(ev.target));data.clearKey=Boolean(data.clearKey);
  const save=()=>run(()=>mutate("model",data,"模型设置已保存"));
  if(isExtension&&data.endpoint){
    let u;try{u=new URL(data.endpoint);}catch{notice("请输入完整的接口 URL",true);return;}
    chrome.permissions.request({origins:[u.protocol+"//"+u.hostname+"/*"]}).then(ok=>{if(ok)save();else notice("未授予模型端点访问权限",true);},e=>notice(e.message,true));
  }else save();
});
$("#queue-list").addEventListener("click",ev=>{const b=ev.target.closest("[data-cancel]");if(b)run(()=>mutate("cancel",{id:b.dataset.cancel},"已取消"));});
$("#dry-run").onclick=()=>run(()=>mutate("start",{real:false},"演练队列已启动，不会发送消息或简历"));
$("#stop").onclick=()=>run(()=>mutate("stop",{},"队列已暂停"));
$("#real-run").onclick=()=>run(async()=>{
  if(!$("#real-ack").checked)throw Error("请先检查在线简历，并勾选实际发送确认");
  await mutate("start",{real:true,acknowledgement:isDesktop?"发送已审核岗位的平台简历":"发送平台在线简历"},"队列已启动，请保持对应平台窗口打开，观察投递记录。");
});
$("#demo").onclick=()=>run(async()=>{
  if(state.profile.name&&!confirm("查看示例会替换当前个人资料，已有岗位会保留。请先导出备份。是否继续？"))return;
  state=await loadDemo();selected=state.jobs.find(j=>j.source==="demo")?.id;render();if(view==="profile")renderProfile();notice("示例使用虚构资料和岗位，不能用于实际投递。请导入自己的资料后使用。");
});
await run(async()=>{
  state=await api("get");$("#mode").textContent=isDesktop?"JobFit 本机资料库":isExtension?"BOSS 直聘扩展 · v0.1":"浏览器预览 · 不执行真实投递";
  render();
  if(new URL(location.href).searchParams.get("tab")==="digest")showView("digest");
  if(isDesktop){
    $("#export-profile").textContent="导出求职备份";$("#import-profile").textContent="导入资料 / 备份";
  }else if(!isExtension)notice("当前是本地预览。可使用示例或粘贴岗位；BOSS 采集与真实发送需要安装扩展。");
});
if(isExtension||isDesktop)setInterval(()=>{if(!busy&&view==="queue")run(async()=>{state=await api("get");renderQueue();});},5000);

$("#desktop-demo").onclick=()=>$("#demo").click();
$("#desktop-data").onclick=()=>run(async()=>{await globalThis.jobfitDesktop?.openData();});
globalThis.jobfitDesktop?.onDigest(()=>showView("digest"));
