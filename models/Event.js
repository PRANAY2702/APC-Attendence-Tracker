const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  isMultiDay: {
    type: Boolean,
    default: false
  },
  totalDays: {
    type: Number,
    default: 1
  }
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);
