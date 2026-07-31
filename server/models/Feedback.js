const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
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

module.exports = mongoose.model('Feedback', FeedbackSchema);
