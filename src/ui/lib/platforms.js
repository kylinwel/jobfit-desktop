// Copyright (C) 2026 JobFit contributors. GPL-3.0-only.
export const platforms=[
  {id:'boss',name:'BOSS 直聘',home:'https://www.zhipin.com/web/geek/job',note:'支持已导入会话的招呼及平台在线简历发送。新岗位可打开详情进行首次沟通。'},
  {id:'nowcoder',name:'牛客网',home:'https://www.nowcoder.com/jobs/intern/center',note:'支持实习 / 校招岗位采集，以及牛客站内的简历申请。企业官网网申需在官网处理。'}
];
export function platformOfJob(job){
  try{if(new URL(job.url).hostname==='www.nowcoder.com')return 'nowcoder';if(new URL(job.url).hostname==='www.zhipin.com')return 'boss';}catch{}
  return job.source?.startsWith('nowcoder-')?'nowcoder':job.source?.startsWith('boss-')?'boss':'';
}
export function canonicalJobUrl(value){
  try{
    const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return '';
    if(u.hostname==='www.nowcoder.com'&&/^\/jobs\/detail\/\d+\/?$/.test(u.pathname))return u.origin+u.pathname.replace(/\/$/,'');
    if(u.hostname==='www.zhipin.com'&&/^\/job_detail\/[^/]+\.html$/.test(u.pathname))return u.origin+u.pathname;
    if(u.hostname==='www.zhipin.com'&&u.pathname==='/web/geek/chat')return u.origin+u.pathname;
  }catch{}
  return '';
}
