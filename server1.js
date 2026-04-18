const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");

const app = express();

app.use(express.json());
app.use(cors());

mongoose.connect("mongodb://127.0.0.1:27017/studentDB")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// =============================
// USER SCHEMA
// =============================
const UserSchema = new mongoose.Schema({
  email: String,
  password: String,
  fullName: String,
  room: String,
  hostel: String,
  phone: String
});

const User = mongoose.model("User", UserSchema);

// =============================
// LOGIN ROUTE
// =============================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res.json({ success: false, message: "User not found" });
  }

  const isMatch = password === user.password;

  if (!isMatch) {
    return res.json({ success: false, message: "Invalid password" });
  }

  res.json({ success: true });
});

// =============================
// GET STUDENT PROFILE
// =============================
app.get("/api/student/profile", async (req, res) => {
  const studentId = req.query.studentId;

  if (!studentId) {
    return res.status(400).json({ error: "studentId required" });
  }

  const user = await User.findOne({ email: studentId });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    name: user.fullName || user.email.split("@")[0],
    fullName: user.fullName || "--",
    room: user.room || "--",
    hostel: user.hostel || "--",
    phone: user.phone || "--",
    email: user.email,
    profileImage: ""
  });
});

// =============================
// PREFERENCE SCHEMA
// =============================
const PreferenceSchema = new mongoose.Schema({
  studentId: { type: String, required: true },

  preferences: {
    mon: { breakfast: String, lunch: String, dinner: String },
    tue: { breakfast: String, lunch: String, dinner: String },
    wed: { breakfast: String, lunch: String, dinner: String },
    thu: { breakfast: String, lunch: String, dinner: String },
    fri: { breakfast: String, lunch: String, dinner: String },
    sat: { breakfast: String, lunch: String, dinner: String },
    sun: { breakfast: String, lunch: String, dinner: String }
  }

}, { timestamps: true });

const Preference = mongoose.model("Preference", PreferenceSchema);

// =============================
// GET STUDENT PREFERENCES
// =============================
app.get("/api/student/preferences", async (req, res) => {
  const studentId = req.query.studentId;

  if (!studentId) {
    return res.status(400).json({ error: "studentId required" });
  }

  let pref = await Preference.findOne({ studentId });

  // If first time → create default veg
  if (!pref) {
    pref = new Preference({
      studentId,
      preferences: {
        mon: { breakfast: "veg", lunch: "veg", dinner: "veg" },
        tue: { breakfast: "veg", lunch: "veg", dinner: "veg" },
        wed: { breakfast: "veg", lunch: "veg", dinner: "veg" },
        thu: { breakfast: "veg", lunch: "veg", dinner: "veg" },
        fri: { breakfast: "veg", lunch: "veg", dinner: "veg" },
        sat: { breakfast: "veg", lunch: "veg", dinner: "veg" },
        sun: { breakfast: "veg", lunch: "veg", dinner: "veg" }
      }
    });

    await pref.save();
  }

  res.json({ preferences: pref.preferences });
});

// =============================
// SAVE STUDENT PREFERENCES
// =============================
app.post("/api/student/preferences", async (req, res) => {
  const { studentId, preferences } = req.body;

  if (!studentId || !preferences) {
    return res.status(400).json({ success: false });
  }

  await Preference.findOneAndUpdate(
    { studentId },
    { preferences },
    { upsert: true, new: true }
  );

  res.json({ success: true });
});


// =============================
// FOOD CANCEL SCHEMA
// =============================
// FIX: One document per student. All cancellations stored inside
// the `cancellations` array. Monthly usage tracked in `monthlyUsage`
// map (key = "YYYY-MM", value = days used that month).
// =============================
const CancellationEntrySchema = new mongoose.Schema({
  fromDate: { type: Date, required: true },
  toDate:   { type: Date, required: true },
  daysCancelled: { type: Number, required: true },
  reason: { type: String, enum: ["personal", "official"], required: true },
  status: { type: String, enum: ["approved", "pending", "rejected"], default: "approved" },
  submittedAt: { type: Date, default: Date.now }
});

const FoodCancelSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true }, // one doc per student

  name:    String,
  regdNo:  String,
  email:   String,

  // All cancellation entries for this student
  cancellations: [CancellationEntrySchema],

  // Key = "YYYY-MM" (e.g. "2026-03"), Value = personal days used that month
  monthlyUsage: {
    type: Map,
    of: Number,
    default: {}
  }

}, { timestamps: true });

const FoodCancel = mongoose.model("FoodCancel", FoodCancelSchema);


// =============================
// HELPER — get "YYYY-MM" key for a given Date
// =============================
function monthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// =============================
// HELPER — check if a given date falls inside any approved cancellation
// =============================
function isDateCancelled(date, cancellations) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  return cancellations.some(c => {
    if (c.status !== "approved") return false;
    const from = new Date(c.fromDate); from.setHours(0, 0, 0, 0);
    const to   = new Date(c.toDate);   to.setHours(0, 0, 0, 0);
    return d >= from && d <= to;
  });
}


// =============================
// SUBMIT CANCEL REQUEST
// =============================
app.post("/api/student/cancel-request", async (req, res) => {
  try {
    const { name, regdNo, email, fromDate, toDate, reason } = req.body;

    // Basic validation
    if (!email || !fromDate || !toDate || !reason) {
      return res.json({ success: false, message: "Missing required fields" });
    }

    const from = new Date(fromDate);
    const to   = new Date(toDate);
    from.setHours(0, 0, 0, 0);
    to.setHours(0, 0, 0, 0);

    if (to < from) {
      return res.json({ success: false, message: "Invalid date range" });
    }

    const dayCount = Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1;

    // ─────────────────────────────────────────────
    // Split days across months
    // e.g. March 31 → April 1 gives: { "2026-03": 1, "2026-04": 1 }
    // ─────────────────────────────────────────────
    const monthBreakdown = {}; // { "YYYY-MM": daysCount }
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      const k = monthKey(d);
      monthBreakdown[k] = (monthBreakdown[k] || 0) + 1;
    }

    // ─────────────────────────────────────────────
    // MONTHLY LIMIT CHECK (personal only)
    // Check each month in the range independently
    // ─────────────────────────────────────────────
    const studentDoc = await FoodCancel.findOne({ studentId: email });

    if (reason === "personal") {
      for (const [k, days] of Object.entries(monthBreakdown)) {
        const usedThisMonth = studentDoc?.monthlyUsage?.get(k) || 0;
        if (usedThisMonth + days > 5) {
          return res.json({
            success: false,
            message: `Monthly limit exceeded for ${k}. You used ${usedThisMonth}/5 days.`
          });
        }
      }
    }

    // ─────────────────────────────────────────────
    // BUILD THE NEW CANCELLATION ENTRY
    // ─────────────────────────────────────────────
    const newEntry = {
      fromDate: from,
      toDate:   to,
      daysCancelled: dayCount,
      reason,
      status: reason === "personal" ? "approved" : "pending",
      submittedAt: new Date()
    };

    // ─────────────────────────────────────────────
    // Build the monthlyUsage $inc update object
    // e.g. { "monthlyUsage.2026-03": 1, "monthlyUsage.2026-04": 1 }
    // ─────────────────────────────────────────────
    const usageInc = {};
    if (reason === "personal") {
      for (const [k, days] of Object.entries(monthBreakdown)) {
        usageInc[`monthlyUsage.${k}`] = days;
      }
    }

    if (!studentDoc) {
      // First cancellation — create the document with $setOnInsert + $push
      await FoodCancel.findOneAndUpdate(
        { studentId: email },
        {
          $setOnInsert: { name, regdNo, email },
          $push: { cancellations: newEntry },
          ...(Object.keys(usageInc).length > 0 && { $inc: usageInc })
        },
        { upsert: true, new: true }
      );
    } else {
      // Existing document — push entry and increment monthly usage
      await FoodCancel.findOneAndUpdate(
        { studentId: email },
        {
          $push: { cancellations: newEntry },
          ...(Object.keys(usageInc).length > 0 && { $inc: usageInc })
        }
      );
    }

    res.json({
      success: true,
      message: reason === "personal"
        ? "Meals cancelled successfully"
        : "Official request sent for admin approval"
    });

  } catch (err) {
    console.error("Cancel Request Error:", err);
    res.json({ success: false, message: "Server error" });
  }
});


// =============================
// GET CANCEL STATUS
// (used days this month + pending official count)
// =============================
app.get("/api/student/cancel-status", async (req, res) => {
  try {
    const { studentId } = req.query;

    if (!studentId) {
      return res.status(400).json({ error: "studentId required" });
    }

    const key = monthKey(new Date()); // current month "YYYY-MM"

    const studentDoc = await FoodCancel.findOne({ studentId });

    // Personal days used this month — read directly from monthlyUsage map
    const personalUsed = studentDoc?.monthlyUsage?.get(key) || 0;

    // Count pending official requests
    const pendingOfficial = studentDoc
      ? studentDoc.cancellations.filter(
          c => c.reason === "official" && c.status === "pending"
        ).length
      : 0;

    res.json({
      personalUsed,
      personalLimit: 5,
      pendingOfficial
    });

  } catch (err) {
    console.error("Cancel Status Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// =============================
// GET TODAY'S COUPON
// Logic:
//   1. Check if today is a cancelled (approved) day → no coupon
//   2. Otherwise, read veg/non-veg preference for today's weekday
//   3. Return coupon with meal type per slot
// =============================
app.get("/api/student/coupon/today", async (req, res) => {
  try {
    const studentId = req.query.studentId;

    if (!studentId) {
      return res.status(400).json({ error: "studentId required" });
    }

    // Fetch user
    const user = await User.findOne({ email: studentId });
    if (!user) {
      return res.json({ hasCoupon: false, reason: "User not found" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ─── Step 1: Check if today is cancelled ───
    const studentDoc = await FoodCancel.findOne({ studentId });

    if (studentDoc && isDateCancelled(today, studentDoc.cancellations)) {
      return res.json({
        hasCoupon: false,
        reason: "Food cancelled for today"
      });
    }

    // ─── Step 2: Fetch veg/non-veg preferences ───
    const prefDoc = await Preference.findOne({ studentId });

    if (!prefDoc) {
      return res.json({ hasCoupon: false, reason: "Preferences not set" });
    }

    const days      = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const todayKey  = days[today.getDay()];
    const todayMeals = prefDoc.preferences[todayKey];

    if (!todayMeals) {
      return res.json({ hasCoupon: false, reason: "No preference for today" });
    }

    // ─── Step 3: Generate coupon ───
    res.json({
      hasCoupon: true,
      couponData: {
        name:  user.fullName || user.email,
        room:  user.room   || "--",
        hostel: user.hostel || "--",
        date:  today.toISOString().split("T")[0],
        meals: {
          breakfast: todayMeals.breakfast, // "veg" | "non-veg"
          lunch:     todayMeals.lunch,
          dinner:    todayMeals.dinner
        }
      }
    });

  } catch (err) {
    console.error("Coupon Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// =============================
// BILLING SCHEMA
// =============================
const BillingSchema = new mongoose.Schema({
  name:    String,
  regdNo:  String,
  email:   String,

  billingPeriod:  String,  // e.g. "March 2026"
  amountPerMeal:  Number,
  totalMeals:     Number,  // days eaten
  amountDue:      Number   // totalMeals * amountPerMeal
});

const Billing = mongoose.model("Billing", BillingSchema);


// =============================
// GET STUDENT BILLING (auto-computed)
// =============================
app.get("/api/student/billing", async (req, res) => {
  try {
    const studentId = req.query.studentId;

    if (!studentId) {
      return res.status(400).json({ error: "studentId required" });
    }

    const user = await User.findOne({ email: studentId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const today = new Date();
    const year  = today.getFullYear();
    const month = today.getMonth();

  const billingPeriod = today.toLocaleString("default", { month: "long", year: "numeric" });
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0); // Normalize today to start of day
    const start = new Date(year, month, 1);
    const end   = new Date(year, month + 1, 0, 23, 59, 59);

    // Fetch student's FoodCancel doc
    const studentDoc = await FoodCancel.findOne({ studentId });

    let cancelledDays = 0;

    if (studentDoc) {
      // Only count approved cancellations that overlap this month
      studentDoc.cancellations
  // Include pending official requests so the bill drops immediately upon submission
  .filter(c => c.status === "approved" || (c.reason === "official" && c.status === "pending"))
        .forEach(c => {
          const from = new Date(c.fromDate); from.setHours(0, 0, 0, 0);
          const to   = new Date(c.toDate);   to.setHours(0, 0, 0, 0);

          // Overlap with current month
          const overlapStart = from > start ? from : start;
          const overlapEnd   = to   < end   ? to   : end;

          if (overlapEnd >= overlapStart) {
            cancelledDays +=
              Math.floor((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
          }
        });
    }

    // Calculate based on days passed in the month, not the whole month
   // Calculate based on days passed so far in the month
    const currentDay = today.getDate(); 
    // Ensure cancelledDays only counts days UP TO today
    const mealsEaten = Math.max(0, currentDay - cancelledDays);
    const amountPerMeal = 100;
    const amountDue = mealsEaten * amountPerMeal;

    res.json({ billingPeriod, amountPerMeal, totalMeals: daysEaten, amountDue });

  } catch (err) {
    console.error("Billing Error:", err);
    res.status(500).json({
      billingPeriod: "--", amountPerMeal: 0, totalMeals: 0, amountDue: 0
    });
  }
});


// =============================
// SAVE BILLING (manual snapshot)
// =============================
app.post("/api/student/billing", async (req, res) => {
  try {
    const { name, regdNo, email, billingPeriod, amountPerMeal, totalMeals } = req.body;

    const amountDue = amountPerMeal * totalMeals;

    const bill = new Billing({ name, regdNo, email, billingPeriod, amountPerMeal, totalMeals, amountDue });
    await bill.save();

    res.json({ success: true });
  } catch (err) {
    console.error("Save Billing Error:", err);
    res.json({ success: false });
  }
});

// =============================
// DAILY SNAPSHOT SCHEMA (For Vendor)
// =============================
const DailySnapshotSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // "YYYY-MM-DD"
  totalCoupons: { type: Number, default: 0 },
  breakdown: {
    breakfast: { veg: { type: Number, default: 0 }, nonveg: { type: Number, default: 0 } },
    lunch:     { veg: { type: Number, default: 0 }, nonveg: { type: Number, default: 0 } },
    dinner:    { veg: { type: Number, default: 0 }, nonveg: { type: Number, default: 0 } }
  }
});

const DailySnapshot = mongoose.model("DailySnapshot", DailySnapshotSchema);

// =============================================
// REUSABLE HELPER: Compute Bill for any Month
// =============================================
async function computeMonthlyBill(studentId, year, month) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  const totalDays = end.getDate();
  const monthStr = start.toLocaleString("default", { month: "long", year: "numeric" });
  
  const studentDoc = await FoodCancel.findOne({ studentId });
  let cancelledDays = 0;

  if (studentDoc) {
   studentDoc.cancellations
  // Include pending official requests so the bill drops immediately upon submission
  .filter(c => c.status === "approved" || (c.reason === "official" && c.status === "pending"))
      .forEach(c => {
        const from = new Date(c.fromDate); from.setHours(0, 0, 0, 0);
        const to   = new Date(c.toDate);   to.setHours(0, 0, 0, 0);
        const overlapStart = from > start ? from : start;
        const overlapEnd   = to < end ? to : end;
        if (overlapEnd >= overlapStart) {
          cancelledDays += Math.floor((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
        }
      });
  }

  const today = new Date();
  // If viewing the current month, only calculate up to today's date
  const daysToCount = (month === today.getMonth() && year === today.getFullYear()) 
                      ? today.getDate() 
                      : totalDays;

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  // Use today's date if calculating the current month
  const effectiveDaysPassed = (month === todayDate.getMonth() && year === todayDate.getFullYear()) 
                               ? todayDate.getDate() 
                               : totalDays;

  const daysEaten = Math.max(0, effectiveDaysPassed - cancelledDays);
  const amountPerMeal = 100; 
  return {
    month: monthStr,
    totalMeals: daysEaten,
    amountDue: daysEaten * amountPerMeal
  };
}

// =============================
// VENDOR: GET COUPON SUMMARY
// =============================
app.get("/api/vendor/coupon-summary", async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split("T")[0];
    
    // On-the-fly calculation: Count all students who HAVEN'T cancelled for this date
    const targetDate = new Date(date);
    targetDate.setHours(0,0,0,0);
    
    const allUsers = await User.find();
    const cancellations = await FoodCancel.find();
    
    let summary = {
      date,
      totalCoupons: 0,
      breakfast: { veg: 0, nonveg: 0 },
      lunch: { veg: 0, nonveg: 0 },
      dinner: { veg: 0, nonveg: 0 }
    };

    for (const user of allUsers) {
      const studentCancel = cancellations.find(c => c.studentId === user.email);
      const isCancelled = studentCancel && isDateCancelled(targetDate, studentCancel.cancellations);
      
      if (!isCancelled) {
        summary.totalCoupons++;
        const pref = await Preference.findOne({ studentId: user.email });
        const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][targetDate.getDay()];
        const dayPref = pref?.preferences[dayKey] || { breakfast: "veg", lunch: "veg", dinner: "veg" };
        
        summary.breakfast[dayPref.breakfast]++;
        summary.lunch[dayPref.lunch]++;
        summary.dinner[dayPref.dinner]++;
      }
    }
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// =============================
// ADMIN: GET ALL BILLING
// =============================
app.get("/api/admin/all-billing", async (req, res) => {
  try {
    const students = await User.find();
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const report = await Promise.all(students.map(async (s) => {
      // 1. Current Month
      const current = await computeMonthlyBill(s.email, currentYear, currentMonth);
      
      // 2. Historical Breakdown (Example: last 3 months)
      const history = [];
      for (let i = 1; i <= 3; i++) {
        const d = new Date(currentYear, currentMonth - i, 1);
        history.push(await computeMonthlyBill(s.email, d.getFullYear(), d.getMonth()));
      }

      const totalAccumulated = history.reduce((sum, m) => sum + m.amountDue, current.amountDue);

      return {
        name: s.fullName || s.email,
        email: s.email,
        totalAccumulated,
        currentMonth: current,
        history: history
      };
    }));

    // Sort by highest due
    report.sort((a, b) => b.totalAccumulated - a.totalAccumulated);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// =============================
// ADMIN: GET SINGLE STUDENT BILLING
// =============================
app.get("/api/admin/student-billing", async (req, res) => {
  const { studentId } = req.query;
  if (!studentId) return res.status(400).json({ error: "studentId required" });

  const today = new Date();
  const bill = await computeMonthlyBill(studentId, today.getFullYear(), today.getMonth());
  res.json(bill);
});
// =============================
// SERVER START
// =============================
app.listen(5000, () => {
  console.log("Server running on port 5000");
});