const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// ── Verify JWT and attach full user document to req.user ──────────────────────
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorised.' });
    }

    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'Not authorised.' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

// ── Role guards — must come AFTER protect ─────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
};

const driverOnly = (req, res, next) => {
  if (req.user?.role !== 'driver') {
    return res.status(403).json({ message: 'Driver access required.' });
  }
  next();
};

// Allow admin OR driver (e.g. for attendance routes)
const adminOrDriver = (req, res, next) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'driver') {
    return res.status(403).json({ message: 'Admin or driver access required.' });
  }
  next();
};

module.exports = { protect, adminOnly, driverOnly, adminOrDriver };
