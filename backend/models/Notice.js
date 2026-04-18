const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
  },
  attachment: {
    type: String, // will store file name or file path
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Notice", noticeSchema);
