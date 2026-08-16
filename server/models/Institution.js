const mongoose = require('mongoose');

const InstitutionSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  address:      { type: String, default: '' },
  city:         { type: String, default: '' },
  state:        { type: String, default: '' },
  contactEmail: { type: String, default: '', lowercase: true, trim: true },
  contactPhone: { type: String, default: '' },
  logoUrl:      { type: String, default: '' },
  // Which super_admin created this institution
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status:       { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  // Campus GPS coordinates — used as the "destination" for route optimization
  campusLat:    { type: Number, default: null },
  campusLng:    { type: Number, default: null },
  campusName:   { type: String, default: 'Main Campus' },
}, { timestamps: true });

module.exports = mongoose.model('Institution', InstitutionSchema);
