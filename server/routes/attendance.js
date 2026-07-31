const express    = require('express');
const Attendance = require('../models/Attendance');
const Student    = require('../models/Student');
const Bus        = require('../models/Bus');
const { protect, adminOnly, driverOnly, adminOrDriver } = require('../middleware/auth');
const { createNotification } = require('./notifications');

const router = express.Router();

// Helper — today's date string "YYYY-MM-DD"
const todayStr = () => new Date().toISOString().split('T')[0];

// Helper — current time string "HH:MM AM/PM"
const nowTimeStr = () =>
  new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

// ── POST /api/attendance/board ────────────────────────────────────────────────
// Driver marks a student as boarded.
// Body: { studentId, stop?, method? }
router.post('/board', protect, adminOrDriver, async (req, res) => {
  try {
    const { studentId, stop, method = 'manual' } = req.body;
    if (!studentId) return res.status(400).json({ message: 'studentId is required.' });

    // Find the student
    const student = await Student.findOne({ studentId });
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    // Find the bus (driver's own bus, or any bus if admin)
    let bus;
    if (req.user.role === 'driver') {
      bus = await Bus.findOne({ driverId: req.user._id });
      if (!bus) return res.status(404).json({ message: 'No bus assigned to your account.' });
    } else {
      // Admin: derive bus from student's assignment
      bus = await Bus.findOne({ busNumber: student.assignedBus });
      if (!bus) return res.status(404).json({ message: 'Student has no assigned bus.' });
    }

    const date    = todayStr();
    const timeStr = nowTimeStr();

    // Upsert the attendance record (one per student per day)
    const attendance = await Attendance.findOneAndUpdate(
      { studentId, date },
      {
        $set: {
          studentName:  student.name,
          busNumber:    bus.busNumber,
          driverId:     req.user.role === 'driver' ? req.user._id : null,
          stop:         stop || student.pickupPoint || '',
          boardingTime: timeStr,
          method,
          status:       'Boarded',
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Update Student record
    await Student.findByIdAndUpdate(student._id, {
      $set: {
        attendanceStatus:   'Boarded',
        actualBoardingTime: timeStr,
      },
    });

    // Increment bus occupied count (only if student was not already boarded)
    if (student.attendanceStatus !== 'Boarded') {
      await Bus.findByIdAndUpdate(bus._id, { $inc: { occupied: 1 } });
    }

    // Notify the student they have been marked as boarded (respects notifPrefs)
    const prefs = student.notifPrefs;
    if (!prefs || prefs.busArrival !== false) {
      await createNotification({
        recipientId:    student._id,
        message:        `✅ You have been marked as boarded on ${bus.busNumber} at ${stop || student.pickupPoint || 'your stop'} — ${timeStr}.`,
        type:           'success',
        relatedBus:     bus.busNumber,
        relatedStudent: student.studentId,
      });
    }

    res.status(201).json({
      message:    `${student.name} marked as boarded.`,
      attendance,
    });
  } catch (err) {
    // Duplicate key — student already boarded today
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Student already marked as boarded today.' });
    }
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/attendance/:studentId/absent ─────────────────────────────────────
// Mark a student absent for today.
router.put('/:studentId/absent', protect, adminOrDriver, async (req, res) => {
  try {
    const { studentId } = req.params;
    const date = todayStr();

    const student = await Student.findOne({ studentId });
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    // Upsert absent record
    const attendance = await Attendance.findOneAndUpdate(
      { studentId, date },
      {
        $set: {
          studentName:  student.name,
          busNumber:    student.assignedBus || '',
          boardingTime: '',
          status:       'Absent',
          method:       'manual',
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    // If they were previously boarded, decrement bus occupied count
    if (student.attendanceStatus === 'Boarded' && student.assignedBus) {
      await Bus.findOneAndUpdate(
        { busNumber: student.assignedBus },
        { $inc: { occupied: -1 } }
      );
    }

    // Update student status
    await Student.findByIdAndUpdate(student._id, {
      $set: { attendanceStatus: 'Absent', actualBoardingTime: '--:--' },
    });

    res.json({ message: `${student.name} marked as absent.`, attendance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/attendance/today — admin: all records for today ──────────────────
router.get('/today', protect, adminOnly, async (req, res) => {
  try {
    const records = await Attendance.find({ date: todayStr() }).sort({ createdAt: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/attendance/bus/:busNumber — driver/admin: today's list for a bus ─
router.get('/bus/:busNumber', protect, adminOrDriver, async (req, res) => {
  try {
    // Drivers can only see their own bus
    if (req.user.role === 'driver') {
      const myBus = await Bus.findOne({ driverId: req.user._id });
      if (!myBus || myBus.busNumber !== req.params.busNumber.toUpperCase()) {
        return res.status(403).json({ message: 'You can only view your own bus.' });
      }
    }

    const records = await Attendance.find({
      busNumber: req.params.busNumber.toUpperCase(),
      date:      todayStr(),
    }).sort({ boardingTime: 1 });

    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/attendance/student/:studentId — student's full history ────────────
router.get('/student/:studentId', protect, async (req, res) => {
  try {
    const { studentId } = req.params;

    // Students can only fetch their own history
    if (req.user.role === 'student' && req.user.studentId !== studentId) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const records = await Attendance.find({ studentId })
      .sort({ date: -1, createdAt: -1 })
      .limit(60); // last 60 days

    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/attendance/stats — live boarding stats per bus/route ─────────────
// Returns counts for dashboard cards and analytics
router.get('/stats', protect, async (req, res) => {
  try {
    const date = req.query.date || todayStr();

    // Overall totals
    const totalStudents = await Student.countDocuments();
    const boarded       = await Attendance.countDocuments({ date, status: 'Boarded' });
    const absent        = await Attendance.countDocuments({ date, status: 'Absent' });
    const waiting       = totalStudents - boarded - absent;

    // Per-bus breakdown
    const perBus = await Attendance.aggregate([
      { $match: { date } },
      {
        $group: {
          _id:    '$busNumber',
          boarded:{ $sum: { $cond: [{ $eq: ['$status', 'Boarded'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'Absent']  }, 1, 0] } },
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
