const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  sid: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    default: null
  },
  password: {
    type: String,
    default: null
  },
  email: {
    type: String,
    default: null
  },
  phone: {
    type: String,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Member', memberSchema);
