const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  sid: {
    type: String,
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    default: null
  },
  otp: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // MongoDB TTL index to auto remove expired OTP records
  }
}, { timestamps: true });

module.exports = mongoose.model('Otp', otpSchema);
