// GPL-3.0-only. Uses the attributed upstream selector adapter in vendor/boss-dom.js.
(() => {
  const dom = globalThis.JobFitBossDOM;
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  const visible = el => Boolean(el && el.getClientRects().length);
  const txt = (root,selectors) => selectors.map(s=>root.querySelector(s)?.textContent?.trim()).find(Boolean)||"";
  const compact = x => String(x||"").replace(/\s+/g,"").toLowerCase();
  const activeChat = () => dom.extractChatList().filter(c=>
    c.el.matches(".selected,.active,.cur,.chosen,[aria-selected=true]") ||
    c.el.querySelector(".friend-content.selected,.friend-content.active,[aria-selected=true]"));
  function currentChatJob() {
    const [c] = activeChat();
    if(!c || activeChat().length!==1) throw Error("无法唯一识别当前会话，请改用岗位详情页导入");
    return {title:dom.extractJobTitle()||c.position,company:c.company,city:dom.extractCity(),
      salary:dom.extractSalary(),chatId:c.chatId,url:location.href,source:"boss-chat",
      description:txt(document,[".job-sec-text",".chat-position-content"])+"\n"+dom.extractMessages().filter(m=>!m.isSelf).map(m=>m.text).join("\n")};
  }
  function collect() {
    const anomaly=dom.detectPageAnomaly();if(anomaly)throw Error(anomaly.msg);
    if(location.pathname.includes("/web/geek/chat"))return [currentChatJob()];
    const detail=document.querySelector(".job-detail-box,.job-detail");
    if(location.pathname.includes("/job_detail/")) {
      return [{title:txt(document,[".info-primary .name h1",".job-banner .name h1",".job-name"]),company:txt(document,[".sider-company .company-info a",".company-info a",".company-name"]),
        city:txt(document,[".text-city",".job-banner .job-address",".job-area"]),salary:txt(document,[".info-primary .salary",".salary"]),
        description:txt(detail||document,[".job-sec-text",".job-detail-section"]),url:location.href,source:"boss-detail"}];
    }
    const cards=[...document.querySelectorAll(".job-card-wrapper,.job-card-box")].filter(c=>!c.parentElement?.closest(".job-card-wrapper,.job-card-box"));
    if(!cards.length)throw Error("未找到可识别岗位。请打开 BOSS 岗位列表、详情或会话页后重试");
    return cards.slice(0,100).map(c=>({
      title:txt(c,[".job-name",".job-title"]),company:txt(c,[".company-name"]),city:txt(c,[".job-area",".job-location"]),
      salary:txt(c,[".salary"]),description:c.textContent.trim(),url:c.querySelector('a[href*="/job_detail/"]')?.href||"",source:"boss-list"
    })).filter(j=>j.title&&j.company);
  }
  function assertIdentity(job) {
    if(globalThis.JobFitAbort)throw Error("执行已暂停，请核对平台发送结果");
    const active=activeChat();
    if(active.length!==1)throw Error("当前会话无法唯一识别，已停止");
    const c=active[0];
    if(c.chatId!==job.chatId||compact(c.company)!==compact(job.company)||compact(dom.extractJobTitle()||c.position)!==compact(job.title))
      throw Error("当前公司、岗位或会话 ID 不一致，已停止");
    const anomaly=dom.detectPageAnomaly();if(anomaly)throw Error(anomaly.msg);
    return c;
  }
  async function sendGreeting(job, greeting) {
    assertIdentity(job);
    const editor=document.querySelector(".chat-editor,.message-controls");
    if(!editor)throw Error("未找到专用聊天编辑区域");
    const inputs=[...editor.querySelectorAll('textarea,[contenteditable="true"],.chat-input')].filter(visible);
    const input=inputs[0];
    if(!input)throw Error("未找到聊天输入框");
    if((input.value||input.textContent||"").trim())throw Error("输入框已有草稿，已停止以免覆盖");
    input.focus();
    if(input.tagName==="TEXTAREA") {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(input,greeting);
      input.dispatchEvent(new Event("input",{bubbles:true}));
    }else{
      input.textContent=greeting;input.dispatchEvent(new InputEvent("input",{bubbles:true,data:greeting}));
    }
    await sleep(400);assertIdentity(job);
    const buttons=[...editor.querySelectorAll("button,.btn-send")].filter(b=>visible(b)&&b.textContent.trim()==="发送"&&!b.disabled);
    if(buttons.length!==1)throw Error("发送按钮不唯一或不可用，请人工处理草稿");
    buttons[0].click();
    for(let i=0;i<10;i++){await sleep(400);assertIdentity(job);if(dom.extractMessages().some(m=>m.isSelf&&m.text===greeting))return;}
    throw Error("招呼已点击发送，但未验证出现在会话中，请人工核对");
  }
  async function sendPlatformResume(job) {
    assertIdentity(job);
    const tools=[...document.querySelectorAll(".toolbar-btn")].filter(b=>visible(b)&&b.innerText.trim()==="发简历");
    if(tools.length!==1)throw Error("未找到唯一的发简历按钮");
    const countBefore=document.querySelectorAll(".message-item [class*='resume']").length;
    tools[0].click();await sleep(650);assertIdentity(job);
    // Upstream sendResume selectors retained; removed its global fallback clicks.
    const panels=[...document.querySelectorAll(".panel-resume,.dialog-resume,.resume-dialog,[class*='resume-panel']")].filter(visible);
    if(panels.length!==1||!panels[0].textContent.includes("在线简历"))throw Error("无法确认正在发送平台在线简历，请人工选择并发送附件");
    const buttons=[...panels[0].querySelectorAll("button,.btn-sure-v2,.btn-sure,.btn-confirm")].filter(b=>visible(b)&&/^(确定|发送|确认|发送简历)$/.test(b.textContent.trim())&&!b.disabled);
    if(buttons.length!==1)throw Error("简历确认按钮不唯一，请人工处理");
    assertIdentity(job);buttons[0].click();
    for(let i=0;i<12;i++){await sleep(400);assertIdentity(job);if(document.querySelectorAll(".message-item [class*='resume']").length>countBefore)return;}
    throw Error("简历已点击发送，但未验证新增简历卡片，请人工核对");
  }
  async function send(job,greeting) {
    if(!job.chatId)throw Error("当前版本只对已导入的 BOSS 会话执行发送；岗位列表、详情请先手动沟通");
    const candidates=dom.extractChatList().filter(c=>c.chatId===job.chatId&&compact(c.company)===compact(job.company)&&compact(c.position)===compact(job.title));
    if(candidates.length!==1)throw Error("找不到唯一匹配会话，请打开对应 BOSS 会话并重新导入");
    (candidates[0].el.querySelector(".friend-content")||candidates[0].el).click();
    await sleep(1000);assertIdentity(job);
    if(dom.hasResumeInChat())throw Error("会话已有简历记录，请人工核对，避免重复发送");
    if(dom.extractMessages().some(m=>m.isSelf&&m.text===greeting))throw Error("会话已存在相同招呼，请人工核对");
    await sendGreeting(job,greeting);await sendPlatformResume(job);
    return {verified:true,note:"已验证招呼及平台在线简历卡片；未发送本工具生成的专属附件"};
  }
  globalThis.JobFitBoss={collect,send,preflight:(job)=>{const anomaly=dom.detectPageAnomaly();if(anomaly)throw Error(anomaly.msg);const candidates=dom.extractChatList().filter(c=>c.chatId===job.chatId&&compact(c.company)===compact(job.company)&&compact(c.position)===compact(job.title));if(candidates.length!==1)throw Error("请先登录并打开匹配的 BOSS 会话");return true;},status:()=>({state:dom.detectPageAnomaly()?'attention':activeChat().length?'ready':'unknown',note:dom.detectPageAnomaly()?.msg||'登录和账号验证请在此平台页面完成'})};
})();
