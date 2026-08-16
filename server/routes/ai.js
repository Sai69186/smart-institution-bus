/**
 * ai.js — Node.js proxy to the Python AI microservice (port 5001)
 * All requests are JWT-authenticated before forwarding to Python.
 * GPS data (lat/lng/speed) is auto-merged from the live Bus document.
 */
const express = require('express');
const Bus     = require('../models/Bus');
const { protect } = require('../middleware/auth');

const router = express.Router();
const PYTHON = process.env.PYTHON_SERVICE_URL || 'http://localhost:5001';

// Helper — forward to Python with JSON body
const callPython = async (path, body = null, method = 'POST') => {
  const { default: fetch } = await import('node-fetch');
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res  = await fetch(`${PYTHON}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
};

// Helper — get live GPS from the requesting user's bus (driver)
// or from a specific bus number passed in the request body
const resolveGPS = async (req) => {
  try {
    let bus = null;

    if (req.user.role === 'driver') {
      bus = await Bus.findOne({ driverId: req.user._id }).select('gpsLat gpsLng speed occupied');
    } else if (req.body?.busNumber) {
      const filter = { busNumber: req.body.busNumber.toUpperCase() };
      if (req.user.institutionId) filter.institutionId = req.user.institutionId;
      bus = await Bus.findOne(filter).select('gpsLat gpsLng speed occupied');
    }

    if (bus?.gpsLat && bus?.gpsLng) {
      return { bus_lat: bus.gpsLat, bus_lng: bus.gpsLng, speed_kmh: bus.speed || 30, occupancy: bus.occupied || 0 };
    }
  } catch (_) {}
  return {};
};

// ── POST /api/ai/predict/boarding ─────────────────────────────────────────────
// Merges live bus GPS automatically before calling Python
router.post('/predict/boarding', protect, async (req, res) => {
  try {
    const liveGPS = await resolveGPS(req);

    // Merge: request body overrides auto-resolved GPS if caller provides explicit coords
    const body = {
      ...liveGPS,          // bus_lat, bus_lng, speed_kmh, occupancy from live bus
      ...req.body,         // caller can override any field
    };

    const { status, data } = await callPython('/predict/boarding', body);
    res.status(status).json(data);
  } catch (err) {
    res.status(503).json({ error: 'AI service unavailable.', detail: err.message });
  }
});

// ── POST /api/ai/predict/all-stops ────────────────────────────────────────────
// Predict boarding time for ALL remaining stops on a bus's route in one call
// Returns array of { stop, predicted_mins, eta_time, distance_km }
router.post('/predict/all-stops', protect, async (req, res) => {
  try {
    const liveGPS = await resolveGPS(req);
    const { model = 'XGBoost', busNumber, weather = 'Sunny',
            academic_period = 'Regular Semester' } = req.body;

    // Get the bus's remaining stop sequence
    const busDoc = busNumber
      ? await Bus.findOne({ busNumber: busNumber.toUpperCase() })
      : req.user.role === 'driver'
        ? await Bus.findOne({ driverId: req.user._id })
        : null;

    if (!busDoc) return res.status(404).json({ error: 'Bus not found.' });

    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const results = [];

    for (const stop of busDoc.stopSequence) {
      try {
        const { data } = await callPython('/predict/boarding', {
          ...liveGPS,
          ...req.body,
          stop,
          model,
          weather,
          academic_period,
          day_of_week: dayName,
        });
        results.push({
          stop,
          predicted_mins: data.predicted_mins,
          eta_time:       data.eta_time,
          distance_km:    data.distance_km,
          gps_used:       data.gps_used,
        });
      } catch (_) {
        results.push({ stop, predicted_mins: null, eta_time: '--:--', error: true });
      }
    }

    res.json({ busNumber: busDoc.busNumber, model, gps_used: !!liveGPS.bus_lat, predictions: results });
  } catch (err) {
    res.status(503).json({ error: 'AI service unavailable.', detail: err.message });
  }
});

// ── POST /api/ai/optimize/route ───────────────────────────────────────────────
// Merges live bus GPS to find nearest stop as actual start
router.post('/optimize/route', protect, async (req, res) => {
  try {
    const liveGPS = await resolveGPS(req);

    const body = {
      ...req.body,
      ...liveGPS,   // GPS overrides static start if available
    };

    const { status, data } = await callPython('/optimize/route', body);
    res.status(status).json(data);
  } catch (err) {
    res.status(503).json({ error: 'AI service unavailable.', detail: err.message });
  }
});

// ── GET /api/ai/models/stats ──────────────────────────────────────────────────
router.get('/models/stats', protect, async (req, res) => {
  try {
    const { status, data } = await callPython('/models/stats', null, 'GET');
    res.status(status).json(data);
  } catch (err) {
    res.status(503).json({ error: 'AI service unavailable.', detail: err.message });
  }
});

// ── POST /api/ai/models/retrain ───────────────────────────────────────────────
router.post('/models/retrain', protect, async (req, res) => {
  const allowed = ['admin', 'institution_admin', 'super_admin'];
  if (!allowed.includes(req.user.role))
    return res.status(403).json({ message: 'Admin access required.' });
  try {
    const { status, data } = await callPython('/models/retrain', {});
    res.status(status).json(data);
  } catch (err) {
    res.status(503).json({ error: 'AI service unavailable.', detail: err.message });
  }
});

// ── GET /api/ai/health ────────────────────────────────────────────────────────
router.get('/health', async (_req, res) => {
  try {
    const { status, data } = await callPython('/health', null, 'GET');
    res.status(status).json(data);
  } catch (err) {
    res.status(503).json({ error: 'AI service unavailable.', detail: err.message });
  }
});

module.exports = router;
