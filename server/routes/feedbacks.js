const express  = require('express');
const Feedback = require('../models/Feedback');
const { protect, adminOnly, tenantScope } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/feedbacks ───────────────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const { category, rating, message, name } = req.body;
    if (!category || !rating || !message)
      return res.status(400).json({ message: 'category, rating, and message are required.' });

    const feedback = await Feedback.create({
      institutionId: req.user.institutionId || null,
      userId:        req.user._id,
      userRole:      req.user.role,
      name:          name || req.user.name || 'Anonymous',
      category,
      rating:        Number(rating),
      message,
      status:        'Open',
      date:          new Date().toISOString().split('T')[0],
    });
    res.status(201).json({ feedback });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/feedbacks — admin: list, scoped to institution ───────────────────
router.get('/', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const feedbacks = await Feedback.find(req.institutionFilter).sort({ createdAt: -1 });
    res.json(feedbacks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/feedbacks/:id/status ─────────────────────────────────────────────
router.put('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    if (!['Open', 'In Progress', 'Resolved'].includes(status))
      return res.status(400).json({ message: 'Invalid status.' });

    const feedback = await Feedback.findByIdAndUpdate(
      req.params.id,
      { $set: { status, ...(adminNote !== undefined && { adminNote }) } },
      { new: true }
    );
    if (!feedback) return res.status(404).json({ message: 'Feedback not found.' });
    res.json({ feedback });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
