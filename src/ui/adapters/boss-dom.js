// Derived from aliu-ronin/boss-jobseeker @ fd9081a26f84d35c2a6ec3a54f31d569db91c4ed
// Copyright (C) 2026 刘戈 <aliu.ronin@gmail.com>
// Modifications Copyright (C) 2026 JobFit contributors; GPL-3.0-only
// Read-only selectors reused; sending is implemented separately with identity checks.
(()=>{
function detectPageAnomaly() {
  const url = location.href;
  const body = document.body?.innerText || "";
  const title = document.title || "";

  // 1. 登录页跳转
  if (url.includes("/web/user/login") || url.includes("/web/user/safe") || url.includes("login.zhipin.com")) {
    return { type: "login_expired", msg: "页面跳转到登录页，登录状态已失效" };
  }

  // 2. 验证码/安全验证弹窗
  const captchaSelectors = [
    ".boss-verify", ".verify-wrap", ".captcha-wrap", ".slide-verify",
    "[class*='captcha']", "[class*='verify-modal']", "[class*='risk-verify']",
    ".geetest_panel", ".nc-container", "#nc_1_wrapper",
  ];
  for (const sel of captchaSelectors) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null) {
      return { type: "captcha", msg: `检测到验证码弹窗: ${sel}` };
    }
  }

  // 3. 页面文案异常
  if (body.includes("操作过于频繁") || body.includes("请求频率过高")) {
    return { type: "rate_limit", msg: "页面提示操作过于频繁（频率限制）" };
  }
  if (body.includes("账号存在风险") || body.includes("安全验证") || body.includes("账号异常")) {
    return { type: "risk_control", msg: "页面提示账号存在风险/安全验证" };
  }
  if (body.includes("登录已过期") || body.includes("请重新登录") || body.includes("身份验证已失效")) {
    return { type: "login_expired", msg: "页面提示登录已过期" };
  }

  // 4. 会话列表完全消失（可能页面被重置）
  if (url.includes("/web/geek/chat")) {
    const chatEls = document.querySelectorAll('li[role="listitem"]');
    const chatContainer = document.querySelector(".chat-list, .message-list, [class*='chat-record']");
    if (!chatContainer && chatEls.length === 0) {
      // 页面可能还在加载，用 title 辅助判断
      if (title.includes("登录") || title.includes("安全")) {
        return { type: "login_expired", msg: "聊天页面内容为空且标题异常" };
      }
    }
  }

  return null; // 正常
}

function extractChatList() {
  const items = [];
  const chatEls = document.querySelectorAll('li[role="listitem"]');

  chatEls.forEach((el, index) => {
    const nameBox = el.querySelector(".name-box");
    const spans = nameBox ? nameBox.querySelectorAll("span") : [];
    const name = el.querySelector(".name-text")?.textContent?.trim() || "";
    const company = spans.length >= 2 ? spans[1].textContent.trim() : "";
    const position = spans.length >= 3 ? spans[2].textContent.trim() : "";
    const lastMsg = el.querySelector(".last-msg-text")?.textContent?.trim() || "";
    const timeText = el.querySelector(".time-text, .msg-time, .time")?.textContent?.trim() || "";
    const hasUnread = !!el.querySelector(".notice-badge");
    // 优先使用 DOM 属性作为稳定 ID，fallback 用 name+company 生成确定性 ID
    const friendEl = el.querySelector(".friend-content");
    const domId = friendEl?.getAttribute("d-c") || friendEl?.getAttribute("data-c")
      || friendEl?.getAttribute("data-id") || friendEl?.getAttribute("data-uid") || "";
    const chatId = domId || (name && company ? `u_${name}_${company}_${position}` : `chat_${index}`);
    items.push({ index, chatId, name, company, position, salary: "", lastMsg, timeText, hasUnread, el });
  });
  return items;
}

// ── 提取当前打开的会话消息 ──
function extractMessages() {
  const msgs = [];
  document.querySelectorAll(".message-item").forEach((el) => {
    const isSelf = el.classList.contains("item-myself");
    const isFriend = el.classList.contains("item-friend");
    if (!isSelf && !isFriend) return;
    const textEl = el.querySelector("div.text");
    if (!textEl) return;
    const text = textEl.innerText.trim();
    if (text.length < 2) return;
    msgs.push({ text, isSelf });
  });
  return msgs.slice(-15);
}

function extractSalary() {
  const el = document.querySelector(".chat-position-content .salary");
  return el ? el.textContent.trim() : "";
}
function extractCity() {
  const el = document.querySelector(".chat-position-content .city");
  return el ? el.textContent.trim() : "";
}
function extractJobTitle() {
  const el = document.querySelector(".chat-position-content .position-name");
  return el ? el.textContent.trim() : "";
}

function hasResumeInChat() {
  const resumeEls = document.querySelectorAll('.message-item [class*="resume"], .message-item .msg-resume, .message-item .resume-card');
  if (resumeEls.length > 0) return true;
  const msgItems = document.querySelectorAll(".message-item");
  for (const item of msgItems) {
    const text = item.textContent || "";
    if (text.includes("在线简历") || text.includes("已发送简历") || text.includes("附件简历")) return true;
  }
  return false;
}


globalThis.JobFitBossDOM={detectPageAnomaly,extractChatList,extractMessages,extractSalary,extractCity,extractJobTitle,hasResumeInChat};
})();
