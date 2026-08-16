const mongoose = require('mongoose');

const BoardingStopSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  name:        { type: String, required: true, trim: true },
  lat:         { type: Number, default: null },
  lng:         { type: Number, default: null },
  isActive:    { type: Boolean, default: true },   // admin can deactivate without deleting
  studentCount:{ type: Number, default: 0 },       // updated when students are assigned
  addedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

// stop name unique per institution
BoardingStopSchema.index({ institutionId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('BoardingStop', BoardingStopSchema);
