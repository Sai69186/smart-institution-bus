const express  = require('express');
const Bus      = require('../models/Bus');
const User     = require('../models/User');
const Student  = require('../models/Student');
const { protect, adminOnly, driverOnly, adminOrDriver, tenantScope } = require('../middleware/auth');
const { createNotification } = require('./notifications');
const { gpsToCanvas, haversineKm, calcStopETAs, nearestNeighbor2opt, getRemainingStops, STOP_COORDS } = require('../utils/geo');
const { validateBody } = require('../utils/validate');

const router = express.Router();

// ── GET /api/buses/unassigned_drivers ────────────────────────────────────────
router.get('/unassigned_drivers', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const assignedIds = await Bus.distinct('driverId', {
      driverId: { $ne: null },
      ...req.institutionFilter,
    });
    const driverFilter = { role: 'driver', _id: { $nin: assignedIds } };
    if (req.user.institutionId) driverFilter.institutionId = req.user.institutionId;

    const drivers = await User.find(driverFilter).select('_id name email phone');
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/buses/available ─────────────────────────────────────────────────
// Buses with no driver — for driver signup. Scoped to institution via query param.
router.get('/available', async (req, res) => {
  try {
    const filter = { driverId: null };
    if (req.query.institutionId) filter.institutionId = req.query.institutionId;
    const buses = await Bus.find(filter)
      .select('busNumber route capacity institutionId')
      .sort({ busNumber: 1 });
    res.json(buses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/buses/me ─────────────────────────────────────────────────────────
router.get('/me', protect, driverOnly, async (req, res) => {
  try {
    const bus = await Bus.findOne({ driverId: req.user._id });
    if (!bus) return res.status(404).json({ message: 'No bus assigned to your account.' });
    res.json(bus);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/buses/me/gps ─────────────────────────────────────────────────────
router.put('/me/gps', protect, driverOnly,
  (req, res, next) => {
    // Per-IP GPS rate limit (60 pushes/min max) — fetched from app settings
    const gpsLimiter = req.app.get('gpsLimiter');
    if (gpsLimiter) return gpsLimiter(req, res, next);
    next();
  },
  validateBody(({ lat, lng, speed, fuel }) => [
    { field: 'lat',   value: lat,   required: true, isNumber: true, min: -90,  max: 90  },
    { field: 'lng',   value: lng,   required: true, isNumber: true, min: -180, max: 180 },
    { field: 'speed', value: speed, isNumber: true, min: 0, max: 200                    },
    { field: 'fuel',  value: fuel,  isNumber: true, min: 0, max: 100                    },
  ]),
  async (req, res) => {
  try {
    const bus = await Bus.findOne({ driverId: req.user._id });
    if (!bus) return res.status(404).json({ message: 'No bus assigned.' });

    const { lat, lng, speed, fuel } = req.body;
    if (!lat || !lng) return res.status(400).json({ message: 'lat and lng are required.' });

    const canvas   = gpsToCanvas(lat, lng);
    const stopETAs = calcStopETAs(lat, lng, bus.stopSequence, speed || bus.speed || 30);
    const nextStop = bus.stopSequence.find(s => stopETAs[s] > 0) || bus.stopSequence[bus.stopSequence.length - 1] || '';
    const etaToNext = stopETAs[nextStop] || 0;

    // Compute remaining stops using 150m geofence — skips already-passed stops
    const remainingStops = getRemainingStops(lat, lng, bus.stopSequence, 150);

    const updates = {
      gpsLat:         lat,
      gpsLng:         lng,
      gpsUpdatedAt:   new Date(),
      canvasX:        canvas.x,
      canvasY:        canvas.y,
      speed:          speed ?? bus.speed,
      nextStop,
      etaToNextStop:  etaToNext,
      remainingStops, // ← stored so all portals read the same computed value
      status:         bus.status === 'Standby' ? 'On Route' : bus.status,
    };
    if (fuel !== undefined) updates.fuel = fuel;

    const updated = await Bus.findByIdAndUpdate(
      bus._id, { $set: updates }, { returnDocument: 'after' }
    );

    // Capture io before entering setImmediate (req not available inside)
    const io = req.app.get('io');

    setImmediate(async () => {
      try {
        const { default: fetch } = await import('node-fetch');
        const PYTHON  = process.env.PYTHON_SERVICE_URL || 'http://localhost:5001';
        const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const remainingStops = bus.stopSequence.filter(s => (stopETAs[s] || 0) > 0);

        for (const stop of remainingStops.slice(0, 5)) {
          fetch(`${PYTHON}/predict/boarding`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'XGBoost', stop, bus_lat: lat, bus_lng: lng,
              speed_kmh: speed || bus.speed || 30, occupancy: bus.occupied || 0,
              weather: 'Sunny', academic_period: 'Regular Semester', day_of_week: dayName,
            }),
          }).catch(() => {});
        }

        const arrivedStops = bus.stopSequence.filter(s => stopETAs[s] === 0);
        for (const stop of arrivedStops) {
          const waitingStudents = await Student.find({
            institutionId:    bus.institutionId,
            assignedBus:      bus.busNumber,
            pickupPoint:      stop,
            attendanceStatus: 'Waiting',
          });
          if (!waitingStudents.length) continue;
          const userDocs = await User.find({ email: { $in: waitingStudents.map(s => s.email) } }).select('_id email');
          const emailToUserId = {};
          userDocs.forEach(u => { emailToUserId[u.email] = u._id; });
          for (const student of waitingStudents) {
            if (student.notifPrefs?.busArrival === false) continue;
            const userId = emailToUserId[student.email];
            if (!userId) continue;
            createNotification({
              institutionId: bus.institutionId,
              recipientId: userId,
              message: `🚌 ${bus.busNumber} has arrived at ${stop}. Please board now!`,
              type: 'success', relatedBus: bus.busNumber, relatedStudent: student.studentId,
              io,
            }).catch(() => {});
          }
        }

        const approachingStops = bus.stopSequence.filter(s => stopETAs[s] === 3);
        for (const stop of approachingStops) {
          const waitingStudents = await Student.find({
            institutionId: bus.institutionId, assignedBus: bus.busNumber,
            pickupPoint: stop, attendanceStatus: 'Waiting',
          });
          if (!waitingStudents.length) continue;
          const userDocs = await User.find({ email: { $in: waitingStudents.map(s => s.email) } }).select('_id email');
          const emailToUserId = {};
          userDocs.forEach(u => { emailToUserId[u.email] = u._id; });
          for (const student of waitingStudents) {
            if (student.notifPrefs?.busArrival === false) continue;
            const userId = emailToUserId[student.email];
            if (!userId) continue;
            createNotification({
              institutionId: bus.institutionId, recipientId: userId,
              message: `⏰ ${bus.busNumber} is 3 minutes away from ${stop}. Be ready!`,
              type: 'warning', relatedBus: bus.busNumber, relatedStudent: student.studentId,
              io,
            }).catch(() => {});
          }
        }
      } catch (_) {}
    });

    // ── Real-time broadcast via Socket.io ────────────────────────────────────
    // Push bus update to all connected clients in this institution room
    // so they don't need to poll — they receive the update instantly
    if (io && updated.institutionId) {
      io.to(`institution:${updated.institutionId}`).emit('bus:gps_update', {
        busNumber:     updated.busNumber,
        gpsLat:        updated.gpsLat,
        gpsLng:        updated.gpsLng,
        speed:         updated.speed,
        fuel:          updated.fuel,
        status:        updated.status,
        nextStop:      updated.nextStop,
        etaToNextStop: updated.etaToNextStop,
        remainingStops: updated.remainingStops,
        stopETAs,
        gpsUpdatedAt:  updated.gpsUpdatedAt,
      });
    }

    res.json({ bus: updated, stopETAs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/buses/me/status ──────────────────────────────────────────────────
router.put('/me/status', protect, driverOnly, async (req, res) => {
  try {
    const bus = await Bus.findOne({ driverId: req.user._id });
    if (!bus) return res.status(404).json({ message: 'No bus assigned.' });

    const { status, delayMins } = req.body;
    const updates = {};
    if (status)    updates.status        = status;
    if (delayMins) updates.etaToNextStop = bus.etaToNextStop + delayMins;

    const updated = await Bus.findByIdAndUpdate(
      bus._id, { $set: updates }, { returnDocument: 'after' }
    );

    const io = req.app.get('io');

    if (delayMins) {
      const message = `⚠ ${bus.busNumber} is running +${delayMins} min late. New ETA adjusted.`;
      await createNotification({
        institutionId: bus.institutionId, recipientRole: 'admin',
        message, type: 'warning', relatedBus: bus.busNumber, createdBy: req.user._id,
        io,
      });
      const assignedStudents = await Student.find({
        institutionId: bus.institutionId, assignedBus: bus.busNumber,
      });
      const userDocs = await User.find({ email: { $in: assignedStudents.map(s => s.email) } }).select('_id email');
      const emailToUserId = {};
      userDocs.forEach(u => { emailToUserId[u.email] = u._id; });
      await Promise.all(assignedStudents.map(student => {
        if (student.notifPrefs?.delays === false) return Promise.resolve();
        const userId = emailToUserId[student.email];
        if (!userId) return Promise.resolve();
        return createNotification({
          institutionId: bus.institutionId, recipientId: userId,
          message, type: 'warning', relatedBus: bus.busNumber,
          relatedStudent: student.studentId, createdBy: req.user._id,
          io,
        });
      }));
    }

    // ── Real-time broadcast: status/delay change ──────────────────────────
    if (io && updated.institutionId) {
      io.to(`institution:${updated.institutionId}`).emit('bus:status_update', {
        busNumber:     updated.busNumber,
        status:        updated.status,
        etaToNextStop: updated.etaToNextStop,
      });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/buses/me/checklist ───────────────────────────────────────────────
router.put('/me/checklist', protect, driverOnly, async (req, res) => {
  try {
    const bus = await Bus.findOne({ driverId: req.user._id });
    if (!bus) return res.status(404).json({ message: 'No bus assigned.' });
    const { taskIndex, done } = req.body;
    if (taskIndex === undefined) return res.status(400).json({ message: 'taskIndex required.' });
    const checklist = [...bus.driverChecklist];
    if (!checklist[taskIndex]) return res.status(400).json({ message: 'Invalid task index.' });
    checklist[taskIndex] = { ...checklist[taskIndex].toObject(), done: !!done };
    const updated = await Bus.findByIdAndUpdate(
      bus._id, { $set: { driverChecklist: checklist } }, { returnDocument: 'after' }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/buses — list buses scoped to institution ────────────────────────
// Drivers only see their own bus; all other roles see institution buses
router.get('/', protect, tenantScope, async (req, res) => {
  try {
    let filter = req.institutionFilter;
    // Driver: only return their own bus
    if (req.user.role === 'driver') {
      filter = { ...filter, driverId: req.user._id };
    }
    const buses = await Bus.find(filter).sort({ busNumber: 1 });
    res.json(buses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/buses/:busNumber/etas ────────────────────────────────────────────
router.get('/:busNumber/etas', protect, tenantScope, async (req, res) => {
  try {
    const bus = await Bus.findOne({
      busNumber: req.params.busNumber.toUpperCase(),
      ...req.institutionFilter,
    });
    if (!bus) return res.status(404).json({ message: 'Bus not found.' });
    const stopETAs = calcStopETAs(bus.gpsLat, bus.gpsLng, bus.stopSequence, bus.speed || 30);
    res.json({ busNumber: bus.busNumber, stopETAs, gpsUpdatedAt: bus.gpsUpdatedAt });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/buses/:busNumber/assign ─────────────────────────────────────────
router.put('/:busNumber/assign', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const { driverId } = req.body;
    if (!driverId) return res.status(400).json({ message: 'driverId is required.' });

    const bus = await Bus.findOne({ busNumber: req.params.busNumber.toUpperCase(), ...req.institutionFilter });
    if (!bus) return res.status(404).json({ message: 'Bus not found.' });
    if (bus.driverId && bus.driverId.toString() !== driverId)
      return res.status(409).json({ message: 'Bus already has a driver. Unassign first.' });

    const driver = await User.findById(driverId);
    if (!driver || driver.role !== 'driver')
      return res.status(404).json({ message: 'Driver not found.' });

    await Bus.updateMany({ driverId, institutionId: bus.institutionId }, { $set: { driverId: null, driverName: '' } });
    const updated = await Bus.findByIdAndUpdate(
      bus._id,
      { $set: { driverId: driver._id, driverName: driver.name, status: 'Standby' } },
      { returnDocument: 'after' }
    );
    driver.busId         = bus._id;
    driver.institutionId = bus.institutionId;
    await driver.save();

    res.json({ message: `${driver.name} assigned to ${bus.busNumber}.`, bus: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/buses/:busNumber/unassign ───────────────────────────────────────
router.put('/:busNumber/unassign', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const bus = await Bus.findOne({ busNumber: req.params.busNumber.toUpperCase(), ...req.institutionFilter });
    if (!bus) return res.status(404).json({ message: 'Bus not found.' });
    if (bus.driverId) {
      await User.findByIdAndUpdate(bus.driverId, { $set: { busId: null } });
    }
    const updated = await Bus.findByIdAndUpdate(
      bus._id,
      { $set: { driverId: null, driverName: '', status: 'Standby', gpsLat: null, gpsLng: null, speed: 0 } },
      { returnDocument: 'after' }
    );
    res.json({ message: `Driver removed from ${bus.busNumber}.`, bus: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/buses/:busNumber/starting-point ─────────────────────────────────
router.put('/:busNumber/starting-point', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const { startingPoint, lat, lng } = req.body;
    if (!startingPoint) return res.status(400).json({ message: 'startingPoint is required.' });

    // Use provided lat/lng, or fall back to known STOP_COORDS
    const coord   = (lat && lng) ? { lat, lng } : STOP_COORDS[startingPoint];
    const updates = { startingPoint };
    if (coord) { updates.startingLat = coord.lat; updates.startingLng = coord.lng; }

    const bus = await Bus.findOneAndUpdate(
      { busNumber: req.params.busNumber.toUpperCase(), ...req.institutionFilter },
      { $set: updates },
      { returnDocument: 'after' }
    );
    if (!bus) return res.status(404).json({ message: 'Bus not found.' });
    res.json({ message: `Starting point set to "${startingPoint}".`, bus });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/buses — admin creates a bus ────────────────────────────────────
router.post('/', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const { busNumber, route, capacity, stopSequence, startingPoint } = req.body;
    if (!busNumber) return res.status(400).json({ message: 'busNumber is required.' });

    // institutionId comes from token via tenantScope (never from body)
    const institutionId = req.user.institutionId;
    if (!institutionId && req.user.role !== 'super_admin') {
      return res.status(400).json({ message: 'institutionId required — pass it in the request body for super_admin.' });
    }
    const instId = institutionId || req.body.institutionId;

    const exists = await Bus.findOne({ busNumber: busNumber.toUpperCase(), institutionId: instId });
    if (exists) return res.status(409).json({ message: 'Bus number already exists for this institution.' });

    const firstStop  = startingPoint || stopSequence?.[0] || '';
    const startCoord = (req.body.startingLat && req.body.startingLng)
      ? { lat: req.body.startingLat, lng: req.body.startingLng }
      : STOP_COORDS[firstStop];

    const checklist = [
      { task: 'Pre-trip safety inspection', done: false },
      { task: 'Fuel level confirmed (>30%)', done: false },
      { task: 'GPS transmitter activated',   done: false },
      ...(stopSequence || []).map((s, i) => ({ task: `Stop ${i + 1} — ${s}`, done: false })),
      { task: 'Destination — Main Campus',   done: false },
    ];

    const bus = await Bus.create({
      institutionId:   instId,
      busNumber:       busNumber.toUpperCase(),
      route:           route        || '',
      capacity:        capacity     || 40,
      stopSequence:    stopSequence || [],
      startingPoint:   firstStop,
      startingLat:     startCoord?.lat || null,
      startingLng:     startCoord?.lng || null,
      driverChecklist: checklist,
    });
    res.status(201).json(bus);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/buses/:busNumber — admin updates a bus ──────────────────────────
router.put('/:busNumber', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const allowed = ['route', 'capacity', 'status', 'stopSequence', 'startingPoint',
                     'startingLat', 'startingLng', 'fuel', 'driverChecklist'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const bus = await Bus.findOneAndUpdate(
      { busNumber: req.params.busNumber.toUpperCase(), ...req.institutionFilter },
      { $set: updates },
      { returnDocument: 'after' }
    );
    if (!bus) return res.status(404).json({ message: 'Bus not found.' });
    res.json(bus);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/buses/:busNumber ─────────────────────────────────────────────
router.delete('/:busNumber', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const bus = await Bus.findOneAndDelete({
      busNumber: req.params.busNumber.toUpperCase(),
      ...req.institutionFilter,
    });
    if (!bus) return res.status(404).json({ message: 'Bus not found.' });
    res.json({ message: `Bus ${req.params.busNumber} removed.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/buses/:busNumber/optimize ──────────────────────────────────────
// Runs nearest-neighbor + 2-opt on this bus's stop sequence and saves it.
router.post('/:busNumber/optimize', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const bus = await Bus.findOne({
      busNumber: req.params.busNumber.toUpperCase(),
      ...req.institutionFilter,
    });
    if (!bus) return res.status(404).json({ message: 'Bus not found.' });
    if (!bus.stopSequence?.length) return res.status(400).json({ message: 'Bus has no stops to optimize.' });

    // Build stop coords map from bus stops (uses provided lat/lng or falls back to STOP_COORDS)
    const { ordered, totalKm } = nearestNeighbor2opt(
      bus.stopSequence,
      bus.startingPoint || bus.stopSequence[0],
    );

    await Bus.findByIdAndUpdate(bus._id, {
      $set: { stopSequence: ordered, totalRouteDistanceKm: totalKm, lastOptimizedAt: new Date() },
    });

    res.json({
      busNumber:   bus.busNumber,
      before:      bus.stopSequence,
      after:       ordered,
      totalKm,
      savedAt:     new Date(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = { router };
