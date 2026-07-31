const express      = require('express');
const Notification = require('../models/Notification');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// ── Helper: create a notification record ─────────────────────────────────────
// Used internally by other routes (SOS, attendance, etc.)
const createNotification = async ({
  recipientId   = null,
  recipientRole = 'all',
  message,
  type          = 'info',
  relatedBus    = '',
  relatedStudent = '',
  createdBy     = null,
}) => {
  return Notification.create({
    recipientId, recipientRole, message, type,
    relatedBus, relatedStudent, createdBy,
  });
};

// Export helper so other route files can call it
module.exports.createNotification = createNotification;

// ── GET /api/notifications/me ─────────────────────────────────────────────────
// Returns notifications for the logged-in user:
//   - their own targeted notifications (recipientId = user._id)
//   - role-broadcast notifications (recipientRole = user.role or 'all')
// Query params: ?limit=20&skip=0&unread=true
router.get('/me', protect, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 20, 50);
    const skip   = parseInt(req.query.skip) || 0;
    const unread = req.query.unread === 'true';

    const filter = {
      $or: [
        { recipientId: req.user._id },
        { recipientRole: req.user.role },
        { recipientRole: 'all' },
      ],
      ...(unread ? { isRead: false } : {}),
    };

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments(filter),
    ]);

    const unreadCount = await Notification.countDocuments({ ...filter, isRead: false });

    res.json({ notifications, total, unreadCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/notifications/:id/read — mark single as read ────────────────────
router.put('/:id/read', protect, async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { $set: { isRead: true } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    res.json({ notification });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/notifications/read_all — mark all as read for this user ─────────
router.put('/read_all', protect, async (req, res) => {
  try {
    await Notification.updateMany(
      {
        $or: [
          { recipientId: req.user._id },
          { recipientRole: req.user.role },
          { recipientRole: 'all' },
        ],
        isRead: false,
      },
      { $set: { isRead: true } }
    );
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/notifications/:id — dismiss a notification ───────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ message: 'Notification dismissed.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/notifications/broadcast — admin sends to a role group ──────────
// Body: { message, type, recipientRole, relatedBus?, relatedStudent? }
router.post('/broadcast', protect, adminOnly, async (req, res) => {
  try {
    const { message, type = 'info', recipientRole = 'all', relatedBus = '', relatedStudent = '' } = req.body;
    if (!message) return res.status(400).json({ message: 'message is required.' });

    const valid = ['admin', 'student', 'driver', 'all'];
    if (!valid.includes(recipientRole))
      return res.status(400).json({ message: `recipientRole must be one of: ${valid.join(', ')}` });

    const notification = await createNotification({
      recipientRole,
      message,
      type,
      relatedBus,
      relatedStudent,
      createdBy: req.user._id,
    });

    res.status(201).json({ notification });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/notifications — admin: all notifications (paginated) ─────────────
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const skip  = parseInt(req.query.skip) || 0;

    const [notifications, total] = await Promise.all([
      Notification.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(),
    ]);
    res.json({ notifications, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Attach the router to module.exports as well
module.exports.router = router;
