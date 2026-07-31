const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  studentId:    { type: String, required: true, unique: true, trim: true },
  name:         { type: String, required: true, trim: true },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:        { type: String, default: '' },
  department:   { type: String, required: true, trim: true },
  year:         { type: String, required: true },           // e.g. "1st Year"
  address:      { type: String, default: '' },
  pickupPoint:  { type: String, default: '' },              // boarding stop name
  pickupLat:    { type: Number, default: null },
  pickupLon:    { type: Number, default: null },
  assignedBus:  { type: String, default: '' },              // e.g. "VL-A01"
  assignedRoute:{ type: String, default: '' },              // e.g. "Route A — ..."
  attendanceStatus: {
    type:    String,
    enum:    ['Boarded', 'Waiting', 'Absent'],
    default: 'Waiting',
  },
  predBoardingTime:   { type: String, default: '--:--' },
  actualBoardingTime: { type: String, default: '--:--' },

  // Auto-allocation tracking
  allocatedAt:      { type: Date,   default: null },
  allocationMethod: { type: String, default: '' }, // 'route-match' | 'nearest-bus' | 'manual' | 'unallocated'

  // Notification preferences — saved via PUT /api/students/me/notifications
  notifPrefs: {
    busArrival: { type: Boolean, default: true },
    delays:     { type: Boolean, default: true },
    emergency:  { type: Boolean, default: true },
    general:    { type: Boolean, default: true },
  },
}, { timestamps: true });

module.exports = mongoose.model('Student', StudentSchema);
