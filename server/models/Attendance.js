const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  // Who boarded
  studentId:   { type: String, required: true, index: true },
  studentName: { type: String, required: true },

  // Which bus / stop
  busNumber:   { type: String, required: true, index: true },
  driverId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  stop:        { type: String, default: '' },           // boarding stop name

  // Timing
  boardingTime: { type: String, default: '' },          // e.g. "07:34 AM"
  date:         { type: String, required: true, index: true }, // "YYYY-MM-DD"

  // How was this record created
  method: {
    type:    String,
    enum:    ['qr', 'manual', 'auto'],
    default: 'manual',
  },

  // Status for this specific trip record
  status: {
    type:    String,
    enum:    ['Boarded', 'Absent'],
    default: 'Boarded',
  },
}, { timestamps: true });

// Prevent duplicate boarding record per student per date
AttendanceSchema.index({ studentId: 1, date: 1 }, { unique: true });

// ── Hot-path indexes ──────────────────────────────────────────────────────────
// Reports: attendance by institution + date range (attendance_summary report)
AttendanceSchema.index({ institutionId: 1, date: -1 });
// Driver view: all boardings for a bus on a given date
AttendanceSchema.index({ busNumber: 1, date: -1 });
// Student history: all records for a student, newest first
AttendanceSchema.index({ studentId: 1, createdAt: -1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
