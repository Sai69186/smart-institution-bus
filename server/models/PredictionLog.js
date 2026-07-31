const mongoose = require('mongoose');

const PredictionLogSchema = new mongoose.Schema({
  studentId:   { type: String, required: true, index: true },
  studentName: { type: String, required: true },
  busNumber:   { type: String, default: '' },
  stop:        { type: String, default: '' },

  // Times stored as "HH:MM AM/PM" strings (matches existing frontend format)
  predictedTime: { type: String, default: '--:--' },
  actualTime:    { type: String, default: '--:--' },

  // Error in minutes (positive = late, negative = early, 0 = on time)
  errorMins: { type: Number, default: null },

  // Context at time of prediction
  date:           { type: String, required: true, index: true }, // "YYYY-MM-DD"
  weather:        { type: String, default: 'Sunny' },
  academicPeriod: { type: String, default: 'Regular Semester' },
}, { timestamps: true });

PredictionLogSchema.index({ studentId: 1, date: -1 });

module.exports = mongoose.model('PredictionLog', PredictionLogSchema);
