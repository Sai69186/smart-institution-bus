const express    = require('express');
const Attendance = require('../models/Attendance');
const Student    = require('../models/Student');
const Bus        = require('../models/Bus');
const { protect, adminOnly, driverOnly, adminOrDriver, tenantScope } = require('../middleware/auth');
const { createNotification } = require('./notifications');

const router = express.Router();

const todayStr  = () => new Date().toISOString().split('T')[0];
const nowTimeStr = () =>
  new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

// ── POST /api/attendance/board ────────────────────────────────────────────────
router.post('/board', protect, adminOrDriver, async (req, res) => {
  try {
    const { studentId, stop, method = 'manual' } = req.body;
    if (!studentId) return res.status(400).json({ message: 'studentId is required.' });

    // Scope student lookup to institution
    const instFilter = req.user.institutionId ? { institutionId: req.user.institutionId } : {};
    const student = await Student.findOne({ studentId, ...instFilter });
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    let bus;
    if (req.user.role === 'driver') {
      bus = await Bus.findOne({ driverId: req.user._id });
      if (!bus) return res.status(404).json({ message: 'No bus assigned to your account.' });
    } else {
      bus = await Bus.findOne({ busNumber: student.assignedBus, ...instFilter });
      if (!bus) return res.status(404).json({ message: 'Student has no assigned bus.' });
    }

    const date    = todayStr();
    const timeStr = nowTimeStr();

    const attendance = await Attendance.findOneAndUpdate(
      { studentId, date },
      {
        $set: {
          institutionId: student.institutionId,
          studentName:   student.name,
          busNumber:     bus.busNumber,
          driverId:      req.user.role === 'driver' ? req.user._id : null,
          stop:          stop || student.pickupPoint || '',
          boardingTime:  timeStr,
          method,
          status:        'Boarded',
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    await Student.findByIdAndUpdate(student._id, {
      $set: { attendanceStatus: 'Boarded', actualBoardingTime: timeStr },
    });

    if (student.attendanceStatus !== 'Boarded') {
      await Bus.findByIdAndUpdate(bus._id, { $inc: { occupied: 1 } });
    }

    const prefs = student.notifPrefs;
    if (!prefs || prefs.busArrival !== false) {
      createNotification({
        institutionId:  student.institutionId,
        recipientId:    student._id,
        message:        `✅ You have been marked as boarded on ${bus.busNumber} at ${stop || student.pickupPoint || 'your stop'} — ${timeStr}.`,
        type:           'success',
        relatedBus:     bus.busNumber,
        relatedStudent: student.studentId,
        io:             req.app.get('io'),
      }).catch(() => {});
    }

    // ── Real-time broadcast: student boarded ──────────────────────────────────
    const io = req.app.get('io');
    if (io && student.institutionId) {
      io.to(`institution:${student.institutionId}`).emit('attendance:boarded', {
        studentId:   student.studentId,
        studentName: student.name,
        busNumber:   bus.busNumber,
        stop:        stop || student.pickupPoint || '',
        time:        timeStr,
        occupied:    bus.occupied + (student.attendanceStatus !== 'Boarded' ? 1 : 0),
      });
    }

    res.status(201).json({ message: `${student.name} marked as boarded.`, attendance });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Student already marked as boarded today.' });
    }
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/attendance/:studentId/absent ─────────────────────────────────────
router.put('/:studentId/absent', protect, adminOrDriver, async (req, res) => {
  try {
    const { studentId } = req.params;
    const instFilter = req.user.institutionId ? { institutionId: req.user.institutionId } : {};
    const student = await Student.findOne({ studentId, ...instFilter });
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    const date = todayStr();
    const attendance = await Attendance.findOneAndUpdate(
      { studentId, date },
      {
        $set: {
          institutionId: student.institutionId,
          studentName:   student.name,
          busNumber:     student.assignedBus || '',
          boardingTime:  '',
          status:        'Absent',
          method:        'manual',
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    if (student.attendanceStatus === 'Boarded' && student.assignedBus) {
      await Bus.findOneAndUpdate(
        { busNumber: student.assignedBus, ...instFilter },
        { $inc: { occupied: -1 } }
      );
    }

    await Student.findByIdAndUpdate(student._id, {
      $set: { attendanceStatus: 'Absent', actualBoardingTime: '--:--' },
    });

    res.json({ message: `${student.name} marked as absent.`, attendance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/attendance/today ─────────────────────────────────────────────────
router.get('/today', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const records = await Attendance.find({
      date: todayStr(),
      ...req.institutionFilter,
    }).sort({ createdAt: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/attendance/bus/:busNumber ────────────────────────────────────────
router.get('/bus/:busNumber', protect, adminOrDriver, tenantScope, async (req, res) => {
  try {
    if (req.user.role === 'driver') {
      const myBus = await Bus.findOne({ driverId: req.user._id });
      if (!myBus || myBus.busNumber !== req.params.busNumber.toUpperCase()) {
        return res.status(403).json({ message: 'You can only view your own bus.' });
      }
    }

    const records = await Attendance.find({
      busNumber: req.params.busNumber.toUpperCase(),
      date:      todayStr(),
      ...req.institutionFilter,
    }).sort({ boardingTime: 1 });

    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/attendance/student/:studentId ────────────────────────────────────
router.get('/student/:studentId', protect, async (req, res) => {
  try {
    const { studentId } = req.params;
    if (req.user.role === 'student' && req.user.studentId !== studentId) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const filter = { studentId };
    if (req.user.institutionId) filter.institutionId = req.user.institutionId;

    const records = await Attendance.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(60);

    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/attendance/stats ─────────────────────────────────────────────────
router.get('/stats', protect, tenantScope, async (req, res) => {
  try {
    const date = req.query.date || todayStr();
    const instFilter = req.institutionFilter;

    const totalStudents = await Student.countDocuments(instFilter);
    const boarded       = await Attendance.countDocuments({ date, status: 'Boarded', ...instFilter });
    const absent        = await Attendance.countDocuments({ date, status: 'Absent',  ...instFilter });
    const waiting       = totalStudents - boarded - absent;

    // For aggregation, convert ObjectId filter
    const matchFilter = { date };
    if (instFilter.institutionId) matchFilter.institutionId = instFilter.institutionId;

    const perBus = await Attendance.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id:     '$busNumber',
          boarded: { $sum: { $cond: [{ $eq: ['$status', 'Boarded'] }, 1, 0] } },
          absent:  { $sum: { $cond: [{ $eq: ['$status', 'Absent']  }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      date,
      totals: { totalStudents, boarded, absent, waiting: Math.max(0, waiting) },
      perBus,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
