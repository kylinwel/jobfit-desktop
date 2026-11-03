// GPL-3.0-only. Selectors checked against Nowcoder's public pages on 2026-11-03.
(()=>{
  const visible=el=>Boolean(el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
  const text=el=>(el?.textContent||'').trim();
  const read=(root,s)=>text(root.querySelector(s));
  const compact=x=>String(x||'').replace(/\s+/g,'').toLowerCase();
  const buttons=(root,re)=>[...root.querySelectorAll('button')].filter(b=>visible(b)&&!b.disabled&&re.test(text(b)));
  const stateButtons=(root,re)=>[...root.querySelectorAll("button")].filter(b=>visible(b)&&re.test(text(b)));
  function guard(){
    if(location.hostname!=='www.nowcoder.com')throw Error('已离开牛客网，停止执行');
    if([...document.querySelectorAll('.loginRegisterBtn,.nc-login-mask,[class*="captcha"],.geetest_panel')].some(visible))throw Error('请先在牛客窗口完成登录或验证码');
    if(/操作过于频繁|账号异常|请重新登录/.test(document.body?.innerText||''))throw Error('平台需要处理登录或访问验证，队列已停止');
  }
  function detail(){
    const root=document.querySelector('.job-detail-wrap');
    if(!root||!/^\/jobs\/detail\/\d+\/?$/.test(location.pathname))throw Error('请打开牛客岗位详情');
    const title=read(root,'h1.title'),company=read(document,'.company-card .fs-20');
    if(!title||!company)throw Error('无法确定牛客岗位名称和公司');
    return {title,company,city:read(root,'.extra .el-tooltip'),salary:read(root,'.salary'),description:[read(root,'.extra'),read(root,'.job-detail-infos')].join('\n'),url:location.origin+location.pathname.replace(/\/$/,''),source:'nowcoder-detail'};
  }
  function collect(){
    if(/^\/jobs\/detail\//.test(location.pathname))return [detail()];
    const cards=[...document.querySelectorAll('.job-card-item')];
    const jobs=cards.slice(0,100).map(c=>({title:read(c,'.job-name'),company:read(c,'.company-name'),city:[...c.querySelectorAll('.job-info-item')].map(text).find(t=>/^(北京|上海|深圳|广州|重庆|成都|杭州|南京|武汉|西安|苏州|天津|长沙|合肥|郑州|济南|青岛|厦门|福州|珠海|东莞|佛山|宁波|无锡|大连|沈阳|全国)/.test(t))||'',salary:read(c,'.job-salary'),description:text(c),url:c.querySelector('a[href*="/jobs/detail/"]')?.href||'',source:'nowcoder-list'})).filter(j=>j.title&&j.company);
    if(!jobs.length)throw Error('此页尚未找到岗位，请打开实习 / 校招列表或岗位详情');return jobs;
  }
  function identity(job){guard();const current=detail();if(current.url!==job.url||compact(current.company)!==compact(job.company)||compact(current.title)!==compact(job.title))throw Error('当前牛客公司或岗位与审核记录不一致，已停止');}
  function dialog(job){
    const panels=[...document.querySelectorAll('.el-dialog')].filter(el=>visible(el)&&el.querySelector('.delivery-resume-popup'));
    if(panels.length!==1||!text(panels[0]).includes('申请职位：'+job.title))throw Error('无法唯一确认牛客岗位申请弹窗，请手动处理');
    return panels[0];
  }
  function preflight(job){
    identity(job);
    const root=document.querySelector('.job-detail-wrap');
    if(/官网闪投|简历直投官网|绑定官网账号/.test(text(root))||buttons(root,/绑定官网账号|前往官网|官网投递/).length)throw Error('此岗位需要企业官网网申，请手动绑定并填写');
    if(stateButtons(root,/^(已投递|继续沟通|和TA聊聊)$/).length)throw Error('平台已有申请记录，未重复投递');
    const apply=buttons(root,/^立即申请$/);if(apply.length!==1)throw Error('没有找到唯一的站内申请按钮');
    return true;
  }
  function prepare(job){preflight(job);buttons(document.querySelector('.job-detail-wrap'),/^立即申请$/)[0].click();return {opened:true};
  }
  function selectResume(job,name){
    identity(job);if(!name?.trim())throw Error('请在平台账号中填写牛客简历的准确名称');
    const panel=dialog(job),selected=panel.querySelector('.resume-wrap .resume-item-info');
    if(read(selected||panel,'.resume-name')===name)return {selected:true};
    if(!selected)throw Error('尚未找到平台已有简历，请在牛客先完善简历');
    selected.click();return {selected:false};
  }
  function chooseResume(job,name){
    identity(job);
    const candidates=[...document.querySelectorAll('.el-dropdown-menu .resume-item-info')].filter(el=>visible(el)&&read(el,'.resume-name')===name);
    if(candidates.length!==1)throw Error('牛客简历名称不唯一或尚未上传，请手动选择');candidates[0].click();return true;
  }
  function submit(job,name){
    identity(job);const panel=dialog(job);
    if(read(panel,'.resume-wrap .resume-item-info .resume-name')!==name)throw Error('所选简历与审核名称不一致，未提交');
    if([...panel.querySelectorAll('.el-form-item.is-required,input[required],textarea[required]')].some(visible))throw Error('申请需要补填信息，请在平台手动填写');
    const submit=buttons(panel.querySelector('.deliver-btn-box')||panel,/^投递简历$/);
    if(submit.length!==1)throw Error('无法确认唯一的简历提交按钮');submit[0].click();return {clicked:true};
  }
  function verify(job){
    identity(job);const root=document.querySelector('.job-detail-wrap');
    // A generic toast or another job's recommendation is not proof of submission.
    return stateButtons(root,/^(已投递|继续沟通|和TA聊聊)$/).length===1;
  }
  function status(){
    if([...document.querySelectorAll('.loginRegisterBtn')].some(visible))return {state:'login_required',note:'请在牛客窗口登录'};
    return {state:'unknown',note:'窗口已打开；执行前会重新核对岗位、登录与简历'};
  }
  globalThis.JobFitNowcoder={collect,status,preflight,prepare,selectResume,chooseResume,submit,verify};
})();
