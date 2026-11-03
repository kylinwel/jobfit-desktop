import {canonicalJobUrl} from './platforms.js';
// Copyright (C) 2026 JobFit contributors. GPL-3.0-only.
export const SKILLS = ["Python", "C++", "JavaScript", "TypeScript", "Java", "SQL", "Git", "Linux", "Docker", "FastAPI", "React", "Vue", "RAG", "Agent", "LangChain", "PyTorch", "Postman", "Selenium", "C"];
export const blankProfile = () => ({
  name: "", email: "", phone: "", school: "", major: "", degree: "本科",
  graduationYear: new Date().getFullYear()+1, cities: ["待填写"], strictCity: false, daysPerWeek: 5,
  months: 3, targets: [], skills: [], projects: []
});
export function validateProfile(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) throw Error("个人资料必须为对象");
  for (const k of ["name", "email", "phone", "school", "major", "degree"])
    if (typeof p[k] !== "string" || p[k].length > 250) throw Error("资料字段无效：" + k);
  if (!Number.isInteger(p.graduationYear) || p.graduationYear < 2000 || p.graduationYear > 2100) throw Error("毕业年份无效");
  for (const [k, min, max] of [["daysPerWeek", 1, 7], ["months", 1, 24]])
    if (!Number.isFinite(p[k]) || p[k] < min || p[k] > max) throw Error("实习时间无效：" + k);
  for (const k of ["cities", "targets"])
    if (!Array.isArray(p[k]) || p[k].some(v => typeof v !== "string" || !v.trim())) throw Error(k + " 必须为文本数组");
  if (!p.cities.length || typeof p.strictCity !== "boolean") throw Error("需要意向城市与城市筛选开关");
  if (!Array.isArray(p.skills) || p.skills.length > 100 || p.skills.some(s => !s.name || !["入门", "熟悉", "熟练"].includes(s.level))) throw Error("技能需要名称和真实熟练程度");
  if (!Array.isArray(p.projects) || p.projects.length > 50) throw Error("项目格式无效");
  const ids = new Set();
  for (const x of p.projects) {
    if (!x.id || ids.has(x.id) || typeof x.title !== "string" || typeof x.role !== "string"
      || !Array.isArray(x.bullets) || x.bullets.length>100 || x.bullets.some(b => typeof b !== "string" || b.length > 1000)
      || typeof x.confirmed !== "boolean") throw Error("项目需要唯一 ID、名称、真实职责、描述和事实确认状态");
    ids.add(x.id);
  }
  return p;
}
export function normalize(s) { return String(s || "").normalize("NFKC").replace(/\s+/g, "").toLowerCase(); }
export function skillPresent(text, skill) {
  const escaped = skill.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  return new RegExp("(?<![a-zA-Z0-9_+])" + escaped + "(?![a-zA-Z0-9_+])", "i").test(text);
}
export function jobKey(j) {
  if (j.url) {
    try {
      const u = new URL(j.url);
      if (canonicalJobUrl(j.url) && !u.pathname.includes("/web/geek/chat")) return canonicalJobUrl(j.url);
    } catch {}
  }
  return [j.company, j.title, j.city].map(normalize).join("|");
}
export function cleanJob(j) {
  if (!j || typeof j !== "object") throw Error("岗位数据无效");
  const out = {};
  for (const k of ["title", "company", "city", "salary", "description", "url", "source", "chatId"])
    out[k] = typeof j[k] === "string" ? j[k].trim().slice(0, k === "description" ? 30000 : 1000) : "";
  if (!out.title || !out.company) throw Error("需要填写岗位名称和公司");
  out.url=canonicalJobUrl(out.url);
  out.id = jobKey(out);
  return out;
}
function minValue(text, re) { return [...text.matchAll(re)].map(m => Number(m[1])).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0); }
export function assess(profile, job) {
  validateProfile(profile);
  const text = [job.title, job.description].join("\n");
  const reasons = [], blockers = [], unknowns = [], cautions = [];
  const cityKnown = Boolean(job.city?.trim());
  if (!cityKnown) unknowns.push("工作城市未明确");
  else if (!profile.cities.some(c => normalize(job.city).includes(normalize(c)))) {
    (profile.strictCity ? blockers : cautions).push("工作城市不在偏好范围：" + job.city);
  } else reasons.push("城市符合偏好");
  const years = [...new Set((text.match(/20\d{2}(?=\s*届)/g) || []).map(Number))];
  if (years.length && !years.includes(profile.graduationYear)) blockers.push("毕业届别不符：" + years.join(" / ") + " 届");
  else if (years.length) reasons.push("面向 " + profile.graduationYear + " 届");
  else if(/毕业(?:年份|届别)?不限|届别不限|不限届别/.test(text))reasons.push("毕业届别不限");
  else unknowns.push("是否接收 " + profile.graduationYear + " 届需确认");
  const postgraduate = /(?:硕士|研究生|博士)(?:及以上|以上|学历|在读)|(?:学历[：:\s]*|仅限|要求)\s*(?:硕士|研究生|博士)/.test(text);
  if (profile.degree === "本科" && postgraduate
      && !/本科(?:及以上|以上|[、/或]硕士)/.test(text)) blockers.push("学历要求高于本科");
  else if (/硕士|博士|研究生/.test(text) && !/本科/.test(text)) unknowns.push("研究生学历表述需确认");
  const months = minValue(text, /(?:至少|不少于|最少|实习(?:期|时间|时长)?[：:\s]*|连续实习|持续实习|可实习|实习满)\s*(\d{1,2})\s*个?月/g);
  const days = Math.max(minValue(text, /(?:每周|一周|周出勤)\s*(?:至少|不少于|最少|需|出勤|到岗)?\s*(\d)\s*天/g),minValue(text, /(\d)\s*天\s*[/／]\s*周/g));
  if (months > profile.months) blockers.push("至少实习 " + months + " 个月，你目前可提供 " + profile.months + " 个月");
  else if (months) reasons.push("实习时长符合（" + months + " 个月起）");
  else unknowns.push("最低实习月数需确认");
  if (days > profile.daysPerWeek) blockers.push("每周需 " + days + " 天，你目前可提供 " + profile.daysPerWeek + " 天");
  else if (days) reasons.push("每周出勤符合");
  else unknowns.push("每周出勤要求需确认");
  if (/(?:需|要求|具备|至少)\s*[3-9]\s*年.*(?:工作|开发)经验/.test(text) && !/不限经验|经验不限/.test(text)) blockers.push("要求多年工作经验");
  if (/缴纳.*(?:培训费|押金)|付费培训|先培训后就业|培训贷款/.test(text)) blockers.push("岗位描述含收费培训信息");
  if (!/实习|在校|在读/.test(text)) unknowns.push("是否为在校生实习岗位需确认");
  if (/独立(?:负责|完成|设计)|精通|熟练掌握/.test(text)) cautions.push("岗位强调独立完成或熟练掌握，需要对照实际能力");
  const required = SKILLS.filter(s => skillPresent(text, s));
  const matched = profile.skills.filter(s => required.some(r => normalize(r) === normalize(s.name)));
  const gaps = required.filter(r => !profile.skills.some(s => normalize(s.name) === normalize(r)));
  if (matched.length) reasons.push("已有接触：" + matched.map(s => s.name + "（" + s.level + "）").join("、"));
  if (matched.some(s => s.level === "入门")) cautions.push("技能关键词相同不代表已达到岗位熟练程度");
  const direction = profile.targets.some(t => normalize(text).includes(normalize(t)));
  const score = Math.max(0, Math.min(100, Math.round(35 + (cityKnown && !blockers.some(s=>s.startsWith("工作城市")) ? 15 : 0)
    + (direction ? 15 : 0) + (required.length ? matched.length / required.length * 25 : 5)
    + (months && months <= profile.months ? 5 : 0) + (days && days <= profile.daysPerWeek ? 5 : 0)
    - cautions.length * 5 - unknowns.length * 3 - blockers.length * 35)));
  return { score, status: blockers.length ? "blocked" : unknowns.length ? "review" : "match", reasons, blockers, unknowns, cautions, matched, gaps };
}
export function factCatalog(profile) {
  validateProfile(profile);
  return profile.projects.filter(p => p.confirmed).flatMap(p => p.bullets.map((text, i) => ({
    id: p.id + ":" + i, projectId: p.id, title: p.title, role: p.role, text
  })));
}
export function validatePlan(plan, facts) {
  if (!plan || !Array.isArray(plan.factIds) || plan.factIds.some(id => typeof id !== "string")) throw Error("模型返回格式错误，需要 factIds 数组");
  const allowed = new Set(facts.map(f => f.id));
  if (plan.factIds.length>10 || plan.factIds.some(id => !allowed.has(id)) || new Set(plan.factIds).size !== plan.factIds.length) throw Error("模型引用了不存在、重复或过多的经历，已拒绝结果");
  return plan.factIds;
}
export function tailor(profile, job, factIds = null) {
  const assessment = assess(profile, job), catalog = factCatalog(profile);
  const text = [job.title, job.description].join(" ");
  const keywords = SKILLS.filter(s => skillPresent(text, s));
  const sorted = [...catalog].sort((a,b) => keywords.filter(k=>skillPresent(b.text,k)).length - keywords.filter(k=>skillPresent(a.text,k)).length);
  const ids = factIds === null ? sorted.slice(0, 10).map(f=>f.id) : validatePlan({factIds}, catalog);
  const chosen = ids.map(id=>catalog.find(f=>f.id === id));
  const projects = [];
  for (const f of chosen) {
    let p = projects.find(p=>p.id === f.projectId);
    if (!p) {p={id:f.projectId,title:f.title,role:f.role,bullets:[],factIds:[]};projects.push(p);}
    p.bullets.push(f.text); p.factIds.push(f.id);
  }
  return {
    target: job.title, company: job.company, createdAt: new Date().toISOString(),
    basics: { name: profile.name, email: profile.email, phone: profile.phone },
    education: {school:profile.school,major:profile.major,degree:profile.degree,graduationYear:profile.graduationYear},
    availability: {daysPerWeek:profile.daysPerWeek,months:profile.months,cities:profile.cities},
    skills: [...profile.skills].sort((a,b)=> Number(skillPresent(text,b.name))-Number(skillPresent(text,a.name))),
    projects, assessment, factIds: ids,
    method: factIds === null ? "规则选择真实经历" : "模型排序真实经历（原文保留）"
  };
}
export function greeting(profile, job) {
  const matched = assess(profile, job).matched.map(s=>s.name + "（" + s.level + "）").join("、");
  return "您好，我是" + (profile.school || "") + (profile.major || "") + profile.graduationYear
    + "届" + profile.degree + "在读生，想申请贵司的" + job.title + "。"
    + (matched ? "目前接触过" + matched + "。" : "")
    + "可每周到岗" + profile.daysPerWeek + "天，实习" + profile.months + "个月。希望有机会进一步沟通，谢谢。";
}
export function markdown(r) {
  const lines = ["# " + (r.basics.name || "请填写姓名"), "", "求职意向：" + r.target,
    [r.basics.email, r.basics.phone].filter(Boolean).join(" · "), "",
    "## 教育背景", [r.education.school,r.education.major,r.education.degree,r.education.graduationYear+"届"].filter(Boolean).join(" · "), "",
    "## 实习安排", "意向城市：" + r.availability.cities.join(" / ") + "；每周 " + r.availability.daysPerWeek + " 天；" + r.availability.months + " 个月。", "",
    "## 专业技能", ...r.skills.map(s=>"- "+s.name+"："+s.level), "", "## 项目经历"];
  for (const p of r.projects) lines.push("", "### "+p.title, "职责："+p.role, ...p.bullets.map(b=>"- "+b));
  return lines.join("\n");
}
export const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function resumeHTML(r) {
  const e = escapeHtml;
  return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>' + e(r.basics.name||"简历") + " · " + e(r.target)
    + '</title><style>@page{size:A4;margin:18mm}body{max-width:760px;margin:36px auto;font:14px/1.7 "Microsoft YaHei",sans-serif;color:#202020}h1{font-size:28px;margin-bottom:4px}h2{font-size:16px;border-bottom:1px solid #aaa;margin:22px 0 8px}h3{font-size:14px;margin-bottom:0}p{margin:4px 0}ul{margin-top:6px;padding-left:20px}li{break-inside:avoid}h2,h3{break-after:avoid}@media print{body{margin:0;max-width:none}}</style><body><h1>'
    + e(r.basics.name || "请填写姓名") + '</h1><p>求职意向：' + e(r.target) + '</p><p>'
    + e([r.basics.email,r.basics.phone].filter(Boolean).join(" · ")) + '</p><h2>教育背景</h2><p>'
    + e([r.education.school,r.education.major,r.education.degree,r.education.graduationYear+"届"].filter(Boolean).join(" · "))
    + '</p><h2>实习安排</h2><p>' + e(r.availability.cities.join(" / ")) + " · 每周 " + r.availability.daysPerWeek + " 天 · " + r.availability.months
    + ' 个月</p><h2>专业技能</h2><p>' + r.skills.map(s=>e(s.name)+"（"+e(s.level)+"）").join(" · ")
    + '</p>' + (r.projects.length?'<h2>项目经历</h2>':"")
    + r.projects.map(p=>'<h3>'+e(p.title)+'</h3><p>职责：'+e(p.role)+'</p><ul>'+p.bullets.map(b=>'<li>'+e(b)+'</li>').join("")+'</ul>').join("")
    + '</body></html>';
}
