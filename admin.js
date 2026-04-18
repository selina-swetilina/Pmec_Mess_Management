/* ===== ZeroWaste Admin – admin2.js (Merged: admin UI + admin1 server features) ===== */
const role = localStorage.getItem("role");
if (role !== "admin") {
  window.location.href = "login.html";
}

// ── Load from Server ──
async function loadStudentsFromDB() {
  try {
    const res = await fetch("http://localhost:5000/api/admin/students");
    const data = await res.json();
    Store.students = data;
    if (currentPage === "students") render();
  } catch (err) {
    console.error(err);
  }
}
//JADE

async function loadTodayStats() {
  try {
    const res  = await fetch("http://localhost:5000/api/admin/today-stats");
    const data = await res.json();
    Store.totalEating   = data.eating   ?? 0;
    Store.totalSkipping = data.skipping ?? 0;
    if (currentPage === "dashboard") render();
  } catch (err) {
    console.error("Today stats load error:", err);
  }
}
//JADE
async function loadBillingFromDB() {
  try {
    const res = await fetch("http://localhost:5000/api/admin/billing/all");
    const data = await res.json();
    Store.bills = data.map((s, i) => ({ id: i + 1, ...s, balance: 0, payments: [] }));
    if (currentPage === "billing") render();
  } catch (err) { console.error("Billing load error:", err); }
}

async function loadLeavesFromDB() {
  try {
    const [pendingRes, processedRes] = await Promise.all([
      fetch("http://localhost:5000/api/admin/leaves/pending"),
      fetch("http://localhost:5000/api/admin/leaves/processed")
    ]);
    Store.leaves = await pendingRes.json();
    Store.processedLeaves = await processedRes.json();
    if (currentPage === "leave") render();
  } catch (err) { console.error("Leaves load error:", err); }
}

const Store = {
  admins: [],
  students: [],
  bills: [],
  leaves: [],
  processedLeaves: [],
  notices: [],
  vendors: [],
  hostels: [],
  policy: { maxOffs: 0, mealRate: 0, newRate: null, newRateFrom: null },
  totalEating: 0,
  totalSkipping: 0,
  nextId: 100,
};

// ── Helpers ──
function genId() {
  return ++Store.nextId;
}
function toast(msg, type = "success") {
  const c = document.getElementById("toast-container");
  const d = document.createElement("div");
  d.className = "toast " + type;
  d.textContent = msg;
  c.appendChild(d);
  setTimeout(() => d.remove(), 3000);
}
function showUndoToast(msg, onUndo) {
  const tid = "undo_" + Date.now();
  const c = document.getElementById("toast-container");
  const d = document.createElement("div");
  d.className = "toast";
  d.id = tid;
  d.innerHTML = `<div style="display:flex;align-items:center;gap:16px;justify-content:space-between;width:100%;">
    <span style="font-size:15px;">${msg}</span>
    <button id="btn_${tid}" style="background:var(--card);border:1px solid var(--border);color:var(--fg);padding:6px 14px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;box-shadow:0 2px 4px rgba(0,0,0,0.1);transition:background 0.2s;">Undo (5s)</button>
  </div>`;
  c.appendChild(d);
  let timeLeft = 5;
  const btn = document.getElementById("btn_" + tid);
  const interval = setInterval(() => {
    timeLeft--;
    if (btn) btn.textContent = "Undo (" + timeLeft + "s)";
  }, 1000);
  const timeout = setTimeout(() => {
    clearInterval(interval);
    if (document.getElementById(tid)) document.getElementById(tid).remove();
  }, 5000);
  btn.onclick = () => {
    clearInterval(interval);
    clearTimeout(timeout);
    if (document.getElementById(tid)) document.getElementById(tid).remove();
    onUndo();
    toast("Action undone successfully");
  };
}
function showConfirmBox(title, desc) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `<div class="confirm-box"><div class="confirm-title">${title}</div><div class="confirm-desc">${desc}</div><div class="confirm-actions"><button class="btn btn-outline" id="confirm-cancel">Cancel</button><button class="btn btn-red" id="confirm-ok">Delete</button></div></div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("active"));
    const close = (result) => {
      overlay.classList.remove("active");
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };
    document.getElementById("confirm-cancel").onclick = () => close(false);
    document.getElementById("confirm-ok").onclick = () => close(true);
  });
}
function formatDate(d) {
  return d ? new Date(d).toLocaleDateString("en-IN") : "—";
}
function daysRemaining(dateStr) {
  if (!dateStr) return "—";
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  return diff > 0 ? diff + " days" : "Expired";
}
function renderStars(n) {
  let s = "";
  for (let i = 1; i <= 5; i++)
    s += `<span class="${i <= n ? "" : "empty"}">★</span>`;
  return `<span class="stars">${s}</span>`;
}

// ── Navigation ──
let currentPage = "dashboard";
function navigate(page) {
  currentPage = page;
  document
    .querySelectorAll(".nav-item")
    .forEach((el) => el.classList.toggle("active", el.dataset.page === page));
  const titles = {
    dashboard: "Admin Dashboard",
    students: "Student Details",
    notices: "Notices",
    billing: "Billing Management",
    leave: "Leave Approval",
    vendors: "Vendors",
    hostel: "Hostel Management",
  };
  document.getElementById("pageTitle").textContent = titles[page] || page;
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById("sidebar");
    if (sidebar && !sidebar.classList.contains("collapsed")) {
      toggleSidebar();
    }
  }
  render();
  if (page === "notices") {
    loadNoticesFromDB();
  }
  if (page === "vendors") {
    loadVendorsFromDB();
  }
  if (page === "hostel") {
    loadHostelsFromDB();
  }
  if (page === "dashboard") {
    loadAdmins();
    loadTodayStats();
  }
  if (page === "billing") loadBillingFromDB();
  if (page === "leave") loadLeavesFromDB();
}
document.querySelectorAll(".nav-item").forEach((el) =>
  el.addEventListener("click", (e) => {
    e.preventDefault();
    navigate(el.dataset.page);
  }),
);

// ── Collapsible Sidebar ──
const coll = document.querySelectorAll(".collapsible");
coll.forEach((btn) => {
  btn.addEventListener("click", function () {
    this.classList.toggle("active");
    const content = this.nextElementSibling;
    content.style.display =
      content.style.display === "block" ? "none" : "block";
  });
});

// ── Sidebar / Theme ──
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("collapsed");
  const overlay = document.getElementById("mobile-overlay");
  if (overlay) {
    if (sidebar.classList.contains("collapsed")) {
      overlay.classList.remove("active");
    } else {
      overlay.classList.add("active");
    }
  }
}
function toggleTheme() {
  document.documentElement.classList.toggle("dark");
}

// ── Render Router ──
function render() {
  const c = document.getElementById("content");
  switch (currentPage) {
    case "dashboard":
      c.innerHTML = renderDashboard();
      break;
    case "students":
      c.innerHTML = renderStudents();
      break;
    case "notices":
      c.innerHTML = renderNotices();
      break;
    case "billing":
      c.innerHTML = renderBilling();
      break;
    case "leave":
      c.innerHTML = renderLeave();
      break;
    case "vendors":
      c.innerHTML = renderVendors();
      break;
    case "hostel":
      c.innerHTML = renderHostel();
      break;
    default:
      c.innerHTML = "<p>Page not found.</p>";
  }
  bindEvents();
}

// ═══════════════════════════════════════
// PAGE: ADMIN DASHBOARD (admin.js enhanced UI + admin1.js server calls)
// ═══════════════════════════════════════
function renderDashboard() {
  return `
  <style>
.dsb-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
.dsb-title{font-size:20px;font-weight:700;color:var(--fg);margin-bottom:4px}
.dsb-subtitle{font-size:13px;color:var(--fg2)}
.dsb-actions{display:flex;gap:16px;align-items:center}
.dsb-icon-btn{background:none;border:none;color:var(--fg2);cursor:pointer;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center}
.dsb-icon-btn:hover{background:rgba(0,0,0,0.05);color:var(--fg)}
.dark .dsb-icon-btn:hover{background:rgba(255,255,255,0.05)}
.dsb-avatar{width:32px;height:32px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px}
.dsb-stats-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.dsb-stat-card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:24px;position:relative;overflow:hidden;box-shadow:var(--shadow)}
.dsb-stat-icon{position:absolute;right:24px;top:24px;color:var(--fg2);opacity:0.15;width:64px;height:64px}
.dsb-stat-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--fg2)}
.dsb-stat-value-row{display:flex;align-items:baseline;gap:12px;margin-top:8px;position:relative;z-index:2}
.dsb-stat-value{font-size:42px;font-weight:700;color:var(--fg);font-family:'Courier New',monospace}
.dsb-stat-trend{font-size:12px;padding:2px 6px;border-radius:4px;font-weight:600;display:inline-flex;align-items:center;gap:4px}
.dsb-stat-trend.up{color:var(--primary);background:var(--primary-light)}
.dsb-stat-trend.down{color:var(--amber);background:var(--amber-light)}
.dsb-stat-line{position:absolute;bottom:16px;left:24px;right:48px;height:3px;border-radius:2px}
.dsb-stat-card.green .dsb-stat-line{background:var(--primary)}
.dsb-stat-card.amber .dsb-stat-line{background:var(--amber)}
.dsb-main-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-bottom:16px}
.dsb-col{display:flex;flex-direction:column;gap:16px}
.dsb-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;box-shadow:var(--shadow)}
.dsb-card-title{font-size:16px;font-weight:600;color:var(--fg);margin-bottom:20px;display:flex;align-items:center;gap:10px}
.dsb-card-title svg{width:20px;height:20px;color:var(--primary)}
.dsb-input-group{display:flex;flex-direction:column;gap:6px}
.dsb-label{font-size:11px;color:var(--fg2);font-weight:600}
.dsb-input{background:var(--input-bg);border:1px solid var(--input-border);color:var(--fg);border-radius:6px;padding:0 12px;height:38px;font-size:13px;outline:none;transition:border 0.2s}
.dsb-input:focus{border-color:var(--primary)}
.dsb-input-icon-wrap{position:relative;display:flex;align-items:center}
.dsb-input-icon-wrap svg{position:absolute;left:12px;width:16px;height:16px;color:var(--fg2)}
.dsb-input-icon-wrap .dsb-input{width:100%;padding-left:36px}
.dsb-btn{height:38px;border-radius:6px;border:none;cursor:pointer;font-weight:600;font-size:13px;display:inline-flex;align-items:center;justify-content:center;padding:0 16px;transition:opacity 0.15s}
.dsb-btn:hover{opacity:0.85}
.dsb-btn-primary{background:var(--primary);color:#fff}
.dsb-btn-icon{width:38px;padding:0;font-size:18px}
.dsb-btn-white{background:var(--fg);color:var(--bg);width:100%;margin-top:16px}
.dsb-admin-form{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:12px;align-items:flex-end}
.dsb-policy-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.dsb-policy-box{border:1px solid var(--input-border);border-radius:8px;padding:16px;background:var(--bg2);display:flex;flex-direction:column;justify-content:space-between}
.dsb-policy-box-title{font-size:13px;font-weight:700;color:var(--fg);margin-bottom:4px}
.dsb-policy-box-desc{font-size:11px;color:var(--fg2);margin-bottom:12px;line-height:1.4;flex:1}
.dsb-stepper{display:flex;border:1px solid var(--input-border);border-radius:6px;overflow:hidden;height:32px;width:fit-content}
.dsb-stepper button{background:var(--input-bg);border:none;color:var(--fg);width:32px;cursor:pointer;font-size:16px}
.dsb-stepper button:hover{background:var(--border)}
.dsb-stepper input{background:var(--input-bg);border:none;border-left:1px solid var(--input-border);border-right:1px solid var(--input-border);color:var(--fg);width:40px;text-align:center;font-weight:700;outline:none}
.dsb-rate-input{display:flex;align-items:center;border:1px solid var(--input-border);border-radius:6px;background:var(--input-bg);height:32px;overflow:hidden}
.dsb-rate-sym{padding:0 12px;color:var(--fg2);background:rgba(0,0,0,0.03);border-right:1px solid var(--input-border);font-size:13px;height:100%;display:flex;align-items:center}
.dark .dsb-rate-sym{background:rgba(255,255,255,0.03)}
.dsb-rate-input input{background:transparent;border:none;color:var(--fg);font-weight:700;padding:0 10px;width:60px;outline:none}
.dsb-warning{background:var(--amber-light);border:1px solid rgba(180,83,9,0.2);border-radius:8px;padding:16px;display:flex;gap:12px;margin-bottom:24px;align-items:flex-start}
.dark .dsb-warning{background:rgba(251,191,36,0.05);border-color:rgba(251,191,36,0.2)}
.dsb-warning svg{color:var(--amber);width:20px;height:20px;flex-shrink:0}
.dsb-warning-text{font-size:12px;color:var(--amber);line-height:1.5;font-weight:500}
.dsb-policy-extra{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:flex-end;border-top:1px solid var(--border);padding-top:16px}
@media(max-width:900px){.dsb-main-grid{grid-template-columns:1fr}.dsb-admin-form{grid-template-columns:1fr}.dsb-policy-row{grid-template-columns:1fr}.dsb-policy-extra{grid-template-columns:1fr}}
  </style>
  <div class="dsb-header"><div><div class="dsb-title">Daily Forecast & Admin Config</div><div class="dsb-subtitle">Manage daily operations and system parameters</div></div>
    <div class="dsb-actions"><button class="dsb-icon-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg></button><div class="dsb-avatar">${(Store.admins[0]?.name || Store.admins[0]?.fullName || "A").charAt(0)}</div></div></div>
  <div class="dsb-stats-row">
    <div class="dsb-stat-card green"><svg class="dsb-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path></svg><div class="dsb-stat-label">Total Eating Today</div><div class="dsb-stat-value-row"><div class="dsb-stat-value">${Store.totalEating.toLocaleString()}</div><div class="dsb-stat-trend up"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg> +5%</div></div><div class="dsb-stat-line"></div></div>
    <div class="dsb-stat-card amber"><svg class="dsb-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path><line x1="2" y1="2" x2="22" y2="22"></line></svg><div class="dsb-stat-label">Total Skipping Today</div><div class="dsb-stat-value-row"><div class="dsb-stat-value">${Store.totalSkipping.toLocaleString()}</div><div class="dsb-stat-trend down"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"></polyline><polyline points="16 17 22 17 22 11"></polyline></svg> -2%</div></div><div class="dsb-stat-line"></div></div>
  </div>
  <div class="dsb-main-grid"><div class="dsb-col">
    <div class="dsb-card"><div class="dsb-card-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>Add New Admin</div>
      <div class="dsb-admin-form"><div class="dsb-input-group"><label class="dsb-label">Full Name</label><input class="dsb-input" id="adName" placeholder="John Doe"/></div><div class="dsb-input-group"><label class="dsb-label">Email Address</label><input class="dsb-input" id="adEmail" placeholder="admin@zerowaste.edu"/></div><div class="dsb-input-group"><label class="dsb-label">Temporary Password</label><input class="dsb-input" type="password" id="adPass" placeholder="••••••••"/></div><button class="dsb-btn dsb-btn-primary dsb-btn-icon" onclick="addAdmin()">+</button></div>
      <div class="table-wrap mt-4"><table><thead><tr><th>Name</th><th>Email</th><th>Password</th></tr></thead><tbody id="adminTable"></tbody></table></div>
    </div>
    <div class="dsb-card"><div class="dsb-card-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21v-7"></path><path d="M4 10V3"></path><path d="M12 21v-9"></path><path d="M12 8V3"></path><path d="M20 21v-5"></path><path d="M20 12V3"></path><path d="M1 14h6"></path><path d="M9 8h6"></path><path d="M17 16h6"></path></svg>Global Policy Settings</div>
      <div class="dsb-policy-row"><div class="dsb-policy-box"><div class="dsb-policy-box-title">Max Monthly Offs</div><div class="dsb-policy-box-desc">Maximum leave days per student</div><div class="dsb-stepper"><button onclick="Store.policy.maxOffs=Math.max(0,Store.policy.maxOffs-1);render()">−</button><input class="mono" value="${Store.policy.maxOffs}" onchange="Store.policy.maxOffs=+this.value"/><button onclick="Store.policy.maxOffs++;render()">+</button></div></div><div class="dsb-policy-box"><div class="dsb-policy-box-title">Flat Meal Rate</div><div class="dsb-policy-box-desc">Cost per single meal unit</div><div class="dsb-rate-input"><div class="dsb-rate-sym">₹</div><input class="mono" value="${Store.policy.mealRate}" readonly style="cursor:default;pointer-events:none;background:var(--bg2,#f5f5f5);color:var(--fg)"/></div></div></div>
      <div class="dsb-policy-extra"><div class="dsb-input-group"><label class="dsb-label">Scheduled Rate (₹)</label><input class="dsb-input mono" id="newRate" value="${Store.policy.newRate || ""}" placeholder="e.g. 90"/></div><div class="dsb-input-group"><label class="dsb-label">Effective From</label><input type="date" class="dsb-input" id="newRateFrom" value="${Store.policy.newRateFrom || ""}"/></div><button class="dsb-btn dsb-btn-primary" onclick="savePolicySettings()">Save Policy Changes</button></div>
      ${Store.policy.newRate ? `<div class="mt-2" style="font-size:12px;color:var(--fg2)">📅 New rate ₹${Store.policy.newRate} will apply from ${formatDate(Store.policy.newRateFrom)}</div>` : ""}
    </div>
  </div><div class="dsb-col">
    <div class="dsb-card"><div class="dsb-card-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>Security</div>
      <div class="dsb-warning"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg><div class="dsb-warning-text">It is recommended to update your admin password every 90 days for optimal security.</div></div>
      <div class="dsb-input-group" style="margin-bottom:12px"><label class="dsb-label">Current Password</label><div class="dsb-input-icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg><input type="password" class="dsb-input" id="curPass"/></div></div>
      <div class="dsb-input-group" style="margin-bottom:12px"><label class="dsb-label">New Password</label><div class="dsb-input-icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg><input type="password" class="dsb-input" id="newPass"/></div></div>
      <div class="dsb-input-group" style="margin-bottom:12px"><label class="dsb-label">Confirm New Password</label><div class="dsb-input-icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg><input type="password" class="dsb-input" id="confPass"/></div></div>
      <button class="dsb-btn dsb-btn-white" onclick="updateOwnPassword()">Update Credentials</button>
    </div>
  </div></div>
  <div class="lock-info">🔒 Meal bookings within the 12-hour window are locked and cannot be overridden.</div>`;
}
async function savePolicySettings() {
  const maxOffs = Store.policy.maxOffs;
  const mealRate = Store.policy.mealRate;

  let scheduledRate = document.getElementById("newRate")?.value;
  let effectiveFrom = document.getElementById("newRateFrom")?.value;

  if (scheduledRate && !effectiveFrom) {
    toast("Please set an effective date for the new rate", "error");
    return;
  }

  // If effective date is today, promote scheduled rate → flat meal rate
  let finalMealRate = mealRate;
  let ratePromoted = false;
  if (scheduledRate && effectiveFrom) {
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    if (effectiveFrom === today) {
      finalMealRate = Number(scheduledRate);
      scheduledRate = null;
      effectiveFrom = null;
      ratePromoted = true;
    }
  }

  try {
    const res = await fetch("http://localhost:5000/api/admin/policy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        maxMonthlyOffs: maxOffs,
        flatMealRate: finalMealRate,
        scheduledRate: scheduledRate || null,
        effectiveFrom: effectiveFrom || null,
      }),
    });

    await res.json();

    toast(ratePromoted
      ? "Scheduled rate is now active — Flat Meal Rate updated ✅"
      : "Policy saved to database ✅"
    );
  } catch (err) {
    toast("Server error ❌", "error");
    console.error(err);
  }
  Store.policy.maxOffs = maxOffs;
  Store.policy.mealRate = finalMealRate;
  Store.policy.newRate = scheduledRate ? Number(scheduledRate) : null;
  Store.policy.newRateFrom = effectiveFrom;

  render();
}

async function loadPolicy() {
  const res = await fetch("http://localhost:5000/api/admin/policy");
  const data = await res.json();

  if (!data) return;

  // Auto-promote: if scheduled rate's effective date has arrived, apply it as flat meal rate
  if (data.scheduledRate && data.effectiveFrom) {
    // Use local date (not UTC) to avoid IST timezone mismatch
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    const eff = new Date(data.effectiveFrom);
    const effectiveDate = `${eff.getFullYear()}-${String(eff.getMonth()+1).padStart(2,'0')}-${String(eff.getDate()).padStart(2,'0')}`;

    if (effectiveDate <= today) {
      data.flatMealRate = data.scheduledRate;
      data.scheduledRate = null;
      data.effectiveFrom = null;

      await fetch("http://localhost:5000/api/admin/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxMonthlyOffs: data.maxMonthlyOffs,
          flatMealRate: data.flatMealRate,
          scheduledRate: null,
          effectiveFrom: null,
        }),
      });
    }
  }

  Store.policy.maxOffs = data.maxMonthlyOffs;
  Store.policy.mealRate = data.flatMealRate;
  Store.policy.newRate = data.scheduledRate;
  Store.policy.newRateFrom = data.effectiveFrom;

  if (currentPage === "policy") render();
}
// Server-connected addAdmin (from admin1.js)
async function addAdmin() {
  const name = document.getElementById("adName").value.trim();
  const email = document.getElementById("adEmail").value.trim();
  const password = document.getElementById("adPass").value.trim();
  if (!name || !email || !password) {
    toast("All fields are required", "error");
    return;
  }
  try {
    const res = await fetch("http://localhost:5000/add-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (data.success) {
    toast("Admin added successfully ✅");
    } else {
     toast(data.message || "Something went wrong", "error");
}
    document.getElementById("adName").value = "";
    document.getElementById("adEmail").value = "";
    document.getElementById("adPass").value = "";
    loadAdmins();
  } catch (err) {
    toast("Server error ❌", "error");
  }
}
// Server-connected loadAdmins (from admin1.js)
async function loadAdmins() {
  try {
    const res = await fetch("http://localhost:5000/admins");
    const admins = await res.json();
    Store.admins = admins;
    const table = document.getElementById("adminTable");
    if (!table) return;
    table.innerHTML = admins
  .map(
    (a) =>
      `<tr><td>${a.name || a.fullName || "—"}</td><td class="mono">${a.email}</td><td class="mono">${a.password}</td></tr>`,
  )
  .join("");
  } catch (err) {
    console.error(err);
  }
}
// REPLACE updateOwnPassword() in admin.js
async function updateOwnPassword() {
  const email = localStorage.getItem("userEmail"); // logged-in admin's email
  const currentPassword = document.getElementById("curPass").value;
  const newPassword = document.getElementById("newPass").value;
  const confirmPassword = document.getElementById("confPass").value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    toast("All fields are required", "error");
    return;
  }
  if (newPassword !== confirmPassword) {
    toast("Passwords do not match", "error");
    return;
  }
  try {
    const res = await fetch("http://localhost:5000/update-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, currentPassword, newPassword, confirmPassword }),
    });
    const data = await res.json();
    if (data.success) {
      toast("Password updated ✅");
      document.getElementById("curPass").value = "";
      document.getElementById("newPass").value = "";
      document.getElementById("confPass").value = "";
      loadAdmins(); // refresh the admin table to show the new password
    } else {
      toast(data.message, "error");
    }
  } catch (err) {
    toast("Server error ❌", "error");
  }
}

// ═══════════════════════════════════════
// PAGE: STUDENTS (server-connected from admin1.js)
// ═══════════════════════════════════════
let studentFilters = { hostel: "", year: "", branch: "", search: "" };
let selectedStudents = new Set();
function renderStudents() {
  const hostels = [
    ...new Set(Store.students.map((s) => s.hostel).filter(Boolean)),
  ];
  const years = [...new Set(Store.students.map((s) => s.year).filter(Boolean))];
  const branches = [
    ...new Set(Store.students.map((s) => s.branch).filter(Boolean)),
  ];
  let filtered = Store.students.filter((s) => {
    if (studentFilters.hostel && s.hostel !== studentFilters.hostel)
      return false;
    if (studentFilters.year && s.year !== studentFilters.year) return false;
    if (studentFilters.branch && s.branch !== studentFilters.branch)
      return false;
    if (studentFilters.search) {
      const q = studentFilters.search.toLowerCase();
      if (
        !s.name.toLowerCase().includes(q) &&
        !s.regNo.toLowerCase().includes(q) &&
        !s.email.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });
  return `
  <div class="space-y">
    <div class="flex justify-between items-center flex-wrap gap-2">
      <div class="section-title" style="margin:0">Student Directory (${filtered.length})</div>
      <div class="flex gap-2">
        ${selectedStudents.size > 0 ? `<button class="btn btn-red btn-sm" onclick="bulkDeleteStudents()">🗑 Delete Selected (${selectedStudents.size})</button>` : ""}
        <button class="btn btn-outline btn-sm" onclick="downloadCSVTemplate()">⬇ Template</button>
        <label class="btn btn-outline btn-sm" style="cursor:pointer;margin:0">
          ⬆ Import CSV
          <input type="file" id="csvImportInput" accept=".csv" style="display:none" onchange="importCSV(this)"/>
        </label>
        <a class="btn btn-outline btn-sm" style="cursor:pointer" onclick="navigate('leave')">Pending Leave Requests →</a>
      </div>
    </div>
    <div class="filter-bar">
      <input class="form-input" placeholder="🔍 Search by name, reg no, email..." style="width:240px" value="${studentFilters.search}" oninput="studentFilters.search=this.value;render()"/>
      <select class="form-input" onchange="studentFilters.hostel=this.value;render()"><option value="">All Hostels</option>${hostels.map((h) => `<option ${studentFilters.hostel === h ? "selected" : ""}>${h}</option>`).join("")}</select>
      <select class="form-input" onchange="studentFilters.year=this.value;render()"><option value="">All Years</option>${years.map((y) => `<option ${studentFilters.year === y ? "selected" : ""}>${y}</option>`).join("")}</select>
      <select class="form-input" onchange="studentFilters.branch=this.value;render()"><option value="">All Branches</option>${branches.map((b) => `<option ${studentFilters.branch === b ? "selected" : ""}>${b}</option>`).join("")}</select>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th><input type="checkbox" class="cb" onchange="toggleAllStudents(this.checked)" ${selectedStudents.size === filtered.length && filtered.length > 0 ? "checked" : ""}/></th><th class="sticky-col">Name</th><th>Reg No</th><th>Branch</th><th>Year</th><th>Hostel</th><th>Room</th><th>Email</th><th>Phone</th><th>Password</th><th>Actions</th></tr></thead>
      <tbody>
        <tr style="background:var(--primary-light)"><td></td>
          <td class="sticky-col" style="background:var(--primary-light)"><input class="form-input" style="width:100%;height:26px;font-size:12px" id="sa_name" placeholder="Name"/></td>
          <td><input class="form-input" style="width:90px;height:26px;font-size:12px" id="sa_reg" placeholder="21BCS000"/></td>
          <td><input class="form-input" style="width:60px;height:26px;font-size:12px" id="sa_branch" placeholder="CSE"/></td>
          <td><select class="form-input" style="height:26px;font-size:12px" id="sa_year"><option value="">Year</option><option>1st</option><option>2nd</option><option>3rd</option><option>4th</option></select></td>
          <td><input class="form-input" style="width:70px;height:26px;font-size:12px" id="sa_hostel" placeholder="Optional"/></td>
          <td><input class="form-input" style="width:50px;height:26px;font-size:12px" id="sa_room" placeholder="Opt"/></td>
          <td><input class="form-input" style="width:130px;height:26px;font-size:12px" id="sa_email" placeholder="email@uni.in"/></td>
          <td><input class="form-input" style="width:110px;height:26px;font-size:12px" id="sa_phone" placeholder="Phone (opt)"/></td>
          <td class="mono" style="font-size:11px">Password@123</td>
          <td><button class="btn btn-primary btn-sm" onclick="addStudent()">+ Add</button></td>
        </tr>
        ${filtered
          .map(
            (s) => `
        <tr id="srow_${s._id}">
          <td><input type="checkbox" class="cb" ${selectedStudents.has(s._id) ? "checked" : ""} onchange="toggleStudent('${s._id}',this.checked)"/></td>
          <td class="sticky-col">${editingStudent === s._id ? `<input class="form-input" style="width:100%;height:24px;font-size:12px" value="${s.name}" data-field="name" data-sid="${s._id}"/>` : s.name}</td>
          <td class="mono">${s.regNo}</td>
          <td>${editingStudent === s._id ? `<input class="form-input" style="width:60px;height:24px;font-size:12px" value="${s.branch}" data-field="branch" data-sid="${s._id}"/>` : s.branch}</td>
          <td>${editingStudent === s._id ? `<select class="form-input" style="height:24px;font-size:12px" data-field="year" data-sid="${s._id}">${["1st", "2nd", "3rd", "4th"].map((y) => `<option ${s.year === y ? "selected" : ""}>${y}</option>`).join("")}</select>` : s.year}</td>
          <td>${editingStudent === s._id ? `<input class="form-input" style="width:80px;height:24px;font-size:12px" value="${s.hostel}" data-field="hostel" data-sid="${s._id}"/>` : s.hostel || "—"}</td>
          <td>${editingStudent === s._id ? `<input class="form-input" style="width:50px;height:24px;font-size:12px" value="${s.room}" data-field="room" data-sid="${s._id}"/>` : s.room || "—"}</td>
          <td>${editingStudent === s._id ? `<input class="form-input" style="width:130px;height:24px;font-size:12px" value="${s.email}" data-field="email" data-sid="${s._id}"/>` : `<span class="mono" style="font-size:11px">${s.email}</span>`}</td>
          <td>${editingStudent === s._id ? `<input class="form-input" style="width:110px;height:24px;font-size:12px" value="${s.phone||''}" data-field="phone" data-sid="${s._id}" placeholder="Phone"/>` : `<span class="mono" style="font-size:12px">${s.phone || '—'}</span>`}</td>
          <td class="mono" style="font-size:11px">${s.password}</td>
          <td>${editingStudent === s._id ? `<button class="btn btn-primary btn-sm" onclick="saveStudentEdit('${s._id}')">Save</button> <button class="btn btn-outline btn-sm" onclick="editingStudent=null;render()">✕</button>` : `<button class="btn btn-outline btn-sm" onclick="editingStudent='${s._id}';render()">✏ Edit</button>`}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table></div>
    <div class="lock-info">🔒 Meals within the 12-hour lock window are shown with a locked indicator on student portals.</div>
  </div>`;
}

// ── Download blank CSV template ──
function downloadCSVTemplate() {
  const headers = "name,regNo,branch,year,hostel,room,email,phone,password";
  const example = "John Doe,21CSE001,CSE,3rd,Block A,101,john@uni.in,9876543210,Password@123";
  const blob = new Blob([headers + "\n" + example], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "students_template.csv";
  a.click();
}

// ── Import CSV and send to backend ──
async function importCSV(input) {
  const file = input.files[0];
  if (!file) return;

  // Confirm before bulk insert
  const confirm = window.confirm(`Import "${file.name}"? This will add all valid rows to the database.`);
  if (!confirm) { input.value = ""; return; }

  const formData = new FormData();
  formData.append("csvFile", file);

  toast("Importing students...");

  try {
    const res = await fetch("http://localhost:5000/api/admin/import-students", {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (data.success) {
      toast(`✅ ${data.added} added, ${data.skipped} skipped (duplicates)`);
      if (data.errors.length > 0) {
        console.warn("Import errors:", data.errors);
        toast(`⚠️ ${data.errors.length} rows had errors — check console`, "error");
      }
      loadStudents(); // refresh table
    } else {
      toast(data.message || "Import failed", "error");
    }
  } catch (err) {
    toast("Server error during import ❌", "error");
  }

  // Reset input so same file can be re-imported if needed
  input.value = "";
}

let editingStudent = null;
async function addStudent() {
  const name = document.getElementById("sa_name").value.trim();
  const regNo = document.getElementById("sa_reg").value.trim();
  const branch = document.getElementById("sa_branch").value.trim();
  const year = document.getElementById("sa_year").value;
  const hostel = document.getElementById("sa_hostel").value.trim();
  const room = document.getElementById("sa_room").value.trim();
  const email = document.getElementById("sa_email").value.trim();
  const phone = document.getElementById("sa_phone").value.trim();
  if (!name || !regNo || !branch || !year || !email) {
    toast("Name, Reg No, Branch, Year & Email required", "error");
    return;
  }
  try {
    const response = await fetch(
      "http://localhost:5000/api/admin/add-student",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          regNo,
          branch,
          year,
          hostel,
          room,
          email,
          phone,
          password: "Password@123",
        }),
      },
    );
    const data = await response.json();
    if (response.ok) {
      toast("Student stored in database ✅");
      await loadStudentsFromDB();
    } else {
      toast(data.message, "error");
    }
  } catch (err) {
    toast("Server not reachable ❌", "error");
  }
}
async function saveStudentEdit(id) {
  const updatedData = {};
  document.querySelectorAll(`[data-sid="${id}"]`).forEach((el) => {
    updatedData[el.dataset.field] = el.value;
  });
  try {
    const response = await fetch(
      `http://localhost:5000/api/admin/update-student/${id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedData),
      },
    );
    if (response.ok) {
      toast("Student updated in database ✅");
      editingStudent = null;
      await loadStudentsFromDB();
    } else {
      toast("Update failed ❌", "error");
    }
  } catch (err) {
    toast("Server error ❌", "error");
  }
}
function toggleStudent(id, checked) {
  if (checked) selectedStudents.add(id);
  else selectedStudents.delete(id);
  render();
}
function toggleAllStudents(checked) {
  const filtered = getFilteredStudents();
  if (checked) filtered.forEach((s) => selectedStudents.add(s._id));
  else selectedStudents.clear();
  render();
}
function getFilteredStudents() {
  return Store.students.filter((s) => {
    if (studentFilters.hostel && s.hostel !== studentFilters.hostel)
      return false;
    if (studentFilters.year && s.year !== studentFilters.year) return false;
    if (studentFilters.branch && s.branch !== studentFilters.branch)
      return false;
    if (studentFilters.search) {
      const q = studentFilters.search.toLowerCase();
      if (
        !s.name.toLowerCase().includes(q) &&
        !s.regNo.toLowerCase().includes(q) &&
        !s.email.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });
}
async function bulkDeleteStudents() {
  const confirmed = await showConfirmBox(
    "Delete Students",
    `Are you sure you want to delete ${selectedStudents.size} selected student(s)?`,
  );
  if (!confirmed) return;
  try {
    for (const id of selectedStudents) {
      await fetch(`http://localhost:5000/api/admin/delete-student/${id}`, {
        method: "DELETE",
      });
    }
    toast("Students removed from database ✅");
    selectedStudents.clear();
    await loadStudentsFromDB();
  } catch (err) {
    toast("Delete failed ❌", "error");
  }
}

// ═══════════════════════════════════════
// PAGE: BILLING
// ═══════════════════════════════════════

// ── [CHANGED] billingFilters now includes `month` for month-based filtering ──
// BACKEND: When fetching bills, pass `month` as a query param, e.g.:
//   GET /api/admin/bills?hostel=Block+A&year=3rd&month=2025-04
//   The server should filter bills whose billing period matches the given YYYY-MM value.
let billingFilters = { hostel: "", year: "", month: "" };

// ── [CHANGED] getLast12Months() – generates the last 12 calendar months
// Returns array of { value: "YYYY-MM", label: "Month YYYY" } objects,
// most-recent first. Used for both the top filter dropdown and per-row month dropdowns.
// BACKEND: The `value` field ("YYYY-MM") is the canonical month identifier to send to the API.
function getLast12Months() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-IN", { month: "long", year: "numeric" });
    months.push({ value, label });
  }
  return months;
}

function renderBilling() {
  const hostels = [
    ...new Set(Store.bills.map((b) => b.hostel).filter(Boolean)),
  ];
  const years = [...new Set(Store.bills.map((b) => b.year).filter(Boolean))];

  // ── [CHANGED] Month options for top filter dropdown ──
  const monthOptions = getLast12Months();

  // ── [CHANGED] Filter logic now also checks billingFilters.month against bill.month ──
  // BACKEND NOTE: `bill.month` should be a "YYYY-MM" string stored per billing record.
  // If bill.month is not set (legacy data), the row passes the month filter by default.
  let filtered = Store.bills.filter((b) => {
    if (billingFilters.hostel && b.hostel !== billingFilters.hostel)
      return false;
    if (billingFilters.year && b.year !== billingFilters.year) return false;
    // [CHANGED] Month filter: only apply if a month is selected AND the bill has a month field
    if (billingFilters.month && b.month && b.month !== billingFilters.month)
      return false;
    return true;
  });

  return `
  <div class="space-y">
    <div class="section-title">Billing Management</div>
    <div class="filter-bar">
      <select class="form-input" onchange="billingFilters.hostel=this.value;render()"><option value="">All Hostels</option>${hostels.map((h) => `<option ${billingFilters.hostel === h ? "selected" : ""}>${h}</option>`).join("")}</select>
      <select class="form-input" onchange="billingFilters.year=this.value;render()"><option value="">All Years</option>${years.map((y) => `<option ${billingFilters.year === y ? "selected" : ""}>${y}</option>`).join("")}</select>
      <!-- [CHANGED] Month filter dropdown (last 12 months) – top of billing page -->
      <!-- BACKEND: On change, re-fetch bills with ?month=YYYY-MM from the server for accurate server-side filtering -->
      <select class="form-input" onchange="billingFilters.month=this.value;render()">
        <option value="">All Months</option>
        ${monthOptions.map((m) => `<option value="${m.value}" ${billingFilters.month === m.value ? "selected" : ""}>${m.label}</option>`).join("")}
      </select>
    </div>
    <div class="table-wrap"><table>
      <!-- [CHANGED] Added "Bill Month" column header between Status and Add Payment -->
      <thead><tr><th>Reg No</th><th>Name</th><th>Pending Mess (₹)</th><th>Pending Hostel (₹)</th><th>Balance (₹)</th><th>Status</th><th>Bill Month</th><th>Add Payment</th><th>Action</th></tr></thead>
      <tbody>${filtered
        .map((b) => {
          const totalDue = b.messBill + b.hostelBill;
          const net = b.balance - totalDue;
          // [CHANGED] Build month options for per-row dropdown, pre-selecting bill.month if set
          // BACKEND: On change, call PATCH /api/admin/bills/:id  with body { month: "YYYY-MM" }
          // to persist the month assignment for this billing record.
          const rowMonthOptions = getLast12Months();
          const monthDropdown = `
            <select class="form-input" style="height:26px;font-size:12px;min-width:130px"
              onchange="updateBillMonth(${b.id}, this.value)">
              <option value="">— Select Month —</option>
              ${rowMonthOptions.map((m) => `<option value="${m.value}" ${b.month === m.value ? "selected" : ""}>${m.label}</option>`).join("")}
            </select>`;
          return `
        <tr><td class="mono">${b.regNo}</td><td>${b.name}</td>
          <td class="mono">${b.messBill > 0 ? `<span class="text-red">₹${b.messBill.toLocaleString()}</span>` : '<span class="muted">—</span>'}</td>
          <td class="mono">${b.hostelBill > 0 ? `<span class="text-red">₹${b.hostelBill.toLocaleString()}</span>` : '<span class="muted">—</span>'}</td>
          <td class="mono">${net > 0 ? `<span class="text-green">+₹${net}</span>` : net < 0 ? `<span class="text-red">-₹${Math.abs(net)}</span>` : '<span class="muted">₹0</span>'}</td>
          <td>${net >= 0 ? '<span class="badge badge-green">Settled / Credit</span>' : '<span class="badge badge-red">Due</span>'}</td>
          <!-- [CHANGED] Per-row Bill Month dropdown inserted after Status column -->
          <td>${monthDropdown}</td>
          <td><div class="flex gap-2 items-center"><input class="form-input mono" style="width:80px;height:26px;font-size:12px" id="pay_${b.id}" placeholder="₹ amount"/><button class="btn btn-primary btn-sm" onclick="addPayment(${b.id})">Pay</button></div></td>
          <td>${totalDue > 0 ? `<button class="btn btn-primary btn-sm" onclick="clearBill(${b.id})">✓ Clear All</button>` : '<span class="muted" style="font-size:11px">Settled</span>'}</td>
        </tr>`;
        })
        .join("")}</tbody>
    </table></div>
    <div class="card mt-4"><div class="section-title">💡 How Billing Works</div>
      <ul style="font-size:12px;color:var(--fg2);list-style:disc;padding-left:18px" class="space-y-sm">
        <li><strong>Add Payment:</strong> Enter any amount the student paid. If they pay more than due, the excess becomes a positive balance (credit).</li>
        <li><strong>Clear All:</strong> Zeroes out all pending bills for that student.</li>
        <li><strong>Rate changes</strong> only affect billing from the set effective date onward — previous days are not recalculated.</li>
      </ul>
    </div>
  </div>`;
}
function addPayment(id) {
  const input = document.getElementById("pay_" + id);
  const amt = parseFloat(input?.value);
  if (!amt || amt <= 0) {
    toast("Enter a valid amount", "error");
    return;
  }
  const b = Store.bills.find((x) => x.id === id);
  if (!b) return;
  b.balance += amt;
  let remaining = amt;
  if (b.hostelBill > 0) {
    const apply = Math.min(remaining, b.hostelBill);
    b.hostelBill -= apply;
    remaining -= apply;
  }
  if (b.messBill > 0 && remaining > 0) {
    const apply = Math.min(remaining, b.messBill);
    b.messBill -= apply;
    remaining -= apply;
  }
  b.payments.push({ date: new Date().toISOString(), amount: amt });
  toast(
    `₹${amt} payment recorded` +
      (remaining > 0 ? `. ₹${remaining} credit added.` : ""),
  );
  render();
}
function clearBill(id) {
  const b = Store.bills.find((x) => x.id === id);
  if (!b) return;
  b.messBill = 0;
  b.hostelBill = 0;
  toast("All bills cleared for " + b.name);
  render();
}

// ── [CHANGED] updateBillMonth – saves the selected billing month for a record ──
// Updates the local Store immediately for instant UI feedback, then persists to backend.
// BACKEND: PATCH /api/admin/bills/:id
//   Request body (JSON): { month: "YYYY-MM" }
//   Response: { success: true, bill: { id, month, ... } }
//   The `month` field on the Bill model should be a String (e.g. "2025-04").
//   Index this field for efficient filtering: db.bills.createIndex({ month: 1 })
async function updateBillMonth(id, month) {
  const b = Store.bills.find((x) => x.id === id);
  if (!b) return;

  // Optimistic local update
  b.month = month;

  if (!month) return; // No need to persist an empty/cleared selection

  try {
    const res = await fetch(`http://localhost:5000/api/admin/bills/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });
    if (!res.ok) {
      toast("Failed to save bill month ❌", "error");
    } else {
      toast(`Bill month set to ${month} ✅`);
    }
  } catch (err) {
    toast("Server error while saving month ❌", "error");
  }
}

// ═══════════════════════════════════════
// PAGE: LEAVE APPROVAL
// ═══════════════════════════════════════
function renderLeave() {
  // Store.leaves       = pending requests  (from /api/admin/leaves/pending)
  // Store.processedLeaves = approved/rejected (from /api/admin/leaves/processed)
  const pending   = Store.leaves;
  const processed = Store.processedLeaves || [];
  return `
  <div class="space-y">
    <div class="section-title">Leave Approval — Pending (${pending.length})</div>
    ${
      pending.length === 0
        ? '<div class="card"><p class="muted" style="font-size:13px">No pending requests 🎉</p></div>'
        : `
    <div class="table-wrap"><table>
      <thead><tr><th>Reg No</th><th>Name</th><th>From</th><th>To</th><th>Days</th><th>Actions</th></tr></thead>
      <tbody>${pending
        .map(l => {
          const days = Math.floor((new Date(l.to) - new Date(l.from)) / 86400000) + 1;
          return `
        <tr>
          <td class="mono">${l.regNo || "—"}</td>
          <td>${l.name || l.studentId}</td>
          <td class="mono">${new Date(l.from).toLocaleDateString("en-IN")}</td>
          <td class="mono">${new Date(l.to).toLocaleDateString("en-IN")}</td>
          <td class="mono">${days} day${days > 1 ? "s" : ""}</td>
          <td class="flex gap-2">
            <button class="btn btn-primary btn-sm" onclick="approveLeave('${l._id}')">✓ Approve</button>
            <button class="btn btn-red btn-sm"     onclick="rejectLeave('${l._id}')">✕ Reject</button>
          </td>
        </tr>`;
        })
        .join("")}</tbody>
    </table></div>`
    }
    ${
      processed.length > 0
        ? `
    <div class="section-title mt-4">Processed Requests</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Reg No</th><th>Name</th><th>From</th><th>To</th><th>Days</th><th>Status</th></tr></thead>
      <tbody>${processed
        .map(l => {
          const days = Math.floor((new Date(l.to) - new Date(l.from)) / 86400000) + 1;
          return `
        <tr>
          <td class="mono">${l.regNo || "—"}</td>
          <td>${l.name || l.studentId}</td>
          <td class="mono">${new Date(l.from).toLocaleDateString("en-IN")}</td>
          <td class="mono">${new Date(l.to).toLocaleDateString("en-IN")}</td>
          <td class="mono">${days} day${days > 1 ? "s" : ""}</td>
          <td>${l.status === "approved"
            ? '<span class="badge badge-green">Approved</span>'
            : '<span class="badge badge-red">Rejected</span>'}</td>
        </tr>`;
        })
        .join("")}</tbody>
    </table></div>`
        : ""
    }
    <div class="lock-info">✅ Approved leaves deduct the meals from billing. Rejected requests are permanently deleted.</div>
  </div>`;
}

async function approveLeave(id) {
  // id is a MongoDB ObjectId string passed from onclick
  const l = Store.leaves.find(x => String(x._id) === String(id));
  if (!l) { toast("Request not found ❌", "error"); return; }
  try {
    const res = await fetch(`http://localhost:5000/api/admin/leaves/${l._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approved" })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      toast("Leave approved for " + (l.name || l.studentId) + " ✅");
      await loadLeavesFromDB();
    } else {
      toast(data.error || "Failed to approve ❌", "error");
    }
  } catch (err) {
    console.error("Approve error:", err);
    toast("Server error ❌", "error");
  }
}

async function rejectLeave(id) {
  const l = Store.leaves.find(x => String(x._id) === String(id));
  if (!l) { toast("Request not found ❌", "error"); return; }
  try {
    const res = await fetch(`http://localhost:5000/api/admin/leaves/${l._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rejected" })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      toast("Leave request rejected and deleted 🗑️");
      await loadLeavesFromDB();
    } else {
      toast(data.error || "Failed to reject ❌", "error");
    }
  } catch (err) {
    console.error("Reject error:", err);
    toast("Server error ❌", "error");
  }
}

// ═══════════════════════════════════════
// PAGE: NOTICES (server-connected from admin1.js)
// ═══════════════════════════════════════
function renderNotices() {
  return `
  <div class="space-y">
    <div class="card">
      <div class="section-title">📢 Post New Notice</div>
      <div class="form-row"><div class="form-group" style="flex:1"><label>Content</label><textarea class="form-input" id="noticeText" rows="3" placeholder="Write announcement..."></textarea></div></div>
      <div class="flex gap-2 mt-2 items-center">
        <input type="file" accept=".pdf,.doc,.docx" id="noticeFile" style="display:none"/>
<button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('noticeFile').click()">📎 Attach PDF</button>
        <span id="noticeFileName" style="font-size:11px;color:var(--fg2)"></span>
        <button type="button" class="btn btn-primary ml-auto" id="postNoticeBtn">Post Notice</button>
      </div>
    </div>
    <div class="section-title">Notice Archive</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Content</th><th>Attachment</th><th>Action</th></tr></thead>
      <tbody id="noticeTableBody">${Store.notices
        .map(
          (n) => `
        <tr><td class="mono" style="font-size:12px">${formatDate(n.date)}</td>
          <td style="white-space:normal;max-width:400px">${n.content}</td>
          <td>${n.attachment ? `<a href="http://localhost:5000/uploads/${n.attachment}" target="_blank" class="badge badge-green">📎 View</a>` : '<span class="muted">None</span>'}</td>
          <td><button class="btn btn-red btn-sm" onclick="retractNotice('${n._id}')">🗑 Retract</button></td>
        </tr>`,
        )
        .join("")}</tbody>
    </table></div>
  </div>`;
}
async function loadNoticesFromDB() {
  try {
    const res = await fetch("http://localhost:5000/api/admin/notices");
    const data = await res.json();
    Store.notices = data.map((n) => ({
      _id: n._id,
      date: n.createdAt,
      content: n.content,
      attachment: n.attachment,
    }));
    if (currentPage === "notices") {
      updateNoticeTable();
    }
  } catch (err) {
    toast("Failed to load notices ❌", "error");
  }
}
async function postNotice(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  } // ← add stopPropagation
  const textarea = document.getElementById("noticeText");
  const fileInput = document.getElementById("noticeFile");
  const text = textarea ? textarea.value.trim() : "";
  if (!text) {
    toast("Notice content is required", "error");
    return;
  }
  const formData = new FormData();
  formData.append("content", text);
  if (fileInput && fileInput.files.length > 0) {
    formData.append("attachment", fileInput.files[0]);
  }
  try {
    const response = await fetch("http://localhost:5000/api/admin/add-notice", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (response.ok) {
      toast("Notice posted successfully ✅");
      textarea.value = "";
      if (fileInput) fileInput.value = "";
      const span = document.getElementById("noticeFileName");
      if (span) span.textContent = ""; // ← clear filename display too
      await loadNoticesFromDB(); // this calls updateNoticeTable(), not render()
      navigate("notices"); // ensure we're on the notices page to see the update
    } else {
      toast(data.message || "Failed to post notice", "error");
    }
  } catch (err) {
    toast("Server error ❌", "error");
  }
}
async function retractNotice(id) {
  const confirmed = await showConfirmBox(
    "Retract Notice",
    "Are you sure you want to permanently delete this notice?",
  );
  if (!confirmed) return;
  try {
    await fetch(`http://localhost:5000/api/admin/delete-notice/${id}`, {
      method: "DELETE",
    });
    toast("Notice removed ✅");
    await loadNoticesFromDB();
  } catch (err) {
    toast("Delete failed ❌", "error");
  }
}
function updateNoticeTable() {
  const tbody = document.querySelector("#noticeTableBody");
  if (!tbody) return;
  tbody.innerHTML = Store.notices
    .map(
      (n) => `
    <tr><td class="mono" style="font-size:12px">${formatDate(n.date)}</td>
      <td style="white-space:normal;max-width:400px">${n.content}</td>
      <td>${n.attachment ? `<a href="http://localhost:5000/uploads/${n.attachment}" target="_blank" class="badge badge-green">📎 View</a>` : '<span class="muted">None</span>'}</td>
      <td><button class="btn btn-red btn-sm" onclick="retractNotice('${n._id}')">🗑 Retract</button></td>
    </tr>`,
    )
    .join("");
}

async function loadHostelsFromDB() {
  try {
    const res = await fetch("http://localhost:5000/api/admin/hostels");
    const data = await res.json();
    Store.hostels = data.map(h => ({ ...h, id: h._id }));
    if (currentPage === "hostel") render();
  } catch (err) {
    toast("Failed to load hostels ❌", "error");
  }
}

async function loadBilling() {
  const content = document.getElementById("content");
  content.innerHTML = `
    <div class="card">
      <div class="section-title">Student Billing Records</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Month/Year</th>
              <th>Total Bill</th>
              <th>Status</th>
              <th>Date Created</th>
            </tr>
          </thead>
          <tbody id="admin-billing-body">
            <tr><td colspan="5">Loading records...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  try {
    const res = await fetch("http://localhost:5000/api/admin/billing/all");
    const data = await res.json();
    
    const tbody = document.getElementById("admin-billing-body");
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">No billing records found.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(bill => `
      <tr>
        <td class="mono">${bill.studentId}</td>
        <td>${bill.month}/${bill.year}</td>
        <td class="text-green">₹${bill.totalBill}</td>
        <td><span class="badge ${bill.status === 'Paid' ? 'badge-green' : 'badge-amber'}">${bill.status}</span></td>
        <td class="muted">${new Date(bill.createdAt).toLocaleDateString()}</td>
      </tr>
    `).join("");

  } catch (err) {
    toast("Failed to load billing data", "error");
  }
}

// ═══════════════════════════════════════
// PAGE: VENDORS
// ═══════════════════════════════════════
async function loadVendorsFromDB() {
  try {
    const res = await fetch("http://localhost:5000/api/admin/vendors");
    const data = await res.json();

    Store.vendors = data.map(v => {
      if(v.tenure && v.tenure.includes('|')) {
        const parts = v.tenure.split('|');
        v.contractStart = parts[0];
        v.tenure = parts[1];
      }
      return v;
    });
    if (currentPage === "vendors") render();
  } catch (err) {
    toast("Failed to load vendors ❌", "error");
  }
}
let showVendorForm = false;
function renderVendors() {
  return `
  <div class="space-y">
    <div class="flex justify-between items-center">
      <div class="section-title" style="margin:0">Vendor Management</div>
      <button class="btn btn-primary btn-sm" onclick="showVendorForm=!showVendorForm;render()">${showVendorForm ? "✕ Close Form" : "+ Register Vendor"}</button>
    </div>
    ${
      showVendorForm
        ? `
    <div class="card">
      <div class="section-title">Register New Vendor</div>
      <div class="form-row">
        <div class="form-group"><label>Vendor Name</label><input class="form-input" id="vName"/></div>
        <div class="form-group"><label>Phone</label><input class="form-input" id="vPhone"/></div>
        <div class="form-group"><label>Email</label><input class="form-input" id="vEmail"/></div>
        <div class="form-group"><label>Aadhaar No.</label><input class="form-input" id="vAadhaar"/></div>
      </div>
      <div class="form-row mt-2">
      // modified by jade
        <div class="form-group"><label>Contract Start</label><input type="date" class="form-input" id="vStartDate"/></div>
        <div class="form-group"><label>Contract Until</label><input type="date" class="form-input" id="vTenure"/></div>
        <div class="form-group"><label>Assigned Hostel</label><input class="form-input" id="vHostel" placeholder="Block A"/></div>
        <div class="form-group">
          <label>Contract PDF</label>
          <div style="display:flex;align-items:center;gap:8px">
            <label class="btn btn-outline btn-sm" style="cursor:pointer;margin:0;white-space:nowrap">
              📎 Upload PDF
              <input type="file" id="vContract" accept=".pdf" style="display:none" onchange="document.getElementById('vContractName').textContent=this.files[0]?.name||''"/>
            </label>
            <span id="vContractName" style="font-size:11px;color:var(--fg2);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
          </div>
        </div>
        <div class="form-group" style="align-self:flex-end"><button class="btn btn-primary" onclick="addVendor()">Register</button></div>
      </div>
    </div>`
        : ""
    }
    <div class="table-wrap"><table>
    // modified by jade
      <thead><tr><th>Vendor</th><th>Phone</th><th>Email</th><th>Aadhaar</th><th>Hostel</th><th>Contract Start</th><th>Contract Until</th><th>Days Left</th><th>Rating</th><th>Attachment</th><th>Password</th><th>Actions</th></tr></thead>
      <tbody id="vendorTableBody">${Store.vendors
        .map((v) => vendorRow(v))
        .join("")}</tbody>
    </table></div>
  </div>`;
}
function vendorRow(v) {
  return `
  <tr id="vrow_${v._id}">
    <td><strong>${v.name}</strong></td>
    <td class="mono">${v.phone}</td>
    <td class="mono" style="font-size:11px">${v.email}</td>
    <td class="mono">${v.aadhaar}</td>
    dified by jade
    <td>${v.hostel}</td><td class="mono">${v.contractStart ? formatDate(v.contractStart) : '—'}</td><td class="mono">${v.tenure ? formatDate(v.tenure) : '—'}</td>
    <td class="mono">${daysRemaining(v.tenure)}</td>
    <td>${renderStars(v.rating)}</td>
    <td>${v.contract
      ? `<a href="http://localhost:5000/uploads/${v.contract}" target="_blank" class="btn btn-outline btn-sm" style="display:inline-flex;align-items:center;gap:4px;text-decoration:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> View</a>`
      : '<span class="muted" style="font-size:12px">—</span>'}</td>
      <td class="mono" style="font-size:11px">${v.password || 'Password@123'}</td>
    <td><div class="flex gap-2 flex-wrap">
      <button class="btn btn-outline btn-sm" onclick="toggleEditRow('${v._id}')">✏ Update</button>
      <button class="btn btn-red btn-sm" onclick="terminateVendor('${v._id}')">Early Term.</button>
      <button class="btn btn-amber btn-sm" onclick="resetRating('${v._id}')">↺ Reset</button>
    </div></td>
  </tr>
  <tr id="vedit_${v._id}" style="display:none;background:var(--primary-light) !important;border-left:3px solid var(--primary)">
    <td><input class="form-input" id="ename_${v._id}"    value="${v.name}"          style="width:100%;min-width:90px"/></td>
    <td><input class="form-input mono" id="ephone_${v._id}"  value="${v.phone}"     style="width:100%;min-width:100px"/></td>
    <td><input class="form-input mono" id="eemail_${v._id}"  value="${v.email}"     style="width:100%;min-width:140px;font-size:11px"/></td>
    <td><input class="form-input mono" id="eaadhaar_${v._id}" value="${v.aadhaar}"  style="width:100%;min-width:110px"/></td>
    <td><input class="form-input" id="ehostel_${v._id}"  value="${v.hostel}"        style="width:100%;min-width:80px"/></td>

    <td><input type="date" class="form-input" id="estart_${v._id}" value="${v.contractStart || ''}" style="width:100%;min-width:130px"/></td>
    <td><input type="date" class="form-input" id="etenure_${v._id}" value="${v.tenure || ''}" style="width:100%;min-width:130px"/></td>
    <td>—</td>
    <td>
      <div style="display:flex;flex-direction:column;gap:4px;min-width:130px">
        <label class="btn btn-outline btn-sm" style="cursor:pointer;margin:0;white-space:nowrap;font-size:11px">
          📎 ${v.contract ? 'Replace PDF' : 'Upload PDF'}
          <input type="file" id="econtract_${v._id}" accept=".pdf" style="display:none"
            onchange="document.getElementById('econname_${v._id}').textContent=this.files[0]?.name||''"/>
        </label>
        <span id="econname_${v._id}" style="font-size:10px;color:var(--fg2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.contract ? '✓ Contract on file' : ''}</span>
      </div>
    </td>

    <td class="mono" style="font-size:11px;color:var(--fg2)">Password@123</td>
    <td colspan="2"><div class="flex gap-2">
      <button class="btn btn-primary btn-sm" onclick="saveVendor('${v._id}')">💾 Save</button>
      <button class="btn btn-outline btn-sm" onclick="toggleEditRow('${v._id}')">✕</button>
    </div></td>
  </tr>`;
}
function toggleEditRow(id) {
  const editRow = document.getElementById("vedit_" + id);
  if (!editRow) return;
  const isHidden = editRow.style.display === "none";
  editRow.style.display = isHidden ? "table-row" : "none";
}
async function saveVendor(id) {
  const name    = document.getElementById("ename_"   + id)?.value.trim();
  const phone   = document.getElementById("ephone_"  + id)?.value.trim();
  const email   = document.getElementById("eemail_"  + id)?.value.trim();
  const aadhaar = document.getElementById("eaadhaar_"+ id)?.value.trim();
  // modified by jade
  const hostel  = document.getElementById("ehostel_" + id)?.value.trim();
  const tenureStart = document.getElementById("estart_" + id)?.value;
  const tenureEnd  = document.getElementById("etenure_" + id)?.value;
  const tenure = (tenureStart || tenureEnd) ? `${tenureStart || ''}|${tenureEnd || ''}` : '';

  if (!name || !phone) {
    toast("Name and phone are required", "error");
    return;
  }

  const contractInput = document.getElementById("econtract_" + id);
  const hasNewFile = contractInput && contractInput.files[0];

  // If there's a new PDF, use FormData; otherwise send JSON as before
  if (hasNewFile) {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("phone", phone);
    formData.append("email", email);
    formData.append("aadhaar", aadhaar);
    formData.append("hostel", hostel);
    formData.append("tenure", tenure);
    formData.append("contract", contractInput.files[0]);
    try {
      const res = await fetch(`http://localhost:5000/api/admin/vendors/${id}`, {
        method: "PATCH",
        body: formData
      });
      if (!res.ok) { toast("Failed to update vendor ❌", "error"); return; }
      toast("Vendor updated with new contract ✅");
      await loadVendorsFromDB();
    } catch (err) {
      toast("Server error ❌", "error");
    }
  } else {
    try {
      const res = await fetch(`http://localhost:5000/api/admin/vendors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, aadhaar, hostel, tenure })
      });
      if (!res.ok) { toast("Failed to update vendor ❌", "error"); return; }
      toast("Vendor updated ✅");
      await loadVendorsFromDB();
    } catch (err) {
      toast("Server error ❌", "error");
    }
  }
}
async function addVendor() {
  const name = document.getElementById("vName").value.trim();
  const phone = document.getElementById("vPhone").value.trim();
  const email = document.getElementById("vEmail").value.trim();
  const aadhaar = document.getElementById("vAadhaar").value.trim();
  // modified by jade
  const tenureStart = document.getElementById("vStartDate").value;
  const tenureEnd = document.getElementById("vTenure").value;
  const tenure = (tenureStart || tenureEnd) ? `${tenureStart || ''}|${tenureEnd || ''}` : '';
  const hostel = document.getElementById("vHostel").value.trim();

  if (!name || !phone) {
    toast("Vendor name and phone required", "error");
    return;
  }

  const formData = new FormData();
  formData.append("name", name);
  formData.append("phone", phone);
  formData.append("email", email);
  formData.append("aadhaar", aadhaar);
  formData.append("tenure", tenure);
  formData.append("hostel", hostel);
  const contractInput = document.getElementById("vContract");
  if (contractInput && contractInput.files[0]) {
    formData.append("contract", contractInput.files[0]);
  }

  try {
    const res = await fetch("http://localhost:5000/api/admin/vendors", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.message || "Failed to register vendor", "error");
      return;
    }
    showVendorForm = false;
    toast("Vendor registered ✅");
    await loadVendorsFromDB();
  } catch (err) {
    toast("Server error ❌", "error");
  }
}
async function terminateVendor(id) {
  const confirmed = await showConfirmBox(
    "Terminate Vendor",
    "Are you sure you want to terminate this vendor's contract early?",
  );
  if (!confirmed) return;

  const deleted = Store.vendors.find((v) => v._id === id);
  try {
    await fetch(`http://localhost:5000/api/admin/vendors/${id}`, { method: "DELETE" });
    Store.vendors = Store.vendors.filter((v) => v._id !== id);
    render();
    showUndoToast("Vendor contract terminated", async () => {
      // Re-register the deleted vendor to restore it
      const formData = new FormData();
      // modified by jade
      const combinedTenure = (deleted.contractStart || deleted.tenure) ? `${deleted.contractStart || ''}|${deleted.tenure || ''}` : '';
      ["name","phone","email","aadhaar","hostel"].forEach(k => formData.append(k, deleted[k] || ""));
      formData.append("tenure", combinedTenure);
      await fetch("http://localhost:5000/api/admin/vendors", { method: "POST", body: formData });
      await loadVendorsFromDB();
    });
  } catch (err) {
    toast("Failed to terminate vendor ❌", "error");
  }
}
async function resetRating(id) {
  try {
    await fetch(`http://localhost:5000/api/admin/vendors/${id}/rating`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 0 })
    });
    const v = Store.vendors.find((x) => x._id === id);
    if (v) v.rating = 0;
    toast("Rating reset");
    render();
  } catch (err) {
    toast("Failed to reset rating ❌", "error");
  }
}

// ═══════════════════════════════════════
// PAGE: HOSTEL MANAGEMENT
// ═══════════════════════════════════════
let showHostelForm = false;
let _hostelAddMenuFile = null;
function renderHostel() {
  const phoneIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.77 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
  const cards = Store.hostels.length === 0
    ? `<p class="muted" style="font-size:13px">No hostels added yet.</p>`
    : Store.hostels.map((h) => {
      const wardens = h.wardens || (h.warden ? [h.warden] : []);
      const caretakers = h.caretakers || [];
      return `
      <div class="hcv2-card" id="hcard_${h._id}">
        <div class="hcv2-header"><span class="hcv2-dot"></span><span class="hcv2-name">${h.name}</span></div>
        ${h.description ? `<p class="hcv2-desc">${h.description}</p>` : ''}
        <div class="hcv2-capacity">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Capacity: ${h.capacity || '—'} students
        </div>
        <div class="hcv2-section">
          <div class="hcv2-section-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>WARDEN(S)</div>
          ${wardens.map(w => `<div class="hcv2-person-name">${w.name}</div><div class="hcv2-person-phone">${phoneIcon} ${w.phone}</div>`).join('')}
        </div>
        ${caretakers.length > 0 ? `
        <div class="hcv2-section">
          <div class="hcv2-section-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>CARETAKER(S)</div>
          ${caretakers.map(c => `<div class="hcv2-person-name">${c.name}</div><div class="hcv2-person-phone">${phoneIcon} ${c.phone}</div>`).join('')}
        </div>` : ''}
        <div class="hcv2-section">
          <div class="hcv2-section-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>MESS VENDOR</div>
          <div class="hcv2-person-name">${h.messVendor.name}</div>
          <div class="hcv2-person-phone">${phoneIcon} ${h.messVendor.phone}</div>
        </div>
        <div class="hcv2-actions">
          ${h.messMenuImage ? `<button class="btn btn-outline btn-sm hcv2-menu-btn" onclick="showMenuPopup('${h._id}')">🍽 View Menu</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="openEditHostelModal('${h._id}')">✏ Edit</button>
          <button class="btn btn-red btn-sm" onclick="deleteHostelCard('${h._id}')">🗑 Remove</button>
        </div>
      </div>`;
    }).join('');

  const addFormHtml = showHostelForm ? `
    <div class="card hostel-add-form">
      <div class="section-title">🏠 Add New Hostel</div>
      <div class="form-row">
        <div class="form-group" style="flex:2"><label>Hostel Name</label><input class="form-input" id="hf_name" placeholder="Hostel-1 (Boys)"/></div>
        <div class="form-group" style="width:100px"><label>Capacity</label><input type="number" class="form-input" id="hf_capacity" placeholder="250"/></div>
      </div>
      <div class="form-group mt-2"><label>Description</label><textarea class="form-input" id="hf_desc" rows="2" placeholder="Brief description..."></textarea></div>
      <div class="hcv2-form-section-title">Warden(s)</div>
      <div id="hf_warden_list">
        <div class="form-row hf-person-row">
          <div class="form-group" style="flex:1"><label>Name</label><input class="form-input hf-warden-name" placeholder="Dr. Full Name"/></div>
          <div class="form-group"><label>Phone</label><input class="form-input hf-warden-phone" placeholder="98XXXXXXXX"/></div>
        </div>
      </div>
      <button type="button" class="btn btn-outline btn-sm mt-2" onclick="addHostelPersonRow('hf_warden_list','hf-warden-name','hf-warden-phone','Warden')">+ Add Another Warden</button>
      <div class="hcv2-form-section-title">Caretaker(s)</div>
      <div id="hf_caretaker_list">
        <div class="form-row hf-person-row">
          <div class="form-group" style="flex:1"><label>Name</label><input class="form-input hf-caretaker-name" placeholder="Mr. Full Name"/></div>
          <div class="form-group"><label>Phone</label><input class="form-input hf-caretaker-phone" placeholder="98XXXXXXXX"/></div>
        </div>
      </div>
      <button type="button" class="btn btn-outline btn-sm mt-2" onclick="addHostelPersonRow('hf_caretaker_list','hf-caretaker-name','hf-caretaker-phone','Caretaker')">+ Add Another Caretaker</button>
      <div class="hcv2-form-section-title">Mess Vendor</div>
      <div class="form-row">
        <div class="form-group" style="flex:1"><label>Vendor Name</label><input class="form-input" id="hf_vendor_name" placeholder="Sri Balaji Caterers"/></div>
        <div class="form-group"><label>Phone</label><input class="form-input" id="hf_vendor_phone" placeholder="98XXXXXXXX"/></div>
      </div>
      <div class="hcv2-form-section-title">Mess Menu</div>
      <div class="hcv2-menu-upload-row">
        <label class="hcv2-menu-upload-label" for="hf_menu_file"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>Upload Menu Image</label>
        <input type="file" id="hf_menu_file" accept="image/*" style="display:none" onchange="previewHostelMenuFile(this,'hf_menu_preview','hf_menu_name')"/>
        <span id="hf_menu_name" class="muted" style="font-size:12px">No file chosen</span>
      </div>
      <img id="hf_menu_preview" src="" alt="Menu Preview" style="display:none;max-width:200px;max-height:140px;object-fit:contain;border:1px solid var(--border);border-radius:6px;margin-top:6px"/>
      <div class="flex gap-2 mt-2" style="margin-top:14px">
        <button class="btn btn-primary" onclick="addHostel()">+ Add Hostel</button>
        <button class="btn btn-outline" onclick="showHostelForm=false;_hostelAddMenuFile=null;render()">Cancel</button>
      </div>
    </div>` : '';

  return `
  <div class="space-y">
    <div class="flex justify-between items-center flex-wrap gap-2">
      <div class="section-title" style="margin:0">Hostel Directory (${Store.hostels.length})</div>
      <button class="btn btn-primary btn-sm" onclick="showHostelForm=!showHostelForm;_hostelAddMenuFile=null;render()">${showHostelForm ? '✕ Close Form' : '+ Add Hostel'}</button>
    </div>
    ${addFormHtml}
    <div class="hcv2-grid">${cards}</div>
    <div class="lock-info">🏨 Hostel info is display-only for students. Only admins can modify warden, caretaker and vendor details.</div>
  </div>`;
}
function addHostelPersonRow(listId, nameClass, phoneClass, role) {
  const container = document.getElementById(listId);
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'form-row hf-person-row mt-2';
  row.innerHTML = `
    <div class="form-group" style="flex:1"><label>Name</label><input class="form-input ${nameClass}" placeholder="${role === 'Warden' ? 'Dr.' : 'Mr.'} Full Name"/></div>
    <div class="form-group"><label>Phone</label><input class="form-input ${phoneClass}" placeholder="98XXXXXXXX"/></div>
    <button type="button" title="Remove" style="align-self:flex-end;margin-bottom:0;background:none;border:none;color:var(--red,#e53e3e);cursor:pointer;font-size:16px;padding:0 4px;line-height:1" onclick="this.closest('.hf-person-row').remove()">&#x2715;</button>`;
  container.appendChild(row);
}
function addHostelPersonRowToEl(container, nameClass, phoneClass, role) {
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'form-row hf-person-row';
  row.style.marginBottom = '6px';
  row.innerHTML = `
    <div class="form-group" style="flex:1"><input class="form-input ${nameClass}" placeholder="${role === 'Warden' ? 'Dr.' : 'Mr.'} Full Name"/></div>
    <div class="form-group"><input class="form-input ${phoneClass}" placeholder="98XXXXXXXX"/></div>
    <button type="button" title="Remove" style="align-self:flex-end;margin-bottom:0;background:none;border:none;color:var(--red,#e53e3e);cursor:pointer;font-size:16px;padding:0 4px;line-height:1" onclick="this.closest('.hf-person-row').remove()">&#x2715;</button>`;
  container.appendChild(row);
}
function collectPersonRows(listId, nameClass, phoneClass) {
  const names = document.querySelectorAll(`#${listId} .${nameClass}`);
  const phones = document.querySelectorAll(`#${listId} .${phoneClass}`);
  const result = [];
  names.forEach((el, i) => {
    const name = el.value.trim();
    if (name) result.push({ name, phone: phones[i]?.value.trim() || '—' });
  });
  return result;
}
async function addHostel() {
  const name = document.getElementById('hf_name')?.value.trim();
  const capacity = document.getElementById('hf_capacity')?.value;
  const description = document.getElementById('hf_desc')?.value.trim();
  const vendorName = document.getElementById('hf_vendor_name')?.value.trim();
  const vendorPhone = document.getElementById('hf_vendor_phone')?.value.trim();
  const wardens = collectPersonRows('hf_warden_list', 'hf-warden-name', 'hf-warden-phone');
  const caretakers = collectPersonRows('hf_caretaker_list', 'hf-caretaker-name', 'hf-caretaker-phone');

  if (!name || wardens.length === 0 || !vendorName) {
    toast('Hostel name, at least one warden, and vendor name are required', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('name', name);
  formData.append('capacity', capacity || 0);
  formData.append('description', description || '');
  formData.append('wardens', JSON.stringify(wardens));
  formData.append('caretakers', JSON.stringify(caretakers));
  formData.append('messVendor', JSON.stringify({ name: vendorName, phone: vendorPhone || '—' }));

  const menuFile = document.getElementById('hf_menu_file')?.files[0];
  if (menuFile) formData.append('messMenuImage', menuFile);

  try {
    const res = await fetch('http://localhost:5000/api/admin/hostels', {
      method: 'POST',
      body: formData   // ⚠️ No Content-Type header — browser handles it for FormData
    });
    const data = await res.json();
    if (!res.ok) { toast(data.message || 'Failed to add hostel ❌', 'error'); return; }
    showHostelForm = false;
    _hostelAddMenuFile = null;
    toast('Hostel added and saved to database ✅');
    await loadHostelsFromDB();
  } catch (err) {
    toast('Server error ❌', 'error');
  }
}
function openEditHostelModal(id) {
  const h = Store.hostels.find((x) => x._id === id || x.id === id);
  if (!h) return;
  const wardens = h.wardens || (h.warden ? [h.warden] : []);
  const caretakers = h.caretakers || [];
  const buildRows = (people, nameClass, phoneClass) =>
    people.map(p => `
      <div class="form-row hf-person-row" style="margin-bottom:6px">
        <div class="form-group" style="flex:1"><input class="form-input ${nameClass}" value="${p.name}" placeholder="Full Name"/></div>
        <div class="form-group"><input class="form-input ${phoneClass}" value="${p.phone}" placeholder="98XXXXXXXX"/></div>
        <button type="button" title="Remove" style="align-self:flex-end;margin-bottom:0;background:none;border:none;color:var(--red,#e53e3e);cursor:pointer;font-size:16px;padding:0 4px;line-height:1" onclick="this.closest('.hf-person-row').remove()">&#x2715;</button>
      </div>`).join('');
  const wardenRows = buildRows(wardens.length > 0 ? wardens : [{ name: '', phone: '' }], 'em-warden-name', 'em-warden-phone');
  const caretakerRows = buildRows(caretakers.length > 0 ? caretakers : [{ name: '', phone: '' }], 'em-caretaker-name', 'em-caretaker-phone');
  let _editMenuFile = null;
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box" style="max-width:540px;text-align:left;max-height:88vh;overflow-y:auto">
      <div class="confirm-title" style="margin-bottom:14px">Edit Hostel Details</div>
      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group" style="flex:2"><label style="font-size:11px;font-weight:600;color:var(--fg2)">Hostel Name</label><input class="form-input" id="em_name" value="${h.name}" style="width:100%"/></div>
        <div class="form-group" style="width:90px"><label style="font-size:11px;font-weight:600;color:var(--fg2)">Capacity</label><input type="number" class="form-input" id="em_capacity" value="${h.capacity || ''}"/></div>
      </div>
      <div class="form-group" style="margin-bottom:10px"><label style="font-size:11px;font-weight:600;color:var(--fg2)">Description</label><textarea class="form-input" id="em_desc" rows="2" style="width:100%">${h.description || ''}</textarea></div>
      <div class="hcv2-form-section-title" style="margin:8px 0 6px">Warden(s)</div>
      <div id="em_warden_list">${wardenRows}</div>
      <button type="button" class="btn btn-outline btn-sm mt-2" onclick="addHostelPersonRowToEl(document.getElementById('em_warden_list'),'em-warden-name','em-warden-phone','Warden')">+ Add Warden</button>
      <div class="hcv2-form-section-title" style="margin:10px 0 6px">Caretaker(s)</div>
      <div id="em_caretaker_list">${caretakerRows}</div>
      <button type="button" class="btn btn-outline btn-sm mt-2" onclick="addHostelPersonRowToEl(document.getElementById('em_caretaker_list'),'em-caretaker-name','em-caretaker-phone','Caretaker')">+ Add Caretaker</button>
      <div class="hcv2-form-section-title" style="margin:10px 0 6px">Mess Vendor</div>
      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group" style="flex:1"><label style="font-size:11px;font-weight:600;color:var(--fg2)">Vendor Name</label><input class="form-input" id="em_vname" value="${h.messVendor.name}"/></div>
        <div class="form-group"><label style="font-size:11px;font-weight:600;color:var(--fg2)">Phone</label><input class="form-input" id="em_vphone" value="${h.messVendor.phone}"/></div>
      </div>
      <div class="hcv2-form-section-title" style="margin:8px 0 6px">Mess Menu</div>
      <div class="hcv2-menu-upload-row">
        <label class="hcv2-menu-upload-label" for="em_menu_file"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>${h.messMenuImage ? 'Replace Menu Image' : 'Upload Menu Image'}</label>
        <input type="file" id="em_menu_file" accept="image/*" style="display:none"/>
        <span id="em_menu_name" class="muted" style="font-size:12px">${h.messMenuImage ? 'Menu uploaded ✓' : 'No file chosen'}</span>
      </div>
      ${h.messMenuImage ? `<img src="http://localhost:5000${h.messMenuImage}" id="em_menu_preview" alt="Current Menu" style="max-width:180px;max-height:120px;object-fit:contain;border:1px solid var(--border);border-radius:6px;margin-top:6px"/>` : `<img id="em_menu_preview" src="" alt="Menu Preview" style="display:none;max-width:180px;max-height:120px;object-fit:contain;border:1px solid var(--border);border-radius:6px;margin-top:6px"/>`}
      <div class="confirm-actions" style="margin-top:16px">
        <button class="btn btn-outline" id="em_cancel">Cancel</button>
        <button class="btn btn-primary" id="em_save">Save Changes</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));
  const close = () => { overlay.classList.remove('active'); setTimeout(() => overlay.remove(), 200); };
  document.getElementById('em_menu_file').addEventListener('change', (evt) => {
    const f = evt.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (e) => {
      _editMenuFile = e.target.result;
      const preview = document.getElementById('em_menu_preview');
      const nameEl = document.getElementById('em_menu_name');
      if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
      if (nameEl) nameEl.textContent = f.name;
    };
    r.readAsDataURL(f);
  });
  document.getElementById('em_cancel').onclick = close;
  document.getElementById('em_save').onclick = async () => {
  const updatedName = document.getElementById('em_name').value.trim() || h.name;
  const updatedCapacity = document.getElementById('em_capacity').value;
  const updatedDesc = document.getElementById('em_desc').value.trim();
  const nw = collectPersonRows('em_warden_list', 'em-warden-name', 'em-warden-phone');
  const nc = collectPersonRows('em_caretaker_list', 'em-caretaker-name', 'em-caretaker-phone');
  const updatedVendorName = document.getElementById('em_vname').value.trim();
  const updatedVendorPhone = document.getElementById('em_vphone').value.trim();

  const formData = new FormData();
  formData.append('name', updatedName);
  formData.append('capacity', updatedCapacity || 0);
  formData.append('description', updatedDesc);
  formData.append('wardens', JSON.stringify(nw.length > 0 ? nw : h.wardens));
  formData.append('caretakers', JSON.stringify(nc));
  formData.append('messVendor', JSON.stringify({ name: updatedVendorName || h.messVendor.name, phone: updatedVendorPhone || h.messVendor.phone }));

  const menuFile = document.getElementById('em_menu_file')?.files[0];
  if (menuFile) formData.append('messMenuImage', menuFile);

  try {
    const res = await fetch(`http://localhost:5000/api/admin/hostels/${h._id}`, {
      method: 'PUT',
      body: formData
    });
    if (!res.ok) { toast('Update failed ❌', 'error'); return; }
    close();
    toast('Hostel updated in database ✅');
    await loadHostelsFromDB();
  } catch (err) {
    toast('Server error ❌', 'error');
  }
};
}
async function deleteHostelCard(id) {
  const h = Store.hostels.find((x) => x.id === id || x._id === id);
  if (!h) return;
  const confirmed = await showConfirmBox("Remove Hostel", `Remove "${h.name}" from the directory?`);
  if (!confirmed) return;

  try {
    await fetch(`http://localhost:5000/api/admin/hostels/${h._id}`, { method: 'DELETE' });
    toast('Hostel removed ✅');
    await loadHostelsFromDB();
  } catch (err) {
    toast('Delete failed ❌', 'error');
  }
}
function previewHostelMenuFile(input, previewId, nameId) {
  const file = input.files?.[0];
  const preview = document.getElementById(previewId);
  const nameEl = document.getElementById(nameId);
  if (!file) return;
  if (nameEl) nameEl.textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    _hostelAddMenuFile = e.target.result;
    if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
  };
  reader.readAsDataURL(file);
}
function showMenuPopup(id) {
  const h = Store.hostels.find((x) => x.id === id);
  if (!h || !h.messMenuImage) return;
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="hcv2-menu-popup">
      <div class="hcv2-menu-popup-header">
        <span>🍽 Mess Menu – ${h.name}</span>
        <button id="menupop_close" class="hcv2-menu-close">&times;</button>
      </div>
      <img src="http://localhost:5000${h.messMenuImage}" alt="Mess Menu" class="hcv2-menu-popup-img"/>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));
  const close = () => { overlay.classList.remove('active'); setTimeout(() => overlay.remove(), 200); };
  document.getElementById('menupop_close').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

// ── Event binding (for file input display) ──
function bindEvents() {
  const nf = document.getElementById("noticeFile");
  if (nf)
    nf.addEventListener("change", () => {
      const span = document.getElementById("noticeFileName");
      if (span) span.textContent = nf.files?.[0]?.name || "";
    });
  const postBtn = document.getElementById("postNoticeBtn");
  if (postBtn) postBtn.addEventListener("click", postNotice);
}

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.add("collapsed");
  }
  navigate("dashboard");
  loadStudentsFromDB();
  loadNoticesFromDB();
  loadPolicy();
  loadHostelsFromDB();
  loadBillingFromDB();
  loadLeavesFromDB();
  loadTodayStats();
});