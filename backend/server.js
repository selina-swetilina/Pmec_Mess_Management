const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// Models (adminDB)
const Notice = require("./models/Notice");
const Admin = require("./models/AddAdmin");
const Policy = require("./models/Policy");
const Hostel = require("./models/Hostel");
const Student = require("./models/Student");
const Vendor = require("./models/Vendor");

const app = express();
app.use(express.json());
app.use(cors());

// Serve static files from backend dir (uploads, etc.)
app.use(express.static(path.join(__dirname)));
// Serve frontend static files from public dir (admin.html, login.html, etc.)
app.use(express.static(path.join(__dirname, "..")));

// ============================================================
// INJECTION PREVENTION MIDDLEWARE
// ============================================================

/**
 * Sanitize a single string value:
 * - Strips HTML/script tags (XSS prevention)
 * - Blocks MongoDB/NoSQL injection operators like $gt, $ne, $regex, etc.
 * - Removes dangerous characters used in object injection
 */
function sanitizeString(value) {
  if (typeof value !== "string") return value;
  // Strip HTML/script tags
  value = value.replace(/<[^>]*>/g, "");
  // Block NoSQL operators (e.g., { "$gt": "" } bypass attacks)
  value = value.replace(/\$[a-zA-Z_]+/g, "");
  return value;
}

/**
 * Recursively sanitize all string values in an object/array.
 * Rejects any key starting with '$' (MongoDB operator injection).
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (typeof obj === "object") {
    const clean = {};
    for (const key of Object.keys(obj)) {
      // Reject keys starting with $ (NoSQL operator injection)
      if (key.startsWith("$")) continue;
      clean[key] = sanitizeObject(obj[key]);
    }
    return clean;
  }
  return obj;
}

// Apply sanitization to all incoming requests
app.use((req, res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === "object") {
    req.query = sanitizeObject(req.query);
  }
  if (req.params && typeof req.params === "object") {
    req.params = sanitizeObject(req.params);
  }
  next();
});

// ============================================================
// DATABASE CONNECTIONS
// ============================================================

// adminDB → notices, admins, students, policy
mongoose.connect("mongodb://127.0.0.1:27017/adminDB")
  .then(() => {
    console.log("Connected to adminDB");
    Admin.createIndexes();
  })
  .catch(err => console.log(err));

// studentDB → users, preferences, food cancels, billing
const studentConnection = mongoose.createConnection(
  "mongodb://127.0.0.1:27017/studentDB"
);
studentConnection.on("connected", () => console.log("Connected to studentDB"));

// ============================================================
// SCHEMAS & MODELS  (studentDB)
// ============================================================

const UserSchema = new mongoose.Schema({
  email: String,
  password: String,
  fullName: String,
  room: String,
  hostel: String,
  phone: String,
  resetToken: String,
  resetTokenExpiry: Date
});
const User = studentConnection.model("User", UserSchema);

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
const Preference = studentConnection.model("Preference", PreferenceSchema);

// ── FoodCancel: one doc per student, all entries in cancellations[] ──────────
const CancellationEntrySchema = new mongoose.Schema({
  fromDate:      { type: Date,   required: true },
  toDate:        { type: Date,   required: true },
  daysCancelled: { type: Number, required: true },
  reason:        { type: String, enum: ["personal", "official"], required: true },
  status:        { type: String, enum: ["approved", "pending", "rejected"], default: "approved" },
  submittedAt:   { type: Date,   default: Date.now }
});

const FoodCancelSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name:    String,
  regdNo:  String,
  email:   String,
  cancellations: [CancellationEntrySchema],
  // Key = "YYYY-MM", Value = personal days used that month
  monthlyUsage: { type: Map, of: Number, default: {} }
}, { timestamps: true });
const FoodCancel = studentConnection.model("FoodCancel", FoodCancelSchema);

// ── StudentBilling: one doc per student, month-by-month bill history ─────────
const MonthlyBillEntrySchema = new mongoose.Schema({
  monthKey:      { type: String, required: true },
  monthLabel:    { type: String, required: true },
  totalMeals:    { type: Number, required: true },
  amountPerMeal: { type: Number, default: 100 },
  amountDue:     { type: Number, required: true },
  updatedAt:     { type: Date,   default: Date.now }
}, { _id: false });

const StudentBillingSchema = new mongoose.Schema({
  studentId:    { type: String, required: true, unique: true },
  name:         String,
  monthlyBills: [MonthlyBillEntrySchema]
}, { timestamps: true });
const StudentBilling = studentConnection.model("StudentBilling", StudentBillingSchema);

// ── Student-facing notice schema (separate from admin Notice model) ───────────
const StudentNoticeSchema = new mongoose.Schema({
  title:     { type: String, required: true },
  pdfUrl:    { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const StudentNotice = studentConnection.model("StudentNotice", StudentNoticeSchema);

// ── Vendor Feedback ──────────────────────────────────────────────────────────
const VendorFeedbackSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name:  String,
  month: Number,
  year:  Number,
  ratings: {
    overall:     { type: Number, default: 0 },
    foodQuality: { type: Number, default: 0 },
    cleanliness: { type: Number, default: 0 },
    behavior:    { type: Number, default: 0 }
  },
  comment: { type: String, default: "" }
}, { timestamps: true });
const VendorFeedback = studentConnection.model("VendorFeedback", VendorFeedbackSchema);

// ============================================================
// MULTER CONFIGS
// ============================================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename:    (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

const vendorStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename:    (req, file, cb) => cb(null, "contract_" + Date.now() + path.extname(file.originalname))
});
const vendorUpload = multer({ storage: vendorStorage });

const menuStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename:    (req, file, cb) => cb(null, "menu_" + Date.now() + path.extname(file.originalname))
});
const menuUpload = multer({ storage: menuStorage });

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/** Returns "YYYY-MM" string for a given Date */
function monthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Returns true if a date falls inside any approved cancellation entry */
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

/** Compute billing for a given student + year/month */
async function computeMonthlyBill(studentId, year, month) {
  const AMOUNT_PER_MEAL = 100;

  const monthStart = new Date(year, month, 1);
  monthStart.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isCurrentMonth = (year === today.getFullYear() && month === today.getMonth());
  const daysPassed     = isCurrentMonth ? today.getDate() : new Date(year, month + 1, 0).getDate();
  const countUpTo      = isCurrentMonth ? today : new Date(year, month + 1, 0);
  countUpTo.setHours(23, 59, 59, 999);

  const cancelDoc = await FoodCancel.findOne({ studentId });
  let cancelledDays = 0;

  if (cancelDoc) {
    cancelDoc.cancellations
      .filter(c => c.status === "approved" || (c.reason === "official" && c.status === "pending"))
      .forEach(c => {
        const from = new Date(c.fromDate); from.setHours(0, 0, 0, 0);
        const to   = new Date(c.toDate);   to.setHours(0, 0, 0, 0);
        const overlapStart = from > monthStart ? from : monthStart;
        const overlapEnd   = to   < countUpTo  ? to   : countUpTo;
        if (overlapEnd >= overlapStart) {
          cancelledDays += Math.floor((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
        }
      });
  }

  const totalMeals = Math.max(0, daysPassed - cancelledDays);
  const mKey       = `${year}-${String(month + 1).padStart(2, "0")}`;
  const mLabel     = monthStart.toLocaleString("default", { month: "long", year: "numeric" });

  return { monthKey: mKey, monthLabel: mLabel, totalMeals, amountPerMeal: AMOUNT_PER_MEAL, amountDue: totalMeals * AMOUNT_PER_MEAL };
}

/** Upsert a monthly bill entry — same monthKey → replace, new → append */
async function upsertMonthBill(studentId, name, billEntry) {
  const entry = { ...billEntry, updatedAt: new Date() };
  const doc   = await StudentBilling.findOne({ studentId });

  if (!doc) {
    await StudentBilling.create({ studentId, name, monthlyBills: [entry] });
    return;
  }

  const exists = doc.monthlyBills.some(b => b.monthKey === billEntry.monthKey);

  if (exists) {
    await StudentBilling.updateOne(
      { studentId, "monthlyBills.monthKey": billEntry.monthKey },
      {
        $set: {
          "monthlyBills.$.monthLabel":    entry.monthLabel,
          "monthlyBills.$.totalMeals":    entry.totalMeals,
          "monthlyBills.$.amountPerMeal": entry.amountPerMeal,
          "monthlyBills.$.amountDue":     entry.amountDue,
          "monthlyBills.$.updatedAt":     entry.updatedAt
        }
      }
    );
  } else {
    await StudentBilling.updateOne(
      { studentId },
      { $push: { monthlyBills: { $each: [entry], $sort: { monthKey: 1 } } } }
    );
  }
}

// ============================================================
// VENDOR ROUTES  (/api/admin/vendors)
// ============================================================

// Register a new vendor
app.post("/api/admin/vendors", vendorUpload.single("contract"), async (req, res) => {
  try {
    const { name, phone, email, aadhaar, tenure, hostel } = req.body;
    if (!name || !phone) return res.status(400).json({ message: "Vendor name and phone are required" });
    const vendor = new Vendor({
      name, phone, email, aadhaar, tenure, hostel,
      contract: req.file ? req.file.filename : null,
      rating: 0,
      password: "Password@123"
    });
    await vendor.save();
    res.status(201).json(vendor);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all vendors
app.get("/api/admin/vendors", async (req, res) => {
  try {
    const vendors = await Vendor.find().sort({ createdAt: -1 });
    res.json(vendors);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete vendor
app.delete("/api/admin/vendors/:id", async (req, res) => {
  try {
    await Vendor.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update vendor details (optional contract re-upload)
app.patch("/api/admin/vendors/:id", vendorUpload.single("contract"), async (req, res) => {
  try {
    const { name, phone, email, aadhaar, hostel, tenure } = req.body;
    const update = { name, phone, email, aadhaar, hostel, tenure };
    if (req.file) update.contract = req.file.filename;
    const vendor = await Vendor.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json(vendor);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update vendor rating
app.patch("/api/admin/vendors/:id/rating", async (req, res) => {
  try {
    const { rating } = req.body;
    const vendor = await Vendor.findByIdAndUpdate(req.params.id, { rating }, { new: true });
    res.json(vendor);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// View vendor contract PDF
app.get("/api/admin/vendors/:id/contract", async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor || !vendor.contract) return res.status(404).json({ message: "No contract found for this vendor" });
    res.sendFile(path.join(__dirname, "uploads", vendor.contract));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// POLICY ROUTES  (/api/admin/policy)
// ============================================================

const router = express.Router();
app.use("/api/admin", router);

router.post("/policy", async (req, res) => {
  try {
    const { maxMonthlyOffs, flatMealRate, scheduledRate, effectiveFrom } = req.body;
    const policy = await Policy.findOneAndUpdate(
      {},
      { maxMonthlyOffs, flatMealRate, scheduledRate, effectiveFrom },
      { upsert: true, new: true }
    );
    res.json(policy);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/policy", async (req, res) => {
  try {
    const policy = await Policy.findOne();
    res.json(policy);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// HOSTEL ROUTES  (/api/admin/hostels)
// ============================================================

// Add hostel
app.post("/api/admin/hostels", menuUpload.single("messMenuImage"), async (req, res) => {
  try {
    const { name, capacity, description, wardens, caretakers, messVendor } = req.body;
    if (!name) return res.status(400).json({ message: "Hostel name is required" });

    const hostel = new Hostel({
      name,
      capacity:    parseInt(capacity) || 0,
      description,
      wardens:     JSON.parse(wardens    || "[]"),
      caretakers:  JSON.parse(caretakers || "[]"),
      messVendor:  JSON.parse(messVendor || "{}"),
      messMenuImage: req.file ? "/uploads/" + req.file.filename : null
    });

    await hostel.save();
    res.status(201).json(hostel);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all hostels (admin view)
app.get("/api/admin/hostels", async (req, res) => {
  try {
    const hostels = await Hostel.find().sort({ createdAt: -1 });
    res.json(hostels);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update hostel
app.put("/api/admin/hostels/:id", menuUpload.single("messMenuImage"), async (req, res) => {
  try {
    const { name, capacity, description, wardens, caretakers, messVendor } = req.body;
    const updateData = {
      name,
      capacity:   parseInt(capacity) || 0,
      description,
      wardens:    JSON.parse(wardens    || "[]"),
      caretakers: JSON.parse(caretakers || "[]"),
      messVendor: JSON.parse(messVendor || "{}")
    };
    if (req.file) updateData.messMenuImage = "/uploads/" + req.file.filename;

    const hostel = await Hostel.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!hostel) return res.status(404).json({ message: "Hostel not found" });
    res.json(hostel);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete hostel
app.delete("/api/admin/hostels/:id", async (req, res) => {
  try {
    await Hostel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// NOTICE ROUTES  (/api/admin/notices)
// ============================================================

// Post admin notice
app.post("/api/admin/add-notice", upload.single("attachment"), async (req, res) => {
  try {
    const newNotice = new Notice({
      content:    req.body.content,
      attachment: req.file ? req.file.filename : null
    });
    await newNotice.save();
    res.status(201).json(newNotice);
  } catch (err) {
    res.status(500).json({ message: "Error posting notice" });
  }
});

// Get admin notices
app.get("/api/admin/notices", async (req, res) => {
  try {
    const notices = await Notice.find().sort({ createdAt: -1 });
    res.json(notices);
  } catch (err) {
    res.status(500).json({ message: "Error fetching notices" });
  }
});

// Delete admin notice
app.delete("/api/admin/delete-notice/:id", async (req, res) => {
  try {
    await Notice.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ============================================================
// STUDENT MANAGEMENT ROUTES
// ============================================================

// Add student
app.post("/api/admin/add-student", async (req, res) => {
  try {
    const newStudent = new Student(req.body);
    await newStudent.save();

    // Auto-sync to studentDB so student can log in immediately
    await User.findOneAndUpdate(
      { email: req.body.email },
      {
        email:    req.body.email,
        password: req.body.password || "Password@123",
        fullName: req.body.name,
        room:     req.body.room    || "",
        hostel:   req.body.hostel  || "",
        phone:    req.body.phone   || ""
      },
      { upsert: true, new: true }
    );

    res.status(201).json({ success: true, message: "Student added successfully" });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: "Registration number or Email already in use!" });
    res.status(500).json({ success: false, message: "An error occurred while saving." });
  }
});

// Bulk import students via CSV
const csv = require("csv-parse/sync");

app.post("/api/admin/import-students", upload.single("csvFile"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const fileContent = require("fs").readFileSync(req.file.path, "utf8");
    const records     = csv.parse(fileContent, { columns: true, skip_empty_lines: true, trim: true });

    let added = 0, skipped = 0;
    const errors = [];

    for (const row of records) {
      try {
        const student = new Student({
          name:     row.name,
          regNo:    row.regNo,
          branch:   row.branch,
          year:     row.year,
          hostel:   row.hostel   || "",
          room:     row.room     || "",
          email:    row.email,
          phone:    row.phone    || "",
          password: row.password || "Password@123"
        });
        await student.save();

        await User.findOneAndUpdate(
          { email: row.email },
          { email: row.email, password: row.password || "Password@123", fullName: row.name, room: row.room || "", hostel: row.hostel || "", phone: row.phone || "" },
          { upsert: true, new: true }
        );
        added++;
      } catch (err) {
        if (err.code === 11000) skipped++;
        else errors.push(`Row ${row.regNo || "?"}: ${err.message}`);
      }
    }

    require("fs").unlinkSync(req.file.path);
    res.json({ success: true, added, skipped, errors });
  } catch (err) {
    res.status(500).json({ message: "Failed to parse CSV: " + err.message });
  }
});

// Get all students
app.get("/api/admin/students", async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update student
app.put("/api/admin/update-student/:id", async (req, res) => {
  try {
    const oldStudent = await Student.findById(req.params.id);
    const updated    = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true });

    await User.findOneAndUpdate(
      { email: oldStudent.email },
      {
        email:    req.body.email    || oldStudent.email,
        password: req.body.password || oldStudent.password,
        fullName: req.body.name     || oldStudent.name,
        room:     req.body.room     || oldStudent.room,
        hostel:   req.body.hostel   || oldStudent.hostel,
        phone:    req.body.phone !== undefined ? req.body.phone : (oldStudent.phone || "")
      },
      { upsert: true, new: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete student
app.delete("/api/admin/delete-student/:id", async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    await Student.findByIdAndDelete(req.params.id);
    await User.findOneAndDelete({ email: student.email });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ============================================================
// ADMIN ACCOUNT ROUTES
// ============================================================

// Add admin
app.post("/add-admin", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const newAdmin = new Admin({ name, email, password });
    await newAdmin.save();
    res.json({ success: true, message: "Admin Added", admin: newAdmin });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, error: "This admin email already exists!" });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all admins
app.get("/admins", async (req, res) => {
  try {
    const admins = await Admin.find();
    res.json(admins);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update admin password
app.post("/update-password", async (req, res) => {
  const { email, currentPassword, newPassword, confirmPassword } = req.body;
  if (newPassword !== confirmPassword) return res.json({ success: false, message: "Passwords do not match" });

  const admin = await Admin.findOne({ email });
  if (!admin || admin.password !== currentPassword) return res.json({ success: false, message: "Current password incorrect" });

  admin.password = newPassword;
  await admin.save();
  res.json({ success: true, message: "Password updated successfully" });
});

// ============================================================
// LOGIN ROUTE  (admin + student + vendor)
// ============================================================

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    // Check admin first
    const admin = await Admin.findOne({ email });
    if (admin) {
      if (admin.password === password) return res.json({ success: true, role: "admin" });
      else return res.json({ success: false, message: "Invalid password" });
    }

    // Then check vendor
    const vendor = await Vendor.findOne({ email });
    if (vendor) {
      if (vendor.password === password) return res.json({ success: true, role: "vendor" });
      else return res.json({ success: false, message: "Invalid password" });
    }

    // Then check student
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: false, message: "User not found" });
    if (password !== user.password) return res.json({ success: false, message: "Invalid password" });

    return res.json({ success: true, role: "student" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ============================================================
// STUDENT-FACING PUBLIC ROUTES
// ============================================================

// Get all hostels (student view)
app.get("/api/hostels", async (req, res) => {
  try {
    const hostels = await Hostel.find().sort({ createdAt: -1 });
    res.json(hostels);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch hostel data" });
  }
});

// Get weekly mess menu image
app.get("/api/menu", async (req, res) => {
  try {
    const hostelName = req.query.hostel || "";
    const hostel = await Hostel.findOne({ name: hostelName });
    res.json({ menuImage: hostel?.messMenuImage || null, hostel: hostelName });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch menu" });
  }
});

// Get student-facing notices (from admin Notice collection)
app.get("/api/notices", async (req, res) => {
  try {
    const notices = await Notice.find().sort({ createdAt: -1 });
    const mapped  = notices.map(n => ({
      title:     n.content,
      pdfUrl:    n.attachment ? `http://localhost:5000/uploads/${n.attachment}` : null,
      createdAt: n.createdAt
    }));
    res.json(mapped);
  } catch (err) {
    console.error("/api/notices error:", err);
    res.status(500).json({ error: "Failed to fetch notices" });
  }
});

// ============================================================
// STUDENT PROFILE & PREFERENCES
// ============================================================

// Get student profile
app.get("/api/student/profile", async (req, res) => {
  const studentId = req.query.studentId;
  if (!studentId) return res.status(400).json({ error: "studentId required" });

  const user = await User.findOne({ email: studentId });
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    name:         user.fullName || user.email.split("@")[0],
    fullName:     user.fullName || "--",
    room:         user.room    || "--",
    hostel:       user.hostel  || "--",
    phone:        user.phone   || "--",
    email:        user.email,
    profileImage: ""
  });
});

// Get preferences
app.get("/api/student/preferences", async (req, res) => {
  const studentId = req.query.studentId;
  if (!studentId) return res.status(400).json({ error: "studentId required" });

  let pref = await Preference.findOne({ studentId });
  if (!pref) {
    const defaultMeal = { breakfast: "veg", lunch: "veg", dinner: "veg" };
    pref = new Preference({
      studentId,
      preferences: {
        mon: { ...defaultMeal }, tue: { ...defaultMeal }, wed: { ...defaultMeal },
        thu: { ...defaultMeal }, fri: { ...defaultMeal }, sat: { ...defaultMeal },
        sun: { ...defaultMeal }
      }
    });
    await pref.save();
  }

  res.json({ preferences: pref.preferences });
});

// Save preferences
app.post("/api/student/preferences", async (req, res) => {
  const { studentId, preferences } = req.body;
  if (!studentId || !preferences) return res.status(400).json({ success: false });

  await Preference.findOneAndUpdate(
    { studentId },
    { preferences },
    { upsert: true, new: true }
  );
  res.json({ success: true });
});

// ============================================================
// FOOD CANCEL ROUTES
// ============================================================

// Submit cancel request
app.post("/api/student/cancel-request", async (req, res) => {
  try {
    const { name, regdNo, email, fromDate, toDate, reason } = req.body;

    if (!email || !fromDate || !toDate || !reason) {
      return res.json({ success: false, message: "Missing required fields" });
    }

    const from = new Date(fromDate); from.setHours(0, 0, 0, 0);
    const to   = new Date(toDate);   to.setHours(0, 0, 0, 0);

    if (to < from) return res.json({ success: false, message: "Invalid date range" });

    const dayCount = Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1;

    // Split days across months  e.g. March 31 → April 1 gives { "2026-03": 1, "2026-04": 1 }
    const monthBreakdown = {};
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      const k = monthKey(d);
      monthBreakdown[k] = (monthBreakdown[k] || 0) + 1;
    }

    const studentDoc = await FoodCancel.findOne({ studentId: email });

    // Monthly limit check (personal only)
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

    const newEntry = {
      fromDate: from,
      toDate:   to,
      daysCancelled: dayCount,
      reason,
      status:      reason === "personal" ? "approved" : "pending",
      submittedAt: new Date()
    };

    const usageInc = {};
    if (reason === "personal") {
      for (const [k, days] of Object.entries(monthBreakdown)) {
        usageInc[`monthlyUsage.${k}`] = days;
      }
    }

    if (!studentDoc) {
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

// Get cancel status (days used this month + pending official count)
app.get("/api/student/cancel-status", async (req, res) => {
  try {
    const { studentId } = req.query;
    if (!studentId) return res.status(400).json({ error: "studentId required" });

    const key        = monthKey(new Date());
    const studentDoc = await FoodCancel.findOne({ studentId });

    const personalUsed    = studentDoc?.monthlyUsage?.get(key) || 0;
    const pendingOfficial = studentDoc
      ? studentDoc.cancellations.filter(c => c.reason === "official" && c.status === "pending").length
      : 0;

    res.json({ personalUsed, personalLimit: 5, pendingOfficial });
  } catch (err) {
    console.error("Cancel Status Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ============================================================
// COUPON ROUTES
// ============================================================

// Get today's coupon for a student
app.get("/api/student/coupon/today", async (req, res) => {
  try {
    const studentId = req.query.studentId;
    if (!studentId) return res.status(400).json({ error: "studentId required" });

    const user = await User.findOne({ email: studentId });
    if (!user) return res.json({ hasCoupon: false, reason: "User not found" });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if today is cancelled
    const studentDoc = await FoodCancel.findOne({ studentId });
    if (studentDoc && isDateCancelled(today, studentDoc.cancellations)) {
      return res.json({ hasCoupon: false, reason: "Food cancelled for today" });
    }

    // Fetch preferences
    const prefDoc = await Preference.findOne({ studentId });
    if (!prefDoc) return res.json({ hasCoupon: false, reason: "Preferences not set" });

    const days       = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const todayKey   = days[today.getDay()];
    const todayMeals = prefDoc.preferences[todayKey];

    if (!todayMeals) return res.json({ hasCoupon: false, reason: "No preference for today" });

    res.json({
      hasCoupon: true,
      couponData: {
        name:   user.fullName || user.email,
        room:   user.room   || "--",
        hostel: user.hostel || "--",
        date:   today.toISOString().split("T")[0],
        meals:  { breakfast: todayMeals.breakfast, lunch: todayMeals.lunch, dinner: todayMeals.dinner }
      }
    });
  } catch (err) {
    console.error("Coupon Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Vendor: get coupon summary for a given date
app.get("/api/vendor/coupon-summary", async (req, res) => {
  try {
    const date       = req.query.date || new Date().toISOString().split("T")[0];
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const allUsers      = await User.find();
    const cancellations = await FoodCancel.find();

    const summary = {
      date,
      totalCoupons: 0,
      breakfast: { veg: 0, nonveg: 0 },
      lunch:     { veg: 0, nonveg: 0 },
      dinner:    { veg: 0, nonveg: 0 }
    };

    for (const user of allUsers) {
      const studentCancel = cancellations.find(c => c.studentId === user.email);
      if (studentCancel && isDateCancelled(targetDate, studentCancel.cancellations)) continue;

      summary.totalCoupons++;
      const pref    = await Preference.findOne({ studentId: user.email });
      const dayKey  = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][targetDate.getDay()];
      const dayPref = pref?.preferences?.[dayKey] || { breakfast: "veg", lunch: "veg", dinner: "veg" };

      ["breakfast", "lunch", "dinner"].forEach(slot => {
        summary[slot][dayPref[slot] === "non-veg" ? "nonveg" : "veg"]++;
      });
    }

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ============================================================
// BILLING ROUTES
// ============================================================

// Student: get current month billing
app.get("/api/student/billing", async (req, res) => {
  try {
    const studentId = req.query.studentId;
    if (!studentId) return res.status(400).json({ error: "studentId required" });

    const user = await User.findOne({ email: studentId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const today = new Date();
    const bill  = await computeMonthlyBill(studentId, today.getFullYear(), today.getMonth());
    await upsertMonthBill(studentId, user.fullName || user.email, bill);

    const billingDoc  = await StudentBilling.findOne({ studentId });
    const grandTotal  = billingDoc ? billingDoc.monthlyBills.reduce((sum, b) => sum + b.amountDue, 0) : 0;

    res.json({ ...bill, grandTotal });
  } catch (err) {
    console.error("Billing Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: get one student's full billing history
app.get("/api/admin/student-billing", async (req, res) => {
  try {
    const { studentId } = req.query;
    if (!studentId) return res.status(400).json({ error: "studentId required" });

    const today       = new Date();
    const currentBill = await computeMonthlyBill(studentId, today.getFullYear(), today.getMonth());
    await upsertMonthBill(studentId, studentId, currentBill);

    const billingDoc  = await StudentBilling.findOne({ studentId });
    const allMonths   = billingDoc?.monthlyBills || [];
    const grandTotal  = allMonths.reduce((sum, b) => sum + b.amountDue, 0);

    res.json({ studentId, currentMonth: currentBill, grandTotal, monthlyBreakdown: allMonths });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Add this under your other billing routes in server.js
app.get("/api/admin/billing/all", async (req, res) => {
  try {
    const allUsers = await User.find();
    const today = new Date();
    const report = await Promise.all(allUsers.map(async (user) => {
      const studentId = user.email;
      const currentBill = await computeMonthlyBill(studentId, today.getFullYear(), today.getMonth());
      await upsertMonthBill(studentId, user.fullName || user.email, currentBill);
      const billingDoc = await StudentBilling.findOne({ studentId });
      const allMonths = billingDoc?.monthlyBills || [];
      const grandTotal = allMonths.reduce((sum, b) => sum + b.amountDue, 0);
      const adminStudent = await Student.findOne({ email: studentId });
      return {
        studentId,
        regNo: adminStudent?.regNo || "—",
        name: user.fullName || user.email,
        hostel: user.hostel || "—",
        year: adminStudent?.year || "—",
        messBill: currentBill.amountDue,
        hostelBill: 0,
        grandTotal,
        monthlyBreakdown: allMonths
      };
    }));
    res.json(report);
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Admin: get all students billing report
app.get("/api/admin/all-billing", async (req, res) => {
  try {
    const allUsers = await User.find();
    const today    = new Date();

    const report = await Promise.all(allUsers.map(async (user) => {
      const studentId = user.email;
      const cancelDoc = await FoodCancel.findOne({ studentId });
      const prefDoc   = await Preference.findOne({ studentId });

      const dateCandidates = [];
      if (cancelDoc?.createdAt) dateCandidates.push(new Date(cancelDoc.createdAt));
      if (prefDoc?.createdAt)   dateCandidates.push(new Date(prefDoc.createdAt));

      const earliest = dateCandidates.length > 0
        ? dateCandidates.reduce((a, b) => a < b ? a : b)
        : today;

      let y = earliest.getFullYear();
      let m = earliest.getMonth();
      const monthlyBreakdown = [];

      while (y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth())) {
        const bill = await computeMonthlyBill(studentId, y, m);
        monthlyBreakdown.push(bill);
        await upsertMonthBill(studentId, user.fullName || user.email, bill);
        m++; if (m > 11) { m = 0; y++; }
      }

      const grandTotal = monthlyBreakdown.reduce((sum, b) => sum + b.amountDue, 0);
      return {
        studentId,
        name: user.fullName || user.email,
        room: user.room    || "--",
        hostel: user.hostel || "--",
        grandTotal,
        currentMonthDue: monthlyBreakdown.at(-1)?.amountDue || 0,
        monthlyBreakdown
      };
    }));

    report.sort((a, b) => b.grandTotal - a.grandTotal);
    res.json({ students: report });
  } catch (err) {
    console.error("Admin All Billing Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET pending official leave requests
app.get("/api/admin/leaves/pending", async (req, res) => {
  try {
    const allDocs = await FoodCancel.find({ "cancellations.reason": "official", "cancellations.status": "pending" });
    const leaves = [];
    for (const doc of allDocs) {
      const adminStudent = await Student.findOne({ email: doc.studentId });
      doc.cancellations.forEach(c => {
        if (c.reason === "official" && c.status === "pending") {
          leaves.push({ _id: c._id, studentId: doc.studentId, regNo: adminStudent?.regNo || "—", name: doc.name || doc.email, from: c.fromDate, to: c.toDate, reason: c.reason, submittedAt: c.submittedAt });
        }
      });
    }
    res.json(leaves);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// GET processed leave requests
app.get("/api/admin/leaves/processed", async (req, res) => {
  try {
    const allDocs = await FoodCancel.find({ "cancellations.reason": "official", "cancellations.status": { $in: ["approved", "rejected"] } });
    const leaves = [];
    for (const doc of allDocs) {
      const adminStudent = await Student.findOne({ email: doc.studentId });
      doc.cancellations.forEach(c => {
        if (c.reason === "official" && (c.status === "approved" || c.status === "rejected")) {
          leaves.push({ _id: c._id, studentId: doc.studentId, regNo: adminStudent?.regNo || "—", name: doc.name || doc.email, from: c.fromDate, to: c.toDate, reason: c.reason, status: c.status });
        }
      });
    }
    res.json(leaves);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// PATCH approve or reject a leave (action: "approved" or "rejected")
app.patch("/api/admin/leaves/:cancellationId", async (req, res) => {
  try {
    const { cancellationId } = req.params;
    const { action } = req.body;
    if (!["approved", "rejected"].includes(action)) return res.status(400).json({ error: "Invalid action" });
    const doc = await FoodCancel.findOne({ "cancellations._id": cancellationId });
    if (!doc) return res.status(404).json({ error: "Not found" });
    await FoodCancel.updateOne({ "cancellations._id": cancellationId }, { $set: { "cancellations.$.status": action } });
    if (action === "approved") {
      const entry = doc.cancellations.find(c => c._id.toString() === cancellationId);
      if (entry) {
        const from = new Date(entry.fromDate); const to = new Date(entry.toDate); const today = new Date();
        const months = new Set();
        const cur = new Date(from.getFullYear(), from.getMonth(), 1);
        while (cur <= to) { months.add(`${cur.getFullYear()}-${cur.getMonth()}`); cur.setMonth(cur.getMonth() + 1); }
        const user = await User.findOne({ email: doc.studentId });
        for (const mk of months) {
          const [y, m] = mk.split("-").map(Number);
          if (y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth())) {
            const bill = await computeMonthlyBill(doc.studentId, y, m);
            await upsertMonthBill(doc.studentId, user?.fullName || doc.studentId, bill);
          }
        }
      }
    }
    res.json({ success: true, action });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// GET student's own official leave statuses (for showing approval notifications)
app.get("/api/student/leaves/status", async (req, res) => {
  try {
    const { studentId } = req.query;
    if (!studentId) return res.status(400).json({ error: "studentId required" });
    const doc = await FoodCancel.findOne({ studentId });
    if (!doc) return res.json({ leaves: [] });
    const leaves = doc.cancellations.filter(c => c.reason === "official").map(c => ({ _id: c._id, fromDate: c.fromDate, toDate: c.toDate, status: c.status, submittedAt: c.submittedAt }));
    res.json({ leaves });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ============================================================
// CALENDAR ROUTE
// ============================================================

// Student: get cancelled days for a given month
app.get("/api/student/calendar", async (req, res) => {
  try {
    const { studentId, month, year } = req.query;
    if (!studentId) return res.status(400).json({ error: "studentId required" });

    const studentDoc = await FoodCancel.findOne({ studentId });
    if (!studentDoc) return res.json({ cancelledDays: [], dataAvailable: true });

    const targetMonth = parseInt(month) - 1; // 0-indexed
    const targetYear  = parseInt(year);
    const cancelledDays = [];

    studentDoc.cancellations.forEach(c => {
      if (c.status === "approved" || (c.reason === "official" && c.status === "pending")) {
        let curr = new Date(c.fromDate);
        const to = new Date(c.toDate);
        while (curr <= to) {
          if (curr.getMonth() === targetMonth && curr.getFullYear() === targetYear) {
            cancelledDays.push(curr.getDate());
          }
          curr.setDate(curr.getDate() + 1);
        }
      }
    });

    const uniqueDays = [...new Set(cancelledDays)].sort((a, b) => a - b);
    res.json({ cancelledDays: uniqueDays, month: parseInt(month), year: targetYear, dataAvailable: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ============================================================
// VENDOR FEEDBACK ROUTES
// ============================================================

// Check feedback status for current month
app.get("/api/student/feedback/status", async (req, res) => {
  const { studentId, month, year } = req.query;
  const feedback = await VendorFeedback.findOne({ studentId });

  if (!feedback || feedback.month !== parseInt(month) || feedback.year !== parseInt(year)) {
    return res.json({ hasSubmitted: false });
  }
  res.json({ hasSubmitted: true });
});

// Submit / update vendor feedback & Sync with Admin Vendor table
app.post("/api/student/feedback", async (req, res) => {
  try {
    const { studentId, name, month, year, ratings, comment } = req.body;
    
    // 1. Save/Update the student's feedback
    await VendorFeedback.findOneAndUpdate(
      { studentId },
      { name, month, year, ratings, comment },
      { upsert: true, new: true }
    );

    // 2. Sync Rating with Vendor Table
    // Find the student to know which hostel they are in
    const user = await User.findOne({ email: studentId });
    
    if (user && user.hostel) {
      // Find the vendor assigned to this student's hostel
      const vendor = await Vendor.findOne({ hostel: user.hostel });
      
      if (vendor) {
        // Find all students living in this specific hostel
        const hostelUsers = await User.find({ hostel: user.hostel });
        const hostelUserEmails = hostelUsers.map(u => u.email);

        // Fetch all feedbacks given by students in this hostel
        const feedbacks = await VendorFeedback.find({ studentId: { $in: hostelUserEmails } });

        // Calculate the average overall rating
        if (feedbacks.length > 0) {
          const totalOverall = feedbacks.reduce((sum, f) => sum + (f.ratings?.overall || 0), 0);
          const avgRating = Math.round(totalOverall / feedbacks.length);

          // Update the Vendor document with the new average rating
          vendor.rating = avgRating;
          await vendor.save();
        }
      }
    }

    res.json({ success: true, message: "Feedback updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// ============================================================
// AUTH ROUTES  (forgot / reset password)
// ============================================================

app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.json({ message: "User not found" });

  const token = crypto.randomBytes(32).toString("hex");
  user.resetToken       = token;
  user.resetTokenExpiry = Date.now() + 3600000; // 1 hour
  await user.save();

  const resetLink = `http://127.0.0.1:5500/reset-password.html?token=${token}`;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: "soumyaranjanmishra2048@gmail.com",
      pass: "cxrodmklqoggxyga"
    }
  });

  try {
    const info = await transporter.sendMail({
      from:    '"PMEC" <soumyaranjanmishra2048@gmail.com>',
      to:      email,
      subject: "Reset Your PMEC Password",
      html:    `<p>Click below to reset your password (valid for 1 hour):</p><a href="${resetLink}">Reset Password</a>`
    });
    console.log("MAIL SENT:", info.messageId);
    res.json({ message: "Reset link sent" });
  } catch (err) {
    console.log("MAIL ERROR:", err);
    res.status(500).json({ message: "Email failed" });
  }
});

// Reset password — updates BOTH studentDB.User and adminDB.Student
app.post("/api/auth/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ message: "Token and new password are required" });

  const user = await User.findOne({ resetToken: token, resetTokenExpiry: { $gt: Date.now() } });
  if (!user) return res.status(400).json({ message: "Invalid or expired token" });

  user.password         = newPassword;
  user.resetToken       = undefined;
  user.resetTokenExpiry = undefined;
  await user.save();

  await Student.findOneAndUpdate({ email: user.email }, { password: newPassword });

  res.json({ message: "Password reset successful" });
});

// ============================================================
// ONE-TIME SYNC ROUTE
// ============================================================

// Copy all adminDB students → studentDB Users
app.post("/api/admin/sync-students", async (req, res) => {
  try {
    const allStudents = await Student.find();
    let synced = 0;

    for (const s of allStudents) {
      await User.findOneAndUpdate(
        { email: s.email },
        {
          email:    s.email,
          password: s.password || "Password@123",
          fullName: s.name,
          room:     s.room    || "",
          hostel:   s.hostel  || "",
          phone:    s.phone   || ""
        },
        { upsert: true, new: true }
      );
      synced++;
    }

    res.json({ success: true, message: `Synced ${synced} students` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
//Modified By Jade

// ============================================================
// VENDOR DASHBOARD ROUTES
// ============================================================

// 1. TODAY'S MEALS ROUTE
app.get("/api/vendor/today-meals", async (req, res) => {
  try {
    const nowIST = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const today = new Date(nowIST);
    today.setHours(0, 0, 0, 0);

    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateString = `${yyyy}-${mm}-${dd}`;

    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const dayKey = days[today.getDay()];

    const meals = {
      breakfast: { totalStudents: 0, vegCount: 0, nonVegCount: 0, hasNonVeg: true },
      lunch:     { totalStudents: 0, vegCount: 0, nonVegCount: 0, hasNonVeg: true },
      dinner:    { totalStudents: 0, vegCount: 0, nonVegCount: 0, hasNonVeg: true }
    };

    const allUsers = await User.find();
    const allCancellations = await FoodCancel.find();
    const allPreferences = await Preference.find();

    for (const user of allUsers) {
      const cancelDoc = allCancellations.find(c => c.studentId === user.email);
      if (cancelDoc && isDateCancelled(today, cancelDoc.cancellations)) {
        continue; 
      }

      const prefDoc = allPreferences.find(p => p.studentId === user.email);
      const dayPref = prefDoc?.preferences?.[dayKey] || { breakfast: "veg", lunch: "veg", dinner: "veg" };

      ["breakfast", "lunch", "dinner"].forEach(slot => {
        meals[slot].totalStudents++;
        
        const choice = dayPref[slot] || "veg";
        if (choice.toLowerCase() === "non-veg" || choice.toLowerCase() === "nonveg") {
          meals[slot].nonVegCount++;
        } else {
          meals[slot].vegCount++;
        }
      });
    }

    res.json({
      date: dateString,
      meals
    });

  } catch (err) {
    console.error("Today Meals Error:", err);
    res.status(500).json({ error: "Server error calculating today's meals" });
  }
});

// 2. VENDOR RATING ROUTE
app.get("/api/vendor/rating", async (req, res) => {
  try {
    const feedbacks = await VendorFeedback.find();

    if (!feedbacks || feedbacks.length === 0) {
      return res.json({
        rating: 0,
        totalReviews: 0,
        month: "No reviews yet",
        breakdown: { foodQuality: 0, cleanliness: 0, behavior: 0 }
      });
    }

    const totalReviews = feedbacks.length;
    let sumOverall = 0;
    let sumFood = 0;
    let sumClean = 0;
    let sumBehavior = 0;

    feedbacks.forEach(fb => {
      sumOverall += fb.ratings?.overall || 0;
      sumFood += fb.ratings?.foodQuality || 0;
      sumClean += fb.ratings?.cleanliness || 0;
      sumBehavior += fb.ratings?.behavior || 0;
    });

    const avgOverall = Number((sumOverall / totalReviews).toFixed(1));
    const avgFood = Number((sumFood / totalReviews).toFixed(1));
    const avgClean = Number((sumClean / totalReviews).toFixed(1));
    const avgBehavior = Number((sumBehavior / totalReviews).toFixed(1));

    const prevMonth = new Date();
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const monthLabel = prevMonth.toLocaleString("en-US", { month: "long", year: "numeric" });

    res.json({
      rating: avgOverall,
      totalReviews: totalReviews,
      month: monthLabel,
      breakdown: {
        foodQuality: avgFood,
        cleanliness: avgClean,
        behavior: avgBehavior
      }
    });

  } catch (err) {
    console.error("Vendor Rating Error:", err);
    res.status(500).json({ error: "Server error calculating vendor ratings" });
  }
});

// 3. VENDOR BILLING ROUTE
app.get("/api/vendor/billing", async (req, res) => {
  try {
    const { month } = req.query; // Expects format "YYYY-MM"
    
    if (!month) {
      return res.status(400).json({ error: "Month parameter is required (YYYY-MM)" });
    }

    // 1. Fetch billing records and users (to get room numbers)
    const allBillings = await StudentBilling.find();
    const allUsers = await User.find();

    // 2. Initialize tracking variables
    let totalStudents = 0;
    let totalMeals = 0;
    let amountPerMeal = 0;
    let totalAmount = 0;
    let monthLabel = "--";
    const studentsList = [];

    // 3. Loop through all billing records
    for (const billing of allBillings) {
      // Look for the specific month in this student's billing array
      const monthBill = billing.monthlyBills.find(b => b.monthKey === month);

      if (monthBill) {
        totalStudents++;
        totalMeals += monthBill.totalMeals;
        totalAmount += monthBill.amountDue;
        
        // Grab the static amountPerMeal and label from the first record we find
        if (amountPerMeal === 0) {
          amountPerMeal = monthBill.amountPerMeal;
          monthLabel = monthBill.monthLabel;
        }

        // Find the user to get their room number
        const user = allUsers.find(u => u.email === billing.studentId);
        const room = user && user.room ? user.room : "--";

        // Push formatted data for the frontend table
        studentsList.push({
          name: billing.name || (user ? user.fullName : billing.studentId),
          room: room,
          mealsCount: monthBill.totalMeals,
          amount: monthBill.amountDue
        });
      }
    }

    // 4. Fallback label if no records exist for that month yet
    if (totalStudents === 0) {
      const [yyyy, mm] = month.split("-");
      const fallbackDate = new Date(yyyy, parseInt(mm) - 1, 1);
      monthLabel = fallbackDate.toLocaleString("en-US", { month: "long", year: "numeric" });
    }

    // 5. Send payload back to the vendor dashboard
    res.json({
      month,
      monthLabel,
      totalStudents,
      totalMeals,
      amountPerMeal,
      totalAmount,
      students: studentsList
    });

  } catch (err) {
    console.error("Vendor Billing Error:", err);
    res.status(500).json({ error: "Server error fetching billing records" });
  }
});
//Modified By Jade End
// ============================================================
// DEFAULT ROUTE & SERVER START
// ============================================================
//JADE
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "front_page.html"));
});
//JADE
app.listen(5000, () => {
  console.log("Server running on port 5000");
  console.log("Homepage: http://localhost:5000");
});
//JADE