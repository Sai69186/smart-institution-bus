const express  = require('express');
const Bus      = require('../models/Bus');
const User     = require('../models/User');
const Student  = require('../models/Student');
const { protect, adminOnly, driverOnly } = require('../middleware/auth');
const { createNotification } = require('./notifications');
const { STOP_COORDS, gpsToCanvas, haversineKm, calcStopETAs } = require('../utils/geo');

const router = express.Router();

// ── GET /api/buses/unassigned_drivers ────────────────────────────────────────
router.get('/unassigned_drivers', protect, adminOnly, async (req, res) => {
  try {
    const assignedIds = await Bus.distinct('driverId', { driverId: { $ne: null } });
    const drivers = await User.find({ role: 'driver', _id: { $nin: assignedIds } })
      .select('_id name email phone');
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/buses/available — buses with no driver (public, for signup flow) ─
router.get('/available', async (req, res) => {
  try {
    const buses = await Bus.find({ driverId: null })
      .select('busNumber route capacity')
      .sort({ busNumber: 1 });
    res.json(buses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/buses/me — driver's own bus ──────────────────────────────────────
router.get('/me', protect, driverOnly, async (req, res) => {
  try {
    const bus = await Bus.findOne({ driverId: req.user._id });
    if (!bus) return res.status(404).json({ message: 'No bus assigned to your account.' });
    res.json(bus);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/buses/me/gps — driver pushes live GPS position ──────────────────
router.put('/me/gps', protect, driverOnly, async (req, res) => {
  try {
    const bus = await Bus.findOne({ driverId: req.user._id });
    if (!bus) return res.status(404).json({ message: 'No bus assigned.' });

    const { lat, lng, speed, fuel } = req.body;
    if (!lat || !lng) return res.status(400).json({ message: 'lat and lng are required.' });

    const canvas    = gpsToCanvas(lat, lng);
    const stopETAs  = calcStopETAs(lat, lng, bus.stopSequence, speed || bus.speed || 30);
    const nextStop  = bus.stopSequence.find(s => stopETAs[s] > 0) || 'Vignan LARA — Main Campus';
    const etaToNext = stopETAs[nextStop] || 0;

    const updates = {
      gpsLat:        lat,
      gpsLng:        lng,
      gpsUpdatedAt:  new Date(),
      canvasX:       canvas.x,
      canvasY:       canvas.y,
      speed:         speed ?? bus.speed,
      nextStop,
      etaToNextStop: etaToNext,
      status:        bus.status === 'Standby' ? 'On Route' : bus.status,
    };
    if (fuel !== undefined) updates.fuel = fuel;

    const updated = await Bus.findByIdAndUpdate(
      bus._id,
      { $set: updates },
      { returnDocument: 'after' }
    );

    // ── Fire-and-forget: AI predictions + arrival notifications ──────────────
    // Runs after response is sent — does not block the driver's GPS push
    setImmediate(async () => {
      try {
        const { default: fetch } = await import('node-fetch');
        const PYTHON  = process.env.PYTHON_SERVICE_URL || 'http://localhost:5001';
        const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

        const remainingStops = bus.stopSequence.filter(s => (stopETAs[s] || 0) > 0);

        // 1. AI predictions for next 5 stops
        for (const stop of remainingStops.slice(0, 5)) {
          fetch(`${PYTHON}/predict/boarding`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model:           'XGBoost',
              stop,
              bus_lat:         lat,
              bus_lng:         lng,
              speed_kmh:       speed || bus.speed || 30,
              occupancy:       bus.occupied || 0,
              weather:         'Sunny',
              academic_period: 'Regular Semester',
              day_of_week:     dayName,
            }),
          }).catch(() => {});
        }

        // 2. Arrival notifications — fire when a stop's ETA just hit 0
        //    Compare against the previous GPS push: stops that were >0 before
        //    and are now 0 (or missing, meaning bus passed them) have been reached.
        const arrivedStops = bus.stopSequence.filter(s => {
          const eta = stopETAs[s];
          // eta === 0 means bus is AT the stop right now
          return eta === 0;
        });

        for (const stop of arrivedStops) {
          // Find students assigned to this bus who are waiting at this stop
          const waitingStudents = await Student.find({
            assignedBus:      bus.busNumber,
            pickupPoint:      stop,
            attendanceStatus: 'Waiting',
          });

          if (!waitingStudents.length) continue;

          // Resolve User accounts so notifications reach the right inboxes
          const userDocs = await User.find({
            email: { $in: waitingStudents.map(s => s.email) },
          }).select('_id email');

          const emailToUserId = {};
          userDocs.forEach(u => { emailToUserId[u.email] = u._id; });

          const arrivalMsg = `🚌 ${bus.busNumber} has arrived at ${stop}. Please board now!`;

          for (const student of waitingStudents) {
            if (student.notifPrefs?.busArrival === false) continue;
            const userId = emailToUserId[student.email];
            if (!userId) continue;
            createNotification({
              recipientId:    userId,
              message:        arrivalMsg,
              type:           'success',
              relatedBus:     bus.busNumber,
              relatedStudent: student.studentId,
              createdBy:      null,
            }).catch(() => {});
          }
        }

        // 3. "Approaching" notification — fire when ETA hits 3 mins
        const approachingStops = bus.stopSequence.filter(s => stopETAs[s] === 3);

        for (const stop of approachingStops) {
          const waitingStudents = await Student.find({
            assignedBus:      bus.busNumber,
            pickupPoint:      stop,
            attendanceStatus: 'Waiting',
          });

          if (!waitingStudents.length) continue;

          const userDocs = await User.find({
            email: { $in: waitingStudents.map(s => s.email) },
          }).select('_id email');

          const emailToUserId = {};
          userDocs.forEach(u => { emailToUserId[u.email] = u._id; });

          const approachMsg = `⏰ ${bus.busNumber} is 3 minutes away from ${stop}. Be ready!`;

          for (const student of waitingStudents) {
            if (student.notifPrefs?.busArrival === false) continue;
            const userId = emailToUserId[student.email];
            if (!userId) continue;
            createNotification({
              recipientId:    userId,
              message:        approachMsg,
              type:           'warning',
              relatedBus:     bus.busNumber,
              relatedStudent: student.studentId,
              createdBy:      null,
            }).catch(() => {});
          }
        }
      } catch (_) {}
    });

    res.json({ bus: updated, stopETAs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/buses/me/status — driver updates bus status / reports delay ──────
router.put('/me/status', protect, driverOnly, async (req, res) => {
  try {
    const bus = await Bus.findOne({ driverId: req.user._id });
    if (!bus) return res.status(404).json({ message: 'No bus assigned.' });

    const { status, delayMins } = req.body;
    const updates = {};
    if (status)    updates.status        = status;
    if (delayMins) updates.etaToNextStop = bus.etaToNextStop + delayMins;

    const updated = await Bus.findByIdAndUpdate(
      bus._id,
      { $set: updates },
      { returnDocument: 'after' }
    );

    // Notify students on this bus about the delay + notify all admins
    if (delayMins) {
      const message = `⚠ ${bus.busNumber} is running +${delayMins} min late. New ETA adjusted.`;

      // 1. Notify all admins via role broadcast
      await createNotification({
        recipientRole: 'admin',
        message,
        type:       'warning',
        relatedBus: bus.busNumber,
        createdBy:  req.user._id,
      });

      // 2. Notify ONLY students assigned to this specific bus individually
      const assignedStudents = await Student.find({ assignedBus: bus.busNumber });

      // Resolve User _id from email so recipientId matches req.user._id in notifications/me
      const userDocs = await User.find({
        email: { $in: assignedStudents.map(s => s.email) }
      }).select('_id email');
      const emailToUserId = {};
      userDocs.forEach(u => { emailToUserId[u.email] = u._id; });

      const notifPromises = assignedStudents.map(student => {
        if (student.notifPrefs?.delays === false) return Promise.resolve();
        const userId = emailToUserId[student.email];
        if (!userId) return Promise.resolve(); // no User account yet
        return createNotification({
          recipientId:    userId,           // User._id — matches req.user._id in auth
          message,
          type:           'warning',
          relatedBus:     bus.busNumber,
          relatedStudent: student.studentId,
          createdBy:      req.user._id,
        });
      });
      await Promise.all(notifPromises);
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/buses/me/checklist — driver ticks a checklist item ───────────────
router.put('/me/checklist', protect, driverOnly, async (req, res) => {
  try {
    const bus = await Bus.findOne({ driverId: req.user._id });
    if (!bus) return res.status(404).json({ message: 'No bus assigned.' });

    const { taskIndex, done } = req.body;
    if (taskIndex === undefined)
      return res.status(400).json({ message: 'taskIndex required.' });

    const checklist = [...bus.driverChecklist];
    if (!checklist[taskIndex])
      return res.status(400).json({ message: 'Invalid task index.' });

    checklist[taskIndex] = { ...checklist[taskIndex].toObject(), done: !!done };
    const updated = await Bus.findByIdAndUpdate(
      bus._id,
      { $set: { driverChecklist: checklist } },
      { returnDocument: 'after' }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/buses — list all buses ──────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const buses = await Bus.find().sort({ busNumber: 1 });
    res.json(buses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/buses/:busNumber/etas ────────────────────────────────────────────
router.get('/:busNumber/etas', protect, async (req, res) => {
  try {
    const bus = await Bus.findOne({ busNumber: req.params.busNumber.toUpperCase() });
    if (!bus) return res.status(404).json({ message: 'Bus not found.' });

    const stopETAs = calcStopETAs(bus.gpsLat, bus.gpsLng, bus.stopSequence, bus.speed || 30);
    res.json({ busNumber: bus.busNumber, stopETAs, gpsUpdatedAt: bus.gpsUpdatedAt });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/buses/:busNumber/assign — admin assigns a driver ─────────────────
router.put('/:busNumber/assign', protect, adminOnly, async (req, res) => {
  try {
    const { driverId } = req.body;
    if (!driverId) return res.status(400).json({ message: 'driverId is required.' });

    const bus = await Bus.findOne({ busNumber: req.params.busNumber.toUpperCase() });
    if (!bus) return res.status(404).json({ message: 'Bus not found.' });
    if (bus.driverId && bus.driverId.toString() !== driverId)
      return res.status(409).json({ message: 'Bus already has a driver. Unassign first.' });

    const driver = await User.findById(driverId);
    if (!driver || driver.role !== 'driver')
      return res.status(404).json({ message: 'Driver not found.' });

    // Remove driver from any previous bus
    await Bus.updateMany({ driverId }, { $set: { driverId: null, driverName: '' } });

    const updated = await Bus.findByIdAndUpdate(
      bus._id,
      { $set: { driverId: driver._id, driverName: driver.name, status: 'Standby' } },
      { returnDocument: 'after' }
    );

    driver.busId = bus._id;
    await driver.save();

    res.json({ message: `${driver.name} assigned to ${bus.busNumber}.`, bus: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/buses/:busNumber/unassign — admin removes driver ─────────────────
router.put('/:busNumber/unassign', protect, adminOnly, async (req, res) => {
  try {
    const bus = await Bus.findOne({ busNumber: req.params.busNumber.toUpperCase() });
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

// ── PUT /api/buses/:busNumber/starting-point — admin sets starting point ──────
router.put('/:busNumber/starting-point', protect, adminOnly, async (req, res) => {
  try {
    const { startingPoint } = req.body;
    if (!startingPoint) return res.status(400).json({ message: 'startingPoint is required.' });

    const coord   = STOP_COORDS[startingPoint];
    const updates = { startingPoint };
    if (coord) { updates.startingLat = coord.lat; updates.startingLng = coord.lng; }

    const bus = await Bus.findOneAndUpdate(
      { busNumber: req.params.busNumber.toUpperCase() },
      { $set: updates },
      { returnDocument: 'after' }
    );
    if (!bus) return res.status(404).json({ message: 'Bus not found.' });
    res.json({ message: `Starting point set to "${startingPoint}".`, bus });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/buses — admin creates a bus ─────────────────────────────────────
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { busNumber, route, capacity, stopSequence, startingPoint } = req.body;
    if (!busNumber) return res.status(400).json({ message: 'busNumber is required.' });

    const exists = await Bus.findOne({ busNumber: busNumber.toUpperCase() });
    if (exists) return res.status(409).json({ message: 'Bus already exists.' });

    const firstStop  = startingPoint || stopSequence?.[0] || '';
    const startCoord = STOP_COORDS[firstStop];

    const checklist = [
      { task: 'Pre-trip safety inspection', done: false },
      { task: 'Fuel level confirmed (>30%)', done: false },
      { task: 'GPS transmitter activated',  done: false },
      ...(stopSequence || []).map((s, i) => ({ task: `Stop ${i + 1} — ${s}`, done: false })),
      { task: 'Destination — Vignan LARA Main Campus', done: false },
    ];

    const bus = await Bus.create({
      busNumber:       busNumber.toUpperCase(),
      route:           route        || '',
      capacity:        capacity     || 50,
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

// ── PUT /api/buses/:busNumber — admin updates a bus (whitelist safe fields) ───
router.put('/:busNumber', protect, adminOnly, async (req, res) => {
  try {
    // Whitelist fields that admin is allowed to update directly
    const allowed = ['route', 'capacity', 'status', 'stopSequence', 'startingPoint',
                     'startingLat', 'startingLng', 'fuel', 'driverChecklist'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const bus = await Bus.findOneAndUpdate(
      { busNumber: req.params.busNumber.toUpperCase() },
      { $set: updates },
      { returnDocument: 'after' }
    );
    if (!bus) return res.status(404).json({ message: 'Bus not found.' });
    res.json(bus);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/buses/:busNumber — admin deletes a bus ────────────────────────
router.delete('/:busNumber', protect, adminOnly, async (req, res) => {
  try {
    const bus = await Bus.findOneAndDelete({ busNumber: req.params.busNumber.toUpperCase() });
    if (!bus) return res.status(404).json({ message: 'Bus not found.' });
    res.json({ message: `Bus ${req.params.busNumber} removed.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = { router, calcStopETAs, STOP_COORDS };
