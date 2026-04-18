/**
 * frontpage.js — PMEC Hostel Management System
 *
 * Responsibilities:
 *  1. Fetch hostel data from GET /api/hostels
 *  2. Dynamically render hostel cards (with capacity)
 *  3. Handle desktop horizontal card slider (prev/next/dots)
 *  4. Mobile: slider is disabled — cards stack vertically via CSS
 *  5. Open/close the weekly menu modal via GET /api/menu
 *  6. Update hero stats (hostel count, warden count, total capacity)
 *  7. Fetch and display notices — ticker bar + notice board
 *  8. Dark mode toggle with localStorage persistence
 */

"use strict";

/* ============================================================
   DOM REFERENCES
   ============================================================ */
const sliderTrack  = document.getElementById("sliderTrack");
const prevBtn      = document.getElementById("prevBtn");
const nextBtn      = document.getElementById("nextBtn");
const sliderDots   = document.getElementById("sliderDots");
const loadingState = document.getElementById("loadingState");
const errorState   = document.getElementById("errorState");
const retryBtn     = document.getElementById("retryBtn");

// Hero stats
const statHostels  = document.getElementById("stat-hostels");
const statWardens  = document.getElementById("stat-wardens");
const statCapacity = document.getElementById("stat-capacity");

// Total capacity bar
const totalCapacityBar = document.getElementById("totalCapacityBar");
const totalCapacityNum = document.getElementById("totalCapacityNum");

// Modal
const menuModal   = document.getElementById("menuModal");
const modalClose  = document.getElementById("modalClose");
const menuImg     = document.getElementById("menuImg");
const menuLoading = document.getElementById("menuLoading");
const menuError   = document.getElementById("menuError");

// Footer
document.getElementById("currentYear").textContent = new Date().getFullYear();

/* ============================================================
   SLIDER STATE
   ============================================================ */
let currentIndex  = 0;   // Active card index
let cardWidth     = 0;   // Calculated card width including gap
let totalCards    = 0;   // Total number of hostel cards
let cardsPerView  = 1;   // Number of cards visible at once
const CARD_GAP    = 24;  // Must match CSS var(--space-lg) = 24px

/* ============================================================
   UTILITY: is mobile viewport?
   ============================================================ */
function isMobile() {
  return window.innerWidth <= 768;
}

/* ============================================================
   0. DARK MODE TOGGLE
   FRONTEND ONLY: Theme stored in localStorage (no DB needed)
   ============================================================ */

function applyStoredTheme() {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

applyStoredTheme();
window.toggleTheme = toggleTheme;

/* ============================================================
   1. FETCH HOSTEL DATA
   ============================================================ */

async function fetchHostels() {
  const response = await fetch("http://localhost:5000/api/hostels");
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: Failed to fetch hostels`);
  }
  return response.json();
}

async function loadHostels() {
  if (loadingState) loadingState.style.display = "flex";
  if (errorState)   errorState.style.display   = "none";

  let hostels;
  try {
    hostels = await fetchHostels();
  } catch (err) {
    console.error("[PMEC] Hostels API error:", err);
    if (loadingState) loadingState.style.display = "none";
    if (errorState)   errorState.style.display   = "flex";
    return;
  }

  if (loadingState) loadingState.style.display = "none";

  if (!hostels || hostels.length === 0) {
    if (errorState) errorState.style.display = "flex";
    return;
  }

  renderHostels(hostels);
  updateHeroStats(hostels);
  initSlider();
}

/* ============================================================
   2. RENDER HOSTEL CARDS
   ============================================================ */

function renderHostels(hostels) {
  sliderTrack.innerHTML = "";
  hostels.forEach((hostel, index) => {
    const card = createHostelCard(hostel, index);
    sliderTrack.appendChild(card);
  });
  totalCards = hostels.length;
}

function createHostelCard(hostel, index) {
  const card = document.createElement("article");
  card.className = "hostel-card";
  card.setAttribute("role", "listitem");
  card.setAttribute("aria-label", `Hostel: ${hostel.name}`);
  card.style.animationDelay = `${index * 80}ms`;

  const capacityHTML = hostel.capacity
    ? `<div class="capacity-chip">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Capacity: ${escapeHTML(String(hostel.capacity))} students
      </div>`
    : "";

  const wardensHTML = buildPersonList(
    hostel.wardens,
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    "Warden(s)"
  );

  const caretakersHTML = buildPersonList(
    hostel.caretakers,
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    "Caretaker(s)"
  );

  const vendorHTML = hostel.messVendor
    ? `<div class="info-group">
        <div class="info-group-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
          Mess Vendor
        </div>
        <div class="info-entry">
          <span class="info-name">${escapeHTML(hostel.messVendor.name)}</span>
          ${hostel.messVendor.phone
            ? `<span class="info-phone">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92V21a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.74 20 19.43 19.43 0 0 1 5 13.26a19.79 19.79 0 0 1-3-9.1A2 2 0 0 1 4 2h4.09a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L9.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.849.573 2.81.7A2 2 0 0 1 23 17z"/></svg>
                ${escapeHTML(hostel.messVendor.phone)}
              </span>`
            : ""
          }
        </div>
      </div>`
    : "";

  card.innerHTML = `
    <div class="card-header-bar" aria-hidden="true"></div>
    <div class="card-body">
      <h3 class="hostel-name">${escapeHTML(hostel.name)}</h3>
      ${hostel.description ? `<p class="hostel-desc">${escapeHTML(hostel.description)}</p>` : ""}
      ${capacityHTML}
      ${wardensHTML}
      ${caretakersHTML}
      ${vendorHTML}
    </div>
    <div class="card-footer">
      <button
        class="btn-menu"
        data-hostel="${escapeHTML(hostel.name)}"
        aria-label="View weekly mess menu for ${escapeHTML(hostel.name)}"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"/>
        </svg>
        View Weekly Menu
      </button>
    </div>
  `;

  card.querySelector(".btn-menu").addEventListener("click", () => openMenuModal(hostel.name));
  return card;
}

function buildPersonList(people, iconSVG, label) {
  if (!people || people.length === 0) return "";

  const entries = people.map(person => `
    <div class="info-entry">
      <span class="info-name">${escapeHTML(person.name)}</span>
      ${person.phone
        ? `<span class="info-phone">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M22 16.92V21a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.74 20 19.43 19.43 0 0 1 5 13.26a19.79 19.79 0 0 1-3-9.1A2 2 0 0 1 4 2h4.09a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L9.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.849.573 2.81.7A2 2 0 0 1 23 17z"/>
            </svg>
            ${escapeHTML(person.phone)}
          </span>`
        : ""
      }
    </div>
  `).join("");

  return `
    <div class="info-group">
      <div class="info-group-label">
        ${iconSVG}
        ${escapeHTML(label)}
      </div>
      ${entries}
    </div>
  `;
}

function escapeHTML(str) {
  if (typeof str !== "string") return String(str || "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ============================================================
   3. HERO STATS UPDATE
   ============================================================ */

function updateHeroStats(hostels) {
  statHostels.textContent = hostels.length;

  const totalWardens = hostels.reduce((sum, h) => sum + (h.wardens ? h.wardens.length : 0), 0);
  statWardens.textContent = totalWardens;

  const totalCap = hostels.reduce((sum, h) => sum + (h.capacity || 0), 0);
  if (totalCap > 0) {
    statCapacity.textContent = totalCap;
    if (totalCapacityBar && totalCapacityNum) {
      totalCapacityNum.textContent = totalCap;
      totalCapacityBar.style.display = "inline-flex";
    }
  }
}

/* ============================================================
   4. SLIDER LOGIC
   ============================================================ */

function initSlider() {
  if (isMobile()) {
    prevBtn.style.display = "none";
    nextBtn.style.display = "none";
    return;
  }

  calculateDimensions();
  buildDots();
  updateSlider(false);

  prevBtn.addEventListener("click", slidePrev);
  nextBtn.addEventListener("click", slideNext);
  sliderTrack.addEventListener("keydown", handleSliderKeydown);
  initSwipeSupport();
  window.addEventListener("resize", debounce(handleResize, 120));
}

function calculateDimensions() {
  const trackWrapper = sliderTrack.parentElement;
  const wrapperWidth = trackWrapper.clientWidth;
  const detectedCardWidth = sliderTrack.children[0]
    ? sliderTrack.children[0].getBoundingClientRect().width
    : 340;
  cardWidth = detectedCardWidth + CARD_GAP;
  cardsPerView = Math.max(1, Math.floor((wrapperWidth + CARD_GAP) / cardWidth));
  totalCards = sliderTrack.children.length;
}

function slidePrev() {
  if (currentIndex > 0) { currentIndex--; updateSlider(true); }
}

function slideNext() {
  const maxIndex = Math.max(0, totalCards - cardsPerView);
  if (currentIndex < maxIndex) { currentIndex++; updateSlider(true); }
}

function updateSlider(animate) {
  const offset = currentIndex * cardWidth;
  sliderTrack.style.transition = animate ? "transform 350ms cubic-bezier(0.4, 0, 0.2, 1)" : "none";
  sliderTrack.style.transform = `translateX(-${offset}px)`;
  const maxIndex = Math.max(0, totalCards - cardsPerView);
  prevBtn.disabled = (currentIndex === 0);
  nextBtn.disabled = (currentIndex >= maxIndex);
  updateDots();
}

function handleSliderKeydown(e) {
  if (e.key === "ArrowLeft")  { e.preventDefault(); slidePrev(); }
  if (e.key === "ArrowRight") { e.preventDefault(); slideNext(); }
}

function buildDots() {
  sliderDots.innerHTML = "";
  const maxIndex = Math.max(0, totalCards - cardsPerView);
  for (let i = 0; i <= maxIndex; i++) {
    const dot = document.createElement("button");
    dot.className = "dot" + (i === currentIndex ? " active" : "");
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-selected", i === currentIndex ? "true" : "false");
    dot.setAttribute("aria-label", `Go to hostel ${i + 1}`);
    dot.dataset.index = i;
    dot.addEventListener("click", () => { currentIndex = i; updateSlider(true); });
    sliderDots.appendChild(dot);
  }
}

function updateDots() {
  const dots = sliderDots.querySelectorAll(".dot");
  dots.forEach((dot, i) => {
    const isActive = i === currentIndex;
    dot.classList.toggle("active", isActive);
    dot.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function initSwipeSupport() {
  let touchStartX = 0;
  let touchEndX   = 0;
  const MIN_SWIPE = 60;
  sliderTrack.addEventListener("touchstart", (e) => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
  sliderTrack.addEventListener("touchend",   (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const delta = touchStartX - touchEndX;
    if (Math.abs(delta) > MIN_SWIPE) { delta > 0 ? slideNext() : slidePrev(); }
  }, { passive: true });
}

function handleResize() {
  if (isMobile()) {
    sliderTrack.style.transform  = "";
    sliderTrack.style.transition = "none";
    prevBtn.style.display = "none";
    nextBtn.style.display = "none";
    sliderDots.style.display = "none";
    return;
  }
  prevBtn.style.display    = "";
  nextBtn.style.display    = "";
  sliderDots.style.display = "";
  calculateDimensions();
  const maxIndex = Math.max(0, totalCards - cardsPerView);
  if (currentIndex > maxIndex) currentIndex = maxIndex;
  buildDots();
  updateSlider(false);
}

/* ============================================================
   5. MENU MODAL
   ============================================================ */

async function openMenuModal(hostelName) {
  menuModal.setAttribute("aria-hidden", "false");
  menuModal.classList.add("open");
  document.body.style.overflow = "hidden";

  menuImg.style.display     = "none";
  menuError.style.display   = "none";
  menuLoading.style.display = "flex";

  // Update modal title (replace, not append — avoids duplication bug)
  const titleEl = document.getElementById("modalTitle");
  titleEl.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 11l19-9-9 19-2-8-8-2z"/>
    </svg>
    Mess Menu — ${escapeHTML(hostelName)}
  `;

  let menuImageUrl = null;

  try {
    const response = await fetch(`http://localhost:5000/api/menu?hostel=${encodeURIComponent(hostelName)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data && data.menuImage) {
      // Prepend host because frontend runs on port 5500, assets on 5000
      menuImageUrl = `http://localhost:5000${data.menuImage}`;
    }
  } catch (err) {
    console.warn("[PMEC] Menu API unavailable:", err.message);
    menuImageUrl = "http://localhost:5000/menu.jpeg";
  }

  if (menuImageUrl) {
    menuImg.src = menuImageUrl;
    menuImg.onload  = () => { menuLoading.style.display = "none"; menuImg.style.display = "block"; };
    menuImg.onerror = () => { menuLoading.style.display = "none"; menuError.style.display = "block"; };
  } else {
    menuLoading.style.display = "none";
    menuError.style.display   = "block";
  }
}

function closeMenuModal() {
  menuModal.classList.remove("open");
  menuModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  setTimeout(() => {
    menuImg.src               = "";
    menuImg.style.display     = "none";
    menuLoading.style.display = "flex";
    menuError.style.display   = "none";
    const title = document.getElementById("modalTitle");
    title.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 11l19-9-9 19-2-8-8-2z"/>
      </svg>
      Weekly Mess Menu
    `;
  }, 350);
}

modalClose.addEventListener("click", closeMenuModal);
menuModal.addEventListener("click", (e) => { if (e.target === menuModal) closeMenuModal(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menuModal.classList.contains("open")) closeMenuModal();
});

/* ============================================================
   6. NOTICE TICKER BAR
   Horizontal auto-scrolling ticker placed below the hero section.
   BACKEND: Fetches from GET /api/notices — no dummy data.
   ============================================================ */

async function loadTicker() {
  const trackEl   = document.getElementById("tickerTrack");
  const loadingEl = document.getElementById("tickerLoading");
  const errorEl   = document.getElementById("tickerError");

  if (!trackEl) return; // Guard: ticker not in DOM

  let notices = [];

  try {
    const res = await fetch("http://localhost:5000/api/notices");
    if (!res.ok) throw new Error("HTTP " + res.status);
    notices = await res.json();
  } catch (err) {
    console.warn("[PMEC Ticker] API unavailable:", err.message);
    if (loadingEl) loadingEl.style.display = "none";
    if (errorEl)   errorEl.style.display   = "block";
    return;
  }

  if (loadingEl) loadingEl.style.display = "none";

  if (!notices || notices.length === 0) {
    if (errorEl) { errorEl.textContent = "No notices at this time."; errorEl.style.display = "block"; }
    return;
  }

  notices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  buildTicker(notices, trackEl);
}

function buildTicker(notices, trackEl) {
  function createItemSet(items) {
    const frag = document.createDocumentFragment();
    items.forEach((notice) => {
      const a = document.createElement("a");
      a.className = "ticker-item";
      a.href      = notice.pdfUrl || "#";
      a.target    = "_blank";
      a.rel       = "noopener noreferrer";
      a.setAttribute("aria-label", `${notice.title} — opens PDF in new tab`);
      a.innerHTML = `
        <svg class="ticker-item-icon" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        ${escapeHTML(notice.title)}
      `;
      frag.appendChild(a);

      const sep = document.createElement("span");
      sep.className = "ticker-sep";
      sep.textContent = "|";
      sep.setAttribute("aria-hidden", "true");
      frag.appendChild(sep);
    });
    return frag;
  }

  // Duplicate for seamless loop
  trackEl.appendChild(createItemSet(notices));
  trackEl.appendChild(createItemSet(notices));

  requestAnimationFrame(() => {
    const halfWidth = trackEl.scrollWidth / 2;
    const duration  = Math.min(90, Math.max(20, halfWidth / 80));
    trackEl.style.setProperty("--ticker-duration", `${duration.toFixed(1)}s`);
    trackEl.style.animationDuration = `${duration.toFixed(1)}s`;
  });
}

/* ============================================================
   7. NOTICE BOARD (vertical scrollable list)
   BACKEND: Fetches from GET /api/notices
   ============================================================ */

async function loadNotices() {
  const listEl     = document.getElementById("noticesGrid");
  const loadingEl  = document.getElementById("noticesLoading");
  const emptyEl    = document.getElementById("noticesEmpty");
  const errorEl    = document.getElementById("noticesError");
  const countChip  = document.getElementById("noticesCountChip");
  const countText  = document.getElementById("noticesCountText");

  if (!listEl) return;

  if (loadingEl) loadingEl.style.display = "block";
  if (emptyEl)   emptyEl.style.display   = "none";
  if (errorEl)   errorEl.style.display   = "none";
  listEl.innerHTML = "";

  let notices;

  try {
    const response = await fetch("http://localhost:5000/api/notices");
    if (!response.ok) throw new Error("HTTP " + response.status);
    notices = await response.json();
  } catch (err) {
    console.error("[PMEC] Notices API error:", err);
    if (loadingEl) loadingEl.style.display = "none";
    if (errorEl)   errorEl.style.display   = "block";
    return;
  }

  if (loadingEl) loadingEl.style.display = "none";

  if (!notices || notices.length === 0) {
    if (emptyEl) emptyEl.style.display = "flex";
    return;
  }

  notices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Update count chip if present
  if (countChip && countText) {
    countText.textContent   = `${notices.length} notice${notices.length !== 1 ? "s" : ""}`;
    countChip.style.display = "inline-flex";
  }

  renderNotices(notices, listEl);
}

/**
 * Renders notice rows into the <ul id="noticesGrid"> list.
 * Each row: PDF icon, title, NEW badge (if <3 days old), date, View PDF button.
 */
function renderNotices(notices, container) {
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  notices.forEach((notice) => {
    let dateStr = "";
    const dateObj = notice.createdAt ? new Date(notice.createdAt) : null;
    if (dateObj && !isNaN(dateObj)) {
      dateStr = dateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    }

    const isNew      = dateObj && (now - dateObj.getTime()) < THREE_DAYS_MS;
    const pdfUrl     = notice.pdfUrl || "#";
    const isDummyUrl = pdfUrl === "#" || pdfUrl.startsWith("/pdfs/");

    const li = document.createElement("li");
    li.className = "notice-row";
    li.setAttribute("role", "article");
    li.setAttribute("data-pdf-url", pdfUrl);

    li.innerHTML = `
      <div class="notice-pdf-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      </div>

      <div class="notice-row-body">
        <span class="notice-row-title" title="${escapeHTML(notice.title)}">
          ${escapeHTML(notice.title)}
        </span>
        ${dateStr ? `
          <span class="notice-row-date">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <time datetime="${escapeHTML(notice.createdAt || "")}">${escapeHTML(dateStr)}</time>
          </span>` : ""}
      </div>

      ${isNew ? '<span class="notice-new-tag" aria-label="New notice">New</span>' : ""}

      <a class="notice-pdf-link"
         href="${escapeHTML(pdfUrl)}"
         target="_blank"
         rel="noopener noreferrer"
         aria-label="View PDF: ${escapeHTML(notice.title)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        View PDF
      </a>
    `;

    // Mobile: tap entire row to open PDF
    li.addEventListener("click", (e) => {
      if (e.target.closest(".notice-pdf-link")) return;
      if (window.innerWidth <= 600) {
        if (!isDummyUrl) window.open(pdfUrl, "_blank", "noopener,noreferrer");
      }
    });

    // Guard dummy links
    const pdfBtn = li.querySelector(".notice-pdf-link");
    if (pdfBtn && isDummyUrl) {
      pdfBtn.addEventListener("click", (e) => {
        e.preventDefault();
        alert(`[Demo] PDF not available yet.\nTitle: "${notice.title}"\n\nConnect to backend to serve real PDFs.`);
      });
    }

    container.appendChild(li);
  });
}

/* ============================================================
   8. UTILITIES
   ============================================================ */

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/* ============================================================
   INIT — Run when DOM is ready
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  // Hostel card slider
  loadHostels();
  retryBtn.addEventListener("click", loadHostels);

  // Notice ticker bar (below hero)
  loadTicker();

  // Notice board (vertical list)
  loadNotices();

  // Notice board retry button
  const noticesRetryBtn = document.getElementById("noticesRetryBtn");
  if (noticesRetryBtn) noticesRetryBtn.addEventListener("click", loadNotices);
});