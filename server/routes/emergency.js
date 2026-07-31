const express   = require('express');
const Emergency = require('../models/Emergency');
const Bus       = require('../models/Bus');
const Student   = require('../models/Student');
const User      = require('../models/User');
const { protect, adminOnly, adminOrDriver } = require('../middleware/auth');
const { createNotification } = require('./notifications');

const router = express.Router();

// ── POST /api/emergency/sos ───────────────────────────────────────────────────
// Driver triggers SOS.
// Body: { reason, lat?, lng? }
router.post('/sos', protect, adminOrDriver, async (req, res) => {
  try {
    const { reason, lat, lng } = req.body;
    if (!reason) return res.status(400).json({ message: 'reason is required.' });

    // Find the driver's bus
    const bus = await Bus.findOne({ driverId: req.user._id });
    if (!bus && req.user.role === 'driver')
      return res.status(404).json({ message: 'No bus assigned to your account.' });

    // Set bus status to Emergency
    const targetBus = bus || await Bus.findById(req.body.busId);
    if (targetBus) {
      await Bus.findByIdAndUpdate(targetBus._id, { $set: { status: 'Emergency', speed: 0 } });
    }

    // Create emergency record
    const emergency = await Emergency.create({
      busId:      targetBus?._id      || null,
      busNumber:  targetBus?.busNumber || req.body.busNumber || 'Unknown',
      driverId:   req.user._id,
      driverName: req.user.name,
      reason,
      status:     'Active',
      location:   { lat: lat || null, lng: lng || null },
    });

    // Broadcast notification to all admins
    await createNotification({
      recipientRole:  'admin',
      message:        `🚨 SOS: ${emergency.busNumber} — ${reason} (Driver: ${req.user.name})`,
      type:           'danger',
      relatedBus:     emergency.busNumber,
      createdBy:      req.user._id,
    });

    // Notify only students assigned to this specific bus
    if (targetBus?.busNumber) {
      const assignedStudents = await Student.find({ assignedBus: targetBus.busNumber });
      const userDocs = await User.find({
        email: { $in: assignedStudents.map(s => s.email) }
      }).select('_id email');
      const emailToUserId = {};
      userDocs.forEach(u => { emailToUserId[u.email] = u._id; });

      const sosMessage = `🚨 Emergency on your bus ${emergency.busNumber}: ${reason}. Please stay calm.`;
      const notifPromises = assignedStudents.map(student => {
        if (student.notifPrefs?.emergency === false) return Promise.resolve();
        const userId = emailToUserId[student.email];
        if (!userId) return Promise.resolve();
        return createNotification({
          recipientId:    userId,
          message:        sosMessage,
          type:           'danger',
          relatedBus:     emergency.busNumber,
          relatedStudent: student.studentId,
          createdBy:      req.user._id,
        });
      });
      await Promise.all(notifPromises);
    }

    res.status(201).json({ message: 'SOS dispatched.', emergency });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/emergency — admin: all emergencies ───────────────────────────────
// Query: ?status=Active|Resolved&limit=20
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const emergencies = await Emergency.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json(emergencies);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/emergency/active — count of active emergencies (dashboard badge) ─
router.get('/active', protect, async (req, res) => {
  try {
    const count = await Emergency.countDocuments({ status: 'Active' });
    const list  = await Emergency.find({ status: 'Active' }).sort({ createdAt: -1 });
    res.json({ count, emergencies: list });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/emergency/:id/resolve — admin resolves an emergency ──────────────
// Body: { resolution? }
router.put('/:id/resolve', protect, adminOnly, async (req, res) => {
  try {
    const { resolution = '' } = req.body;

    const emergency = await Emergency.findById(req.params.id);
    if (!emergency) return res.status(404).json({ message: 'Emergency not found.' });
    if (emergency.status === 'Resolved')
      return res.status(409).json({ message: 'Already resolved.' });

    // Update emergency record
    emergency.status     = 'Resolved';
    emergency.resolvedAt = new Date();
    emergency.resolvedBy = req.user._id;
    emergency.resolution = resolution;
    await emergency.save();

    // Reset bus status back to Standby
    if (emergency.busId) {
      await Bus.findByIdAndUpdate(emergency.busId, { $set: { status: 'Standby' } });
    }

    // Notify driver their SOS has been acknowledged
    if (emergency.driverId) {
      await createNotification({
        recipientId: emergency.driverId,
        message:     `✅ Your SOS for ${emergency.busNumber} has been resolved by admin.`,
        type:        'success',
        relatedBus:  emergency.busNumber,
        createdBy:   req.user._id,
      });
    }

    res.json({ message: 'Emergency resolved.', emergency });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
