/**
 * =====================================================
 * ZeroWaste - Student Dashboard (student_interface.js)
 * =====================================================
 *
 * ARCHITECTURE:
 * - Pure static frontend inside /public
 * - No React, no modules, no external dependencies
 * - All API calls use async/await with fetch()
 * - Backend: Node.js + Express + MongoDB
 * - Student ID comes from auth session/token (backend resolves from cookie/header)
 *
 * REQUIRED API ENDPOINTS (MongoDB backend):
 *
 *  1. GET  /api/student/profile
 *     -> MongoDB Collection: students
 *     -> Returns: { name, fullName, room, hostel, phone, email, profileImage }
 *
 *  2. GET  /api/notices/active
 *     -> MongoDB Collection: notices
 *     -> Returns: { notices: [{ id, message, priority, createdAt }] }
 *
 *  3. GET  /api/student/coupon/today?studentId=xxx
 *     -> MongoDB Collections: coupons, cancellations
 *     -> Returns: { hasCoupon: bool, couponData: { name, room, date, meals } }
 *     -> hasCoupon=false when student cancelled today's meal
 *
 *  4. GET  /api/student/cancel/status?studentId=xxx&month=M&year=Y
 *     -> MongoDB Collection: cancellations
 *     -> Returns: { personalUsed, personalLimit, pendingOfficial }
 *
 *  5. POST /api/student/cancel/request
 *     -> MongoDB Collection: cancellations
 *     -> Body (personal): { studentId, fromDate, toDate, reason: "personal" }
 *     -> Body (official): FormData { studentId, fromDate, toDate, reason: "official", document: <PDF> }
 *     -> Personal = immediate cancellation, Official = pending admin approval
 *
 *  6. GET  /api/student/preferences?studentId=xxx
 *     -> MongoDB Collection: preferences
 *     -> Returns: { preferences: { mon: { breakfast, lunch, dinner }, ... } }
 *
 *  7. POST /api/student/preferences
 *     -> MongoDB Collection: preferences
 *     -> Body: { studentId, preferences }
 *
 *  8. GET  /api/menu/nonveg-availability
 *     -> MongoDB Collection: menus
 *     -> Returns: { mon: { breakfast: bool, lunch: bool, dinner: bool }, ... }
 *
 *  9. GET  /api/student/calendar?studentId=xxx&month=M&year=Y
 *     -> MongoDB Collection: cancellations
 *     -> Returns: { cancelledDays: [5, 12], month, year, dataAvailable: bool }
 *
 * 10. GET  /api/student/billing?studentId=xxx
 *     -> MongoDB Collections: billing, attendance
 *     -> Returns: { billingPeriod, amountPerMeal, totalMeals, amountDue }
 *
 * 11. GET  /api/menu/weekly
 *     -> MongoDB Collection: menus
 *     -> Returns: { menu: [{ day, breakfast, lunch, dinner, nonveg: {...} }] }
 *
 * 12. GET  /api/student/feedback/status?studentId=xxx&month=M&year=Y
 *     -> MongoDB Collection: feedback
 *     -> Returns: { hasSubmitted: bool }
 *
 * 13. POST /api/student/feedback
 *     -> MongoDB Collection: feedback
 *     -> Body: { studentId, month, year, ratings: { overall, foodQuality, cleanliness, behavior }, comment }
 *     -> Rule: Only 1 feedback per student per month. Backend rejects duplicates.
 *
 * =====================================================
 */

document.addEventListener('DOMContentLoaded', function () {

    // =====================================================
    // AUTH GUARD — Only authenticated students can access
    // =====================================================
    const authRole = localStorage.getItem("role");
    const authStudentId = localStorage.getItem("studentId");
    if (authRole !== "student" || !authStudentId) {
        localStorage.removeItem("role");
        localStorage.removeItem("studentId");
        localStorage.removeItem("userEmail");
        window.location.href = "login.html";
        return;
    }

    // =====================================================
    // API FUNCTIONS — async/await, production-ready
    // =====================================================

    /**
     * API: GET /api/student/profile
     * MongoDB Collection: students
     * Description: Fetch logged-in student profile details.
     * Expected Response: { name, fullName, room, hostel, phone, email, profileImage }
     */
    async function fetchStudentProfile() {
    try {

        // ✅ Get studentId from localStorage
        var studentId = localStorage.getItem("studentId");

        if (!studentId) {
            window.location.href = "login.html";
            return;
        }

        var response = await fetch(
            `http://localhost:5000/api/student/profile?studentId=${studentId}`
        );

        var data = await response.json();
        return data;

    } catch (error) {
        console.error('Error fetching student profile:', error);

        return {
            name: 'Student',
            fullName: '--',
            room: '--',
            hostel: '--',
            phone: '--',
            email: '--',
            profileImage: ''
        };
    }
}
    

    /**
     * API: GET /api/student/coupon/today?studentId=xxx
     * MongoDB Collections: coupons, cancellations
     * Description: Check if student has a valid coupon for today.
     * Backend MUST check if today is within any cancelled date range.
     * If cancelled -> hasCoupon: false
     * Expected Response: { hasCoupon: bool, couponData: { name, room, date, meals: { breakfast, lunch, dinner } } }
     */
    async function fetchCouponStatus() {
        try {
            var studentId = localStorage.getItem("studentId");

            var response = await fetch(
            `http://localhost:5000/api/student/coupon/today?studentId=${studentId}`
            );
            var data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching coupon status:', error);
            return { hasCoupon: false };
        }
    }

    /**
     * API: GET /api/student/cancel/status?studentId=xxx&month=M&year=Y
     * MongoDB Collection: cancellations
     * Description: Get personal cancellation usage for current month.
     * Expected Response: { personalUsed: number, personalLimit: number, pendingOfficial: number }
     */
    async function fetchCancelStatus() {
        try {
            var studentId = localStorage.getItem("studentId");
            if (!studentId) return { personalUsed: 0, personalLimit: 5, pendingOfficial: 0 };
            var response = await fetch("http://localhost:5000/api/student/cancel-status?studentId=" + encodeURIComponent(studentId));
            var data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching cancel status:', error);
            return { personalUsed: 0, personalLimit: 5, pendingOfficial: 0 };
        }
    }

    /**
     * API: POST /api/student/cancel/request
     * MongoDB Collection: cancellations
     * Description: Submit a meal cancellation request.
     *
     * Personal reason:
     *   - No admin approval required
     *   - Cancellation is immediate
     *   - Backend increments personalUsed
     *   - All meals for date range are cancelled instantly
     *   - Response: { success: true, status: "approved", message: "..." }
     *
     * Official reason:
     *   - Requires admin approval
     *   - Stored as "pending" in database
     *   - Meals cancelled ONLY after admin approves
     *   - Bill deduction ONLY after approval
     *   - Response: { success: true, status: "pending", message: "..." }
     */
    async function submitCancelRequest(formData) {
        try {
            const response = await fetch("http://localhost:5000/api/student/cancel-request", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();
            return data;

        } catch (error) {
            console.error('Error submitting cancel request:', error);
            return { success: false, message: 'Network error. Please try again.' };
        }
    }
        /**
     * API: GET /api/student/preferences?studentId=xxx
     * MongoDB Collection: preferences
     * Description: Fetch saved veg/nonveg preferences for each day and meal.
     * Expected Response: { preferences: { mon: { breakfast: "veg", lunch: "nonveg", dinner: "veg" }, ... } }
     */
  async function fetchPreferences() {
    try {

        // ✅ Get studentId from localStorage
        var studentId = localStorage.getItem("studentId");

        if (!studentId) {
            console.error("No studentId found. Redirecting to login.");
            window.location.href = "login.html";
            return;
        }

        // ✅ Send studentId to backend
        var response = await fetch(
            `http://localhost:5000/api/student/preferences?studentId=${studentId}`
        );

        var data = await response.json();
        return data;

    } catch (error) {
        console.error('Error fetching preferences:', error);

        // fallback default
        return {
            preferences: {
                mon: { breakfast: 'veg', lunch: 'veg', dinner: 'veg' },
                tue: { breakfast: 'veg', lunch: 'veg', dinner: 'veg' },
                wed: { breakfast: 'veg', lunch: 'veg', dinner: 'veg' },
                thu: { breakfast: 'veg', lunch: 'veg', dinner: 'veg' },
                fri: { breakfast: 'veg', lunch: 'veg', dinner: 'veg' },
                sat: { breakfast: 'veg', lunch: 'veg', dinner: 'veg' },
                sun: { breakfast: 'veg', lunch: 'veg', dinner: 'veg' }
            }
        };
    }
} 

    /**
     * API: GET /api/menu/nonveg-availability
     * MongoDB Collection: menus
     * Description: Check which meals have non-veg options available.
     * Expected Response: { mon: { breakfast: bool, lunch: bool, dinner: bool }, ... }
     */
    async function fetchNonvegAvailability() {
        try {
            var response = await fetch('/api/menu/nonveg-availability');
            var data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching nonveg availability:', error);
            return {
                mon: { breakfast: false, lunch: false, dinner: false },
                tue: { breakfast: true, lunch: true, dinner: true },
                wed: { breakfast: true, lunch: true, dinner: true },
                thu: { breakfast: false, lunch: false, dinner: false },
                fri: { breakfast: true, lunch: true, dinner: true },
                sat: { breakfast: false, lunch: false, dinner: false },
                sun: { breakfast: true, lunch: true, dinner: true }
            };
        }
    }

    /**
     * API: GET /api/student/calendar?studentId=xxx&month=M&year=Y
     * MongoDB Collection: cancellations
     * Description: Fetch cancelled meal days for calendar display.
     * Expected Response: { cancelledDays: [5, 12], month, year, dataAvailable: bool }
     */
    async function fetchCalendarData(month, year) {
        try {
            const studentId = localStorage.getItem("studentId");
            if (!studentId) return { cancelledDays: [], dataAvailable: false };

            // Updated URL with studentId
            var response = await fetch(`http://localhost:5000/api/student/calendar?studentId=${studentId}&month=${month}&year=${year}`);
            var data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching calendar data:', error);
            return { cancelledDays: [], month: month, year: year, dataAvailable: false };
        }
    }

    /**
     * API: GET /api/student/billing?studentId=xxx
     * MongoDB Collections: billing, attendance
     * Description: Fetch billing info for current month.
     * amountDue = totalMeals * amountPerMeal (calculated on backend)
     * Expected Response: { billingPeriod, amountPerMeal, totalMeals, amountDue }
     */
    async function fetchBilling() {
    try {
        // Get student email from localStorage
        var studentId = localStorage.getItem("studentId");
        
        if (!studentId) return { billingPeriod: '--', amountPerMeal: 0, totalMeals: 0, amountDue: 0, grandTotal: 0 };

        var response = await fetch(`http://localhost:5000/api/student/billing?studentId=${studentId}`);
        var data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching billing:', error);
        return { billingPeriod: '--', amountPerMeal: 0, totalMeals: 0, amountDue: 0, grandTotal: 0 };
    }
}
    /**
 * API: POST /api/student/billing
 * Description: Generates and saves the monthly bill to the database.
 */
async function generateStudentBill(month, year, finalAmount) {
    try {
        const studentId = localStorage.getItem("studentId");
        if (!studentId) return { success: false, message: "No Student ID found" };

        const res = await fetch("http://localhost:5000/api/student/billing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                studentId: studentId,
                month: month,
                year: year,
                totalBill: finalAmount,
                status: "Pending" 
            })
        });
        return await res.json();
    } catch (error) {
        console.error("Error generating bill:", error);
        return { success: false, message: "Network error" };
    }
}
    

    /**
     * API: POST /api/student/preferences
     * MongoDB Collection: preferences
     * Description: Save weekly veg/nonveg preferences.
     * Body: { studentId, preferences }
     */
   async function savePreferencesToBackend(currentPreferences) {

    var studentId = localStorage.getItem("studentId");

    var response = await fetch(
        "http://localhost:5000/api/student/preferences",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                studentId,
                preferences: currentPreferences
            })
        }
    );

    return await response.json();
}

    /**
     * API: GET /api/student/feedback/status?studentId=xxx&month=M&year=Y
     * MongoDB Collection: feedback
     * Description: Check if student has already submitted feedback this month.
     * Expected Response: { hasSubmitted: bool }
     */
    async function fetchFeedbackStatus() {
        try {
            const studentId = localStorage.getItem("studentId");
            const now = new Date();
            const m = now.getMonth() + 1;
            const y = now.getFullYear();

            const response = await fetch(`http://localhost:5000/api/student/feedback/status?studentId=${studentId}&month=${m}&year=${y}`);
            return await response.json();
        } catch (error) {
            return { hasSubmitted: false };
        }
    }

    /**
     * API: POST /api/student/feedback
     * MongoDB Collection: feedback
     * Description: Submit monthly vendor feedback.
     * Body: { studentId, month, year, ratings: { overall, foodQuality, cleanliness, behavior }, comment }
     * Rule: Only 1 feedback per student per month. Backend must reject duplicates.
     */
    async function submitFeedback(feedbackData) {
        try {
            const studentId = localStorage.getItem("studentId");
            const profile = await fetchStudentProfile(); // To get the student's name

            const payload = {
                studentId: studentId,
                name: profile.fullName || profile.name,
                ...feedbackData // contains month, year, ratings, comment
            };

            const response = await fetch('http://localhost:5000/api/student/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (error) {
            return { success: false, message: 'Network error.' };
        }
    }


    // =====================================================
    // UTILITY FUNCTIONS
    // =====================================================

    function formatDate(date) {
        var dd = String(date.getDate()).padStart(2, '0');
        var mm = String(date.getMonth() + 1).padStart(2, '0');
        var yyyy = date.getFullYear();
        return dd + '/' + mm + '/' + yyyy;
    }

    var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
    var DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var MEAL_KEYS = ['breakfast','lunch','dinner'];
    var MEAL_LABELS = ['BF','LN','DN'];

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
    // 1. STUDENT PROFILE + PROFILE POPUP
    // =====================================================

    var studentProfileData = null;

    /**
     * Fetches student profile details and populates the profile popup.
     */
    async function fetchStudentProfileDetails() {
        var data = await fetchStudentProfile();
        studentProfileData = data;

        // Update header greeting
        document.getElementById('userName').textContent = data.name;

        // Populate profile popup fields
        document.getElementById('profileName').textContent = data.name;
        document.getElementById('profileFullName').textContent = data.fullName || '--';
        document.getElementById('profileRoom').textContent = data.room || '--';
        document.getElementById('profileHostel').textContent = data.hostel || '--';
        document.getElementById('profilePhone').textContent = data.phone || '--';
        document.getElementById('profileEmail').textContent = data.email || '--';

        // Profile image
        var avatarEl = document.getElementById('profileAvatar');
        if (data.profileImage) {
            avatarEl.innerHTML = '<img src="' + data.profileImage + '" alt="Profile picture of ' + data.name + '">';
        }
    }

    fetchStudentProfileDetails();

    // Open profile popup on user icon click
    document.getElementById('userMenuBtn').addEventListener('click', function () {
        openPopup('profileOverlay');
    });

    setupPopupClose('profileOverlay', 'profileCloseBtn');


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
    // 3. FOOD COUPON
    // Backend checks if today falls within any cancelled date range.
    // If cancelled -> hasCoupon: false -> hide coupon button.
    // =====================================================

    var couponData = null;

    var couponData = null;

(async function loadCouponStatus() {

    var data = await fetchCouponStatus();   // ✅ FIRST get data
    var contentEl = document.getElementById('couponContent');

    if (data.hasCoupon) {

        couponData = data.couponData;       // ✅ THEN assign

        contentEl.innerHTML =
            '<button class="action-btn primary-btn" id="getCouponBtn">Get My Coupon</button>';

        document.getElementById('getCouponBtn').addEventListener('click', function (e) {
            e.stopPropagation();
            showCoupon();
        });

    } else {
        contentEl.innerHTML = '<div class="no-coupon-msg">No coupon found for today</div>';
    }

})();

    function showCoupon() {
        if (!couponData) return;
        document.getElementById('couponName').textContent = couponData.name;
        document.getElementById('couponRoom').textContent = couponData.room;
        document.getElementById('couponDate').textContent = couponData.date;
        setMealBadge('couponBreakfast', couponData.meals.breakfast);
        setMealBadge('couponLunch', couponData.meals.lunch);
        setMealBadge('couponDinner', couponData.meals.dinner);
        openPopup('couponOverlay');
    }

    function setMealBadge(elementId, type) {
        var el = document.getElementById(elementId);
        if (type === 'nonveg') {
            el.textContent = 'Non-Veg';
            el.className = 'coupon-meal-badge badge-nonveg';
        } else {
            el.textContent = 'Veg';
            el.className = 'coupon-meal-badge badge-veg';
        }
    }

    setupPopupClose('couponOverlay', 'couponCloseBtn');


    // =====================================================
    // 4. FOOD CANCEL
    //
    // RULES (from document.md):
    // - Personal Reason:
    //     - No admin approval required
    //     - Cancellation is immediate
    //     - Update personalUsed count on frontend after success
    //     - Meals cancelled instantly
    //
    // - Official Reason:
    //     - Requires admin approval
    //     - Stored as "pending" in database
    //     - Meals cancelled ONLY after admin approves
    //     - Bill deduction ONLY after approval
    //     - Show "Pending Approval" status to student
    // =====================================================

    
    
    var cancelStatus = { personalUsed: 0, personalLimit: 5, pendingOfficial: 0 };

    // Load cancel status on page load
    (async function loadCancelStatus() {
        var data = await fetchCancelStatus();
        cancelStatus = data;
        updateCancelUI();
    })();

    async function loadLeaveNotifications() {
  try {
    var studentId = localStorage.getItem("studentId");
    var res = await fetch("http://localhost:5000/api/student/leaves/status?studentId=" + encodeURIComponent(studentId));
    var data = await res.json();
    var recentlyProcessed = (data.leaves || []).filter(function(l) {
      var updated = new Date(l.submittedAt);
      var hoursSince = (Date.now() - updated) / 3600000;
      return (l.status === "approved" || l.status === "rejected") && hoursSince < 48;
    });
    if (recentlyProcessed.length > 0) {
      recentlyProcessed.forEach(function(l) {
        var from = new Date(l.fromDate).toLocaleDateString("en-IN");
        var to = new Date(l.toDate).toLocaleDateString("en-IN");
        var msg = l.status === "approved"
          ? "✅ Your official meal cancellation (" + from + " – " + to + ") was APPROVED. Bill deducted."
          : "❌ Your official meal cancellation (" + from + " – " + to + ") was REJECTED.";
        alert(msg); // or use a toast/notification UI element
      });
    }
  } catch(e) { console.error("Leave notification error:", e); }
}
loadLeaveNotifications();

    function updateCancelUI() {
        var infoEl = document.getElementById('cancelInfo');
        var used = cancelStatus.personalUsed || 0;
        var limit = cancelStatus.personalLimit || 5;
        var remaining = limit - used;

        var infoHtml = '';
        if (remaining > 0) {
            infoHtml = 'Personal cancels remaining: <strong>' + remaining + '</strong> of ' + limit + ' this month';
        } else {
            infoHtml = 'No personal cancellations left this month. Official cancellations still available.';
        }

        if (cancelStatus.pendingOfficial && cancelStatus.pendingOfficial > 0) {
            infoHtml += '<br><span style="color: #d97706; font-weight: 600;">' + cancelStatus.pendingOfficial + ' official request(s) pending approval</span>';
        }

        infoEl.innerHTML = infoHtml;

        // Also sync the popup status bar (shown when modal is open)
        var usedEl = document.getElementById('personalUsed');
        var limitEl = document.getElementById('personalLimit');
        if (usedEl) usedEl.textContent = used;
        if (limitEl) limitEl.textContent = limit;
    }

    // Open cancel popup — re-fetch from DB every time so usage is always current
    document.getElementById('cancelMealBtn').addEventListener('click', async function () {

        // Re-fetch fresh data from DB before opening popup
        var freshData = await fetchCancelStatus();
        cancelStatus = freshData;
        updateCancelUI();

        var remaining = cancelStatus.personalLimit - cancelStatus.personalUsed;
        var limitMsg = document.getElementById('cancelLimitMsg');
        var reasonSelect = document.getElementById('cancelReason');

        if (remaining <= 0) {
            limitMsg.style.display = 'block';
            var personalOpt = reasonSelect.querySelector('option[value="personal"]');
            if (personalOpt) personalOpt.disabled = true;
        } else {
            limitMsg.style.display = 'none';
            var personalOpt2 = reasonSelect.querySelector('option[value="personal"]');
            if (personalOpt2) personalOpt2.disabled = false;
        }

        // Reset the form
        document.getElementById('cancelForm').reset();
        document.getElementById('documentUploadGroup').style.display = 'none';
        document.getElementById('daysCount').textContent = '0';

        // Set min date to today (can't cancel past meals)
        var today = new Date();
        var yyyy = today.getFullYear();
        var mm = String(today.getMonth() + 1).padStart(2, '0');
        var dd = String(today.getDate()).padStart(2, '0');
        var todayStr = yyyy + '-' + mm + '-' + dd;
        document.getElementById('cancelFromDate').setAttribute('min', todayStr);
        document.getElementById('cancelToDate').setAttribute('min', todayStr);

        openPopup('cancelOverlay');
    });

    // Toggle document upload visibility based on reason
    document.getElementById('cancelReason').addEventListener('change', function () {
        var docGroup = document.getElementById('documentUploadGroup');
        if (this.value === 'official') {
            docGroup.style.display = 'block';
        } else {
            docGroup.style.display = 'none';
        }
    });

    // Calculate days between from and to date
    function calculateDaysBetween(fromDateStr, toDateStr) {
        if (!fromDateStr || !toDateStr) return 0;
        var from = new Date(fromDateStr + 'T00:00:00');
        var to = new Date(toDateStr + 'T00:00:00');
        if (to < from) return 0;
        var msPerDay = 1000 * 60 * 60 * 24;
        return Math.floor((to - from) / msPerDay) + 1;
    }

    // Update days count when dates change
    document.getElementById('cancelFromDate').addEventListener('change', function () {
        var fromDate = this.value;
        var toDate = document.getElementById('cancelToDate').value;
        var days = calculateDaysBetween(fromDate, toDate);
        document.getElementById('daysCount').textContent = days;
    });

    document.getElementById('cancelToDate').addEventListener('change', function () {
        var toDate = this.value;
        var fromDate = document.getElementById('cancelFromDate').value;
        var days = calculateDaysBetween(fromDate, toDate);
        document.getElementById('daysCount').textContent = days;
    });

    // Submit cancel form
    document.getElementById('cancelForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        var fromDate = document.getElementById('cancelFromDate').value;
        var toDate = document.getElementById('cancelToDate').value;
        var reason = document.getElementById('cancelReason').value;

        // Validation
        if (!fromDate) { alert('Please select a from date.'); return; }
        if (!toDate) { alert('Please select a to date.'); return; }
        if (toDate < fromDate) { alert('To date cannot be before from date.'); return; }
        if (!reason) { alert('Please select a reason.'); return; }

        var dayCount = calculateDaysBetween(fromDate, toDate);

        // For personal cancellation: check if days exceed limit
        if (reason === 'personal') {
            var remaining = cancelStatus.personalLimit - cancelStatus.personalUsed;
            if (dayCount > remaining) {
                alert('You can only cancel ' + remaining + ' more day(s) this month. Requested: ' + dayCount + ' day(s).');
                return;
            }
        }

        if (reason === 'official') {
            var fileInput = document.getElementById('cancelDocument');
            if (!fileInput.files || fileInput.files.length === 0) {
                alert('Please upload a PDF document for official cancellation.');
                return;
            }
            var file = fileInput.files[0];
            if (file.type !== 'application/pdf') {
                alert('Only PDF documents are accepted.');
                return;
            }
        }

        /**
         * BACKEND: Build FormData and send to POST /api/student/cancel/request
         *
         * Personal reason -> Backend auto-approves:
         *   - Immediately cancels all meals for date range
         *   - Increments personalUsed by dayCount
         *   - Returns: { success: true, status: "approved", message: "..." }
         *
         * Official reason -> Backend stores as pending:
         *   - Admin must review and approve/reject
         *   - Meals NOT cancelled until approval
         *   - Bill NOT deducted until approval
         *   - Returns: { success: true, status: "pending", message: "..." }
         */
        var formData = {
            name: studentProfileData.fullName || studentProfileData.name,
            email: studentProfileData.email,
            regdNo: studentProfileData.room,
            fromDate: fromDate,
            toDate: toDate,
            reason: reason,
            daysCancelled: dayCount
        };

        // Note: official requests store a PDF reference on the server side.
        // The file is recorded for admin review — server saves it via multer separately.
        // Here we send the JSON metadata; the PDF upload is handled independently.

        var res = await submitCancelRequest(formData);

        if (res.success) {
            if (reason === 'personal') {
                // Personal: immediate cancellation
                cancelStatus.personalUsed += dayCount;
                updateCancelUI();
                alert(res.message || 'Meals cancelled successfully!');
            } else if (reason === 'official') {
                // Official: pending admin approval
                cancelStatus.pendingOfficial = (cancelStatus.pendingOfficial || 0) + 1;
                updateCancelUI();
                alert(res.message || 'Official cancellation request submitted. Pending admin approval.');
            }
            closePopup('cancelOverlay');

            // Refresh coupon status since cancellation may affect today's coupon
            refreshCouponStatus();
        } else {
            alert(res.message || 'Failed to submit cancellation. Please try again.');
        }
    });

    /**
     * Refreshes the coupon status after a cancellation.
     * If the cancelled date range includes today, the coupon will become unavailable.
     */
    async function refreshCouponStatus() {
        var data = await fetchCouponStatus();
        var contentEl = document.getElementById('couponContent');

        if (data.hasCoupon) {
            couponData = data.couponData;
            contentEl.innerHTML = '<button class="action-btn primary-btn" id="getCouponBtn">Get My Coupon</button>';
            document.getElementById('getCouponBtn').addEventListener('click', function (e) {
                e.stopPropagation();
                showCoupon();
            });
        } else {
            couponData = null;
            contentEl.innerHTML = '<div class="no-coupon-msg">No coupon found for today</div>';
        }
    }

    setupPopupClose('cancelOverlay', 'cancelCloseBtn');
    //jade

    // =====================================================
    // OFFICIAL CANCEL REQUEST SUBMISSION
    // =====================================================

    // Make sure 'officialCancelForm' matches the exact ID of the form in your HTML
    var officialForm = document.getElementById('officialCancelForm');

    if (officialForm) {
        officialForm.addEventListener('submit', async function (e) {
            e.preventDefault(); // Stops the page from refreshing

            // 1. Grab the dates from your HTML inputs (adjust IDs if yours are different)
            var fromDate = document.getElementById('officialFromDate').value;
            var toDate = document.getElementById('officialToDate').value;
            
            // Grab the logged-in student's email
            var email = localStorage.getItem("studentId"); 

            // Grab Name and RegdNo (Update the IDs if your inputs are named differently)
            var studentName = document.getElementById('officialName') ? document.getElementById('officialName').value : "Student";
            var regdNo = document.getElementById('officialRegNo') ? document.getElementById('officialRegNo').value : "N/A";

            try {
                // 2. Send the exact payload the backend expects
                var response = await fetch('http://localhost:5000/api/student/cancel-request', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: studentName,
                        regdNo: regdNo,
                        email: email,
                        fromDate: fromDate,
                        toDate: toDate,
                        reason: 'official' // <-- This exact string tells the server to make it "pending"
                    })
                });

                var data = await response.json();
                
                // 3. Show the server's response to the student
                alert(data.message); 

                // 4. If successful, close the popup and refresh the page to update stats
                if (data.success) {
                    document.getElementById('cancelOverlay').classList.remove('active');
                    window.location.reload(); 
                }

            } catch (error) {
                console.error('Official Request Error:', error);
                alert("Failed to connect to the server.");
            }
        });
    }
//jadee
    // =====================================================
    // 5. VEG / NON-VEG PREFERENCE POPUP
    // UI is defined in student_interface.html.
    // JS only loads existing preferences, handles toggle clicks,
    // and sends data to backend.
    // =====================================================

    var currentPreferences = {};
    var nonvegAvailability = {};

    (async function loadPreferences() {
        var results = await Promise.all([fetchPreferences(), fetchNonvegAvailability()]);
        currentPreferences = results[0].preferences;
        nonvegAvailability = results[1];
        buildPreferencePopup();
    })();

    function buildPreferencePopup() {
        var grid = document.getElementById('prefWeekGrid');
        grid.innerHTML = '';

        DAY_KEYS.forEach(function (dayKey, i) {
            var row = document.createElement('div');
            row.className = 'pref-day-row';

            var dayLabel = document.createElement('span');
            dayLabel.className = 'pref-day-name';
            dayLabel.textContent = DAY_LABELS[i];
            row.appendChild(dayLabel);

            var mealGroup = document.createElement('div');
            mealGroup.className = 'pref-meal-group';

            MEAL_KEYS.forEach(function (mealKey, j) {
                var item = document.createElement('div');
                item.className = 'pref-meal-item';

                var label = document.createElement('span');
                label.className = 'pref-meal-name';
                label.textContent = MEAL_LABELS[j];
                item.appendChild(label);

                var toggleGroup = document.createElement('div');
                toggleGroup.className = 'pref-toggle-group';

                var vegBtn = document.createElement('button');
                vegBtn.className = 'pref-toggle-btn';
                vegBtn.textContent = 'V';
                vegBtn.setAttribute('data-day', dayKey);
                vegBtn.setAttribute('data-meal', mealKey);
                vegBtn.setAttribute('data-value', 'veg');

                var nonvegBtn = document.createElement('button');
                nonvegBtn.className = 'pref-toggle-btn';
                nonvegBtn.textContent = 'NV';
                nonvegBtn.setAttribute('data-day', dayKey);
                nonvegBtn.setAttribute('data-meal', mealKey);
                nonvegBtn.setAttribute('data-value', 'nonveg');

                // Check if non-veg is available
                var nvAvailable = nonvegAvailability[dayKey] && nonvegAvailability[dayKey][mealKey];

                if (!nvAvailable) {
                    nonvegBtn.classList.add('disabled');
                    nonvegBtn.setAttribute('disabled', 'true');
                }

                // Current selection
                var currentVal = currentPreferences[dayKey] && currentPreferences[dayKey][mealKey];
                if (!currentVal) currentVal = 'veg';

                // If nonveg not available but pref was nonveg, reset
                if (currentVal === 'nonveg' && !nvAvailable) {
                    currentVal = 'veg';
                    if (currentPreferences[dayKey]) currentPreferences[dayKey][mealKey] = 'veg';
                }

                if (currentVal === 'veg') {
                    vegBtn.classList.add('selected');
                } else {
                    nonvegBtn.classList.add('selected', 'nonveg-selected');
                }

                vegBtn.addEventListener('click', function () {
                    if (!currentPreferences[dayKey]) currentPreferences[dayKey] = {};
                    currentPreferences[dayKey][mealKey] = 'veg';
                    vegBtn.classList.add('selected');
                    nonvegBtn.classList.remove('selected', 'nonveg-selected');
                });

                nonvegBtn.addEventListener('click', function () {
                    if (this.classList.contains('disabled')) return;
                    if (!currentPreferences[dayKey]) currentPreferences[dayKey] = {};
                    currentPreferences[dayKey][mealKey] = 'nonveg';
                    nonvegBtn.classList.add('selected', 'nonveg-selected');
                    vegBtn.classList.remove('selected');
                });

                toggleGroup.appendChild(vegBtn);
                toggleGroup.appendChild(nonvegBtn);
                item.appendChild(toggleGroup);
                mealGroup.appendChild(item);
            });

            row.appendChild(mealGroup);
            grid.appendChild(row);
        });
    }

    document.getElementById('setPrefBtn').addEventListener('click', function () {
        openPopup('prefOverlay');
    });

    document.getElementById('prefSaveBtn').addEventListener('click', async function () {
        var res = await savePreferencesToBackend(currentPreferences);
        if (res.success) {
            alert('Preferences saved successfully!');
            closePopup('prefOverlay');
        } else {
            alert('Failed to save preferences. Please try again.');
        }
    });

    setupPopupClose('prefOverlay', 'prefCloseBtn');


    // =====================================================
    // 6. SPECIAL CALENDAR
    // =====================================================

    var TODAY = new Date();
    var CURRENT_MONTH = TODAY.getMonth();
    var CURRENT_YEAR = TODAY.getFullYear();

    var calendarState = {
        month: CURRENT_MONTH,
        year: CURRENT_YEAR
    };

    var prevMonthDataAvailable = true;

    function updateCalendarNavButtons() {
        var prevBtn = document.getElementById('calPrev');
        var nextBtn = document.getElementById('calNext');

        var isCurrentMonth = (calendarState.month === CURRENT_MONTH && calendarState.year === CURRENT_YEAR);
        if (isCurrentMonth) {
            nextBtn.classList.add('disabled');
        } else {
            nextBtn.classList.remove('disabled');
        }

        if (!prevMonthDataAvailable) {
            prevBtn.classList.add('disabled');
        } else {
            prevBtn.classList.remove('disabled');
        }
    }

    async function renderCalendar() {
        var m = calendarState.month; // 0-indexed
        var y = calendarState.year;

        document.getElementById('calMonthLabel').textContent = MONTH_NAMES[m] + ' ' + y;

        // Fetch data (API expects 1-indexed month)
        var data = await fetchCalendarData(m + 1, y);
        var grid = document.getElementById('calendarGrid');
        grid.innerHTML = '';

        var firstDay = new Date(y, m, 1).getDay();
        var daysInMonth = new Date(y, m + 1, 0).getDate();
        
        // Real-time "Today" comparison
        const realToday = new Date();
        realToday.setHours(0,0,0,0);

        // Empty cells for alignment
        for (var e = 0; e < firstDay; e++) {
            var emptyDiv = document.createElement('div');
            emptyDiv.className = 'calendar-day empty';
            grid.appendChild(emptyDiv);
        }

        for (var day = 1; day <= daysInMonth; day++) {
            var dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            dayDiv.textContent = day;

            const cellDate = new Date(y, m, day);
            cellDate.setHours(0,0,0,0);

            // 1. Check if it's TODAY
            if (cellDate.getTime() === realToday.getTime()) {
                dayDiv.classList.add('today');
            } 
            // 2. Check if it's CANCELLED (from Database)
            else if (data.cancelledDays && data.cancelledDays.includes(day)) {
                dayDiv.classList.add('cancelled');
            } 
            // 3. Check if it's FUTURE
            else if (cellDate > realToday) {
                dayDiv.classList.add('future');
            }
            // Else: Defaults to 'Meal Taken' (Standard green style in your CSS)

            grid.appendChild(dayDiv);
        }
        updateCalendarNavButtons();
    }

    document.getElementById('calPrev').addEventListener('click', function () {
        if (this.classList.contains('disabled')) return;

        calendarState.month--;
        if (calendarState.month < 0) {
            calendarState.month = 11;
            calendarState.year--;
        }
        renderCalendar();
    });

    document.getElementById('calNext').addEventListener('click', function () {
        if (this.classList.contains('disabled')) return;

        var nextM = calendarState.month + 1;
        var nextY = calendarState.year;
        if (nextM > 11) { nextM = 0; nextY++; }

        if (nextY > CURRENT_YEAR || (nextY === CURRENT_YEAR && nextM > CURRENT_MONTH)) {
            return;
        }

        calendarState.month = nextM;
        calendarState.year = nextY;
        renderCalendar();
    });

    renderCalendar();


    // =====================================================
    // 7. BILLING
    // =====================================================

    // FIND THIS BLOCK IN student_interface.js
document.getElementById('fetchBillBtn').addEventListener('click', async function () {
    var data = await fetchBilling(); // This calls GET /api/student/billing
    
    // Check if data is valid
    if(!data) return alert("Could not fetch billing data");

    // Map server response to your UI IDs
    document.getElementById('billPerMeal').textContent = 'Rs. ' + data.amountPerMeal;
    document.getElementById('billMeals').textContent = data.totalMeals + ' meals';
    document.getElementById('monthlyDue').textContent = 'Rs. ' + data.amountDue;
    document.getElementById('totalDue').textContent = 'Rs. ' + (data.grandTotal || data.amountDue);

    openPopup('billOverlay');
});

    setupPopupClose('billOverlay', 'billCloseBtn');





    // =====================================================
    // 9. VENDOR FEEDBACK SYSTEM
    //
    // On page load:
    //   - Check if student already submitted feedback this month
    //   - If hasSubmitted = false -> show "Submit Feedback" button
    //   - If hasSubmitted = true  -> show "Thank you" message
    //
    // Popup:
    //   - 4 star ratings (Overall, Food Quality, Cleanliness, Behavior)
    //   - Optional comment textarea
    //   - Submit button
    //
    // After success:
    //   - Close popup
    //   - Update UI to show Thank You message
    //   - Do NOT reload page
    // =====================================================

    var feedbackRatings = {
        overall: 0,
        foodQuality: 0,
        cleanliness: 0,
        behavior: 0
    };

    /**
     * Load feedback status on page load.
     * Shows button or thank-you message based on backend response.
     */
    (async function loadFeedbackStatus() {
        var data = await fetchFeedbackStatus();
        var contentEl = document.getElementById('feedbackContent');

        if (data.hasSubmitted) {
            showFeedbackThankyou(contentEl);
        } else {
            showFeedbackButton(contentEl);
        }
    })();

    function showFeedbackThankyou(contentEl) {
        contentEl.innerHTML = '<div class="feedback-thankyou">Thank you for your feedback &#10084;&#65039;</div>';
    }

    function showFeedbackButton(contentEl) {
        contentEl.innerHTML = '<button class="action-btn primary-btn" id="submitFeedbackBtn">Submit Feedback</button>';
        document.getElementById('submitFeedbackBtn').addEventListener('click', function () {
            // Reset all star ratings when opening
            feedbackRatings = { overall: 0, foodQuality: 0, cleanliness: 0, behavior: 0 };
            resetAllStars();
            var feedbackForm = document.getElementById('feedbackForm');
            if (feedbackForm) feedbackForm.reset();
            openPopup('feedbackOverlay');
        });
    }

    // Star rating click handlers
    function setupStarRatings() {
        var allStarGroups = document.querySelectorAll('.star-rating');

        allStarGroups.forEach(function (group) {
            var category = group.getAttribute('data-category');
            var stars = group.querySelectorAll('.star-btn');

            stars.forEach(function (starBtn) {
                starBtn.addEventListener('click', function () {
                    var value = parseInt(this.getAttribute('data-value'));
                    feedbackRatings[category] = value;

                    // Update star visuals for this group
                    stars.forEach(function (s) {
                        var sVal = parseInt(s.getAttribute('data-value'));
                        if (sVal <= value) {
                            s.classList.add('active');
                        } else {
                            s.classList.remove('active');
                        }
                    });
                });

                // Hover effect
                starBtn.addEventListener('mouseenter', function () {
                    var value = parseInt(this.getAttribute('data-value'));
                    stars.forEach(function (s) {
                        var sVal = parseInt(s.getAttribute('data-value'));
                        if (sVal <= value) {
                            s.classList.add('active');
                        } else {
                            s.classList.remove('active');
                        }
                    });
                });

                starBtn.addEventListener('mouseleave', function () {
                    // Restore to current rating
                    var currentRating = feedbackRatings[category];
                    stars.forEach(function (s) {
                        var sVal = parseInt(s.getAttribute('data-value'));
                        if (sVal <= currentRating) {
                            s.classList.add('active');
                        } else {
                            s.classList.remove('active');
                        }
                    });
                });
            });
        });
    }

    function resetAllStars() {
        var allStars = document.querySelectorAll('.star-btn');
        allStars.forEach(function (s) {
            s.classList.remove('active');
        });
    }

    setupStarRatings();

    // Submit feedback form
    document.getElementById('feedbackForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        // Validate all ratings are provided
        if (feedbackRatings.overall === 0) { alert('Please rate Overall.'); return; }
        if (feedbackRatings.foodQuality === 0) { alert('Please rate Food Quality.'); return; }
        if (feedbackRatings.cleanliness === 0) { alert('Please rate Cleanliness.'); return; }
        if (feedbackRatings.behavior === 0) { alert('Please rate Staff Behavior.'); return; }

        var now = new Date();
        var feedbackData = {
            month: now.getMonth() + 1,
            year: now.getFullYear(),
            ratings: {
                overall: feedbackRatings.overall,
                foodQuality: feedbackRatings.foodQuality,
                cleanliness: feedbackRatings.cleanliness,
                behavior: feedbackRatings.behavior
            },
            comment: document.getElementById('feedbackComment').value.trim()
        };

        var res = await submitFeedback(feedbackData);

        if (res.success) {
            closePopup('feedbackOverlay');
            // Update UI to show Thank You message (no page reload)
            var contentEl = document.getElementById('feedbackContent');
            showFeedbackThankyou(contentEl);
        } else {
            alert(res.message || 'Failed to submit feedback. Please try again.');
        }
    });

    setupPopupClose('feedbackOverlay', 'feedbackCloseBtn');

});