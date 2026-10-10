const mongoose = require('mongoose');

const qualificationSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  sid: {
    type: String,
    required: true
  },
  isQualified: {
    type: Boolean ,
    required: true
  }
}, { timestamps: true });

qualificationSchema.index({ eventId: 1, sid: 1 }, { unique: true });

module.exports = mongoose.model('Qualification', qualificationSchema);
