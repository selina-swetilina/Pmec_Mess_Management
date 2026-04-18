const mongoose = require("mongoose");

const wardenSchema = new mongoose.Schema({
  name: String,
  phone: String,
});

const hostelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    capacity: { type: Number, required: true },
    description: String,
    wardens: [wardenSchema],
    caretakers: [wardenSchema], // same shape: { name, phone }
    messVendor: {
      name: String,
      phone: String,
    },
    messMenuImage: String, // stores file path e.g. /uploads/menu-123.jpg
  },
  { timestamps: true },
);

module.exports = mongoose.model("Hostel", hostelSchema);
