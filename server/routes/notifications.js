const express      = require('express');
const Notification = require('../models/Notification');
const { protect, adminOnly, tenantScope } = require('../middleware/auth');

const router = express.Router();

// ── Helper: create a notification record + push via Socket.io ─────────────────
// Pass `io` (from req.app.get('io')) to broadcast the notification in real-time.
const createNotification = async ({
  institutionId  = null,
  recipientId    = null,
  recipientRole  = 'all',
  message,
  type           = 'info',
  relatedBus     = '',
  relatedStudent = '',
  createdBy      = null,
  io             = null,   // Socket.io server instance (optional)
}) => {
  const notif = await Notification.create({
    institutionId, recipientId, recipientRole, message, type,
    relatedBus, relatedStudent, createdBy,
  });

  // Push real-time to institution room if io is available
  if (io && institutionId) {
    io.to(`institution:${institutionId}`).emit('notification:new', {
      _id:           notif._id,
      message:       notif.message,
      type:          notif.type,
      relatedBus:    notif.relatedBus,
      relatedStudent: notif.relatedStudent,
      createdAt:     notif.createdAt,
      isRead:        false,
    });
  }

  return notif;
};

module.exports.createNotification = createNotification;

// ── GET /api/notifications/me ─────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip   = parseInt(req.query.skip) || 0;
    const unread = req.query.unread === 'true';

    // Scope to institution when set
    const instFilter = req.user.institutionId
      ? { $or: [{ institutionId: req.user.institutionId }, { institutionId: null }] }
      : {};

    const filter = {
      $or: [
        { recipientId: req.user._id },
        { recipientRole: req.user.role },
        { recipientRole: 'all' },
      ],
      ...(unread ? { isRead: false } : {}),
      ...instFilter,
    };

    const [notifications, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(filter),
    ]);

    const unreadCount = await Notification.countDocuments({ ...filter, isRead: false });

    res.json({ notifications, total, unreadCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/notifications/:id/read ──────────────────────────────────────────
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

// ── PUT /api/notifications/read_all ──────────────────────────────────────────
router.put('/read_all', protect, async (req, res) => {
  try {
    const instFilter = req.user.institutionId
      ? { $or: [{ institutionId: req.user.institutionId }, { institutionId: null }] }
      : {};

    await Notification.updateMany(
      {
        $or: [
          { recipientId: req.user._id },
          { recipientRole: req.user.role },
          { recipientRole: 'all' },
        ],
        isRead: false,
        ...instFilter,
      },
      { $set: { isRead: true } }
    );
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/notifications/:id ────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ message: 'Notification dismissed.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/notifications/broadcast ────────────────────────────────────────
router.post('/broadcast', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const { message, type = 'info', recipientRole = 'all', relatedBus = '', relatedStudent = '' } = req.body;
    if (!message) return res.status(400).json({ message: 'message is required.' });

    const valid = ['admin', 'institution_admin', 'student', 'driver', 'all'];
    if (!valid.includes(recipientRole))
      return res.status(400).json({ message: `recipientRole must be one of: ${valid.join(', ')}` });

    const notification = await createNotification({
      institutionId: req.user.institutionId || null,
      recipientRole,
      message,
      type,
      relatedBus,
      relatedStudent,
      createdBy: req.user._id,
      io:        req.app.get('io'),
    });

    res.status(201).json({ notification });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/notifications — admin: all notifications scoped to institution ───
router.get('/', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const skip  = parseInt(req.query.skip) || 0;

    const filter = req.institutionFilter.institutionId
      ? { institutionId: req.institutionFilter.institutionId }
      : {};

    const [notifications, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(filter),
    ]);
    res.json({ notifications, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports.router = router;
