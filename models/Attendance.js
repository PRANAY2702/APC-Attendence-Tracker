const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  sid: {
    type: String,
    required: true
  },
  date: {
    type: Date, // We will store just the date part (e.g. YYYY-MM-DD at 00:00:00)
    required: true
  }
}, { timestamps: true });

// Prevent duplicate attendance for the same student on the same day for the same event
attendanceSchema.index({ eventId: 1, sid: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
