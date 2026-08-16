const express       = require('express');
const PredictionLog = require('../models/PredictionLog');
const Student       = require('../models/Student');
const { protect, adminOnly, tenantScope } = require('../middleware/auth');

const router = express.Router();

// Helper — today's date string
const todayStr = () => new Date().toISOString().split('T')[0];

// Helper — parse error string like "+2 mins" / "-1 min" / "0 mins" → number
const parseErrorMins = (errStr) => {
  if (!errStr || errStr === 'Absent') return null;
  const n = parseFloat(errStr);
  return isNaN(n) ? 0 : n;
};

// ── POST /api/predictions/log ─────────────────────────────────────────────────
router.post('/log', protect, async (req, res) => {
  try {
    const {
      studentId, predictedTime, actualTime,
      stop, busNumber, weather = 'Sunny', academicPeriod = 'Regular Semester'
    } = req.body;

    if (!studentId || !predictedTime)
      return res.status(400).json({ message: 'studentId and predictedTime are required.' });

    const instFilter = req.user.institutionId ? { institutionId: req.user.institutionId } : {};
    const student = await Student.findOne({ studentId, ...instFilter });
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    let errorMins = null;
    if (actualTime && actualTime !== '--:--') {
      const toMinutes = (t) => {
        const [time, period] = t.split(' ');
        let [h, m] = time.split(':').map(Number);
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        return h * 60 + m;
      };
      try { errorMins = toMinutes(actualTime) - toMinutes(predictedTime); } catch { errorMins = null; }
    }

    const log = await PredictionLog.create({
      institutionId: student.institutionId || null,
      studentId,
      studentName:   student.name,
      busNumber:     busNumber || student.assignedBus || '',
      stop:          stop     || student.pickupPoint  || '',
      predictedTime,
      actualTime:    actualTime || '--:--',
      errorMins,
      date:          todayStr(),
      weather,
      academicPeriod,
    });

    res.status(201).json({ log });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/predictions/student/:studentId ───────────────────────────────────
router.get('/student/:studentId', protect, async (req, res) => {
  try {
    const { studentId } = req.params;
    if (req.user.role === 'student' && req.user.studentId !== studentId)
      return res.status(403).json({ message: 'Access denied.' });

    const filter = { studentId };
    // Include logs that match institution OR have null institutionId (seeded/legacy records)
    if (req.user.institutionId) {
      filter.$or = [
        { institutionId: req.user.institutionId },
        { institutionId: null },
      ];
    }

    const logs = await PredictionLog.find(filter).sort({ date: -1, createdAt: -1 }).limit(60);

    const history = logs.map(l => ({
      id:        l._id,
      date:      l.date,
      student:   l.studentName,
      stop:      l.stop,
      predicted: l.predictedTime,
      actual:    l.actualTime,
      err:       l.errorMins === null
                   ? 'Absent'
                   : l.errorMins === 0 ? '0 mins'
                   : `${l.errorMins > 0 ? '+' : ''}${l.errorMins} min${Math.abs(l.errorMins) !== 1 ? 's' : ''}`,
    }));

    res.json({ history });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/predictions/adjustment/:stop ─────────────────────────────────────
// Real historical correction factor for a specific boarding stop.
// Computes average signed prediction error over the last N days, optionally
// filtered by weather. Frontend uses this to bias-correct raw ML predictions.
// Query: ?days=14&weather=Rainy
router.get('/adjustment/:stop', protect, async (req, res) => {
  try {
    const stop    = decodeURIComponent(req.params.stop);
    const days    = parseInt(req.query.days) || 14;
    const weather = req.query.weather || null;

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const filter = { stop, date: { $gte: sinceStr }, errorMins: { $ne: null } };
    if (weather) filter.weather = weather;

    const logs = await PredictionLog.find(filter);

    if (!logs.length)
      return res.json({ stop, days, adjustmentMins: 0, sampleCount: 0, weather: weather || 'all' });

    // Signed average — positive = bus usually late; negative = usually early
    const sumErr = logs.reduce((acc, l) => acc + (l.errorMins || 0), 0);
    const avgErr = Math.round((sumErr / logs.length) * 10) / 10;

    res.json({ stop, days, adjustmentMins: avgErr, sampleCount: logs.length, weather: weather || 'all' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/predictions/accuracy ────────────────────────────────────────────
// Query: ?days=30 (default 30)
router.get('/accuracy', protect, async (req, res) => {
  try {
    const days  = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const logs = await PredictionLog.find({
      date:      { $gte: sinceStr },
      errorMins: { $ne: null },
    });

    const total   = logs.length;
    if (total === 0) return res.json({ total: 0, avgErrorMins: 0, onTimeRate: 100, days });

    const onTime  = logs.filter(l => Math.abs(l.errorMins) <= 2).length;  // within 2 min = on-time
    const sumErr  = logs.reduce((acc, l) => acc + Math.abs(l.errorMins), 0);
    const avgError = (sumErr / total).toFixed(1);
    const onTimeRate = Math.round((onTime / total) * 100);

    // Breakdown by weather
    const byWeather = {};
    for (const l of logs) {
      if (!byWeather[l.weather]) byWeather[l.weather] = { count: 0, sumErr: 0 };
      byWeather[l.weather].count++;
      byWeather[l.weather].sumErr += Math.abs(l.errorMins);
    }
    const weatherStats = Object.entries(byWeather).map(([w, s]) => ({
      weather:  w,
      count:    s.count,
      avgError: (s.sumErr / s.count).toFixed(1),
    }));

    res.json({ total, avgErrorMins: avgError, onTimeRate, days, weatherStats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/predictions/history ─────────────────────────────────────────────
router.get('/history', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const { date, busNumber, limit: lim = 30, skip: sk = 0 } = req.query;
    const filter = { ...req.institutionFilter };
    if (date)      filter.date      = date;
    if (busNumber) filter.busNumber = busNumber.toUpperCase();

    const limit = Math.min(parseInt(lim), 100);
    const skip  = parseInt(sk) || 0;

    const [logs, total] = await Promise.all([
      PredictionLog.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
      PredictionLog.countDocuments(filter),
    ]);

    const history = logs.map(l => ({
      id:        l._id,
      date:      l.date,
      student:   l.studentName,
      stop:      l.stop,
      predicted: l.predictedTime,
      actual:    l.actualTime,
      err:       l.errorMins === null
                   ? 'Absent'
                   : l.errorMins === 0 ? '0 mins'
                   : `${l.errorMins > 0 ? '+' : ''}${l.errorMins} min${Math.abs(l.errorMins) !== 1 ? 's' : ''}`,
      weather:        l.weather,
      academicPeriod: l.academicPeriod,
      busNumber:      l.busNumber,
    }));

    res.json({ history, total, skip, limit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
