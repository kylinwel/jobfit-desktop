import {platformOfJob} from "./platforms.js";
import {blankProfile,validateProfile,cleanJob,assess,tailor,greeting} from "./core.js";
export const initialState = () => ({version:1,profile:blankProfile(),jobs:[],queue:[],model:{endpoint:"",model:"",key:""},automation:{running:false,dryRun:true,dailyLimit:5,intervalSeconds:60,lastAttempt:0},events:[]});
export function logEvent(s, message) { s.events.unshift({time:new Date().toISOString(),message});s.events=s.events.slice(0,100); }
export function upsertJobs(s, jobs) {
  if (!Array.isArray(jobs) || jobs.length>100) throw Error("每次最多导入 100 个岗位");
  for (const input of jobs) {
    const j=cleanJob(input), existing=s.jobs.find(x=>x.id===j.id);
    if (existing) {
      const changed=["description","city","title","company","chatId","url","source"].some(k=>j[k]&&j[k]!==existing[k]);
      for(const [k,v] of Object.entries(j)) if(v) existing[k]=v;
      if(changed){existing.resume=null; invalidate(s,j.id);}
    } else s.jobs.unshift({...j,addedAt:new Date().toISOString(),resume:null});
  }
  logEvent(s,"导入 "+jobs.length+" 个岗位（按岗位链接或公司/岗位/城市去重）");
}
function invalidate(s, id=null) {
  for(const q of s.queue) if((!id||q.jobId===id)&&q.status==="approved"){q.status="needs_review";q.note="资料或岗位已更新，请重新审核";}
}
export function saveProfile(s,p) {
  s.profile=structuredClone(validateProfile(p));
  s.jobs.forEach(j=>j.resume=null);invalidate(s);logEvent(s,"更新真实经历与求职条件");
}
export function makeResume(s,id,ids=null) {
  const j=s.jobs.find(j=>j.id===id);if(!j)throw Error("岗位不存在");
  j.resume=tailor(s.profile,j,ids);invalidate(s,id);return j.resume;
}
export function approve(s,id) {
  const j=s.jobs.find(j=>j.id===id);if(!j)throw Error("岗位不存在");
  if(j.source==="demo")throw Error("虚构示例岗位不能投递");
  if(assess(s.profile,j).status==="blocked")throw Error("岗位有硬性条件冲突，不能加入发送队列");
  if(!s.profile.name.trim()||!s.profile.school.trim()||!s.profile.major.trim())throw Error("请先补全姓名、学校和专业");
  if(!s.profile.email.trim()&&!s.profile.phone.trim())throw Error("请至少填写一种联系方式");
  if(!j.resume)throw Error("请先生成并检查此岗位的简历");
  const existing=s.queue.find(q=>q.jobId===id);
  if(existing&&["sent","sending","uncertain"].includes(existing.status))throw Error("已有发送记录或待核实记录，不能重复发送");
  const q={id:existing?.id||crypto.randomUUID(),jobId:id,status:"approved",approvedAt:new Date().toISOString(),
    greeting:greeting(s.profile,j),note:platformOfJob(j)==="nowcoder"?"已审核；自动投递使用指定名称的牛客平台简历。":"已审核；BOSS 自动发送使用平台当前在线简历，岗位专属 PDF 需自行上传。"};
  if(existing)Object.assign(existing,q);else s.queue.push(q);
  logEvent(s,"审核通过："+j.company+" / "+j.title);return q;
}
export function nextItem(s, now=Date.now()) {
  if(!s.automation.running)return null;
  const today=new Date(now).toLocaleDateString("en-CA",{timeZone:"Asia/Shanghai"});
  const count=s.queue.filter(q=>q.attemptAt&&new Date(q.attemptAt).toLocaleDateString("en-CA",{timeZone:"Asia/Shanghai"})===today).length;
  if(count>=s.automation.dailyLimit)return null;
  if(now-s.automation.lastAttempt<s.automation.intervalSeconds*1000)return null;
  return s.queue.find(q=>q.status==="approved")||null;
}
export function recoverInFlight(s) {
  for(const q of s.queue)if(q.status==="sending"){q.status="uncertain";q.note="上次发送流程中断，请人工核对，系统不会自动重发";}
}
export const demoJobs = [
  {company:"示例公司 · 山城软件",title:"Python / AI应用实习生",city:"杭州·示例区",salary:"120–160元/天",description:"【虚构演示岗位，不可投递】面向2028届本科在读生，每周至少4天，至少实习3个月。接触 Python、RAG、Agent 者优先，参与测试、接口调试与文档整理。提供带教。",source:"demo"},
  {company:"示例公司 · 星河科技",title:"算法研究实习生",city:"杭州·示例区",salary:"200–300元/天",description:"【虚构演示岗位，不可投递】仅限硕士及以上在读，至少实习6个月，每周5天。熟练掌握 Python、PyTorch，独立完成模型训练。",source:"demo"},
  {company:"示例公司 · 江岸数字",title:"软件测试实习生",city:"杭州·示例区",salary:"100–150元/天",description:"【虚构演示岗位，不可投递】面向2028届本科生，每周5天，至少实习3个月。学习测试用例设计，使用 Python、SQL、Postman 进行接口测试并记录缺陷。",source:"demo"}
];
export const demoProfile = () => ({...blankProfile(),graduationYear:2028,cities:["杭州"],strictCity:true,months:4,targets:["Python","软件测试"],name:"示例同学",email:"student@example.com",school:"示例大学",major:"软件工程",skills:[{name:"Python",level:"入门"},{name:"C++",level:"入门"}],projects:[
  {id:"example-testing",title:"课程项目测试练习（虚构示例）",role:"跟随教程完成",confirmed:true,bullets:["跟随课程使用 Python 编写基础数据处理脚本，并记录运行结果。","参与示例项目的测试文档整理，练习复现问题和编写操作说明。"]},
  {id:"not-mastered",title:"尚未学习完的开源项目（排除项）",role:"收藏后待学习",confirmed:false,bullets:["独立设计高并发生产级系统。"]}
]});
