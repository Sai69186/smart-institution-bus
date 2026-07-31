const mongoose = require('mongoose');

// One document per physical bus at Vignan LARA
// Drivers register by bus number — this record is then linked to their User account
const BusSchema = new mongoose.Schema({
  busNumber:   { type: String, required: true, unique: true, trim: true, uppercase: true }, // e.g. "BUS-001"
  route:       { type: String, default: '' },        // e.g. "Route A — Vadlamudi → Vignan LARA"
  capacity:    { type: Number, default: 50 },
  occupied:    { type: Number, default: 0 },

  // Assigned driver (set when driver registers / admin assigns)
  driverId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  driverName:  { type: String, default: '' },

  // Live GPS position (updated by driver's device via PUT /api/buses/me/gps)
  gpsLat:      { type: Number, default: null },
  gpsLng:      { type: Number, default: null },
  gpsUpdatedAt:{ type: Date,   default: null },

  // Canvas coordinates derived from GPS for map rendering
  canvasX:     { type: Number, default: 400 },
  canvasY:     { type: Number, default: 240 },
  coordIndex:  { type: Number, default: 0 },

  speed:       { type: Number, default: 0 },         // km/h, reported by driver GPS
  fuel:        { type: Number, default: 100 },        // percentage
  status:      { type: String, enum: ['On Route', 'Delayed', 'Standby', 'Emergency', 'Towed'], default: 'Standby' },
  nextStop:    { type: String, default: '' },
  etaToNextStop: { type: Number, default: 0 },       // minutes

  // Route stop sequence (array of stop names in order)
  stopSequence: [{ type: String }],

  // Starting point — first pickup stop where bus begins its route
  startingPoint:    { type: String, default: '' },   // stop name, e.g. "Vadlamudi Bus Stand"
  startingLat:      { type: Number, default: null }, // GPS lat of starting point
  startingLng:      { type: Number, default: null }, // GPS lng of starting point

  // Driver checklist — generated from stopSequence
  driverChecklist: [{
    task: { type: String },
    done: { type: Boolean, default: false }
  }],

  // Route optimization metadata
  lastOptimizedAt:      { type: Date,   default: null },
  totalRouteDistanceKm: { type: Number, default: null }, // km, recomputed by optimizer
}, { timestamps: true });

module.exports = mongoose.model('Bus', BusSchema);
