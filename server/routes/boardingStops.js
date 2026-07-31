const express      = require('express');
const BoardingStop = require('../models/BoardingStop');
const Student      = require('../models/Student');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/boarding-stops — public list (used during student signup) ────────
router.get('/', async (req, res) => {
  try {
    const stops = await BoardingStop.find({ isActive: true })
      .sort({ name: 1 })
      .select('name lat lng studentCount');
    res.json(stops);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/boarding-stops — admin adds a new stop ─────────────────────────
// Body: { name, lat?, lng? }
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { name, lat, lng } = req.body;
    if (!name) return res.status(400).json({ message: 'Stop name is required.' });

    const exists = await BoardingStop.findOne({ name: name.trim() });
    if (exists) return res.status(409).json({ message: 'A stop with this name already exists.' });

    const stop = await BoardingStop.create({
      name: name.trim(),
      lat:  lat  || null,
      lng:  lng  || null,
      addedBy: req.user._id,
    });
    res.status(201).json(stop);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/boarding-stops/:id — admin updates a stop ───────────────────────
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { name, lat, lng, isActive } = req.body;
    const updates = {};
    if (name      !== undefined) updates.name     = name.trim();
    if (lat       !== undefined) updates.lat      = lat;
    if (lng       !== undefined) updates.lng      = lng;
    if (isActive  !== undefined) updates.isActive = isActive;

    const stop = await BoardingStop.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!stop) return res.status(404).json({ message: 'Stop not found.' });
    res.json(stop);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/boarding-stops/:id — admin deletes a stop ────────────────────
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const stop = await BoardingStop.findByIdAndDelete(req.params.id);
    if (!stop) return res.status(404).json({ message: 'Stop not found.' });
    res.json({ message: `Stop "${stop.name}" deleted.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/boarding-stops/suggest — student suggests a new stop ────────────
// When student types a stop not in the list, it's saved as inactive pending admin review
// Body: { name }
router.post('/suggest', protect, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Stop name is required.' });

    const exists = await BoardingStop.findOne({ name: name.trim() });
    if (exists) {
      // Already exists — just return it (active or not)
      return res.json({ stop: exists, existing: true });
    }

    // Create as inactive — admin must approve before it appears in the list
    const stop = await BoardingStop.create({
      name:     name.trim(),
      isActive: false,   // pending admin review
      addedBy:  req.user._id,
    });

    res.status(201).json({ stop, existing: false, message: 'Stop submitted for admin review.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/boarding_stops/:id/sync_count — recalculate studentCount ─────────
router.put('/:id/sync_count', protect, adminOnly, async (req, res) => {
  try {
    const stop = await BoardingStop.findById(req.params.id);
    if (!stop) return res.status(404).json({ message: 'Stop not found.' });

    const count = await Student.countDocuments({ pickupPoint: stop.name });
    stop.studentCount = count;
    await stop.save();
    res.json({ stop });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
