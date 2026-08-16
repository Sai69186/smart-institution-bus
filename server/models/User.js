const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:      { type: String, required: true, minlength: 6 },
  phone:         { type: String, default: '' },
  // Role hierarchy: super_admin > institution_admin > admin > driver > student
  role:          { type: String, enum: ['super_admin', 'institution_admin', 'admin', 'student', 'driver'], default: 'student' },
  // Institution scoping — null only for super_admin
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null },
  studentId:     { type: String, default: null },   // links to student data for student role
  busId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', default: null },  // links to bus for driver
  // Temporary password flag — institution_admin sets this, user must change on first login
  mustChangePassword: { type: Boolean, default: false },
}, { timestamps: true });

// Hash password before saving
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare entered password with hashed
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// ── Indexes ───────────────────────────────────────────────────────────────────
// email already has unique:true (auto-indexes). Add compound indexes for
// the two most common query patterns:
// 1. Auth: find driver by institutionId + role (buses/unassigned_drivers)
UserSchema.index({ institutionId: 1, role: 1 });
// 2. Admin lookup: find all drivers for an institution quickly
UserSchema.index({ role: 1, institutionId: 1 });

module.exports = mongoose.model('User', UserSchema);
