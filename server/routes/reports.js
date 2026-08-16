const express    = require('express');
const Attendance = require('../models/Attendance');
const Student    = require('../models/Student');
const Bus        = require('../models/Bus');
const Feedback   = require('../models/Feedback');
const PredictionLog = require('../models/PredictionLog');
const { protect, adminOnly, tenantScope } = require('../middleware/auth');

const router = express.Router();
const todayStr = () => new Date().toISOString().split('T')[0];

// ── GET /api/reports/attendance_summary ──────────────────────────────────────
router.get('/attendance_summary', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const date    = req.query.date || todayStr();
    const instF   = req.institutionFilter;

    const totalStudents = await Student.countDocuments(instF);
    const boarded       = await Attendance.countDocuments({ date, status: 'Boarded', ...instF });
    const absent        = await Attendance.countDocuments({ date, status: 'Absent',  ...instF });
    const waiting       = Math.max(0, totalStudents - boarded - absent);

    const matchFilter = { date };
    if (instF.institutionId) matchFilter.institutionId = instF.institutionId;

    const perBusRaw = await Attendance.aggregate([
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

    const buses = await Bus.find(instF).select('busNumber driverName');
    const busMap = {};
    buses.forEach(b => { busMap[b.busNumber] = b.driverName || 'Unassigned'; });

    const perBus = perBusRaw.map(b => ({
      busNumber:  b._id,
      driverName: busMap[b._id] || 'Unassigned',
      boarded:    b.boarded,
      absent:     b.absent,
    }));

    res.json({ date, totals: { totalStudents, boarded, absent, waiting }, perBus });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/reports/route_performance ───────────────────────────────────────
router.get('/route_performance', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const days  = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const matchFilter = { date: { $gte: sinceStr }, errorMins: { $ne: null } };
    if (req.institutionFilter.institutionId) {
      matchFilter.institutionId = req.institutionFilter.institutionId;
    }

    const raw = await PredictionLog.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id:      '$busNumber',
          avgError: { $avg: { $abs: '$errorMins' } },
          count:    { $sum: 1 },
          onTime:   { $sum: { $cond: [{ $lte: [{ $abs: '$errorMins' }, 2] }, 1, 0] } },
        },
      },
      { $sort: { avgError: 1 } },
    ]);

    const buses = await Bus.find(req.institutionFilter).select('busNumber route');
    const routeMap = {};
    buses.forEach(b => { routeMap[b.busNumber] = b.route; });

    const performance = raw.map(r => ({
      busNumber:    r._id,
      route:        routeMap[r._id] || '—',
      avgErrorMins: r.avgError.toFixed(1),
      tripCount:    r.count,
      onTimeRate:   Math.round((r.onTime / r.count) * 100),
    }));

    res.json({ days, performance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/reports/occupancy_trend ─────────────────────────────────────────
router.get('/occupancy_trend', protect, tenantScope, async (req, res) => {
  try {
    const date   = req.query.date || todayStr();
    const labels = ['07:00 AM','07:15 AM','07:30 AM','07:45 AM','08:00 AM','08:15 AM','08:30 AM'];
    const instF  = req.institutionFilter;

    const records = await Attendance.find({
      date, status: 'Boarded', boardingTime: { $ne: '' }, ...instF,
    });

    const toMinutes = (t) => {
      if (!t) return 0;
      const [time, period] = t.split(' ');
      let [h, m] = time.split(':').map(Number);
      if (period === 'PM' && h !== 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
      return h * 60 + m;
    };

    const slotMins = labels.map(toMinutes);
    const actual = slotMins.map((slotEnd, i) => {
      const slotStart = i === 0 ? slotMins[0] - 15 : slotMins[i - 1];
      return records.filter(r => {
        const t = toMinutes(r.boardingTime);
        return t >= slotStart && t < slotEnd;
      }).length;
    });

    const totalStudents = await Student.countDocuments(instF);
    const predicted = [
      Math.round(totalStudents * 0.05),
      Math.round(totalStudents * 0.12),
      Math.round(totalStudents * 0.22),
      Math.round(totalStudents * 0.35),
      Math.round(totalStudents * 0.15),
      Math.round(totalStudents * 0.07),
      Math.round(totalStudents * 0.04),
    ];

    res.json({ date, labels, actual, predicted });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/reports/feedback_summary ────────────────────────────────────────
router.get('/feedback_summary', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const matchStage = req.institutionFilter.institutionId
      ? { $match: { institutionId: req.institutionFilter.institutionId } }
      : { $match: {} };

    const [byCategory, byStatus, overall] = await Promise.all([
      Feedback.aggregate([
        matchStage,
        { $group: { _id: '$category', count: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
        { $sort: { count: -1 } },
      ]),
      Feedback.aggregate([
        matchStage,
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Feedback.aggregate([
        matchStage,
        { $group: { _id: null, total: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
      ]),
    ]);

    const statusMap = {};
    byStatus.forEach(s => { statusMap[s._id] = s.count; });

    res.json({
      overall: {
        total:      overall[0]?.total     || 0,
        avgRating:  overall[0]?.avgRating?.toFixed(1) || '0.0',
        open:       statusMap['Open']        || 0,
        inProgress: statusMap['In Progress'] || 0,
        resolved:   statusMap['Resolved']    || 0,
      },
      byCategory: byCategory.map(c => ({
        category:  c._id,
        count:     c.count,
        avgRating: c.avgRating.toFixed(1),
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
