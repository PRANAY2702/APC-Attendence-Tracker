const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  sid: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Member', memberSchema);
