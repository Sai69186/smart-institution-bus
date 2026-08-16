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

    // ── Block all non-password-change routes if mustChangePassword is set ──────
    // Allowed: GET /api/auth/me, PUT /api/auth/update_profile, POST /api/auth/change_password
    if (user.mustChangePassword) {
      const path   = req.path;   // e.g. '/me', '/change_password'
      const method = req.method;
      const isAllowed =
        (method === 'GET'  && path === '/me') ||
        (method === 'PUT'  && path === '/update_profile') ||
        (method === 'POST' && path === '/change_password');

      if (!isAllowed) {
        return res.status(403).json({
          message:           'Password change required before continuing.',
          mustChangePassword: true,
        });
      }
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

// ── Role guards — must come AFTER protect ─────────────────────────────────────

const superAdminOnly = (req, res, next) => {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ message: 'Super admin access required.' });
  }
  next();
};

const institutionAdminOnly = (req, res, next) => {
  if (req.user?.role !== 'institution_admin' && req.user?.role !== 'super_admin') {
    return res.status(403).json({ message: 'Institution admin access required.' });
  }
  next();
};

// Legacy: 'admin' role + new institution_admin both pass this guard
const adminOnly = (req, res, next) => {
  const allowed = ['admin', 'institution_admin', 'super_admin'];
  if (!allowed.includes(req.user?.role)) {
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
  const allowed = ['admin', 'institution_admin', 'super_admin', 'driver'];
  if (!allowed.includes(req.user?.role)) {
    return res.status(403).json({ message: 'Admin or driver access required.' });
  }
  next();
};

/**
 * Tenant isolation guard.
 * Injects req.institutionFilter — use this in every query to scope data.
 *
 * - super_admin:  no filter (can see everything), but can pass ?institutionId= to scope
 * - everyone else: forced to their own institutionId from the token
 *
 * Usage in routes:
 *   const buses = await Bus.find({ ...req.institutionFilter });
 */
const tenantScope = (req, res, next) => {
  if (req.user.role === 'super_admin') {
    // Super admin can optionally filter by institutionId via query param
    const qid = req.query.institutionId || req.body?.institutionId;
    req.institutionFilter = qid ? { institutionId: qid } : {};
  } else {
    if (!req.user.institutionId) {
      return res.status(403).json({ message: 'No institution assigned to your account.' });
    }
    // Everyone else is locked to their own institution
    req.institutionFilter = { institutionId: req.user.institutionId };
  }
  next();
};

/**
 * Cross-institution block.
 * Use on routes where the institutionId comes in as a URL param (:institutionId).
 * Blocks non-super-admins from accessing another institution's data.
 */
const blockCrossInstitution = (req, res, next) => {
  if (req.user.role === 'super_admin') return next();
  const paramId = req.params.institutionId;
  if (paramId && req.user.institutionId?.toString() !== paramId) {
    return res.status(403).json({ message: 'Access denied: cross-institution request blocked.' });
  }
  next();
};

module.exports = {
  protect,
  superAdminOnly,
  institutionAdminOnly,
  adminOnly,
  driverOnly,
  adminOrDriver,
  tenantScope,
  blockCrossInstitution,
};
