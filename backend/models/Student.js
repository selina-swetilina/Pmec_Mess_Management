const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  regNo: { type: String, required: true, unique: true },
  branch: { type: String, required: true },
  year: { type: String, required: true },
  hostel: String,
  room: String,
  email: { type: String, required: true, unique: true },
  phone: { type: String, default: "" },
  password: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model("Student", studentSchema, "SDetails");