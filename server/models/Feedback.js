const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null, index: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userRole:  { type: String, enum: ['student', 'driver', 'admin'], default: 'student' },
  studentId: { type: String, default: null },
  name:      { type: String, required: true, trim: true },
  category:  { type: String, required: true },
  rating:    { type: Number, required: true, min: 1, max: 5 },
  message:   { type: String, required: true, trim: true },
  status:    { type: String, enum: ['Open', 'In Progress', 'Resolved'], default: 'Open' },
  adminNote: { type: String, default: '' },
  date:      { type: String, required: true }
}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
// Admin feedback list: institution + status filter, sorted by newest
FeedbackSchema.index({ institutionId: 1, status: 1, createdAt: -1 });
// Student's own feedback history
FeedbackSchema.index({ userId: 1, createdAt: -1 });
// Rating analytics / feedback summary report
FeedbackSchema.index({ institutionId: 1, createdAt: -1 });

module.exports = mongoose.model('Feedback', FeedbackSchema);
