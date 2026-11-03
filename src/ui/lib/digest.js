// GPL-3.0-only. Job descriptions and profile matching remain local.
import {assess,cleanJob} from './core.js';
export const digestDefaults={enabled:false,hour:9,minute:0,threshold:60};
export function shanghaiDay(time=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));}
export function digestDue(settings,lastDay,time=Date.now()){
  if(!settings.enabled||lastDay===shanghaiDay(time))return false;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(time)).map(p=>[p.type,p.value]));
  return Number(parts.hour)*60+Number(parts.minute)>=settings.hour*60+settings.minute;
}
const words=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/\\n/g,'\n').trim();
export function nowcoderJob(raw){
  const j=raw?.data||raw;if(!j||!/^\d+$/.test(String(j.id))||j.status!==0)return null;
  let ext={};try{ext=JSON.parse(j.ext||'{}');}catch{}
  const company=j.companyNameText||j.recommendInternCompany?.companyShortName||j.recommendInternCompany?.companyName||j.companyName;
  if(!company||!j.jobName)return null;
  const education={0:'学历不限',4000:'专科及以上',5000:'本科及以上',5500:'双学位',6000:'硕士及以上',7000:'博士及以上',8000:'博士后'}[j.eduLevel]||'学历要求需确认';
  const description=[Number(j.recruitType)===2?'实习岗位':'校园招聘岗位',j.graduationYear,education,j.durationDays?`每周${j.durationDays}天`:'',j.durationMonths?`至少实习${j.durationMonths}个月`:'',words(ext.infos),words(ext.requirements),words(ext.jobStrength)].filter(Boolean).join('\n');
  const input={title:j.jobName,company,city:j.jobCity||j.jobCityList?.join('、')||'',salary:j.salaryText||j.salaryShow||(j.salaryMin||j.salaryMax?`${j.salaryMin||''}–${j.salaryMax||''}${j.salaryType===1?'元/天':'元/月'}`:'面议'),description,url:'https://www.nowcoder.com/jobs/detail/'+j.id,source:'nowcoder-detail'};
  const created=Number(j.createTime),publishedAt=Number.isFinite(created)&&created>946684800000?new Date(created).toISOString():null;
  return {...cleanJob(input),publishedAt,timeBasis:publishedAt?'平台创建时间':'发布时间未知',kind:Number(j.recruitType)===2?'实习':'校招'};
}
export async function fetchNowcoder(fetchPage,{type=2,maxPages=6,signal}={}){
  const jobs=[],pages=new Set();let totalPage=1,totalCount=0;
  for(let page=1;page<=Math.min(totalPage,maxPages);page++){
    // Deliberately generic: no resume, city preference, school, contact data or model prompt is sent.
    const body=new URLSearchParams({page:String(page),pageSize:'100',recruitType:String(type),requestFrom:'1',order:'1'}).toString();
    const response=await fetchPage('https://www.nowcoder.com/np-api/u/job/search',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Referer':'https://www.nowcoder.com/jobs/intern/center'},body,credentials:'omit',redirect:'error',signal});
    if(!response.ok)throw Error('牛客公开岗位请求失败（'+response.status+'）');
    const content=await response.text();if(content.length>8000000)throw Error('牛客响应过大，已停止');
    let result;try{result=JSON.parse(content);}catch{throw Error('牛客返回了登录、验证或非数据页面');}
    if(result.code!==0||!Array.isArray(result.data?.datas))throw Error('牛客需要验证或公开接口发生变化');
    const data=result.data;if(data.currentPage!==undefined&&Number(data.currentPage)!==page)throw Error('牛客分页不一致，未将重复页面当作新增岗位');
    totalPage=Math.max(1,Math.min(1000,Number(data.totalPage)||1));totalCount=Number(data.totalCount)||0;
    const signature=data.datas.map(j=>(j.data||j).id).join(',');if(signature&&pages.has(signature))throw Error('牛客重复返回同一页，已停止采集');pages.add(signature);
    jobs.push(...data.datas.map(nowcoderJob).filter(Boolean));if(!data.datas.length)break;
  }
  return {jobs,scanned:jobs.length,pages:pages.size,totalPage,totalCount,truncated:totalPage>maxPages};
}
export function makeDigest({jobs,profile,since,time=Date.now(),seen={},previous=[]}){
  const candidates=new Map();for(const j of [...previous,...jobs]){try{const clean=cleanJob(j);candidates.set(clean.id,{...j,...clean});}catch{}}
  const rows=[],unverified=[],nextSeen={...seen};
  for(const job of candidates.values()){
    const score=assess(profile,job),published=Date.parse(job.publishedAt||'');
    if(!nextSeen[job.id])nextSeen[job.id]=new Date(time).toISOString();
    if(score.status==='blocked'||score.score<60)continue;
    const row={id:job.id,company:job.company,title:job.title,kind:job.kind||'岗位',city:job.city,salary:job.salary,score:score.score,publishedAt:job.publishedAt||'',firstSeenAt:nextSeen[job.id],timeBasis:job.timeBasis||'发布时间未知',reasons:score.reasons,questions:score.unknowns,cautions:score.cautions,gaps:score.gaps,url:job.url,source:job.source.startsWith('nowcoder')?'牛客网':'BOSS 直聘'};
    if(!job.url)continue;
    if(Number.isFinite(published)&&published>since&&published<=time+300000)rows.push(row);
    else if(!Number.isFinite(published)&&(!seen[job.id]||previous.some(p=>p.id===job.id)))unverified.push(row);
  }
  const order=(a,b)=>b.score-a.score||b.publishedAt.localeCompare(a.publishedAt)||a.id.localeCompare(b.id);rows.sort(order);unverified.sort(order);
  const retained=Object.fromEntries(Object.entries(nextSeen).filter(([,date])=>Date.parse(date)>time-45*86400000).slice(-10000));
  return {rows,unverified,seen:retained,candidates:[...candidates.values()].slice(-2500)};
}
const csvCell=value=>{let s=Array.isArray(value)?value.join('；'):String(value??'');if(/^[\s]*[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
export function digestCsv(report){
  const columns=[['公司','company'],['岗位','title'],['类型','kind'],['城市','city'],['薪资','salary'],['匹配分（满分100）','score'],['平台创建时间（北京时间）','publishedAt'],['新发依据','timeBasis'],['首次发现时间（北京时间）','firstSeenAt'],['符合项','reasons'],['待确认条件','questions'],['能力提醒','cautions'],['技能缺口','gaps'],['投递链接','url'],['来源','source']];
  return '\uFEFF'+[columns.map(([name])=>csvCell(name)).join(','),...report.rows.map(row=>columns.map(([,key])=>csvCell((key==='publishedAt'||key==='firstSeenAt')&&row[key]?new Date(row[key]).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai',hour12:false}):row[key])).join(','))].join('\r\n');
}
