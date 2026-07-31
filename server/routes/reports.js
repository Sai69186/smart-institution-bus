const express    = require('express');
const Attendance = require('../models/Attendance');
const Student    = require('../models/Student');
const Bus        = require('../models/Bus');
const Feedback   = require('../models/Feedback');
const PredictionLog = require('../models/PredictionLog');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

const todayStr = () => new Date().toISOString().split('T')[0];

// ── GET /api/reports/attendance-summary ──────────────────────────────────────
// Daily attendance summary — boarded/absent/waiting per bus.
// Query: ?date=YYYY-MM-DD (defaults to today)
router.get('/attendance_summary', protect, adminOnly, async (req, res) => {
  try {
    const date = req.query.date || todayStr();

    const totalStudents = await Student.countDocuments();
    const boarded       = await Attendance.countDocuments({ date, status: 'Boarded' });
    const absent        = await Attendance.countDocuments({ date, status: 'Absent'  });
    const waiting       = Math.max(0, totalStudents - boarded - absent);

    // Per-bus breakdown with driver name
    const perBusRaw = await Attendance.aggregate([
      { $match: { date } },
      {
        $group: {
          _id:     '$busNumber',
          boarded: { $sum: { $cond: [{ $eq: ['$status', 'Boarded'] }, 1, 0] } },
          absent:  { $sum: { $cond: [{ $eq: ['$status', 'Absent']  }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Attach driver names from Bus collection
    const buses = await Bus.find().select('busNumber driverName');
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

// ── GET /api/reports/route-performance ───────────────────────────────────────
// Average delay per route over last N days.
// Query: ?days=30
router.get('/route_performance', protect, adminOnly, async (req, res) => {
  try {
    const days  = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    // Group prediction logs by busNumber → compute avg error
    const raw = await PredictionLog.aggregate([
      { $match: { date: { $gte: sinceStr }, errorMins: { $ne: null } } },
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

    // Attach route names from Bus collection
    const buses = await Bus.find().select('busNumber route');
    const routeMap = {};
    buses.forEach(b => { routeMap[b.busNumber] = b.route; });

    const performance = raw.map(r => ({
      busNumber:   r._id,
      route:       routeMap[r._id] || '—',
      avgErrorMins: r.avgError.toFixed(1),
      tripCount:   r.count,
      onTimeRate:  Math.round((r.onTime / r.count) * 100),
    }));

    res.json({ days, performance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/reports/occupancy-trend ─────────────────────────────────────────
// Hourly occupancy data for the DashboardView boarding chart.
// Returns 7 data points (07:00–08:30) based on today's actual boarding times.
router.get('/occupancy_trend', protect, async (req, res) => {
  try {
    const date   = req.query.date || todayStr();
    const labels = ['07:00 AM','07:15 AM','07:30 AM','07:45 AM','08:00 AM','08:15 AM','08:30 AM'];

    // Count how many students boarded by each time slot
    const records = await Attendance.find({ date, status: 'Boarded', boardingTime: { $ne: '' } });

    const toMinutes = (t) => {
      if (!t) return 0;
      const [time, period] = t.split(' ');
      let [h, m] = time.split(':').map(Number);
      if (period === 'PM' && h !== 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
      return h * 60 + m;
    };

    // Slot boundaries in minutes from midnight
    const slotMins = labels.map(toMinutes);

    const actual = slotMins.map((slotEnd, i) => {
      const slotStart = i === 0 ? slotMins[0] - 15 : slotMins[i - 1];
      return records.filter(r => {
        const t = toMinutes(r.boardingTime);
        return t >= slotStart && t < slotEnd;
      }).length;
    });

    // Cumulative for predicted (static model — will improve in later sprint)
    const totalStudents = await Student.countDocuments();
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

// ── GET /api/reports/feedback-summary ────────────────────────────────────────
// Feedback counts by category, avg rating, status breakdown.
router.get('/feedback_summary', protect, adminOnly, async (req, res) => {
  try {
    const [byCategory, byStatus, overall] = await Promise.all([
      // Group by category
      Feedback.aggregate([
        {
          $group: {
            _id:       '$category',
            count:     { $sum: 1 },
            avgRating: { $avg: '$rating' },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Group by status
      Feedback.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Overall stats
      Feedback.aggregate([
        {
          $group: {
            _id:       null,
            total:     { $sum: 1 },
            avgRating: { $avg: '$rating' },
          },
        },
      ]),
    ]);

    const statusMap = {};
    byStatus.forEach(s => { statusMap[s._id] = s.count; });

    res.json({
      overall: {
        total:     overall[0]?.total     || 0,
        avgRating: overall[0]?.avgRating?.toFixed(1) || '0.0',
        open:      statusMap['Open']        || 0,
        inProgress:statusMap['In Progress'] || 0,
        resolved:  statusMap['Resolved']    || 0,
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
