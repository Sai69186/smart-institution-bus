const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  // Who receives this — either a specific user or a role-group broadcast
  recipientId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  recipientRole: {
    type:    String,
    enum:    ['admin', 'student', 'driver', 'all'],
    default: 'all',
  },

  // Content
  message: { type: String, required: true, trim: true },
  type:    {
    type:    String,
    enum:    ['info', 'warning', 'danger', 'success'],
    default: 'info',
  },

  // Read state
  isRead: { type: Boolean, default: false },

  // Optional context references
  relatedBus:     { type: String, default: '' },
  relatedStudent: { type: String, default: '' },

  // Who created it
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientRole: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
