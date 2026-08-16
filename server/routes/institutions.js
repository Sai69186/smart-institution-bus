/**
 * institutions.js
 * Super-admin manages institutions; institution_admin views their own.
 *
 * POST   /api/institutions                     — super_admin: create institution + its first admin
 * GET    /api/institutions                     — super_admin: list all
 * GET    /api/institutions/:id                 — super_admin OR own institution_admin
 * PUT    /api/institutions/:id                 — super_admin OR own institution_admin
 * DELETE /api/institutions/:id                 — super_admin only
 * PUT    /api/institutions/:id/status          — super_admin: activate/suspend
 * GET    /api/institutions/:id/stats           — aggregated stats for one institution
 */

const express     = require('express');
const bcrypt      = require('bcryptjs');
const Institution = require('../models/Institution');
const User        = require('../models/User');
const Bus         = require('../models/Bus');
const Student     = require('../models/Student');
const {
  protect,
  superAdminOnly,
  blockCrossInstitution,
} = require('../middleware/auth');

const router = express.Router();

// ── POST /api/institutions ────────────────────────────────────────────────────
// Creates institution + first institution_admin account in one transaction.
// Body: { name, address, city, state, contactEmail, contactPhone, campusLat, campusLng, campusName,
//         adminName, adminEmail, adminPassword }
router.post('/', protect, superAdminOnly, async (req, res) => {
  try {
    const {
      name, address = '', city = '', state = '', contactEmail = '',
      contactPhone = '', campusLat = null, campusLng = null,
      campusName = 'Main Campus',
      adminName, adminEmail, adminPassword,
    } = req.body;

    if (!name || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({
        message: 'name, adminName, adminEmail, adminPassword are required.',
      });
    }

    // Check email not already taken
    const emailTaken = await User.findOne({ email: adminEmail.toLowerCase() });
    if (emailTaken) {
      return res.status(409).json({ message: 'Admin email is already registered.' });
    }

    // 1. Create institution
    const institution = await Institution.create({
      name, address, city, state, contactEmail, contactPhone,
      campusLat, campusLng, campusName,
      createdBy: req.user._id,
      status: 'active',
    });

    // 2. Create institution_admin user
    const admin = await User.create({
      name:          adminName,
      email:         adminEmail.toLowerCase(),
      password:      adminPassword,
      role:          'institution_admin',
      institutionId: institution._id,
      mustChangePassword: true,
    });

    // Update createdBy now that admin exists
    institution.createdBy = req.user._id;
    await institution.save();

    return res.status(201).json({
      institution,
      admin: {
        id:    admin._id,
        name:  admin.name,
        email: admin.email,
        role:  admin.role,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/institutions/public — no auth, for signup dropdown ──────────────
router.get('/public', async (req, res) => {
  try {
    const institutions = await Institution.find({ status: 'active' })
      .select('_id name city')
      .sort({ name: 1 });
    res.json(institutions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/institutions ─────────────────────────────────────────────────────
router.get('/', protect, superAdminOnly, async (req, res) => {
  try {
    const institutions = await Institution.find().sort({ createdAt: -1 });

    // Attach bus + student counts
    const withStats = await Promise.all(
      institutions.map(async (inst) => {
        const [busCount, studentCount, adminCount] = await Promise.all([
          Bus.countDocuments({ institutionId: inst._id }),
          Student.countDocuments({ institutionId: inst._id }),
          User.countDocuments({ institutionId: inst._id, role: 'institution_admin' }),
        ]);
        return { ...inst.toObject(), busCount, studentCount, adminCount };
      })
    );

    res.json(withStats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/institutions/:id ─────────────────────────────────────────────────
router.get('/:id', protect, blockCrossInstitution, async (req, res) => {
  try {
    const institution = await Institution.findById(req.params.id);
    if (!institution) return res.status(404).json({ message: 'Institution not found.' });

    // institution_admin can only view their own
    if (
      req.user.role === 'institution_admin' &&
      req.user.institutionId?.toString() !== req.params.id
    ) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const [busCount, studentCount] = await Promise.all([
      Bus.countDocuments({ institutionId: institution._id }),
      Student.countDocuments({ institutionId: institution._id }),
    ]);

    res.json({ ...institution.toObject(), busCount, studentCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/institutions/:id ─────────────────────────────────────────────────
router.put('/:id', protect, blockCrossInstitution, async (req, res) => {
  try {
    // institution_admin can only edit their own
    if (
      req.user.role === 'institution_admin' &&
      req.user.institutionId?.toString() !== req.params.id
    ) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const allowed = ['name', 'address', 'city', 'state', 'contactEmail',
                     'contactPhone', 'campusLat', 'campusLng', 'campusName', 'logoUrl'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const institution = await Institution.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!institution) return res.status(404).json({ message: 'Institution not found.' });
    res.json(institution);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/institutions/:id ──────────────────────────────────────────────
router.delete('/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const institution = await Institution.findByIdAndDelete(req.params.id);
    if (!institution) return res.status(404).json({ message: 'Institution not found.' });
    res.json({ message: `Institution "${institution.name}" deleted.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/institutions/:id/status ─────────────────────────────────────────
router.put('/:id/status', protect, superAdminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({ message: 'status must be active, inactive, or suspended.' });
    }
    const institution = await Institution.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );
    if (!institution) return res.status(404).json({ message: 'Institution not found.' });
    res.json(institution);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/institutions/:id/stats ──────────────────────────────────────────
router.get('/:id/stats', protect, blockCrossInstitution, async (req, res) => {
  try {
    const id = req.params.id;
    const [busCount, studentCount, driverCount, adminCount] = await Promise.all([
      Bus.countDocuments({ institutionId: id }),
      Student.countDocuments({ institutionId: id }),
      User.countDocuments({ institutionId: id, role: 'driver' }),
      User.countDocuments({ institutionId: id, role: 'institution_admin' }),
    ]);
    res.json({ institutionId: id, busCount, studentCount, driverCount, adminCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/institutions/:id/admins ─────────────────────────────────────────
router.get('/:id/admins', protect, superAdminOnly, async (req, res) => {
  try {
    const admins = await User.find({
      institutionId: req.params.id,
      role: 'institution_admin',
    }).select('-password');
    res.json(admins);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/institutions/:id/admins — add another institution admin ─────────
router.post('/:id/admins', protect, superAdminOnly, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email, password required.' });
    }
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: 'Email already registered.' });

    const admin = await User.create({
      name, email: email.toLowerCase(), password,
      role: 'institution_admin',
      institutionId: req.params.id,
      mustChangePassword: true,
    });
    res.status(201).json({
      id: admin._id, name: admin.name, email: admin.email, role: admin.role,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
