/**
 * =====================================================
 * ZeroWaste - Vendor Dashboard (vendor_dashboard.js)
 * =====================================================
 *
 * ARCHITECTURE:
 * - Pure static frontend inside /public
 * - No React, no modules, no external dependencies
 * - All API calls use async/await with fetch()
 * - Backend: Node.js + Express + MongoDB
 * - Vendor ID comes from auth session/token (backend resolves from cookie/header)
 *
 * REQUIRED API ENDPOINTS (MongoDB backend):
 *
 *  1. GET  /api/vendor/profile
 *     -> MongoDB Collection: vendors
 *     -> Returns: { name, fullName, phone, email, profileImage }
 *
 *  2. GET  /api/notices/active
 *     -> MongoDB Collection: notices
 *     -> Returns: { notices: [{ id, content, priority, createdAt }] }
 *
 *  3. GET  /api/vendor/today-meals
 *     -> MongoDB Collections: preferences, cancellations, students, mealOptions
 *     -> Returns: {
 *          date: "YYYY-MM-DD",
 *          meals: {
 *            breakfast: { totalStudents, vegCount, nonVegCount, hasNonVeg },
 *            lunch:     { totalStudents, vegCount, nonVegCount, hasNonVeg },
 *            dinner:    { totalStudents, vegCount, nonVegCount, hasNonVeg }
 *          }
 *        }
 *     -> hasNonVeg (boolean): true if non-veg option exists for that slot in mealOptions.
 *
 *  4. GET  /api/vendor/rating
 *     -> MongoDB Collection: feedback
 *     -> Returns: { rating, totalReviews, month, breakdown: { foodQuality, cleanliness, behavior } }
 *
 *  5. GET  /api/vendor/contract
 *     -> MongoDB Collection: contracts
 *     -> Returns: { contractStart, contractEnd, remainingMonths, remainingDays, contractPdfUrl }
 *
 *  6. GET  /api/vendor/billing?month=YYYY-MM
 *     -> MongoDB Collections: billing, attendance, students
 *     -> Returns: { month, monthLabel, totalStudents, totalMeals, amountPerMeal, totalAmount, students: [...] }
 *
 * =====================================================
 */



document.addEventListener('DOMContentLoaded', function () {
//JADE
    // =====================================================
    // AUTH GUARD — Only authenticated vendors can access
    // =====================================================
    const authRole = localStorage.getItem("role");
    if (authRole !== "vendor") {
        localStorage.removeItem("role");
        localStorage.removeItem("vendorId");
        window.location.href = "login.html";
        return;
    }

    // =====================================================
    // API FUNCTIONS — async/await, production-ready
    // =====================================================

    /**
     * API: GET /api/vendor/profile
     * MongoDB Collection: vendors
     * Description: Fetch logged-in vendor profile details.
     * Expected Response: { name, fullName, phone, email, profileImage }
     */
    async function fetchVendorProfile() {
        try {
            // TODO: Replace with actual MongoDB API integration
            var vendorId = localStorage.getItem("vendorId");

            var response = await fetch(
                `/api/vendor/profile?vendorId=${vendorId}`
            );
            var data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching vendor profile:', error);
            // TODO: Replace with actual MongoDB API integration
            return {
                name: 'Vendor',
                fullName: '--',
                phone: '--',
                email: '--',
                profileImage: ''
            };
        }
    }

    /**
     * API: GET /api/notices/active
     * MongoDB Collection: notices
     * Description: Fetch active notices (shared with student interface).
     * Expected Response: { notices: [{ id, content, priority, createdAt }] }
     */
    async function fetchNotices() {
        try {
            // TODO: Replace with actual MongoDB API integration
            var response = await fetch('/api/notices');
            var data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching notices:', error);
            return { notices: [] };
        }
    }

    /**
     * API: GET /api/vendor/today-meals
     * MongoDB Collections: preferences, cancellations, students, mealOptions
     *
     * Description:
     *   Fetch today's meal preparation counts broken down by meal type.
     *   Each meal type (breakfast/lunch/dinner) contains:
     *     - totalStudents : total active students eating that meal today
     *     - vegCount      : students who have veg preference for that slot
     *     - nonVegCount   : students who have non-veg preference for that slot
     *     - hasNonVeg     : boolean — whether non-veg option is offered at all for that slot
     *                       (false = frontend grays out the nonveg box entirely)
     *
     * Expected Response Shape:
     * {
     *   date: "YYYY-MM-DD",
     *   meals: {
     *     breakfast: { totalStudents, vegCount, nonVegCount, hasNonVeg },
     *     lunch:     { totalStudents, vegCount, nonVegCount, hasNonVeg },
     *     dinner:    { totalStudents, vegCount, nonVegCount, hasNonVeg }
     *   }
     * }
     *
     * Backend Logic (Express + MongoDB):
     *   1. Determine today's date in IST.
     *   2. For each meal slot, check `mealOptions` collection if non-veg is offered → hasNonVeg.
     *   3. Count active students from `students` collection (status: active).
     *   4. Subtract students who cancelled that specific meal slot from `cancellations`.
     *   5. Among remaining students, count veg/nonveg from `preferences` for today's slot.
     */
    async function fetchTodayMeals() {
        try {
            var vendorId = localStorage.getItem("vendorId");
            var response = await fetch(`/api/vendor/today-meals?vendorId=${vendorId}`);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            var data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching today meals:', error);

            // Fallback structure — mirrors exact API response shape so the UI still renders
            return {
                date: new Date().toISOString().split('T')[0],
                meals: {
                    breakfast: { totalStudents: 0, vegCount: 0, nonVegCount: 0, hasNonVeg: false },
                    lunch:     { totalStudents: 0, vegCount: 0, nonVegCount: 0, hasNonVeg: true  },
                    dinner:    { totalStudents: 0, vegCount: 0, nonVegCount: 0, hasNonVeg: true  }
                }
            };
        }
    }

    /**
     * API: GET /api/vendor/rating
     * MongoDB Collection: feedback
     * Description: Fetch vendor's previous month rating.
     * Expected Response: { rating, totalReviews, month, breakdown: { foodQuality, cleanliness, behavior } }
     */
    async function fetchVendorRating() {
        try {
            var vendorId = localStorage.getItem("vendorId");
            var response = await fetch(`/api/vendor/rating?vendorId=${vendorId}`);
            var data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching vendor rating:', error);
            // TODO: Replace with actual MongoDB API integration
            return {
                rating: 0,
                totalReviews: 0,
                month: '--',
                breakdown: { foodQuality: 0, cleanliness: 0, behavior: 0 }
            };
        }
    }

    /**
     * API: GET /api/vendor/contract
     * MongoDB Collection: contracts
     * Description: Fetch contract details for this vendor.
     * Expected Response: { contractStart, contractEnd, remainingMonths, remainingDays, contractPdfUrl }
     */
    async function fetchContractDetails() {
        try {
            // TODO: Replace with actual MongoDB API integration
            var vendorId = localStorage.getItem("vendorId");
            var response = await fetch(
                `/api/vendor/contract?vendorId=${vendorId}`
            );
            var data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching contract details:', error);
            // TODO: Replace with actual MongoDB API integration
            return {
                contractStart: '--',
                contractEnd: '--',
                remainingMonths: 0,
                remainingDays: 0,
                contractPdfUrl: ''
            };
        }
    }

    /**
     * API: GET /api/vendor/billing?month=YYYY-MM
     * MongoDB Collections: billing, attendance, students
     * Description: Fetch monthly billing records for all students.
     * Expected Response: {
     *   month, monthLabel, totalStudents, totalMeals,
     *   amountPerMeal, totalAmount,
     *   students: [{ name, room, mealsCount, amount }]
     * }
     */
    async function fetchBillingRecords(month) {
        try {
            var vendorId = localStorage.getItem("vendorId");
            var response = await fetch(`/api/vendor/billing?month=${month}&vendorId=${vendorId}`);
            var data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching billing records:', error);
            // TODO: Replace with actual MongoDB API integration
            return {
                month: month,
                monthLabel: '--',
                totalStudents: 0,
                totalMeals: 0,
                amountPerMeal: 0,
                totalAmount: 0,
                students: []
            };
        }
    }


    // =====================================================
    // UTILITY FUNCTIONS
    // =====================================================

    function formatDate(dateStr) {
        if (!dateStr || dateStr === '--') return '--';
        var d = new Date(dateStr + 'T00:00:00');
        var dd = String(d.getDate()).padStart(2, '0');
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var yyyy = d.getFullYear();
        return dd + '/' + mm + '/' + yyyy;
    }

    var MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];

    function formatMonthYear(dateStr) {
        if (!dateStr) return '--';
        var parts = dateStr.split('-');
        var monthIndex = parseInt(parts[1], 10) - 1;
        return MONTH_NAMES[monthIndex] + ' ' + parts[0];
    }


    // =====================================================
    // POPUP HELPERS (shared open/close)
    // =====================================================

    function openPopup(overlayId) {
        document.getElementById(overlayId).classList.add('active');
    }

    function closePopup(overlayId) {
        document.getElementById(overlayId).classList.remove('active');
    }

    function setupPopupClose(overlayId, closeBtnId) {
        var overlay = document.getElementById(overlayId);
        var closeBtn = document.getElementById(closeBtnId);

        closeBtn.addEventListener('click', function () {
            closePopup(overlayId);
        });

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                closePopup(overlayId);
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay.classList.contains('active')) {
                closePopup(overlayId);
            }
        });
    }


    // =====================================================
    // 1. VENDOR PROFILE + PROFILE POPUP
    // =====================================================

    var vendorProfileData = null;

    /**
     * Fetches vendor profile details and populates the profile popup.
     */
    async function fetchVendorProfileDetails() {
        var data = await fetchVendorProfile();
        vendorProfileData = data;

        // Update header greeting
        document.getElementById('userName').textContent = data.name || 'Vendor';

        // Populate profile popup fields
        document.getElementById('profileName').textContent = data.name || '--';
        document.getElementById('profileFullName').textContent = data.fullName || '--';
        document.getElementById('profilePhone').textContent = data.phone || '--';
        document.getElementById('profileEmail').textContent = data.email || '--';
        document.getElementById('profileHostel').textContent = data.hostelAllocated || 'Not Assigned';

        // Profile image
        var avatarEl = document.getElementById('profileAvatar');
        if (data.profileImage) {
            avatarEl.innerHTML = '<img src="' + data.profileImage + '" alt="Profile picture of ' + data.name + '">';
        }
    }

    fetchVendorProfileDetails();

    // Open profile popup on user icon click
    document.getElementById('userMenuBtn').addEventListener('click', function () {
        openPopup('profileOverlay');
    });

    setupPopupClose('profileOverlay', 'profileCloseBtn');

    // Logout button (UI only)
    document.getElementById('logoutBtn').addEventListener('click', function () {
        // TODO: Replace with actual logout logic (clear session, redirect)
        localStorage.removeItem('role');
        localStorage.removeItem('vendorId');
        window.location.href = 'login.html';
    });


    // =====================================================
    // DARK MODE / LIGHT MODE TOGGLE
    // =====================================================

    var themeToggle = document.getElementById('themeToggle');

    (function initTheme() {
        var savedTheme = localStorage.getItem('zerowaste-theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggle.checked = true;
        }
        updateThemeIcon();
    })();

    function updateThemeIcon() {
        var themeIcon = document.getElementById('themeIcon');
        if (!themeIcon) return;
        var isDark = document.body.classList.contains('dark-mode');
        if (isDark) {
            themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
        } else {
            themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
        }
    }

    themeToggle.addEventListener('change', function () {
        if (this.checked) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('zerowaste-theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('zerowaste-theme', 'light');
        }
        updateThemeIcon();
    });


    // =====================================================
    // 2. NOTICES
    // =====================================================

    (async function loadNotices() {
        var data = await fetchNotices();
        var noticeEl = document.getElementById('noticeText');

        if (data && data.length > 0) {
            noticeEl.textContent = data[0].title;
            noticeEl.classList.add('has-notice');
        } else {
            noticeEl.textContent = 'No notice available at this moment';
            noticeEl.classList.remove('has-notice');
        }
    })();


    // =====================================================
    // 3. DAILY MEAL SUMMARY — Breakfast / Lunch / Dinner
    //
    // The backend returns counts for each meal slot separately.
    // If hasNonVeg === false for a slot, the non-veg box is grayed out
    // and shows "Not Available" instead of a count.
    //
    // Tab switching is handled purely in the frontend using the
    // cached API response — no additional API calls on tab change.
    // =====================================================

    // Cache the full API response so tab switches don't re-fetch
    var mealData = null;

    // Track which tab is currently active (default: breakfast)
    var activeMealTab = 'breakfast';

    /**
     * Renders the stat boxes for the given meal type using cached mealData.
     * @param {string} mealType - 'breakfast' | 'lunch' | 'dinner'
     */
    function renderMealStats(mealType) {
        if (!mealData || !mealData.meals) return;

        var meal = mealData.meals[mealType];
        if (!meal) return;

        // Populate total and veg counts (always visible)
        document.getElementById('totalStudents').textContent = meal.totalStudents || 0;
        document.getElementById('vegCount').textContent = meal.vegCount || 0;

        var nonVegBox   = document.getElementById('nonVegBox');
        var nonVegCount = document.getElementById('nonVegCount');
        var nonVegLabel = document.getElementById('nonVegLabel');

        if (meal.hasNonVeg) {
            // Non-veg option IS available for this meal slot — show active count
            nonVegBox.classList.remove('nonveg-unavailable');
            nonVegCount.textContent = meal.nonVegCount || 0;
            nonVegLabel.textContent = 'Non-Veg';
        } else {
            // Non-veg option is NOT offered for this meal slot — gray out the box
            // BACKEND NOTE: hasNonVeg = false means `mealOptions` has no non-veg entry
            //               for this date + meal slot combination.
            nonVegBox.classList.add('nonveg-unavailable');
            nonVegCount.textContent = '—';
            nonVegLabel.textContent = 'Not Available';
        }
    }

    /**
     * Switches the active meal tab and re-renders stats.
     * Called both on tab click and after initial data load.
     * @param {string} mealType - 'breakfast' | 'lunch' | 'dinner'
     */
    function switchMealTab(mealType) {
        activeMealTab = mealType;

        // Update tab button active states
        document.querySelectorAll('.meal-tab').forEach(function (btn) {
            var isActive = btn.dataset.meal === mealType;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        renderMealStats(mealType);
    }

    // Attach click listeners to each tab button
    document.querySelectorAll('.meal-tab').forEach(function (btn) {
        btn.addEventListener('click', function () {
            switchMealTab(this.dataset.meal);
        });
    });

    // Fetch data once on page load, then render default tab (breakfast)
    (async function loadTodayMeals() {
        var data = await fetchTodayMeals();
        mealData = data;  // cache for tab switches

        // Update the date footer
        var dateEl = document.getElementById('mealSummaryDate');
        if (data.date) {
            dateEl.textContent = 'As of ' + formatDate(data.date);
        } else {
            dateEl.textContent = 'Data unavailable';
        }

        // Render the default tab
        switchMealTab(activeMealTab);
    })();


    // =====================================================
    // 4. MONTHLY RATING
    // Backend averages all student feedback for previous month.
    // =====================================================

    (async function loadVendorRating() {
        var data = await fetchVendorRating();

        // Numeric rating
        var ratingVal = data.rating || 0;
        document.getElementById('ratingScore').textContent = ratingVal.toFixed(1);

        // Star rendering
        renderStars(ratingVal);

        // Meta info
        var metaEl = document.getElementById('ratingMeta');
        if (data.totalReviews > 0) {
            metaEl.textContent = 'Based on ' + data.totalReviews + ' review' + (data.totalReviews !== 1 ? 's' : '') + ' — ' + (data.month || 'Previous Month');
        } else {
            metaEl.textContent = 'No reviews available yet';
        }

        // Breakdown bars
        var breakdown = data.breakdown || {};
        setBreakdownBar('barFoodQuality', 'valFoodQuality', breakdown.foodQuality || 0);
        setBreakdownBar('barCleanliness', 'valCleanliness', breakdown.cleanliness || 0);
        setBreakdownBar('barBehavior', 'valBehavior', breakdown.behavior || 0);
    })();

    /**
     * Renders 5 stars based on a rating value (supports half stars).
     */
    function renderStars(rating) {
        var container = document.getElementById('ratingStars');
        container.innerHTML = '';

        for (var i = 1; i <= 5; i++) {
            var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '20');
            svg.setAttribute('height', '20');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('stroke-width', '2');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
            svg.classList.add('rating-star-icon');

            var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z');

            if (i <= Math.floor(rating)) {
                // Full star
                svg.classList.add('filled');
                svg.setAttribute('fill', '#f59e0b');
                svg.setAttribute('stroke', '#f59e0b');
            } else if (i === Math.ceil(rating) && rating % 1 !== 0) {
                // Half star (approximate as filled)
                svg.classList.add('filled');
                svg.setAttribute('fill', '#f59e0b');
                svg.setAttribute('stroke', '#f59e0b');
                svg.style.opacity = '0.6';
            } else {
                // Empty star
                svg.setAttribute('fill', 'none');
                svg.setAttribute('stroke', 'currentColor');
            }

            svg.appendChild(path);
            container.appendChild(svg);
        }
    }

    /**
     * Sets a breakdown bar width and value text.
     */
    function setBreakdownBar(barId, valId, value) {
        var percentage = (value / 5) * 100;
        document.getElementById(barId).style.width = percentage + '%';
        document.getElementById(valId).textContent = value.toFixed(1);
    }


    // =====================================================
    // 5. CONTRACT DETAILS
    // =====================================================

    var contractPdfUrl = '';

    (async function loadContractDetails() {
        var data = await fetchContractDetails();

        document.getElementById('contractStart').textContent = formatDate(data.contractStart);
        document.getElementById('contractEnd').textContent = formatDate(data.contractEnd);

        // Remaining duration
        var remaining = '';
        if (data.remainingMonths > 0) {
            remaining = data.remainingMonths + ' month' + (data.remainingMonths !== 1 ? 's' : '');
            if (data.remainingDays > 0) {
                remaining += ', ' + data.remainingDays + ' day' + (data.remainingDays !== 1 ? 's' : '');
            }
            remaining += ' left';
        } else if (data.remainingDays > 0) {
            remaining = data.remainingDays + ' day' + (data.remainingDays !== 1 ? 's' : '') + ' left';
        } else {
            remaining = 'Expired';
        }
        document.getElementById('contractRemaining').textContent = remaining;

        // Store PDF URL for download button
        contractPdfUrl = data.contractPdfUrl || '';
    })();

    // View / Download Contract PDF
    document.getElementById('viewContractBtn').addEventListener('click', function () {
        if (contractPdfUrl) {
            // TODO: Replace with actual MongoDB API integration
            // contractPdfUrl should be a full URL or path to the contract PDF
            window.open(contractPdfUrl, '_blank');
        } else {
            alert('Contract PDF is not available yet.');
        }
    });


    // =====================================================
    // 6. BILLING RECORDS
    // =====================================================

    /**
     * Populates #billingMonthSelect <select> with the last 12 months (including current).
     * Values are in YYYY-MM format — sent directly to the backend as ?month=YYYY-MM.
     * BACKEND: Accept ?month=YYYY-MM in GET /api/vendor/billing
     */
    function populateBillingMonthSelect() {
        var select = document.getElementById('billingMonthSelect');
        var now = new Date();
        select.innerHTML = '';

        for (var i = 0; i < 12; i++) {
            // Step back i months from today
            var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            var yyyy = d.getFullYear();
            var mm = String(d.getMonth() + 1).padStart(2, '0');
            var value = yyyy + '-' + mm;          // YYYY-MM  — used as API query param
            var label = MONTH_NAMES[d.getMonth()] + ' ' + yyyy;

            var opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            select.appendChild(opt);
        }
    }

    // Open billing popup
    document.getElementById('viewBillingBtn').addEventListener('click', function () {
        populateBillingMonthSelect(); // always rebuild so "today" is accurate

        // Reset display, then auto-fetch the selected (current) month
        resetBillingDisplay();
        openPopup('billingOverlay');
        loadBillingForMonth(document.getElementById('billingMonthSelect').value);
    });

    setupPopupClose('billingOverlay', 'billingCloseBtn');

    // Fetch new billing data whenever the month selection changes
    document.getElementById('billingMonthSelect').addEventListener('change', function () {
        if (this.value) loadBillingForMonth(this.value);
    });

    function resetBillingDisplay() {
        document.getElementById('billingTotalStudents').textContent = '--';
        document.getElementById('billingTotalMeals').textContent = '--';
        document.getElementById('billingPerMeal').textContent = '--';
        document.getElementById('billingTotal').textContent = '--';
        document.getElementById('billingTableWrapper').innerHTML =
            '<p class="billing-placeholder" id="billingPlaceholder">Select a month to view billing records</p>';
    }

    async function loadBillingForMonth(month) {
        // Show loading state
        document.getElementById('billingTableWrapper').innerHTML =
            '<p class="billing-placeholder">Loading billing records...</p>';

        var data = await fetchBillingRecords(month);

        // Populate summary (Month row removed from UI; month is shown in the select above)
        document.getElementById('billingTotalStudents').textContent = data.totalStudents || 0;
        document.getElementById('billingTotalMeals').textContent = data.totalMeals || 0;
        document.getElementById('billingPerMeal').textContent = '₹' + (data.amountPerMeal || 0);
        document.getElementById('billingTotal').textContent = '₹' + (data.totalAmount || 0);

        // Build student breakdown table
        var students = data.students || [];
        var wrapper = document.getElementById('billingTableWrapper');

        if (students.length === 0) {
            wrapper.innerHTML = '<p class="billing-placeholder">No billing records found for this month</p>';
            return;
        }

        var tableHtml = '<table class="billing-table">';
        tableHtml += '<thead><tr>';
        tableHtml += '<th>#</th>';
        tableHtml += '<th>Student Name</th>';
        tableHtml += '<th>Room</th>';
        tableHtml += '<th>Meals</th>';
        tableHtml += '<th>Amount</th>';
        tableHtml += '</tr></thead>';
        tableHtml += '<tbody>';

        for (var i = 0; i < students.length; i++) {
            var s = students[i];
            tableHtml += '<tr>';
            tableHtml += '<td>' + (i + 1) + '</td>';
            tableHtml += '<td>' + (s.name || '--') + '</td>';
            tableHtml += '<td>' + (s.room || '--') + '</td>';
            tableHtml += '<td>' + (s.mealsCount || 0) + '</td>';
            tableHtml += '<td>₹' + (s.amount || 0) + '</td>';
            tableHtml += '</tr>';
        }

        tableHtml += '</tbody></table>';
        wrapper.innerHTML = tableHtml;
    }

});
