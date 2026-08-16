const mongoose = require('mongoose');

const EmergencySchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null, index: true },
  busId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Bus',  default: null },
  busNumber:  { type: String, required: true },
  driverId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  driverName: { type: String, default: '' },

  reason:  { type: String, required: true, trim: true },
  status:  {
    type:    String,
    enum:    ['Active', 'Resolved'],
    default: 'Active',
  },

  // GPS location at time of SOS
  location: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },

  // Resolution details
  resolvedAt: { type: Date,   default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolution: { type: String, default: '' },  // admin note on how it was resolved
}, { timestamps: true });

EmergencySchema.index({ status: 1, createdAt: -1 });

// ── Hot-path indexes ──────────────────────────────────────────────────────────
// Admin dashboard: active emergencies per institution (polled frequently)
EmergencySchema.index({ institutionId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Emergency', EmergencySchema);
