/* ═══════════════════════════════════════════════════════════════════
   PMEC Hostel Portal — front_page.js
   Design: matches admin2.js patterns & conventions
   ═══════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────

// BACKEND INTEGRATION:
// Change this URL if your backend API endpoint differs.
// %%"New Connection"%% — Pointing to our new hostel API
const API_HOSTELS = 'http://localhost:5500/api/hostels';

// Breakpoint for mobile/desktop switch
const MOBILE_BP = 768;


// ─────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────
let hostels = [];
let currentSlide = 0;
let isMobile = window.innerWidth <= MOBILE_BP;


// ─────────────────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────────────────
const sliderWrapper  = document.getElementById('sliderWrapper');
const sliderTrack    = document.getElementById('sliderTrack');
const sliderPrev     = document.getElementById('sliderPrev');
const sliderNext     = document.getElementById('sliderNext');
const sliderDots     = document.getElementById('sliderDots');
const mobileCards    = document.getElementById('mobileCards');
const loadingEl      = document.getElementById('hostelsLoading');
const errorEl        = document.getElementById('hostelsError');
const errorMsg       = document.getElementById('errorMsg');
const statHostels    = document.getElementById('statHostels');
const hamburgerBtn   = document.getElementById('hamburgerBtn');
const mobileDropdown = document.getElementById('mobileDropdown');


// ─────────────────────────────────────────────────────
// THEME TOGGLE (same as admin2.js — cookie persistence)
// ─────────────────────────────────────────────────────
function toggleTheme() {
  document.documentElement.classList.toggle("dark");
  const isDark = document.documentElement.classList.contains("dark");
  document.cookie = "theme=" + (isDark ? "dark" : "light") + ";path=/;max-age=" + (365*24*60*60);
}


// ─────────────────────────────────────────────────────
// TOAST (same as admin2.js)
// ─────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3000);
}


// ─────────────────────────────────────────────────────
// HAMBURGER MENU
// ─────────────────────────────────────────────────────
hamburgerBtn.addEventListener('click', () => {
  mobileDropdown.classList.toggle('open');
});
document.querySelectorAll('.mobile-link').forEach(link => {
  link.addEventListener('click', () => mobileDropdown.classList.remove('open'));
});


// ─────────────────────────────────────────────────────
// FETCH HOSTELS
// ─────────────────────────────────────────────────────

/**
 * BACKEND INTEGRATION:
 * Fetches all hostels from the backend.
 * Expected response: Array of hostel objects.
 *
 * Each hostel must have:
 *   - _id or id        : unique identifier
 *   - name             : string
 *   - description      : string
 *   - wardens          : array of { name, phone }
 *   - caretakers       : array of { name, phone }
 *   - messVendor       : { name, phone }
 *   - menuImage        : string (URL/path to menu image)
 */
async function loadHostels() {
  loadingEl.style.display = '';
  errorEl.style.display = 'none';
  sliderWrapper.style.display = 'none';
  mobileCards.style.display = 'none';

  try {
    const res = await fetch(API_HOSTELS);
    if (!res.ok) throw new Error('Server status ' + res.status);

    hostels = await res.json();
    // BACKEND NOTE: If API wraps data, e.g. { data: [...] }, change above to:
    // hostels = (await res.json()).data;

    if (!Array.isArray(hostels) || !hostels.length) {
      showError('No hostels found.');
      return;
    }

    statHostels.textContent = hostels.length;
    renderHostels();

  } catch (err) {
    console.error('loadHostels failed:', err);
    showError('Could not load hostels. Make sure the backend is running.');
  } finally {
    loadingEl.style.display = 'none';
  }
}

function showError(msg) {
  loadingEl.style.display = 'none';
  errorMsg.textContent = msg;
  errorEl.style.display = '';
}


// ─────────────────────────────────────────────────────
// RENDER CARDS
// ─────────────────────────────────────────────────────
function renderHostels() {
  const html = hostels.map((h, i) => buildCard(h, i)).join('');
  if (isMobile) {
    sliderWrapper.style.display = 'none';
    mobileCards.style.display = '';
    mobileCards.innerHTML = html;
  } else {
    mobileCards.style.display = 'none';
    sliderWrapper.style.display = '';
    sliderTrack.innerHTML = html;
    buildDots();
    updateSlider();
  }
}


// ─────────────────────────────────────────────────────
// BUILD CARD HTML
// ─────────────────────────────────────────────────────

/**
 * BACKEND NOTE:
 * Each hostel must include: warden, caretaker, vendor, image
 * Adapted to flat string fields from our Hostel model.
 */
function buildCard(h, idx) {
  const id = h._id || h.id || idx;

  // Adapt single string fields into the UI format
  const wardensHTML = h.warden ? `
    <div class="card-person">
      <div class="person-avatar">${h.warden[0].toUpperCase()}</div>
      <div class="person-info">
        <div class="person-name">${esc(h.warden)}</div>
        <div class="person-phone">—</div>
      </div>
    </div>` : '';

  const caretakersHTML = h.caretaker ? `
    <div class="card-person">
      <div class="person-avatar">${h.caretaker[0].toUpperCase()}</div>
      <div class="person-info">
        <div class="person-name">${esc(h.caretaker)}</div>
        <div class="person-phone">—</div>
      </div>
    </div>` : '';

  const vendorName = h.vendor || '';

  // Use base64 image if available, otherwise default styling
  const imgStyle = h.image ? `background-image: url('${h.image}'); background-size: cover; background-position: center; border-bottom: 1px solid var(--border); height: 140px; border-radius: 12px 12px 0 0;` : '';
  const imgOverlay = h.image ? `<div style="${imgStyle}"></div>` : '';

  return `
  <div class="hostel-card" style="animation-delay:${idx*0.08}s" data-id="${id}">
    ${imgOverlay}
    <div class="card-head" style="${h.image ? 'padding-top: 16px;' : ''}">
      <div class="card-hostel-name">${esc(h.name||'Unnamed')}</div>
      <div class="card-hostel-desc">Capacity: ${h.capacity} Students</div>
    </div>
    <div class="card-body">
      ${wardensHTML ? `<div class="card-info-section"><div class="card-info-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>Warden</div>${wardensHTML}</div>` : ''}
      ${caretakersHTML ? `<div class="card-info-section"><div class="card-info-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>Caretaker</div>${caretakersHTML}</div>` : ''}
      ${vendorName ? `<div class="card-info-section"><div class="card-info-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>Mess Vendor</div><div class="card-person"><div class="person-avatar">${vendorName[0].toUpperCase()}</div><div class="person-info"><div class="person-name">${esc(vendorName)}</div><div class="person-phone">—</div></div></div></div>` : ''}
    </div>
    <div class="card-foot">
      <button class="btn-menu" onclick="openMenuModal('${id}','${esc(h.name||'Hostel')}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
        View Mess Menu
      </button>
    </div>
  </div>`;
}


// ─────────────────────────────────────────────────────
// SLIDER LOGIC
// ─────────────────────────────────────────────────────
function buildDots() {
  if (!hostels.length) return;
  sliderDots.innerHTML = hostels.map((_, i) =>
    `<button class="slider-dot ${i===currentSlide?'active':''}" data-i="${i}"></button>`
  ).join('');
  sliderDots.querySelectorAll('.slider-dot').forEach(d => {
    d.addEventListener('click', () => { currentSlide = +d.dataset.i; updateSlider(); });
  });
}

function updateSlider() {
  if (!hostels.length) return;
  const card = sliderTrack.querySelector('.hostel-card');
  if (!card) return;
  const cardW = card.offsetWidth + 16; // gap
  const trackW = sliderTrack.parentElement.offsetWidth;
  const offset = (trackW/2) - (card.offsetWidth/2) - (currentSlide * cardW);
  sliderTrack.style.transform = `translateX(${offset}px)`;

  sliderDots.querySelectorAll('.slider-dot').forEach((d, i) => d.classList.toggle('active', i===currentSlide));
  sliderPrev.disabled = currentSlide === 0;
  sliderNext.disabled = currentSlide >= hostels.length - 1;
}

sliderPrev.addEventListener('click', () => { if (currentSlide > 0) { currentSlide--; updateSlider(); } });
sliderNext.addEventListener('click', () => { if (currentSlide < hostels.length-1) { currentSlide++; updateSlider(); } });

document.addEventListener('keydown', (e) => {
  if (isMobile) return;
  if (e.key==='ArrowLeft' && currentSlide>0) { currentSlide--; updateSlider(); }
  if (e.key==='ArrowRight' && currentSlide<hostels.length-1) { currentSlide++; updateSlider(); }
});


// ─────────────────────────────────────────────────────
// RESPONSIVE
// ─────────────────────────────────────────────────────
let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    const was = isMobile;
    isMobile = window.innerWidth <= MOBILE_BP;
    if (was !== isMobile && hostels.length) { currentSlide = 0; renderHostels(); }
    if (!isMobile && hostels.length) updateSlider();
  }, 150);
});


// ─────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', function(e) {
    const t = document.querySelector(this.getAttribute('href'));
    if (t) { e.preventDefault(); t.scrollIntoView({ behavior:'smooth', block:'start' }); }
  });
});


// ─────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Apply saved theme (cookie persistence — same as admin2)
  const tc = document.cookie.split('; ').find(c => c.startsWith('theme='));
  if (tc && tc.split('=')[1] === 'dark') document.documentElement.classList.add('dark');

  loadHostels();
});
