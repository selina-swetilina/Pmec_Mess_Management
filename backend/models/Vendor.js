const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  phone:    { type: String, required: true },
  email:    { type: String, default: "" },
  aadhaar:  { type: String, default: "" },
  tenure:   { type: String, default: "" },
  hostel:   { type: String, default: "" },
  contract: { type: String, default: null },
  rating:   { type: Number, default: 0 },
  password: { type: String, default: "Password@123" }
}, { timestamps: true });
module.exports = mongoose.model("Vendor", vendorSchema, "Vendors");