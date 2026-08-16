const express   = require('express');
const Emergency = require('../models/Emergency');
const Bus       = require('../models/Bus');
const Student   = require('../models/Student');
const User      = require('../models/User');
const { protect, adminOnly, adminOrDriver, tenantScope } = require('../middleware/auth');
const { createNotification } = require('./notifications');

const router = express.Router();

// ── POST /api/emergency/sos ───────────────────────────────────────────────────
router.post('/sos', protect, adminOrDriver, async (req, res) => {
  try {
    const { reason, lat, lng } = req.body;
    if (!reason) return res.status(400).json({ message: 'reason is required.' });

    const bus = await Bus.findOne({ driverId: req.user._id });
    if (!bus && req.user.role === 'driver')
      return res.status(404).json({ message: 'No bus assigned to your account.' });

    const targetBus = bus || (req.body.busId ? await Bus.findById(req.body.busId) : null);
    if (targetBus) {
      await Bus.findByIdAndUpdate(targetBus._id, { $set: { status: 'Emergency', speed: 0 } });
    }

    const emergency = await Emergency.create({
      institutionId: req.user.institutionId || targetBus?.institutionId || null,
      busId:         targetBus?._id      || null,
      busNumber:     targetBus?.busNumber || req.body.busNumber || 'Unknown',
      driverId:      req.user._id,
      driverName:    req.user.name,
      reason,
      status:        'Active',
      location:      { lat: lat || null, lng: lng || null },
    });

    const io = req.app.get('io');

    await createNotification({
      institutionId:  emergency.institutionId,
      recipientRole:  'admin',
      message:        `🚨 SOS: ${emergency.busNumber} — ${reason} (Driver: ${req.user.name})`,
      type:           'danger',
      relatedBus:     emergency.busNumber,
      createdBy:      req.user._id,
      io,
    });

    if (targetBus?.busNumber) {
      const assignedStudents = await Student.find({
        institutionId: emergency.institutionId,
        assignedBus:   targetBus.busNumber,
      });
      const userDocs = await User.find({
        email: { $in: assignedStudents.map(s => s.email) },
      }).select('_id email');
      const emailToUserId = {};
      userDocs.forEach(u => { emailToUserId[u.email] = u._id; });

      const sosMessage = `🚨 Emergency on your bus ${emergency.busNumber}: ${reason}. Please stay calm.`;
      await Promise.all(assignedStudents.map(student => {
        if (student.notifPrefs?.emergency === false) return Promise.resolve();
        const userId = emailToUserId[student.email];
        if (!userId) return Promise.resolve();
        return createNotification({
          institutionId:  emergency.institutionId,
          recipientId:    userId,
          message:        sosMessage,
          type:           'danger',
          relatedBus:     emergency.busNumber,
          relatedStudent: student.studentId,
          createdBy:      req.user._id,
          io,
        });
      }));
    }

    res.status(201).json({ message: 'SOS dispatched.', emergency });

    // Broadcast emergency to all institution clients immediately
    if (io && emergency.institutionId) {
      io.to(`institution:${emergency.institutionId}`).emit('emergency:sos', {
        _id:       emergency._id,
        busNumber: emergency.busNumber,
        reason:    emergency.reason,
        status:    'Active',
        createdAt: emergency.createdAt,
      });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/emergency ────────────────────────────────────────────────────────
router.get('/', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const filter = { ...req.institutionFilter };
    if (req.query.status) filter.status = req.query.status;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const emergencies = await Emergency.find(filter).sort({ createdAt: -1 }).limit(limit);
    res.json(emergencies);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/emergency/active ─────────────────────────────────────────────────
router.get('/active', protect, tenantScope, async (req, res) => {
  try {
    const filter = { status: 'Active', ...req.institutionFilter };
    const count  = await Emergency.countDocuments(filter);
    const list   = await Emergency.find(filter).sort({ createdAt: -1 });
    res.json({ count, emergencies: list });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/emergency/:id/resolve ────────────────────────────────────────────
router.put('/:id/resolve', protect, adminOnly, async (req, res) => {
  try {
    const { resolution = '' } = req.body;

    const emergency = await Emergency.findById(req.params.id);
    if (!emergency) return res.status(404).json({ message: 'Emergency not found.' });

    // Non-super-admin can only resolve their own institution's emergencies
    if (
      req.user.role !== 'super_admin' &&
      emergency.institutionId?.toString() !== req.user.institutionId?.toString()
    ) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    if (emergency.status === 'Resolved')
      return res.status(409).json({ message: 'Already resolved.' });

    emergency.status     = 'Resolved';
    emergency.resolvedAt = new Date();
    emergency.resolvedBy = req.user._id;
    emergency.resolution = resolution;
    await emergency.save();

    if (emergency.busId) {
      await Bus.findByIdAndUpdate(emergency.busId, { $set: { status: 'Standby' } });
    }

    if (emergency.driverId) {
      await createNotification({
        institutionId: emergency.institutionId,
        recipientId:   emergency.driverId,
        message:       `✅ Your SOS for ${emergency.busNumber} has been resolved by admin.`,
        type:          'success',
        relatedBus:    emergency.busNumber,
        createdBy:     req.user._id,
        io:            req.app.get('io'),
      });
    }

    res.json({ message: 'Emergency resolved.', emergency });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
