const Game = {
  state: {
    phase: "intro",
    introIndex: 0,
    password: "",
    currentScreen: "intro-screen",
    currentContact: null,
    flags: {
      chatLoggedIn: false,
      metXiaoyu: false,
      xiaoyuChoice1Made: false,
      xiaoyuAlertDismissed: false,
      sawMonitorChat: false,
      sawGrandpaChat: false,
      sawClassGroup: false,
      albumLayer1Unlocked: false,
      albumLayer2Unlocked: false,
      shopUnlocked: false,
      browserRecycleBinOpen: false,
      sawClearedHistory: false,
      sawComplaintLetter: false,
      sawSchoolReport: false,
      weiboUnlocked: false,
      postedExposure: false,
      gameComplete: false,
      calendarShown: false,
      xiaoyuHints: {
        fortuneHint: false,
        partyHint: false,
        dateHint: false,
        schoolHint: false,
        finalMessage: false,
      },
      // 迷惑线追踪: 0=未触发, 1=选错→失败, 2=选对, 3=中性
      falseLeadA: 0,
      falseLeadB: 0,
      sawShihanChat: false,
      unblockedContacts: [],
      viewedContacts: [],
    },
    // 证据链追踪
    evidencePieces: {
      A: { monitorChat: false, fortuneViewed: false, album1: false, album2: false, shopHidden: false },
      B: { browserSurface: false, clearedHistory: false, complaintLetter: false, schoolSite: false },
      C: { diaryKeyCount: 0, readDiaryIds: [], xiaoyuFull: false, grandpaChat: false, classGroup: false },
      D: { accounting: false, shopUnlocked: false, grandpaMoney: false, chenJobOffer: false },
    },
    completedChains: [],
    // 诡异事件状态
    photoViewCounts: {},
    supernaturalTriggered: {
      photoDistortion: false,
      autoRedirect: false,
      ghostSearch: false,
      screenFlash: false,
    },
    autoRedirectTimer: null,
    pendingXiaoyuHints: [],
    _unlockedNotes: {}
  },

  xiaoyuConversationLog: [],

  init() {
    this.loadGame();
    this.bindEvents();
    if (this.state.phase === "intro") {
      this.showIntro();
    } else {
      this.showScreen(this.state.currentScreen);
      if (this.state.currentScreen === "home-screen") {
        this.updateWeiboIconState();
      }
    }
  },

  // --- 存档 ---
  saveGame() {
    const saveData = {
      state: this.state,
      xiaoyuConversationLog: this.xiaoyuConversationLog,
    };
    localStorage.setItem("lostgirl_save", JSON.stringify(saveData));
  },

  loadGame() {
    const raw = localStorage.getItem("lostgirl_save");
    if (raw) {
      try {
        const saveData = JSON.parse(raw);
        this.state = saveData.state;
        this.xiaoyuConversationLog = saveData.xiaoyuConversationLog || [];
        this.migrateState();
      } catch (e) {
        // corrupted save, start fresh
      }
    }
  },

  migrateState() {
    const s = this.state;
    if (!s.evidencePieces) {
      s.evidencePieces = {
        A: { monitorChat: false, fortuneViewed: false, album1: false, album2: false, shopHidden: false },
        B: { browserSurface: false, clearedHistory: false, complaintLetter: false, schoolSite: false },
        C: { diaryKeyCount: 0, readDiaryIds: [], xiaoyuFull: false, grandpaChat: false, classGroup: false },
        D: { accounting: false, shopUnlocked: false, grandpaMoney: false, chenJobOffer: false },
      };
    }
    if (!s.completedChains) s.completedChains = [];
    if (!s.photoViewCounts) s.photoViewCounts = {};
    if (!s.supernaturalTriggered) {
      s.supernaturalTriggered = {
        photoDistortion: false,
        autoRedirect: false,
        ghostSearch: false,
        screenFlash: false,
      };
    }
    if (s.falseLeadA === undefined) s.falseLeadA = 0;
    if (s.falseLeadB === undefined) s.falseLeadB = 0;
    if (s.sawShihanChat === undefined) s.sawShihanChat = false;
    if (!s.unblockedContacts) s.unblockedContacts = [];
    if (!s.viewedContacts) s.viewedContacts = [];
    if (!s._unlockedNotes) s._unlockedNotes = {};
    if (!s.pendingXiaoyuHints) s.pendingXiaoyuHints = [];
    if (!s._falseLeadPresented) s._falseLeadPresented = {};
    if (!s._hintPresented) s._hintPresented = {};

    // 根据已有 flags 回溯填充证据
    const flags = s.flags;
    const ep = s.evidencePieces;
    if (flags.sawMonitorChat) { ep.A.monitorChat = true; ep.D.chenJobOffer = true; }
    if (flags.albumLayer1Unlocked) ep.A.album1 = true;
    if (flags.albumLayer2Unlocked) ep.A.album2 = true;
    if (flags.shopUnlocked) { ep.A.shopHidden = true; ep.D.shopUnlocked = true; }
    if (flags.sawClearedHistory) ep.B.clearedHistory = true;
    if (flags.sawComplaintLetter) ep.B.complaintLetter = true;
    if (flags.sawSchoolReport) ep.B.schoolSite = true;
    if (flags.sawGrandpaChat) { ep.C.grandpaChat = true; ep.D.grandpaMoney = true; }
    if (flags.sawClassGroup) ep.C.classGroup = true;
    if (flags.xiaoyuHints && flags.xiaoyuHints.finalMessage) ep.C.xiaoyuFull = true;

    // 重新检查所有证据链
    ["A", "B", "C", "D"].forEach(chain => this.checkChainCompletion(chain));
  },

  bindEvents() {
    document.getElementById("intro-screen").addEventListener("click", () => this.advanceIntro());
    document.querySelectorAll(".num-btn").forEach(btn => {
      btn.addEventListener("click", () => this.handleNumpad(btn.dataset.num));
    });
    document.querySelectorAll(".app-icon").forEach(icon => {
      icon.addEventListener("click", () => this.openApp(icon.dataset.app));
    });
    document.querySelectorAll(".back-btn").forEach(btn => {
      btn.addEventListener("click", () => this.goBack());
    });
    document.getElementById("browser-go").addEventListener("click", () => this.browserNavigate());
    document.getElementById("browser-url").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.browserNavigate();
    });
    document.getElementById("dismiss-calendar").addEventListener("click", () => {
      document.getElementById("calendar-alert").classList.add("hidden");
    });
  },

  // --- 屏幕切换 ---
  showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    this.state.currentScreen = id;

    // 回到主屏或聊天列表时检查待推送
    if (id === "home-screen" || id === "app-chat") {
      this.showNextXiaoyuNotification();
    }

    // 自动跳转：回到主屏幕后触发
    if (id === "home-screen") {
      this.updateWeiboIconState();
      if (this.state.supernaturalTriggered.autoRedirect &&
        this.state.flags.albumLayer2Unlocked && this.state.flags.sawClearedHistory &&
        !this.state.supernaturalTriggered._redirectFired) {
        this.state.supernaturalTriggered._redirectFired = true;
        this.state.autoRedirectTimer = setTimeout(() => {
          this.triggerAutoRedirect();
        }, STORY.supernatural.autoRedirect.delayMs);
      }
    }

    this.saveGame();
  },

  goBack() {
    const current = this.state.currentScreen;
    if (current === "chat-conversation") {
      if (this.state.currentContact === "xiaoyu" && !this.state.flags.metXiaoyu) {
        this.state.flags.metXiaoyu = true;
        this.showScreen("app-chat");
        setTimeout(() => this.triggerXiaoyuAlert(), 800);
        return;
      }
      this.showScreen("app-chat");
      this.updateChatListState();
    } else if (current === "note-detail") {
      if (this._returnToScreen) {
        const returnTo = this._returnToScreen;
        const returnContact = this._returnToContact;
        this._returnToScreen = null;
        this._returnToContact = null;
        if (returnTo === "chat-conversation" && returnContact) {
          this.openConversation(returnContact);
        } else {
          this.showScreen(returnTo);
        }
      } else {
        this.showScreen("app-notes");
      }
    } else if (current.startsWith("app-")) {
      this.showScreen("home-screen");
    }
  },

  updateChatListState() {
    // 第一次回复后消除红点和预览
    if (this.state.flags.xiaoyuChoice1Made) {
      const xiaoyuDot = document.querySelector('[data-contact="xiaoyu"] .unread-dot');
      if (xiaoyuDot) xiaoyuDot.style.display = "none";
      const xiaoyuPreview = document.querySelector('[data-contact="xiaoyu"] .chat-preview');
      if (xiaoyuPreview && this.xiaoyuConversationLog.length > 0) {
        const lastMsg = this.xiaoyuConversationLog[this.xiaoyuConversationLog.length - 1];
        if (lastMsg) xiaoyuPreview.textContent = lastMsg.text;
      }
    }
  },

  updateWeiboIconState() {
    const weiboIcon = document.getElementById("weibo-icon");
    if (this.state.flags.weiboUnlocked) {
      weiboIcon.classList.remove("locked-app");
      weiboIcon.querySelector("span").textContent = "围脖";
    } else {
      weiboIcon.classList.add("locked-app");
      weiboIcon.querySelector("span").textContent = "围脖 🔒";
    }
  },

  showToast(text) {
    const frame = document.getElementById("phone-frame");
    const existing = frame.querySelector(".toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = text;
    frame.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  },

  triggerXiaoyuAlert() {
    const frame = document.getElementById("phone-frame");
    frame.classList.add("shake");
    setTimeout(() => frame.classList.remove("shake"), 500);

    const notification = document.createElement("div");
    notification.id = "xiaoyu-notification";
    notification.className = "notification-popup";
    notification.innerHTML = `
      <div class="notif-icon">🐟</div>
      <div class="notif-body">
        <div class="notif-title">小鱼</div>
        <div class="notif-text">桐桐？？？这个号怎么上线了？？？</div>
      </div>
    `;
    notification.addEventListener("click", () => {
      notification.remove();
      this.openXiaoyuLive();
    });
    frame.appendChild(notification);

    const xiaoyuPreview = document.querySelector('[data-contact="xiaoyu"] .chat-preview');
    if (xiaoyuPreview) xiaoyuPreview.textContent = "桐桐？？？这个号怎么上线了？？？";
    const xiaoyuTime = document.querySelector('[data-contact="xiaoyu"] .chat-time');
    if (xiaoyuTime) xiaoyuTime.textContent = "刚刚";
    const xiaoyuDot = document.querySelector('[data-contact="xiaoyu"] .unread-dot');
    if (xiaoyuDot) xiaoyuDot.style.display = "block";
  },

  // 看完陈昊聊天后，小鱼再次发消息提示
  triggerXiaoyuHintAlert() {
    const frame = document.getElementById("phone-frame");
    frame.classList.add("shake");
    setTimeout(() => frame.classList.remove("shake"), 500);

    const notification = document.createElement("div");
    notification.className = "notification-popup";
    notification.innerHTML = `
      <div class="notif-icon">🐟</div>
      <div class="notif-body">
        <div class="notif-title">小鱼</div>
        <div class="notif-text">对了 她以前特别迷一个占卜app</div>
      </div>
    `;
    notification.addEventListener("click", () => {
      notification.remove();
      this.openConversation("xiaoyu");
    });
    frame.appendChild(notification);

    setTimeout(() => {
      const n = frame.querySelector(".notification-popup");
      if (n) n.remove();
    }, 5000);
  },

  openXiaoyuLive() {
    this.state.currentContact = "xiaoyu";
    const data = STORY.contacts.xiaoyu;
    document.getElementById("conv-title").textContent = data.name;

    const body = document.getElementById("conv-body");
    body.innerHTML = "";
    document.getElementById("chat-input-area").classList.add("hidden");

    this.renderMessages(body, data.messages);
    data.onlineResponse.forEach(msg => this.xiaoyuConversationLog.push(msg));

    this.streamMessages(body, data.onlineResponse, () => {
      this.showXiaoyuChoices();
    });

    this.showScreen("chat-conversation");
  },

  streamMessages(container, messages, callback) {
    let delay = 0;
    messages.forEach((msg, i) => {
      delay += msg.type === "left" ? 1200 : 300;
      setTimeout(() => {
        const el = document.createElement("div");
        if (msg.type === "time") {
          el.className = "msg-time";
          el.textContent = msg.text;
        } else if (msg.type === "system") {
          el.className = "msg-system";
          el.textContent = msg.text;
        } else {
          el.className = `msg msg-${msg.type}`;
          el.textContent = msg.text;
        }
        container.appendChild(el);
        // 不强制滚底——让玩家自由浏览
        if (i === messages.length - 1 && callback) {
          setTimeout(callback, 600);
        }
      }, delay);
    });
  },

  // --- 引入序列 ---
  showIntro() {
    this.showScreen("intro-screen");
    this.state.introIndex = 0;
    this.renderIntroText();
  },

  renderIntroText() {
    const el = document.getElementById("intro-text");
    const hint = document.getElementById("intro-tap-hint");
    const text = STORY.intro[this.state.introIndex];

    el.classList.remove("visible");
    setTimeout(() => {
      el.textContent = text;
      el.classList.add("visible");
      hint.classList.remove("hidden");
    }, 300);
  },

  advanceIntro() {
    this.state.introIndex++;
    if (this.state.introIndex >= STORY.intro.length) {
      this.showScreen("lock-screen");
    } else {
      this.renderIntroText();
    }
  },

  // --- 锁屏 ---
  handleNumpad(num) {
    if (num === "del") {
      this.state.password = this.state.password.slice(0, -1);
    } else if (this.state.password.length < 6) {
      this.state.password += num;
    }
    this.updateDots();
    if (this.state.password.length === 6) {
      setTimeout(() => this.checkPassword(), 200);
    }
  },

  updateDots() {
    const dots = document.querySelectorAll(".lock-dots .dot");
    dots.forEach((dot, i) => {
      dot.classList.toggle("filled", i < this.state.password.length);
      dot.classList.remove("error");
    });
  },

  checkPassword() {
    if (this.state.password === STORY.password) {
      this.state.phase = "explore";
      this.showScreen("home-screen");
    } else {
      const dots = document.querySelectorAll(".lock-dots .dot");
      dots.forEach(d => { d.classList.add("error"); d.classList.remove("filled"); });
      this.state.password = "";
      setTimeout(() => dots.forEach(d => d.classList.remove("error")), 600);
    }
  },

  // --- 打开APP ---
  openApp(app) {
    switch (app) {
      case "chat":
        if (!this.state.flags.chatLoggedIn) {
          this.showChatLogin();
        } else {
          this.showScreen("app-chat");
          this.renderChatList();
        }
        break;
      case "photos":
        this.showScreen("app-photos");
        this.renderPhotos();
        break;
      case "notes":
        this.showScreen("app-notes");
        this.renderNotes();
        break;
      case "browser":
        this.showScreen("app-browser");
        this.renderBrowser();
        break;
      case "shop":
        this.showScreen("app-shop");
        this.renderShop();
        break;
      case "fortune":
        this.showScreen("app-fortune");
        this.renderFortune();
        break;
      case "weibo":
        if (this.state.flags.weiboUnlocked) {
          this.showScreen("app-weibo");
          this.renderWeibo();
        } else {
          this.showToast("需要收集足够证据才能曝光");
        }
        break;
    }
  },

  // --- 绿泡泡登录 ---
  showChatLogin() {
    this.showScreen("app-chat");
    const chatList = document.querySelector(".chat-list");
    chatList.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:400px;padding:30px;">
        <div style="font-size:48px;margin-bottom:12px;">💬</div>
        <p style="font-size:16px;font-weight:500;color:#333;margin-bottom:4px;">绿泡泡</p>
        <p style="font-size:12px;color:#999;margin-bottom:24px;">请登录以查看消息</p>
        <input type="text" id="chat-login-account" placeholder="账号"
          style="width:200px;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;margin-bottom:10px;">
        <input type="password" id="chat-login-password" placeholder="密码"
          style="width:200px;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;margin-bottom:14px;">
        <button id="chat-login-btn" style="background:#4caf50;color:#fff;border:none;padding:10px 40px;border-radius:6px;font-size:14px;cursor:pointer;">登录</button>
        <p id="chat-login-error" class="hidden" style="color:#e74c3c;font-size:12px;margin-top:8px;">账号或密码错误</p>
      </div>
    `;
    document.getElementById("chat-login-btn").addEventListener("click", () => this.tryChatLogin());
    document.getElementById("chat-login-password").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.tryChatLogin();
    });
  },

  tryChatLogin() {
    const account = document.getElementById("chat-login-account").value.trim();
    const password = document.getElementById("chat-login-password").value.trim();
    if (account === STORY.chatLogin.account && password === STORY.chatLogin.password) {
      this.state.flags.chatLoggedIn = true;
      this.renderChatList();
      this.saveGame();
    } else {
      document.getElementById("chat-login-error").classList.remove("hidden");
      setTimeout(() => document.getElementById("chat-login-error").classList.add("hidden"), 2000);
    }
  },

  renderChatList() {
    const chatList = document.querySelector(".chat-list");
    const flags = this.state.flags;

    // 黑名单按钮
    const showShihanBlocked2 = !flags.unblockedContacts || !flags.unblockedContacts.includes("shihan");
    const hasBlocked = showShihanBlocked2 || (!flags.unblockedContacts || !flags.unblockedContacts.includes("zhangwei"));
    const blockBtn = hasBlocked ? '<span id="blocklist-btn" style="font-size:18px;cursor:pointer;opacity:0.5;line-height:1;" title="黑名单">🚫</span>' : '';

    // 根据状态决定小鱼的预览和红点
    let xiaoyuPreview = "晚安 明天记得吃早饭";
    let xiaoyuTime = "5月14日";
    let xiaoyuDot = "none";

    if (flags.metXiaoyu && !flags.xiaoyuChoice1Made) {
      xiaoyuPreview = "桐桐？？？这个号怎么上线了？？？";
      xiaoyuTime = "刚刚";
      xiaoyuDot = "block";
    } else if (flags.xiaoyuChoice1Made && this.xiaoyuConversationLog.length > 0) {
      const lastMsg = this.xiaoyuConversationLog[this.xiaoyuConversationLog.length - 1];
      xiaoyuPreview = lastMsg.text;
      xiaoyuTime = "刚刚";
      xiaoyuDot = "none";
    }

    chatList.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px 4px;">
        <span style="font-size:12px;color:#999;">消息</span>
        ${blockBtn}
      </div>
      <div class="chat-item" data-contact="xiaoyu">
        <div class="chat-avatar">🐟</div>
        <div class="chat-info">
          <div class="chat-name">小鱼</div>
          <div class="chat-preview">${xiaoyuPreview}</div>
        </div>
        <div class="chat-meta"><span class="chat-time">${xiaoyuTime}</span><div class="unread-dot" style="display:${xiaoyuDot};"></div></div>
      </div>
      <div class="chat-item" data-contact="monitor">
        <div class="chat-avatar">👤</div>
        <div class="chat-info">
          <div class="chat-name">陈昊</div>
          <div class="chat-preview">说出去对你也没好处</div>
        </div>
        <div class="chat-meta"><span class="chat-time">5月15日</span></div>
      </div>
      <div class="chat-item" data-contact="mengqi">
        <div class="chat-avatar">💅</div>
        <div class="chat-info">
          <div class="chat-name">李梦琪</div>
          <div class="chat-preview">开玩笑的啦 别当真</div>
        </div>
        <div class="chat-meta"><span class="chat-time">5月13日</span></div>
      </div>
      ${flags.unblockedContacts && flags.unblockedContacts.includes("shihan") ? `
      <div class="chat-item unblocked-item" data-contact="shihan">
        <div class="chat-avatar">👧</div>
        <div class="chat-info">
          <div class="chat-name">王诗涵（同桌）</div>
          <div class="chat-preview">对方已将你拉黑，消息无法送达</div>
        </div>
        <div class="chat-meta"><span class="chat-time">5月15日</span></div>
      </div>
      ` : ""}
      ${flags.unblockedContacts && flags.unblockedContacts.includes("zhangwei") ? `
      <div class="chat-item unblocked-item" data-contact="zhangwei">
        <div class="chat-avatar">😤</div>
        <div class="chat-info">
          <div class="chat-name">张伟（已从黑名单移出）</div>
          <div class="chat-preview">到时候别来求我</div>
        </div>
        <div class="chat-meta"><span class="chat-time">3月20日</span></div>
      </div>
      ` : ""}
      <div class="chat-item" data-contact="classgroup">
        <div class="chat-avatar">👥</div>
        <div class="chat-info">
          <div class="chat-name">高三(2)班</div>
          <div class="chat-preview">[张伟] 哈哈哈</div>
        </div>
        <div class="chat-meta"><span class="chat-time">5月16日</span></div>
      </div>
      <div class="chat-item" data-contact="grandpa">
        <div class="chat-avatar">👴</div>
        <div class="chat-info">
          <div class="chat-name">爷爷</div>
          <div class="chat-preview">桐桐？</div>
        </div>
        <div class="chat-meta"><span class="chat-time">5月16日</span></div>
      </div>
    `;

    // 黑名单入口（由按钮触发）
    if (hasBlocked) {
      const blockSection = document.createElement("div");
      blockSection.id = "blocklist-section";
      blockSection.className = "hidden";
      blockSection.style.cssText = "padding:8px 16px 12px;border-top:1px solid #eee;margin-top:4px;";
      let blockHTML = '<div style="font-size:11px;color:#bbb;margin-bottom:6px;">黑名单</div>';
      if (showShihanBlocked2) {
        blockHTML += `
        <div class="blocked-contact" id="blocked-shihan" style="display:flex;align-items:center;padding:10px 12px;background:#f9f9f9;border-radius:8px;cursor:pointer;margin-bottom:8px;">
          <div style="width:36px;height:36px;border-radius:4px;background:#ddd;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">👧</div>
          <div style="margin-left:10px;flex:1;">
            <div style="font-size:13px;color:#888;">王诗涵（同桌）</div>
            <div style="font-size:11px;color:#bbb;">已拉黑 · 点击移出黑名单</div>
          </div>
        </div>`;
      }
      if (!flags.unblockedContacts || !flags.unblockedContacts.includes("zhangwei")) {
        blockHTML += `
        <div class="blocked-contact" id="blocked-zhangwei" style="display:flex;align-items:center;padding:10px 12px;background:#f9f9f9;border-radius:8px;cursor:pointer;">
          <div style="width:36px;height:36px;border-radius:4px;background:#ddd;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">😤</div>
          <div style="margin-left:10px;flex:1;">
            <div style="font-size:13px;color:#888;">张伟</div>
            <div style="font-size:11px;color:#bbb;">已拉黑 · 点击移出黑名单</div>
          </div>
        </div>`;
      }
      blockSection.innerHTML = blockHTML;
      chatList.appendChild(blockSection);
    }

    chatList.querySelectorAll(".chat-item").forEach(item => {
      item.addEventListener("click", () => this.openConversation(item.dataset.contact));
    });

    // 黑名单按钮事件
    setTimeout(() => {
      const btn = document.getElementById("blocklist-btn");
      const section = document.getElementById("blocklist-section");
      if (btn && section) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          section.classList.toggle("hidden");
        });
      }
      const blockedZhangwei = document.getElementById("blocked-zhangwei");
      if (blockedZhangwei) {
        blockedZhangwei.addEventListener("click", () => this.unblockContact("zhangwei"));
      }
      const blockedShihan = document.getElementById("blocked-shihan");
      if (blockedShihan) {
        blockedShihan.addEventListener("click", () => this.unblockContact("shihan"));
      }
    }, 0);
  },

  unblockContact(contactId) {
    if (!this.state.flags.unblockedContacts) this.state.flags.unblockedContacts = [];
    this.state.flags.unblockedContacts.push(contactId);
    this.saveGame();
    const nameMap = { shihan: "王诗涵", zhangwei: "张伟" };
    this.showToast(`已将${nameMap[contactId]}移出黑名单`);
    // 移除黑名单区块
    const section = document.getElementById("blocklist-section");
    if (section) section.remove();
    const btn = document.getElementById("blocklist-btn");
    if (btn) btn.remove();
    // 刷新列表以显示张伟
    this.renderChatList();
  },

  // --- 聊天系统 ---
  openConversation(contact) {
    this.state.currentContact = contact;
    const data = STORY.contacts[contact];
    document.getElementById("conv-title").textContent = data.name;

    const body = document.getElementById("conv-body");
    body.innerHTML = "";
    document.getElementById("chat-input-area").classList.add("hidden");

    // 滚动监听：滑到底部弹出备忘录解锁提示
    body.onscroll = () => this.tryShowNoteUnlockAlerts();

    if (contact === "xiaoyu" && this.state.flags.metXiaoyu) {
      this.renderMessages(body, data.messages);
      if (this.xiaoyuConversationLog.length === 0) {
        data.onlineResponse.forEach(msg => this.xiaoyuConversationLog.push(msg));
        this.saveGame();
      }
      this.renderMessages(body, this.xiaoyuConversationLog);
      if (this.state.flags.xiaoyuChoice1Made) {
        this.checkXiaoyuHints();
      } else {
        this.showXiaoyuChoices();
      }
    } else if (contact === "xiaoyu" && !this.state.flags.metXiaoyu) {
      this.renderMessages(body, data.messages);
    } else {
      this.renderMessages(body, data.messages);
    }

    if (contact === "monitor") {
      if (!this.state.flags.sawMonitorChat) {
        this.state.flags.sawMonitorChat = true;
        this.collectEvidence("A", "monitorChat");
        this.collectEvidence("D", "chenJobOffer");
        this.saveGame();
        this.checkNoteUnlocks();
      }
    }
    if (contact === "grandpa") {
      this.state.flags.sawGrandpaChat = true;
      this.collectEvidence("C", "grandpaChat");
      this.collectEvidence("D", "grandpaMoney");
    }
    if (contact === "classgroup") {
      this.state.flags.sawClassGroup = true;
      this.collectEvidence("C", "classGroup");
      this.checkNoteUnlocks();
    }
    if (contact === "shihan") {
      this.state.flags.sawShihanChat = true;
      this.checkNoteUnlocks();
    }

    // 首次打开从顶部开始，再次打开停留底部
    const isFirstVisit = !this.state.flags.viewedContacts.includes(contact);
    if (isFirstVisit) {
      this.state.flags.viewedContacts.push(contact);
      this.saveGame();
    }

    this.showScreen("chat-conversation");

    setTimeout(() => {
      if (isFirstVisit) {
        body.scrollTop = 0;
      } else {
        body.scrollTop = body.scrollHeight;
      }
    }, 50);
  },

  renderMessages(container, messages) {
    messages.forEach(msg => {
      const el = document.createElement("div");
      if (msg.type === "time") {
        el.className = "msg-time";
        el.textContent = msg.text;
      } else if (msg.type === "system") {
        el.className = "msg-system";
        el.textContent = msg.text;
      } else if (msg.type === "retracted") {
        el.className = "msg msg-retracted";
        el.textContent = msg.text;
      } else {
        el.className = `msg msg-${msg.type}`;
        el.textContent = msg.text;
      }
      container.appendChild(el);
    });
  },

  showXiaoyuChoices() {
    const area = document.getElementById("chat-input-area");
    const choices = document.getElementById("chat-choices");
    area.classList.remove("hidden");
    choices.innerHTML = "";

    STORY.contacts.xiaoyu.playerChoices1.forEach((text, i) => {
      const btn = document.createElement("button");
      btn.className = "chat-choice-btn";
      btn.textContent = text;
      btn.addEventListener("click", () => this.selectXiaoyuChoice(i));
      choices.appendChild(btn);
    });
  },

  selectXiaoyuChoice(index) {
    this.state.flags.xiaoyuChoice1Made = true;
    const area = document.getElementById("chat-input-area");
    area.classList.add("hidden");

    const body = document.getElementById("conv-body");
    const choiceText = STORY.contacts.xiaoyu.playerChoices1[index];

    const playerMsg = document.createElement("div");
    playerMsg.className = "msg msg-right";
    playerMsg.textContent = choiceText;
    body.appendChild(playerMsg);
    body.scrollTop = body.scrollHeight;

    this.xiaoyuConversationLog.push({ type: "right", text: choiceText });

    const responses = STORY.contacts.xiaoyu.response1[index];
    responses.forEach(msg => this.xiaoyuConversationLog.push(msg));

    this.streamMessages(body, responses, () => {
      this.saveGame();
    });
  },

  // === 小鱼推送排队系统 ===
  queueXiaoyuHint(hintKey) {
    if (this.state.pendingXiaoyuHints.includes(hintKey)) return;
    if (this.state.flags.xiaoyuHints && this.state.flags.xiaoyuHints[hintKey]) return;
    if (hintKey === "falseLeadA" && this.state.flags.falseLeadA !== 0) return;
    if (hintKey === "falseLeadB" && this.state.flags.falseLeadB !== 0) return;
    const presented = this.state._falseLeadPresented || {};
    if (hintKey.startsWith("falseLead") && presented[hintKey]) return;
    if (this.state._hintPresented && this.state._hintPresented[hintKey]) return;

    this.state.pendingXiaoyuHints.push(hintKey);
    this.saveGame();
    this.updateChatBadge();

    // 如果在小鱼对话中且不处于选择状态，立即触发
    const area = document.getElementById("chat-input-area");
    if (this.state.currentScreen === "chat-conversation" &&
        this.state.currentContact === "xiaoyu" &&
        area.classList.contains("hidden")) {
      this.checkXiaoyuHints();
    } else {
      this.showNextXiaoyuNotification();
    }
  },

  showNextXiaoyuNotification() {
    if (this.state.currentScreen !== "home-screen" && this.state.currentScreen !== "app-chat") return;
    if (this.state.pendingXiaoyuHints.length === 0) return;

    const frame = document.getElementById("phone-frame");
    if (frame.querySelector(".notification-popup")) return;

    const hintKey = this.state.pendingXiaoyuHints[0];

    // 已展示但未选择的hint不再重复弹窗
    const presented = this.state._falseLeadPresented || {};
    if (hintKey.startsWith("falseLead") && presented[hintKey]) return;
    if (this.state._hintPresented && this.state._hintPresented[hintKey]) return;
    const hintTexts = {
      fortuneHint: { icon: "🔮", text: "那个占卜app……你看看她的记录" },
      partyHint: { icon: "🖼", text: "你找到那些照片了？她那天……" },
      dateHint: { icon: "🌐", text: "那些搜索记录……我看得心惊" },
      schoolHint: { icon: "📧", text: "你找到了她的举报信……学校网站上有公告" },
      finalMessage: { icon: "📢", text: "我看到了学校的公告……" },
      falseLeadA: { icon: "💊", text: "那个药……她出事之后买的……" },
      falseLeadB: { icon: "📋", text: "精神病……她一直在说有人跟着她……" },
    };
    const info = hintTexts[hintKey] || { icon: "🐟", text: "有新发现了吗？" };

    frame.classList.add("shake");
    setTimeout(() => frame.classList.remove("shake"), 500);

    const notification = document.createElement("div");
    notification.className = "notification-popup";
    notification.innerHTML = `
      <div class="notif-icon" style="background:#4caf50;">${info.icon}</div>
      <div class="notif-body">
        <div class="notif-title">小鱼</div>
        <div class="notif-text">${info.text}</div>
      </div>
    `;
    notification.addEventListener("click", () => {
      notification.remove();
      this.openConversation("xiaoyu");
    });
    frame.appendChild(notification);

    setTimeout(() => {
      const n = frame.querySelector(".notification-popup");
      if (n) n.remove();
    }, 8000);
  },

  updateChatBadge() {
    const badge = document.getElementById("chat-badge");
    if (!badge) return;
    if (this.state.pendingXiaoyuHints.length > 0) {
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  },

  rebuildHintQueue() {
    const flags = this.state.flags;
    const presented = this.state._falseLeadPresented || {};
    const queue = [];
    if (flags.sawMonitorChat && !flags.xiaoyuHints.fortuneHint && flags.xiaoyuChoice1Made) queue.push("fortuneHint");
    if (flags.albumLayer1Unlocked && !flags.xiaoyuHints.partyHint) queue.push("partyHint");
    if (flags.sawClearedHistory && !flags.xiaoyuHints.dateHint) queue.push("dateHint");
    if (flags.shopUnlocked && flags.falseLeadA === 0 && flags.xiaoyuChoice1Made && !presented.falseLeadA) queue.push("falseLeadA");
    if (flags.albumLayer2Unlocked && flags.falseLeadB === 0 && flags.xiaoyuChoice1Made && !presented.falseLeadB) queue.push("falseLeadB");
    if (flags.sawComplaintLetter && !flags.xiaoyuHints.schoolHint && flags.falseLeadB !== 1) queue.push("schoolHint");
    if (flags.sawSchoolReport && !flags.xiaoyuHints.finalMessage) queue.push("finalMessage");
    this.state.pendingXiaoyuHints = queue;
    this.saveGame();
  },

  advanceHintQueue(body, area) {
    this.state.pendingXiaoyuHints.shift();
    this.saveGame();
    this.rebuildHintQueue();
    this.updateChatBadge();

    if (this.state.pendingXiaoyuHints.length > 0) {
      const nextKey = this.state.pendingXiaoyuHints[0];
      setTimeout(() => {
        if (nextKey.startsWith("falseLead")) {
          if (!this.state._falseLeadPresented) this.state._falseLeadPresented = {};
          this.state._falseLeadPresented[nextKey] = true;
          this.saveGame();
          const leadData = STORY.contacts.xiaoyu[nextKey];
          leadData.messages.forEach(m => this.xiaoyuConversationLog.push(m));
          this.streamMessages(body, leadData.messages, () => {
            this.showFalseLeadChoices(nextKey, leadData, body, area);
          });
        } else {
          this.showQueuedHint(nextKey, body, area);
        }
      }, 2000);
    }
  },

  showQueuedHint(hintKey, body, area) {
    const hintData = STORY.contacts.xiaoyu.hints[hintKey];
    if (!hintData) return;
    hintData.messages.forEach(m => this.xiaoyuConversationLog.push(m));
    this.streamMessages(body, hintData.messages, () => {
      this.showHintChoices(hintKey, hintData, body, area);
    });
  },

  showFalseLeadChoices(leadKey, leadData, body, area) {
    const flags = this.state.flags;
    area.classList.remove("hidden");
    const choicesEl = document.getElementById("chat-choices");
    choicesEl.innerHTML = "";
    leadData.choices.forEach((text, index) => {
      const btn = document.createElement("button");
      btn.className = "chat-choice-btn";
      btn.textContent = text;
      btn.addEventListener("click", () => {
        area.classList.add("hidden");
        const playerMsg = document.createElement("div");
        playerMsg.className = "msg msg-right";
        playerMsg.textContent = text;
        body.appendChild(playerMsg);
        body.scrollTop = body.scrollHeight;
        this.xiaoyuConversationLog.push({ type: "right", text: text });
        flags[leadKey] = (index === 0 ? 1 : (index === 1 ? 2 : 3));
        this.saveGame();
        const responses = leadData.responses[index];
        responses.forEach(m => this.xiaoyuConversationLog.push(m));
        this.streamMessages(body, responses, () => {
          if (index === 0) {
            this.showFalseEnding(leadKey);
          } else {
            this.advanceHintQueue(body, area);
          }
        });
      });
      choicesEl.appendChild(btn);
    });
  },

  checkXiaoyuHints() {
    const area = document.getElementById("chat-input-area");
    const body = document.getElementById("conv-body");
    const flags = this.state.flags;
    const presented = this.state._falseLeadPresented || {};

    // 已展示但未选择的 falseLead：直接恢复选择框，不重新推送
    if (flags.falseLeadA === 0 && presented.falseLeadA) {
      this.state.pendingXiaoyuHints = [];
      this.updateChatBadge();
      const leadData = STORY.contacts.xiaoyu.falseLeadA;
      this.showFalseLeadChoices("falseLeadA", leadData, body, area);
      return;
    }
    if (flags.falseLeadB === 0 && presented.falseLeadB) {
      this.state.pendingXiaoyuHints = [];
      this.updateChatBadge();
      const leadData = STORY.contacts.xiaoyu.falseLeadB;
      this.showFalseLeadChoices("falseLeadB", leadData, body, area);
      return;
    }

    // 已展示但未选择的普通 hint：直接恢复选择框
    if (!this.state._hintPresented) this.state._hintPresented = {};
    const hintKeys = ["fortuneHint", "partyHint", "dateHint", "schoolHint", "finalMessage"];
    for (const key of hintKeys) {
      if (this.state._hintPresented[key] && !flags.xiaoyuHints[key]) {
        const hintData = STORY.contacts.xiaoyu.hints[key];
        if (hintData) {
          this.state.pendingXiaoyuHints = [];
          this.updateChatBadge();
          this.showHintChoices(key, hintData, body, area);
          return;
        }
      }
    }

    // 清除红点
    this.state.pendingXiaoyuHints = [];
    this.updateChatBadge();
    this.rebuildHintQueue();

    if (this.state.pendingXiaoyuHints.length > 0) {
      const hintKey = this.state.pendingXiaoyuHints[0];
      if (hintKey.startsWith("falseLead")) {
        if (!this.state._falseLeadPresented) this.state._falseLeadPresented = {};
        this.state._falseLeadPresented[hintKey] = true;
        this.saveGame();
        const leadData = STORY.contacts.xiaoyu[hintKey];
        leadData.messages.forEach(m => this.xiaoyuConversationLog.push(m));
        this.streamMessages(body, leadData.messages, () => {
          this.showFalseLeadChoices(hintKey, leadData, body, area);
        });
      } else {
        this.state._hintPresented[hintKey] = true;
        this.saveGame();
        this.showQueuedHint(hintKey, body, area);
      }
    }
  },

  showHintChoices(hintToShow, hintData, body, area) {
    const flags = this.state.flags;
    const choices = this.getHintChoices(hintToShow);

    area.classList.remove("hidden");
    const choicesEl = document.getElementById("chat-choices");
    choicesEl.innerHTML = "";

    choices.forEach((text, index) => {
      const btn = document.createElement("button");
      btn.className = "chat-choice-btn";
      btn.textContent = text;
      btn.addEventListener("click", () => {
        area.classList.add("hidden");
        const playerMsg = document.createElement("div");
        playerMsg.className = "msg msg-right";
        playerMsg.textContent = text;
        body.appendChild(playerMsg);
        body.scrollTop = body.scrollHeight;

        this.xiaoyuConversationLog.push({ type: "right", text: text });
        flags.xiaoyuHints[hintToShow] = true;

        // 使用对应选项的回复
        const responses = (hintData.responses && hintData.responses[index])
          ? hintData.responses[index]
          : hintData.messages;

        responses.forEach(msg => this.xiaoyuConversationLog.push(msg));

        this.streamMessages(body, responses, () => {
          if (hintToShow === "finalMessage") {
            this.collectEvidence("C", "xiaoyuFull");
            flags.weiboUnlocked = true;
            const weiboIcon = document.getElementById("weibo-icon");
            weiboIcon.classList.remove("locked-app");
            weiboIcon.querySelector("span").textContent = "围脖";
          }
          this.saveGame();
          this.advanceHintQueue(body, area);
        });
      });
      choicesEl.appendChild(btn);
    });
  },

  // === 迷惑线系统 ===
  showFalseLead(leadKey, body, area) {
    const leadData = STORY.contacts.xiaoyu[leadKey];
    const flags = this.state.flags;

    // 先展示小鱼的消息
    this.streamMessages(body, leadData.messages, () => {
      area.classList.remove("hidden");
      const choicesEl = document.getElementById("chat-choices");
      choicesEl.innerHTML = "";

      leadData.choices.forEach((text, index) => {
        const btn = document.createElement("button");
        btn.className = "chat-choice-btn";
        btn.textContent = text;
        btn.addEventListener("click", () => {
          area.classList.add("hidden");
          const playerMsg = document.createElement("div");
          playerMsg.className = "msg msg-right";
          playerMsg.textContent = text;
          body.appendChild(playerMsg);
          body.scrollTop = body.scrollHeight;

          // index 0 = 错误推导, index 1 = 正确推导, index 2 = 中性
          const resultCode = index === 0 ? 1 : (index === 1 ? 2 : 3);
          flags[leadKey] = resultCode;
          this.saveGame();

          const responses = leadData.responses[index];
          this.streamMessages(body, responses, () => {
            if (index === 0) {
              this.showFalseEnding(leadKey);
            } else {
              // 选对了 → 继续到正常线索
              setTimeout(() => this.checkXiaoyuHints(), 1500);
            }
          });
        });
        choicesEl.appendChild(btn);
      });
    });
  },

  showFalseEnding(leadKey) {
    const leadData = STORY.contacts.xiaoyu[leadKey];
    const ending = leadData.falseEnding;

    // 记录成就
    const achKey = leadKey === "falseLeadA" ? "FA" : "FB";
    this.unlockAchievement(achKey);

    // 清除所有界面
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById("home-screen").classList.add("active");
    this.state.currentScreen = "home-screen";

    const el = document.createElement("div");
    el.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;background:#000;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:40px;z-index:300;opacity:0;transition:opacity 2s;";
    el.innerHTML = `
      <p style="color:#999;font-size:14px;line-height:2.2;text-align:center;">
        ${ending.content.replace(/\n/g, "<br>")}
      </p>
      <p style="color:#e74c3c;font-size:13px;margin-top:24px;">— 失败结局：${ending.title} —</p>
      <div style="margin-top:30px;display:flex;gap:12px;justify-content:center;">
        <button id="false-restart" style="background:#333;color:#ccc;border:1px solid #555;padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer;">重新开始</button>
        <button id="false-gallery" style="background:#333;color:#ccc;border:1px solid #555;padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer;">成就图鉴</button>
      </div>
    `;
    document.getElementById("phone-frame").appendChild(el);
    setTimeout(() => el.style.opacity = "1", 100);

    // 按钮事件
    setTimeout(() => {
      document.getElementById("false-restart")?.addEventListener("click", () => {
        localStorage.removeItem("lostgirl_save");
        location.reload();
      });
      document.getElementById("false-gallery")?.addEventListener("click", () => {
        this.showAchievementGallery();
      });
    }, 500);
  },

  getHintChoices(hint) {
    return STORY.contacts.xiaoyu.hintChoices[hint] || ["我发现了一些事情"];
  },

  // --- 相册 ---
  renderPhotos() {
    const content = document.getElementById("photos-content");

    // 看过陈昊聊天后打开相册，触发小鱼占卜提示
    if (this.state.flags.sawMonitorChat && this.state.flags.xiaoyuChoice1Made && !this.state.flags.xiaoyuHints.fortuneHint) {
      this.queueXiaoyuHint("fortuneHint");
    }

    if (!this.state.flags.albumLayer1Unlocked) {
      content.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;">
          <div style="font-size:48px;margin-bottom:16px;">🔒</div>
          <p style="font-size:14px;color:#666;margin-bottom:20px;">相册已加密，请输入密码</p>
          <input type="text" id="album-pw-input" maxlength="4" placeholder="输入4位密码"
            style="width:140px;padding:10px;border:1px solid #ddd;border-radius:6px;text-align:center;font-size:22px;letter-spacing:8px;margin-bottom:12px;">
          <button id="album-pw-btn" style="background:#4caf50;color:#fff;border:none;padding:10px 30px;border-radius:6px;font-size:14px;cursor:pointer;">解锁</button>
          <p class="hidden" id="album-pw-error" style="color:#e74c3c;font-size:12px;margin-top:8px;">密码错误</p>
        </div>
      `;
      document.getElementById("album-pw-btn").addEventListener("click", () => this.tryUnlockAlbumLayer1());
      document.getElementById("album-pw-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.tryUnlockAlbumLayer1();
      });
      return;
    }

    content.innerHTML = "<h4 style='font-size:13px;color:#888;margin-bottom:12px;padding-top:16px;'>所有照片</h4>";

    const grid = document.createElement("div");
    grid.className = "photo-grid";

    STORY.photos.layer1.forEach(photo => {
      const item = document.createElement("div");
      item.className = "photo-item";
      if (photo.img) {
        item.style.backgroundImage = `url('${encodeURI(photo.img)}')`;
        item.style.backgroundSize = "cover";
        item.style.backgroundPosition = "center";
      }
      item.addEventListener("click", () => this.viewPhoto(photo));
      grid.appendChild(item);
    });

    content.appendChild(grid);

    const recentlyDeleted = document.createElement("div");
    recentlyDeleted.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;margin-top:20px;background:#fff;border-radius:8px;border:1px solid #eee;cursor:pointer;">
        <span style="font-size:20px;">🗑</span>
        <div>
          <div style="font-size:14px;color:#333;">最近删除</div>
          <div style="font-size:11px;color:#999;">3张照片</div>
        </div>
        <span style="margin-left:auto;color:#ccc;">›</span>
      </div>
    `;
    recentlyDeleted.addEventListener("click", () => this.openRecentlyDeleted());
    content.appendChild(recentlyDeleted);
  },

  tryUnlockAlbumLayer1() {
    const input = document.getElementById("album-pw-input");
    const pw = input.value.trim();
    if (pw === STORY.albumPassword) {
      this.state.flags.albumLayer1Unlocked = true;
      this.collectEvidence("A", "album1");
      this.saveGame();
      this.checkNoteUnlocks();
      this.queueXiaoyuHint("partyHint");
      this.renderPhotos();
      setTimeout(() => this.showToast("发现了新线索，去找小鱼聊聊吧"), 800);
    } else {
      const err = document.getElementById("album-pw-error");
      err.classList.remove("hidden");
      setTimeout(() => err.classList.add("hidden"), 2000);
    }
  },

  openRecentlyDeleted() {
    const content = document.getElementById("photos-content");

    if (!this.state.flags.albumLayer2Unlocked) {
      content.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;">
          <div style="font-size:48px;margin-bottom:16px;">🗑🔒</div>
          <p style="font-size:14px;color:#666;margin-bottom:4px;">最近删除</p>
          <p style="font-size:12px;color:#999;margin-bottom:20px;">恢复照片需要输入密码</p>
          <p style="font-size:12px;color:#aaa;margin-bottom:16px;font-style:italic;">忘掉这一天……忘掉，对，我要忘掉。</p>
          <input type="text" id="album-layer2-input" maxlength="4" placeholder="输入4位密码"
            style="width:140px;padding:10px;border:1px solid #ddd;border-radius:6px;text-align:center;font-size:22px;letter-spacing:8px;margin-bottom:12px;">
          <button id="album-layer2-btn" style="background:#4caf50;color:#fff;border:none;padding:10px 30px;border-radius:6px;font-size:14px;cursor:pointer;">恢复</button>
          <p class="hidden" id="album-layer2-error" style="color:#e74c3c;font-size:12px;margin-top:8px;">密码错误</p>
          <button style="background:none;border:none;color:#999;font-size:12px;margin-top:16px;cursor:pointer;" id="layer2-back-btn">← 返回相册</button>
        </div>
      `;
      document.getElementById("album-layer2-btn").addEventListener("click", () => this.tryUnlockAlbumLayer2());
      document.getElementById("album-layer2-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.tryUnlockAlbumLayer2();
      });
      document.getElementById("layer2-back-btn").addEventListener("click", () => this.renderPhotos());
    } else {
      this.renderLayer2Photos();
    }
  },

  tryUnlockAlbumLayer2() {
    const input = document.getElementById("album-layer2-input");
    const pw = input.value.trim();
    if (pw === STORY.albumLayer2Password) {
      this.state.flags.albumLayer2Unlocked = true;
      this.collectEvidence("A", "album2");
      this.saveGame();
      this.queueXiaoyuHint("falseLeadB");
      this.renderLayer2Photos();
      this.checkAutoRedirect();
      setTimeout(() => this.showToast("真相越来越近了……去找小鱼"), 800);
    } else {
      const err = document.getElementById("album-layer2-error");
      err.classList.remove("hidden");
      setTimeout(() => err.classList.add("hidden"), 2000);
    }
  },

  renderLayer2Photos() {
    const content = document.getElementById("photos-content");
    content.innerHTML = "<h4 style='font-size:13px;color:#888;margin-bottom:12px;padding-top:16px;'>最近删除</h4>";

    const grid = document.createElement("div");
    grid.className = "photo-grid";

    STORY.photos.layer2.forEach(photo => {
      const item = document.createElement("div");
      item.className = "photo-item";
      item.style.background = "#2a2a2a";
      if (photo.img) {
        item.style.backgroundImage = `url('${encodeURI(photo.img)}')`;
        item.style.backgroundSize = "cover";
        item.style.backgroundPosition = "center";
      }
      item.addEventListener("click", () => this.viewPhoto(photo));
      grid.appendChild(item);
    });

    content.appendChild(grid);

    const backBtn = document.createElement("button");
    backBtn.style.cssText = "background:none;border:none;color:#999;font-size:12px;margin-top:16px;cursor:pointer;padding:10px;";
    backBtn.textContent = "← 返回相册";
    backBtn.addEventListener("click", () => this.renderPhotos());
    content.appendChild(backBtn);
  },

  viewPhoto(photo) {
    // 照片扭曲效果
    photo = this.handlePhotoDistortion(photo) || photo;

    // 全屏查看照片
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:200;padding:20px;cursor:pointer;";

    if (photo.img) {
      overlay.innerHTML = `
        <img src="${encodeURI(photo.img)}" style="max-width:100%;max-height:70%;object-fit:contain;border-radius:4px;${photo.distorted ? 'filter:blur(1px) contrast(1.3);' : ''}">
        <p style="color:${photo.distorted ? '#c0392b' : '#ccc'};font-size:12px;margin-top:12px;text-align:center;">${photo.desc}</p>
        <p style="color:#666;font-size:11px;margin-top:4px;">${photo.date}</p>
      `;
    } else {
      overlay.innerHTML = `
        <div style="width:200px;height:200px;background:#1a1a1a;border-radius:8px;display:flex;align-items:center;justify-content:center;">
          <p style="color:#666;font-size:13px;text-align:center;padding:20px;">${photo.desc}</p>
        </div>
        <p style="color:#666;font-size:11px;margin-top:12px;">${photo.date}</p>
      `;
    }

    overlay.addEventListener("click", () => overlay.remove());
    document.getElementById("phone-frame").appendChild(overlay);

    // 屏幕闪烁效果
    this.handleScreenFlash(photo);
  },

  // --- 备忘录 ---
  renderNotes() {
    const list = document.getElementById("notes-list");
    list.innerHTML = "";

    STORY.notes.forEach(note => {
      const unlocked = !note.locked || this.state.flags[note.locked];
      const item = document.createElement("div");
      item.className = "note-item" + (unlocked ? "" : " locked-note");
      item.innerHTML = `
        <div class="note-item-title">${unlocked ? note.title : "███"}</div>
        <div class="note-item-preview">${unlocked ? note.content.substring(0, 30) + "..." : "模糊不清……需要更多线索才能阅读"}</div>
        <div class="note-item-date">${note.date}</div>
      `;
      item.addEventListener("click", () => {
        if (unlocked) {
          this.openNote(note);
        } else {
          this.showToast("需要更多线索才能解锁这篇备忘录");
        }
      });
      list.appendChild(item);
    });

    // 滚动监听：滑到底部弹出解锁提示
    list.onscroll = () => this.tryShowNoteUnlockAlerts();
  },

  checkNoteUnlocks() {
    const flags = this.state.flags;

    STORY.notes.forEach(note => {
      if (!note.locked) return;
      if (!this._unlockedNotes) this._unlockedNotes = {};
      if (flags[note.locked] && !this._unlockedNotes[note.id]) {
        this._unlockedNotes[note.id] = true;
        // 暂存待提示的标题
        if (!this._pendingNoteAlerts) this._pendingNoteAlerts = [];
        if (!this._pendingNoteAlerts.includes(note.title)) {
          this._pendingNoteAlerts.push(note.title);
        }
      }
    });
  },

  tryShowNoteUnlockAlerts() {
    if (!this._pendingNoteAlerts || this._pendingNoteAlerts.length === 0) return;

    let container = null;
    if (this.state.currentScreen === "chat-conversation") {
      container = document.getElementById("conv-body");
    } else if (this.state.currentScreen === "app-notes") {
      container = document.getElementById("notes-list");
    } else {
      return;
    }
    if (!container) return;
    if (container.scrollHeight <= container.clientHeight) return;

    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 30;
    if (atBottom) {
      this._pendingNoteAlerts.forEach(title => {
        this.showToast(`📝 备忘录解锁：「${title}」`);
      });
      this._pendingNoteAlerts = [];
    }
  },

  openNote(note) {
    // 检查锁
    if (note.locked && !this.state.flags[note.locked]) {
      this.showToast("需要更多线索才能解锁这篇备忘录");
      return;
    }

    // 涂黑内容渲染
    if (note.redactions) {
      this.renderNoteWithRedactions(note);
    } else {
      const content = document.getElementById("note-content");
      content.className = "note-content" + (note.isCreepy ? " chaotic" : "");

      let text = note.content;
      if (note.isCreepy && text.includes("你在看我的手机吗")) {
        text = text.replace("你在看我的手机吗", '<span class="creepy">你在看我的手机吗</span>');
        content.innerHTML = text.replace(/\n/g, "<br>");
      } else {
        content.textContent = text;
      }
    }

    // 证据收集：关键日记
    const keyDiaryIds = ["diary1", "diary-friend", "diary2", "diary3", "diary4", "diary5", "diary6", "diary7"];
    if (keyDiaryIds.includes(note.id)) {
      this.collectDiaryEvidence(note.id);
    }
    if (note.id === "accounting") {
      this.collectEvidence("D", "accounting");
    }

    this.showScreen("note-detail");
  },

  // --- 浏览器 ---
  renderBrowser() {
    this.collectEvidence("B", "browserSurface");
    const historyEl = document.getElementById("browser-history");
    const page = document.getElementById("browser-page");
    const list = document.getElementById("history-list");

    page.classList.add("hidden");
    historyEl.classList.remove("hidden");
    list.innerHTML = "";

    STORY.browser.surface.forEach(item => {
      const el = document.createElement("div");
      el.className = "history-item";
      el.innerHTML = `
        <div class="history-item-title">${item.title}</div>
        <div class="history-item-url">${item.url} · ${item.date}</div>
      `;
      if (item.hasPage) {
        el.style.cursor = "pointer";
        el.addEventListener("click", () => {
          historyEl.classList.add("hidden");
          page.classList.remove("hidden");
          page.innerHTML = item.pageContent;
        });
      }
      list.appendChild(el);
    });

    // 幽灵搜索条目
    if (this.state.supernaturalTriggered.ghostSearch) {
      const sep = document.createElement("div");
      sep.style.cssText = "border-top:1px dashed #e0e0e0;margin:12px 0;";
      list.appendChild(sep);
      STORY.supernatural.ghostSearch.entries.forEach(item => {
        const el = document.createElement("div");
        el.className = "history-item ghost-item";
        el.innerHTML = `
          <div class="history-item-title" style="color:#999;">${item.title}</div>
          <div class="history-item-url" style="color:#bbb;">${item.url} · ${item.date}</div>
        `;
        list.appendChild(el);
      });
    }

    const recycleBin = document.getElementById("browser-recycle-btn");
    if (recycleBin) {
      recycleBin.onclick = () => this.openRecycleBin();
    }
  },

  openRecycleBin() {
    const historyEl = document.getElementById("browser-history");
    const page = document.getElementById("browser-page");

    historyEl.classList.add("hidden");
    page.classList.remove("hidden");

    if (this.state.flags.browserRecycleBinOpen) {
      this.renderClearedHistory();
      return;
    }

    page.innerHTML = `
      <div style="text-align:center;padding:20px 0;">
        <div style="font-size:36px;margin-bottom:12px;">🗑</div>
        <p style="font-size:14px;color:#333;margin-bottom:4px;">已清除的浏览记录</p>
        <p style="font-size:12px;color:#999;margin-bottom:20px;">恢复记录需验证身份</p>
      </div>
      <div id="security-questions" style="padding:0 10px;"></div>
    `;

    this.showSecurityQuestion(0);
  },

  showSecurityQuestion(index) {
    const container = document.getElementById("security-questions");
    const questions = STORY.browser.securityQuestions;

    if (index >= questions.length) {
      this.state.flags.browserRecycleBinOpen = true;
      this.state.flags.sawClearedHistory = true;
      this.collectEvidence("B", "clearedHistory");
      this.saveGame();
      this.checkNoteUnlocks();
      this.queueXiaoyuHint("dateHint");
      this.renderClearedHistory();
      this.checkAutoRedirect();
      setTimeout(() => this.showToast("有了新发现……去问问小鱼吧"), 1000);
      return;
    }

    const q = questions[index];
    container.innerHTML = `
      <div style="background:#fff;border-radius:8px;padding:16px;margin-bottom:12px;border:1px solid #eee;">
        <p style="font-size:13px;color:#333;margin-bottom:4px;">密保问题 ${index + 1}/3</p>
        <p style="font-size:15px;font-weight:500;color:#333;margin-bottom:12px;">${q.question}</p>
        <input type="text" id="sq-input" placeholder="输入答案"
          style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;margin-bottom:10px;">
        <button id="sq-btn" style="background:#2196f3;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-size:13px;cursor:pointer;">确认</button>
        <p class="hidden" id="sq-error" style="color:#e74c3c;font-size:12px;margin-top:8px;">答案错误，请再想想</p>
      </div>
      ${index > 0 ? '<p style="font-size:11px;color:#4caf50;margin-bottom:8px;">✓ 已通过 ' + index + ' 个问题</p>' : ''}
    `;

    document.getElementById("sq-btn").addEventListener("click", () => {
      const answer = document.getElementById("sq-input").value.trim();
      if (answer === q.answer) {
        this.showSecurityQuestion(index + 1);
      } else {
        document.getElementById("sq-error").classList.remove("hidden");
        setTimeout(() => {
          const err = document.getElementById("sq-error");
          if (err) err.classList.add("hidden");
        }, 2000);
      }
    });

    document.getElementById("sq-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("sq-btn").click();
    });
  },

  renderClearedHistory() {
    const page = document.getElementById("browser-page");
    page.innerHTML = `
      <div style="padding:10px 0;">
        <p style="font-size:12px;color:#4caf50;margin-bottom:12px;">✓ 身份验证通过 · 已恢复记录</p>
        <div id="cleared-list"></div>
      </div>
    `;

    const list = document.getElementById("cleared-list");
    STORY.browser.cleared.forEach(item => {
      const el = document.createElement("div");
      el.className = "history-item cleared-item";
      el.innerHTML = `
        <div class="history-item-title" style="color:#c0392b;">${item.title}</div>
        <div class="history-item-url">${item.url} · ${item.date}</div>
      `;
      list.appendChild(el);
    });
  },

  showComplaintPage() {
    const page = document.getElementById("browser-page");
    const data = STORY.browser.complaintPage;
    this.state.flags.sawComplaintLetter = true;
    this.collectEvidence("B", "complaintLetter");
    this.saveGame();
    this.queueXiaoyuHint("schoolHint");

    page.innerHTML = `
      <div style="padding:10px 0;">
        <h3 style="font-size:15px;color:#333;margin-bottom:12px;">${data.title}</h3>
        <div style="background:#fff5f5;border-left:3px solid #e74c3c;padding:14px;margin-bottom:16px;border-radius:4px;">
          <p style="font-size:11px;color:#999;margin-bottom:6px;">发件人：${data.from} · ${data.date}</p>
          <p style="font-size:13px;line-height:1.8;color:#333;white-space:pre-wrap;">${data.content}</p>
        </div>
        <div style="background:#f5f5f5;border-left:3px solid #999;padding:14px;border-radius:4px;">
          <p style="font-size:11px;color:#999;margin-bottom:6px;">学校回复</p>
          <p style="font-size:13px;line-height:1.8;color:#555;white-space:pre-wrap;">${data.reply}</p>
        </div>
      </div>
    `;
  },

  browserNavigate() {
    const url = document.getElementById("browser-url").value.trim().toLowerCase();
    const page = document.getElementById("browser-page");
    const historyEl = document.getElementById("browser-history");

    // 邮箱搜索 → 举报信
    if (url.includes("wutong0816") || url.includes("163.com")) {
      historyEl.classList.add("hidden");
      page.classList.remove("hidden");
      this.showComplaintPage();
      return;
    }

    if (url.includes("mtyz-edu") || url.includes("mtyz")) {
      historyEl.classList.add("hidden");
      page.classList.remove("hidden");
      page.innerHTML = this.renderSchoolSite();
      this.state.flags.sawSchoolReport = true;
      this.collectEvidence("B", "schoolSite");
      this.saveGame();
      this.queueXiaoyuHint("finalMessage");
    }
  },

  renderSchoolSite() {
    const site = STORY.browser.schoolSite;
    let html = `<h3>木同一中 · 校园公告栏</h3>`;

    site.notices.forEach(notice => {
      const cls = notice.type === "donation" ? "donation-notice" : "official-notice";
      html += `
        <div class="${cls}">
          <strong>${notice.title}</strong><br>
          <small style="color:#999">${notice.date}</small>
          <p style="margin-top:8px;white-space:pre-wrap;">${notice.content}</p>
        </div>
      `;
    });

    return html;
  },

  // --- 拼刀刀 ---
  renderShop() {
    const content = document.getElementById("shop-content");
    content.innerHTML = "<h4 style='font-size:13px;color:#888;margin-bottom:12px;'>我的订单</h4>";

    STORY.shop.recent.forEach(order => {
      const el = document.createElement("div");
      el.className = "order-item";
      el.innerHTML = `
        <div class="order-title">${order.title}</div>
        <div class="order-price">${order.price}</div>
        <div class="order-date">${order.date}</div>
        <div class="order-status">${order.status}</div>
      `;
      content.appendChild(el);
    });

    if (!this.state.flags.shopUnlocked) {
      const lockDiv = document.createElement("div");
      lockDiv.style.cssText = "text-align:center;padding:20px;margin-top:10px;";
      lockDiv.innerHTML = `
        <p style="font-size:12px;color:#999;margin-bottom:10px;">— 更早的订单 —</p>
        <div style="background:#fff;border-radius:8px;padding:16px;border:1px solid #eee;">
          <p style="font-size:13px;color:#666;margin-bottom:10px;">查看更早订单需要输入支付密码</p>
          <input type="text" id="shop-pw-input" maxlength="5" placeholder="支付密码"
            style="width:120px;padding:8px;border:1px solid #ddd;border-radius:6px;text-align:center;font-size:16px;letter-spacing:4px;margin-bottom:10px;">
          <br>
          <button id="shop-pw-btn" style="background:#e91e63;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-size:13px;cursor:pointer;">确认</button>
          <p class="hidden" id="shop-pw-error" style="color:#e74c3c;font-size:12px;margin-top:8px;">密码错误</p>
        </div>
      `;
      content.appendChild(lockDiv);

      setTimeout(() => {
        const btn = document.getElementById("shop-pw-btn");
        if (btn) {
          btn.addEventListener("click", () => this.tryUnlockShop());
          document.getElementById("shop-pw-input").addEventListener("keydown", (e) => {
            if (e.key === "Enter") this.tryUnlockShop();
          });
        }
      }, 0);
    } else {
      this.renderEarlierOrders(content);
    }
  },

  tryUnlockShop() {
    const input = document.getElementById("shop-pw-input");
    const pw = input.value.trim();
    if (pw === STORY.shopPassword) {
      this.state.flags.shopUnlocked = true;
      this.collectEvidence("A", "shopHidden");
      this.collectEvidence("D", "shopUnlocked");
      this.saveGame();
      this.queueXiaoyuHint("falseLeadA");
      this.renderShop();
    } else {
      const err = document.getElementById("shop-pw-error");
      err.classList.remove("hidden");
      setTimeout(() => err.classList.add("hidden"), 2000);
    }
  },

  renderEarlierOrders(content) {
    const divider = document.createElement("p");
    divider.style.cssText = "font-size:12px;color:#999;text-align:center;margin:16px 0 10px;";
    divider.textContent = "— 更早的订单 —";
    content.appendChild(divider);

    STORY.shop.earlier.forEach(order => {
      const el = document.createElement("div");
      el.className = "order-item";
      if (order.hasDetail) el.style.cursor = "pointer";
      el.innerHTML = `
        <div class="order-title">${order.title}</div>
        <div class="order-price">${order.price}</div>
        <div class="order-date">${order.date}</div>
        <div class="order-status">${order.status}</div>
      `;
      if (order.hasDetail) {
        el.addEventListener("click", () => this.showOrderDetail(order));
      }
      content.appendChild(el);
    });
  },

  showOrderDetail(order) {
    const content = document.getElementById("shop-content");
    const d = order.detail;
    content.innerHTML = `
      <div style="padding:4px 0;">
        <button id="order-detail-back" style="background:none;border:none;color:#e91e63;font-size:13px;cursor:pointer;padding:4px 0;margin-bottom:12px;">← 返回订单列表</button>
        <div style="background:#fff;border-radius:8px;padding:16px;border:1px solid #eee;margin-bottom:12px;">
          <h4 style="font-size:14px;margin-bottom:12px;color:#333;">${d.name}</h4>
          <p style="font-size:12px;color:#666;margin-bottom:4px;">规格：${d.spec}</p>
          <p style="font-size:12px;color:#666;margin-bottom:4px;">店铺：${d.shop}</p>
          <p style="font-size:14px;color:#e91e63;font-weight:bold;margin-top:8px;">${order.price}</p>
        </div>
        <div style="background:#fff;border-radius:8px;padding:16px;border:1px solid #eee;margin-bottom:12px;">
          <h4 style="font-size:13px;margin-bottom:10px;color:#333;">收货信息</h4>
          <p style="font-size:12px;color:#666;margin-bottom:4px;">收货人：${d.buyer}</p>
          <p style="font-size:12px;color:#666;margin-bottom:4px;">电话：${d.phone}</p>
          <p style="font-size:12px;color:#666;margin-bottom:4px;">地址：${d.address}</p>
          ${d.note ? `<p style="font-size:12px;color:#999;margin-top:6px;">${d.note}</p>` : ""}
        </div>
        <div style="background:#fff;border-radius:8px;padding:16px;border:1px solid #eee;">
          <h4 style="font-size:13px;margin-bottom:10px;color:#333;">物流信息</h4>
          <p style="font-size:12px;color:#666;margin-bottom:4px;">下单时间：${d.orderTime}</p>
          <p style="font-size:12px;color:#666;margin-bottom:4px;">发货时间：${d.deliverTime}</p>
          <p style="font-size:12px;color:#666;margin-bottom:4px;">签收时间：${d.signTime}</p>
          <p style="font-size:12px;color:#4caf50;margin-top:4px;font-weight:bold;">${order.status}</p>
        </div>
      </div>
    `;
    document.getElementById("order-detail-back").addEventListener("click", () => this.renderShop());
  },

  // --- 星梦女巫 ---
  renderFortune() {
    this.collectEvidence("A", "fortuneViewed");
    const content = document.getElementById("fortune-content");
    content.innerHTML = `<h4 style="color:#e0d0ff;margin-bottom:16px;font-size:14px;">✨ 占卜记录 ✨</h4>`;

    STORY.fortune.forEach(record => {
      const el = document.createElement("div");
      el.className = "fortune-record";
      el.innerHTML = `
        <div class="fortune-question">🔮 「${record.question}」</div>
        <div class="fortune-answer">${record.answer.replace(/\n/g, "<br>")}</div>
        <div class="fortune-date">${record.date}</div>
      `;
      content.appendChild(el);
    });
  },

  // --- 围脖 ---
  renderWeibo() {
    const content = document.getElementById("weibo-content");

    if (!this.state.flags.postedExposure) {
      content.innerHTML = `
        <div class="weibo-compose">
          <textarea id="weibo-text" placeholder="说点什么...">[证据整理] 十一年前木同一中学生梧桐坠楼案真相：\n\n1. 长期遭受以班长陈昊为首的群体性霸凌\n2. 被陈昊安排至其家族酒店打工期间遭张伟性侵\n3. 精神崩溃后意外坠楼\n4. 陈家集团捐款500万，学校压下真相定性为"自杀"\n5. 梧桐生前曾向校长信箱举报，学校未予处理\n\n所有证据附图如下...</textarea>
          <button class="weibo-post-btn" id="weibo-post-btn">发布</button>
        </div>
      `;
      document.getElementById("weibo-post-btn").addEventListener("click", () => this.postWeibo());
    } else {
      this.renderWeiboResult();
    }
  },

  postWeibo() {
    this.state.flags.postedExposure = true;
    this.saveGame();
    this.renderWeiboResult();
    setTimeout(() => this.showEnding(), 5000);
  },

  renderWeiboResult() {
    const completedCount = this.state.completedChains.length;
    let endingKey = "D";
    if (completedCount >= 4) endingKey = "A";
    else if (completedCount >= 3) endingKey = "B";
    else if (completedCount >= 2) endingKey = "C";

    const ending = STORY.endings[endingKey];
    const content = document.getElementById("weibo-content");
    content.innerHTML = `
      <div class="weibo-trending">
        <h4>🔥 热搜榜</h4>
        ${ending.weiboTrending.map(t => `
          <div class="trending-item">${t.rank}. ${t.text} <span class="hot">${t.hot}</span></div>
        `).join("")}
      </div>
      <div class="weibo-news">
        <h4>📰 相关新闻</h4>
        ${ending.weiboNews.map(n => `
          <div class="news-item">
            <div class="news-title">${n.title}</div>
            <div class="news-source">${n.source}</div>
          </div>
        `).join("")}
      </div>
    `;
  },

  showEnding() {
    this.state.flags.gameComplete = true;
    this.saveGame();

    const completedCount = this.state.completedChains.length;

    let endingKey;
    if (completedCount >= 4) endingKey = "A";
    else if (completedCount >= 3) endingKey = "B";
    else if (completedCount >= 2) endingKey = "C";
    else endingKey = "D";

    // 记录成就
    this.unlockAchievement(endingKey);

    const ending = STORY.endings[endingKey];
    const finalLine = (endingKey === "A") ? ending.finalLine : "";
    const hasXiaoyuRevelation = endingKey === "A" && ending.xiaoyuRevelation;

    const el = document.createElement("div");
    el.id = "ending-screen";
    el.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;background:#000;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:40px;z-index:300;opacity:0;transition:opacity 1.5s;overflow-y:auto;";
    el.innerHTML = `
      <div style="max-width:300px;text-align:center;">
        <p style="color:#999;font-size:14px;line-height:2.2;">
          ${ending.content.replace(/\n/g, "<br>")}
        </p>
        ${finalLine ? `<p style="color:#e0e0e0;font-size:16px;margin-top:30px;opacity:0;animation:fadeIn 2s 1.5s forwards;">${finalLine}</p>` : ""}
        <p style="color:#555;font-size:11px;margin-top:24px;">— 结局：${ending.title} —</p>
        <div style="margin-top:40px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <button id="ending-restart" style="background:#333;color:#ccc;border:1px solid #555;padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer;">重新开始</button>
          <button id="ending-gallery" style="background:#333;color:#ccc;border:1px solid #555;padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer;">成就图鉴</button>
        </div>
      </div>
    `;
    document.getElementById("phone-frame").appendChild(el);
    setTimeout(() => el.style.opacity = "1", 100);

    // 按钮事件
    setTimeout(() => {
      document.getElementById("ending-restart")?.addEventListener("click", () => {
        localStorage.removeItem("lostgirl_save");
        location.reload();
      });
      document.getElementById("ending-gallery")?.addEventListener("click", () => {
        this.showAchievementGallery();
      });
    }, 200);

    // 最佳结局：延迟显示小鱼气泡通知
    if (hasXiaoyuRevelation) {
      setTimeout(() => {
        const bubble = document.createElement("div");
        bubble.style.cssText = "position:absolute;bottom:80px;left:50%;transform:translateX(-50%);background:#4caf50;color:#fff;padding:12px 20px;border-radius:20px;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(76,175,80,0.4);opacity:0;transition:opacity 0.8s;white-space:nowrap;z-index:301;";
        bubble.innerHTML = `🐟 小鱼似乎有话想对你说……`;
        bubble.addEventListener("click", () => {
          el.remove();
          this.showXiaoyuRevelation(ending.xiaoyuRevelation);
        });
        el.appendChild(bubble);
        setTimeout(() => bubble.style.opacity = "1", 100);
      }, 3000);
    }
  },

  // === 成就系统 ===
  unlockAchievement(key) {
    let achievements = {};
    try {
      achievements = JSON.parse(localStorage.getItem("lostgirl_achievements") || "{}");
    } catch (e) {}
    achievements[key] = true;
    localStorage.setItem("lostgirl_achievements", JSON.stringify(achievements));
  },

  showAchievementGallery() {
    let achievements = {};
    try {
      achievements = JSON.parse(localStorage.getItem("lostgirl_achievements") || "{}");
    } catch (e) {}

    const allEndings = [
      { key: "D", title: "不了了之", hint: "线索不足……" },
      { key: "C", title: "迟来的道歉", hint: "找到更多证据" },
      { key: "B", title: "真相大白", hint: "几乎拼出了全部" },
      { key: "A", title: "她的安息", hint: "四条证据链全部打通" },
      { key: "FA", title: "打草惊蛇", hint: "错误指认了凶手" },
      { key: "FB", title: "未能拼出的真相", hint: "止步于表象" },
    ];

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);display:flex;flex-direction:column;align-items:center;padding:60px 30px 30px;z-index:350;overflow-y:auto;";
    overlay.innerHTML = `
      <h3 style="color:#e0e0e0;font-size:16px;margin-bottom:24px;">🏆 成就图鉴</h3>
      ${allEndings.map(e => `
        <div style="width:100%;max-width:280px;padding:14px 16px;margin-bottom:10px;border-radius:8px;background:${achievements[e.key] ? '#1a1a2e' : '#111'};border:1px solid ${achievements[e.key] ? '#4caf50' : '#333'};text-align:center;">
          <div style="font-size:14px;color:${achievements[e.key] ? '#e0e0e0' : '#555'};">${achievements[e.key] ? e.title : '？？？'}</div>
          <div style="font-size:11px;color:${achievements[e.key] ? '#888' : '#444'};margin-top:4px;">${achievements[e.key] ? e.hint : '尚未解锁'}</div>
        </div>
      `).join("")}
      <button id="gallery-close" style="margin-top:20px;background:#333;color:#ccc;border:1px solid #555;padding:10px 24px;border-radius:6px;font-size:13px;cursor:pointer;">返回</button>
    `;
    document.getElementById("phone-frame").appendChild(overlay);

    document.getElementById("gallery-close").addEventListener("click", () => overlay.remove());
  },

  showXiaoyuRevelation(messages) {
    const frame = document.getElementById("phone-frame");
    const chatEl = document.createElement("div");
    chatEl.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;z-index:310;display:flex;flex-direction:column;background:#f5f5f5;opacity:0;transition:opacity 0.8s;";

    chatEl.innerHTML = `
      <div class="app-header" style="margin-top:24px;">
        <span class="app-title" style="margin-left:8px;">小鱼</span>
      </div>
      <div class="conversation-body" id="revelation-body" style="flex:1;overflow-y:auto;padding:16px;padding-top:40px;"></div>
    `;

    frame.appendChild(chatEl);
    setTimeout(() => chatEl.style.opacity = "1", 100);

    const body = document.getElementById("revelation-body");
    this.streamMessages(body, messages, () => {
      setTimeout(() => {
        const finalLine = document.createElement("div");
        finalLine.style.cssText = "text-align:center;padding:40px 20px;color:#bbb;font-size:13px;line-height:2;";
        finalLine.innerHTML = `风从窗外吹进来。<br>窗帘轻轻动了一下。<br><br>房间里很安静。<br><br>手机不再响了。
          <div style="margin-top:30px;display:flex;gap:12px;justify-content:center;">
            <button id="rev-restart" style="background:#333;color:#ccc;border:1px solid #555;padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer;">重新开始</button>
            <button id="rev-gallery" style="background:#333;color:#ccc;border:1px solid #555;padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer;">成就图鉴</button>
          </div>`;
        body.appendChild(finalLine);
        body.scrollTop = body.scrollHeight;
        document.getElementById("rev-restart").addEventListener("click", () => {
          localStorage.removeItem("lostgirl_save");
          location.reload();
        });
        document.getElementById("rev-gallery").addEventListener("click", () => {
          this.showAchievementGallery();
        });
      }, 1500);
    });
  },

  // === 证据链系统 ===
  collectEvidence(chain, piece) {
    if (this.state.evidencePieces[chain][piece] !== undefined) {
      this.state.evidencePieces[chain][piece] = true;
      this.checkChainCompletion(chain);
      this.saveGame();
    }
  },

  collectDiaryEvidence(noteId) {
    const ep = this.state.evidencePieces.C;
    if (!ep.readDiaryIds) ep.readDiaryIds = [];
    if (ep.readDiaryIds.includes(noteId)) return;
    ep.readDiaryIds.push(noteId);
    ep.diaryKeyCount = Math.min(ep.readDiaryIds.length, 7);
    if (ep.diaryKeyCount >= 5) {
      this.collectEvidence("C", "diaryKey");
    }
  },

  checkChainCompletion(chain) {
    const pieces = this.state.evidencePieces[chain];
    let allDone = true;

    if (chain === "C") {
      allDone = pieces.diaryKeyCount >= 5 && pieces.xiaoyuFull && pieces.grandpaChat && pieces.classGroup;
    } else {
      Object.values(pieces).forEach(v => { if (!v) allDone = false; });
    }

    if (allDone && !this.state.completedChains.includes(chain)) {
      this.state.completedChains.push(chain);
      this.showToast(`证据链完成：「${STORY.evidenceChains[chain].name}」`);
      this.saveGame();
    }
  },

  // === 诡异事件系统 ===
  handlePhotoDistortion(photo) {
    if (photo.id !== STORY.supernatural.photoDistortion.photoId) return null;
    if (this.state.supernaturalTriggered.photoDistortion) return null;

    const counts = this.state.photoViewCounts;
    counts[photo.id] = (counts[photo.id] || 0) + 1;
    const stage = Math.min(counts[photo.id] - 1, 2);

    if (stage >= 1) {
      this.state.supernaturalTriggered.photoDistortion = true;
      this.saveGame();
    }

    const desc = STORY.supernatural.photoDistortion.stages[stage];
    if (desc) photo = { ...photo, desc: desc, distorted: stage >= 2 };
    return photo;
  },

  checkAutoRedirect() {
    const sup = STORY.supernatural.autoRedirect;
    const flags = this.state.flags;
    const triggered = this.state.supernaturalTriggered;

    if (triggered.autoRedirect) return;
    if (!flags[sup.triggerFlags[0]] || !flags[sup.triggerFlags[1]]) return;

    triggered.autoRedirect = true;
    this.saveGame();

    if (this.state.currentScreen === "home-screen") {
      this.state.autoRedirectTimer = setTimeout(() => {
        this.triggerAutoRedirect();
      }, sup.delayMs);
    }
  },

  triggerAutoRedirect() {
    const note = STORY.notes.find(n => n.id === STORY.supernatural.autoRedirect.targetNoteId);
    if (note) {
      this._returnToScreen = this.state.currentScreen;
      this._returnToContact = this.state.currentContact;
      this.showToast("手机好像自己在动……");
      setTimeout(() => this.openNote(note), 1200);
    }
    this.state.supernaturalTriggered.ghostSearch = true;
    this.saveGame();
  },

  handleScreenFlash(photo) {
    if (photo.id !== STORY.supernatural.screenFlash.photoId) return;
    if (!this.state.flags[STORY.supernatural.screenFlash.triggerFlag]) return;
    if (this.state.supernaturalTriggered.screenFlash) return;

    this.state.supernaturalTriggered.screenFlash = true;
    this.saveGame();

    setTimeout(() => {
      const frame = document.getElementById("phone-frame");
      const flash = document.createElement("div");
      flash.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;z-index:250;pointer-events:none;";
      flash.innerHTML = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:80px;height:180px;background:rgba(255,255,255,0.15);border-radius:40%;filter:blur(20px);animation:flashFigure 0.8s ease-out forwards;"></div>';
      document.getElementById("phone-frame").appendChild(flash);
      setTimeout(() => flash.remove(), 900);
    }, 600);
  },

  // === 涂黑内容交互 ===
  renderNoteWithRedactions(note) {
    const content = document.getElementById("note-content");
    content.className = "note-content" + (note.isCreepy ? " chaotic" : "");

    let html = note.content.replace(/\n/g, "<br>");

    if (note.redactions) {
      note.redactions.forEach(r => {
        const isRevealed = this.state.flags[r.flag];
        if (isRevealed) {
          html = html.replace(r.marker, `<span class="redacted revealed">${r.reveal}</span>`);
        } else {
          html = html.replace(r.marker, `<span class="redacted" data-flag="${r.flag}">${r.marker}</span>`);
        }
      });
    }

    if (note.isCreepy && note.content.includes("你在看我的手机吗")) {
      html = html.replace("你在看我的手机吗", '<span class="creepy">你在看我的手机吗</span>');
    }

    content.innerHTML = html;

    // 涂黑点击交互
    content.querySelectorAll(".redacted:not(.revealed)").forEach(el => {
      el.style.cursor = "pointer";
      el.addEventListener("click", () => {
        const flag = el.dataset.flag;
        if (this.state.flags[flag]) {
          const noteData = STORY.notes.find(n => n.id === note.id);
          if (noteData && noteData.redactions) {
            const r = noteData.redactions.find(rd => rd.flag === flag);
            if (r) {
              el.textContent = r.reveal;
              el.classList.add("revealed");
              this.showToast("拼刀刀的订单揭示了这个数字");
            }
          }
        } else {
          this.showToast("需要更多信息才能揭开");
        }
      });
    });
  },
};

document.addEventListener("DOMContentLoaded", () => Game.init());
