// script.js — หน้าหลัก (ต้องโหลด config.js ก่อน)
'use strict';

(() => {
  const CFG = window.APP_CONFIG;

  const bankPriority = {
    SCB: 1,
    KTB: 2,
    KBANK: 3,
    BBL: 4,
    TMB: 5,
    BAY: 6,
    ISBT: 7
  };

  const bankThaiNames = {
    SCB: "ไทยพาณิชย์",
    KBANK: "กสิกรไทย",
    BBL: "กรุงเทพ",
    KTB: "กรุงไทย",
    TMB: "ทหารไทยธนชาต (TMBThanachart)",
    BAY: "กรุงศรีอยุธยา",
    GSB: "ออมสิน",
    UOB: "ยูโอบี",
    CIMB: "ซีไอเอ็มบี ไทย",
    ISBT: "อิสลามแห่งประเทศไทย",
    TTB: "ทหารไทยธนชาต",
    default: "ไม่ระบุ"
  };

  const paymentGroups = [
    { name: "A884", key: "A884" },
    { name: "A883,WC22", key: "A883,WC22" },
    { name: "A88,0,1,2,AF,AFF", key: "A88,0,1,2,AF,AFF" },
    { name: "THNA", key: "THNA" },
    { name: "THNB", key: "THNB" },
    { name: "THCA", key: "THCA" },
    { name: "THVA", key: "THVA" },
    { name: "AO", key: "AO" }
  ];

  // ── state ─────────────────────────────────────────────
  let token = null;
  try { token = localStorage.getItem('token'); } catch (e) { /* ใช้ storage ไม่ได้ */ }

  if (!token) {
    location.replace('login.html');
    return;
  }

  let lastUpdate = null;
  let lastAccountsJSON = null;
  let checkTimer = null;
  let isChecking = false;
  let isLoggingOut = false; // กดออกจากระบบแล้ว — อย่าให้ poll/คำขอค้างมาเด้งหน้า "เซสชันหมดอายุ"

  // ── helpers ───────────────────────────────────────────
  function formatAccountNumber(no) {
    const s = (no || '').toString();
    if (s.length === 10) {
      return `${s.slice(0, 3)}-${s.slice(3, 4)}-${s.slice(4)}`;
    }
    return s;
  }

  function showToast(msg) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = 1; toast.style.transform = 'translateY(0)'; }, 10);
    setTimeout(() => { toast.style.opacity = 0; toast.style.transform = 'translateY(20px)'; }, 2500);
    setTimeout(() => { toast.remove(); }, 2800);
  }

  function hideLoading() {
    const el = document.getElementById("loading-indicator");
    if (el) el.classList.add("hidden");
  }

  function forceLogout(reason) {
    try { localStorage.removeItem('token'); } catch (e) { /* ignore */ }
    location.replace(`login.html?reason=${encodeURIComponent(reason)}`);
  }

  // เรียก API พร้อมแนบ token; ถ้า server ตอบ UNAUTHORIZED → ออกจากระบบทันที
  async function authCall(action, payload) {
    const res = await apiCall(action, Object.assign({}, payload, { token }));
    if (res && res.code === 'UNAUTHORIZED') {
      if (!isLoggingOut) forceLogout(res.message || 'เซสชันหมดอายุหรือ token ไม่ถูกต้อง');
      const err = new Error('UNAUTHORIZED');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    return res;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* ไปลองวิธีสำรอง */ }

    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  // ── data ──────────────────────────────────────────────
  async function loadAccounts() {
    const res = await authCall('accounts');
    if (!res.success || !Array.isArray(res.data)) {
      throw new Error(res.message || 'โหลดข้อมูลไม่สำเร็จ');
    }
    lastUpdate = res.updated; // จำไว้ เพื่อไม่ให้ poll รอบแรกโหลดซ้ำโดยไม่จำเป็น

    return res.data.map(a => {
      const bank = String(a.bank ?? '');
      const no = String(a.no ?? '');
      return {
        name: String(a.name ?? ''),
        no,
        bank,
        short: String(a.short ?? '').trim() || `${bank}-${no.slice(-5)}`,
        groups: Array.isArray(a.groups) ? a.groups : []
      };
    });
  }

  // โหลดใหม่แล้ว render เฉพาะเมื่อข้อมูลเปลี่ยนจริง — คืน true ถ้ามีการเปลี่ยน
  async function refreshAccounts() {
    const accounts = await loadAccounts();
    const json = JSON.stringify(accounts);
    if (json === lastAccountsJSON) return false;
    renderGroups(accounts);
    lastAccountsJSON = json;
    return true;
  }

  async function checkUpdate() {
    if (isChecking || isLoggingOut || document.hidden) return; // ไม่ยิงตอนแท็บซ่อน / กำลังออก / ไม่ซ้อนกัน
    isChecking = true;
    try {
      const res = await authCall('check');
      if (!res.success) throw new Error(res.message || 'ตรวจสอบอัพเดทไม่ได้');

      if (res.updated !== lastUpdate) {
        const changed = await refreshAccounts();
        if (changed) showToast("ข้อมูลอัพเดทแล้ว ✓");
      }
    } catch (err) {
      if (err.code !== 'UNAUTHORIZED') {
        showToast("ตรวจสอบอัพเดทไม่ได้: " + err.message);
      }
    } finally {
      isChecking = false;
      hideLoading();
    }
  }

  // ── render ────────────────────────────────────────────
  function sortAccounts(accounts) {
    return [...accounts].sort((a, b) => {
      const pa = bankPriority[a.bank] || 999;
      const pb = bankPriority[b.bank] || 999;
      if (pa !== pb) return pa - pb;
      return (a.short || "").localeCompare(b.short || "");
    });
  }

  function makeSpan(className, text) {
    const s = document.createElement("span");
    s.className = className;
    s.textContent = text; // textContent เท่านั้น — กัน HTML/script จากข้อมูลในชีท
    return s;
  }

  function renderGroups(accounts) {
    const container = document.getElementById("groups-container");

    document.querySelectorAll('.group-row').forEach(el => el.remove());

    const fragment = document.createDocumentFragment();
    const sortedAccounts = sortAccounts(accounts);

    paymentGroups.forEach(g => {
      const matches = sortedAccounts.filter(a => a.groups.includes(g.key));
      if (matches.length === 0) return;

      const row = document.createElement("div");
      row.className = "group-row";

      const groupName = document.createElement("div");
      groupName.className = "group-name";
      groupName.textContent = g.name;
      row.appendChild(groupName);

      const accountsContainer = document.createElement("div");
      accountsContainer.className = "accounts-list";

      matches.forEach(acc => {
        const item = document.createElement("button");
        item.className = "account-item";
        item.type = "button";

        const bankThai = bankThaiNames[acc.bank] || bankThaiNames.default;
        item.appendChild(makeSpan("col-bank", bankThai));
        item.appendChild(makeSpan("col-name", acc.short));
        item.appendChild(makeSpan("col-accname", acc.name));
        item.appendChild(makeSpan("col-accno", formatAccountNumber(acc.no)));

        item.dataset.bank = acc.bank;
        item.dataset.name = acc.name;
        item.dataset.no = acc.no;

        accountsContainer.appendChild(item);
      });

      row.appendChild(accountsContainer);
      fragment.appendChild(row);
    });

    container.appendChild(fragment);
    hideLoading();
  }

  function buildTransferMessage(item) {
    const bankThai = bankThaiNames[item.dataset.bank] || bankThaiNames.default;
    return `📌 ช่องทางโอนเงิน
ธนาคาร : ${bankThai}
ชื่อบัญชี : ${item.dataset.name}
เลขบัญชี : ${formatAccountNumber(item.dataset.no)}

━━━━━━━━━━━━━━━━

⚠️ สำคัญ
• กรุณาตรวจสอบชื่อบัญชีก่อนโอน
• โอนจากบัญชีชื่อเดียวกับที่สมัครเท่านั้น
• ฝากขั้นต่ำ ${CFG.MIN_DEPOSIT} บาท
• ถอนขั้นต่ำ ${CFG.MIN_WITHDRAW} บาท

หากโอนแล้ว กรุณาส่งสลิปเพื่อทำรายการค่ะ 🙏`;
  }

  // ── UI wiring ─────────────────────────────────────────
  function wireCopy() {
    const groupsContainer = document.getElementById("groups-container");
    if (!groupsContainer) return;

    groupsContainer.addEventListener("click", async (e) => {
      const item = e.target.closest(".account-item");
      if (!item) return;

      const ok = await copyText(buildTransferMessage(item));
      if (ok) {
        showToast("คัดลอกแล้ว ✓");
        item.classList.add("copied");
        setTimeout(() => item.classList.remove("copied"), 1400);
      } else {
        showToast("คัดลอกไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  }

  function wireMenu(els) {
    const panel = document.getElementById("admin-panel");
    const overlay = document.getElementById("menu-overlay");
    const menuBtn = document.getElementById("menu-btn");
    const closeBtn = document.getElementById("menu-close");

    const openPanel = () => { panel.classList.add("open"); overlay.classList.add("open"); };
    const closePanel = () => { panel.classList.remove("open"); overlay.classList.remove("open"); };

    menuBtn?.addEventListener("click", openPanel);
    closeBtn?.addEventListener("click", closePanel);
    overlay?.addEventListener("click", closePanel);

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        closePanel();
        closePasswordModal(els);
      }
    });

    els.logoutLink?.addEventListener("click", async e => {
      e.preventDefault();
      if (isLoggingOut) return;
      isLoggingOut = true;
      if (checkTimer) clearInterval(checkTimer);
      // ลบ session ฝั่ง server ด้วย (รอสั้น ๆ ไม่ให้ค้างถ้าเน็ตช้า)
      try {
        await Promise.race([
          apiCall('logout', { token }),
          new Promise(resolve => setTimeout(resolve, 3000))
        ]);
      } catch (err) { /* ออกจากเครื่องนี้ต่อได้แม้ server ไม่ตอบ */ }
      try { localStorage.removeItem("token"); } catch (err) { /* ignore */ }
      showToast("ออกจากระบบแล้ว");
      setTimeout(() => location.replace("login.html"), 600);
    });
  }

  function closePasswordModal(els) {
    if (!els.modal || els.modal.style.display === "none") return;
    els.modal.classList.remove("open");
    setTimeout(() => { els.modal.style.display = "none"; }, 300);
  }

  function wirePasswordModal(els) {
    els.changePasswordLink?.addEventListener("click", e => {
      e.preventDefault();
      els.modal.style.display = "flex";
      setTimeout(() => els.modal.classList.add("open"), 10);
      els.errorEl.style.color = "";
      els.errorEl.textContent = "";
    });

    els.closeModal?.addEventListener("click", () => closePasswordModal(els));
    els.modal?.addEventListener("click", e => {
      if (e.target === els.modal) closePasswordModal(els);
    });

    els.submitBtn?.addEventListener("click", async () => {
      const oldPass = els.oldPasswordInput.value.trim();
      const newPass = els.newPasswordInput.value.trim();
      const confirm = els.confirmPasswordInput.value.trim();

      els.errorEl.style.color = "";
      els.errorEl.textContent = "";

      if (!oldPass || !newPass || !confirm) {
        els.errorEl.textContent = "กรุณากรอกครบทุกช่อง";
        return;
      }
      if (newPass !== confirm) {
        els.errorEl.textContent = "รหัสผ่านใหม่ไม่ตรงกัน";
        return;
      }
      if (newPass.length < 6) {
        els.errorEl.textContent = "รหัสผ่านใหม่ต้องอย่างน้อย 6 ตัวอักษร";
        return;
      }

      els.submitBtn.disabled = true;
      els.errorEl.textContent = "กำลังดำเนินการ...";

      try {
        const data = await authCall('change_password', { old_password: oldPass, new_password: newPass });

        if (data.success) {
          els.errorEl.style.color = "#10b981";
          els.errorEl.textContent = "เปลี่ยนรหัสผ่านสำเร็จ!";
          setTimeout(() => {
            closePasswordModal(els);
            setTimeout(() => {
              els.oldPasswordInput.value = "";
              els.newPasswordInput.value = "";
              els.confirmPasswordInput.value = "";
              els.errorEl.textContent = "";
              els.errorEl.style.color = "";
            }, 350);
          }, 1400);
        } else {
          els.errorEl.textContent = data.message || "เกิดข้อผิดพลาด";
        }
      } catch (err) {
        if (err.code !== 'UNAUTHORIZED') {
          els.errorEl.textContent = err.message || "ไม่สามารถเชื่อมต่อได้";
        }
      } finally {
        els.submitBtn.disabled = false;
      }
    });
  }

  // ── init ──────────────────────────────────────────────
  async function initializeApp() {
    const els = {
      userInfo: document.getElementById("user-info"),
      usernameDisplay: document.getElementById("my-username-display"),
      adminSection: document.getElementById("admin-only-section"),
      logoutLink: document.getElementById("logout-link"),
      changePasswordLink: document.getElementById("change-password-link"),
      modal: document.getElementById("change-password-modal"),
      closeModal: document.getElementById("close-password-modal"),
      submitBtn: document.getElementById("submit-password-change"),
      errorEl: document.getElementById("password-error"),
      oldPasswordInput: document.getElementById("old-password"),
      newPasswordInput: document.getElementById("new-password"),
      confirmPasswordInput: document.getElementById("confirm-password")
    };

    wireMenu(els);
    wirePasswordModal(els);
    wireCopy();

    // ยิง verify กับโหลดข้อมูลพร้อมกัน (Apps Script ช้าครั้งละ 1–2 วินาที)
    const verifyPromise = authCall('verify');
    const accountsPromise = loadAccounts();
    accountsPromise.catch(() => { /* จัดการจริงด้านล่าง — กัน unhandled rejection */ });

    try {
      const me = await verifyPromise;
      if (!me.success || !me.valid) {
        forceLogout(me.message || 'เซสชันหมดอายุหรือ token ไม่ถูกต้อง');
        return;
      }

      const username = me.username || '—';
      els.userInfo.textContent = `User : ${username}`;
      els.usernameDisplay.textContent = username;
      if (me.role === 'admin') els.adminSection.style.display = "block";
    } catch (err) {
      if (err.code === 'UNAUTHORIZED') return;
      console.error('Session verification failed:', err);
      hideLoading();
      showToast(err.message || 'ตรวจสอบเซสชันไม่ได้ กรุณารีเฟรชหรือตรวจสอบการเชื่อมต่อ');
      return;
    }

    try {
      const accounts = await accountsPromise;
      renderGroups(accounts);
      lastAccountsJSON = JSON.stringify(accounts);
    } catch (err) {
      if (err.code === 'UNAUTHORIZED') return;
      showToast("โหลดข้อมูลล้มเหลว: " + err.message);
      hideLoading();
    }

    // ตรวจอัพเดทเป็นระยะ (ถ้าโหลดครั้งแรกพลาด lastUpdate ยัง null → รอบถัดไปจะโหลดให้เอง)
    checkTimer = setInterval(checkUpdate, CFG.CHECK_INTERVAL);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) checkUpdate(); // กลับมาที่แท็บ → เช็คทันที
    });
    window.addEventListener("beforeunload", () => {
      if (checkTimer) clearInterval(checkTimer);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }
})();
