const express  = require('express');
const jwt      = require('jsonwebtoken');
const User     = require('../models/User');
const Student  = require('../models/Student');
const Bus      = require('../models/Bus');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// ── Generate JWT ──────────────────────────────────────────────────────────────
const generateToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, role, dept, year, boardingStop } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required.' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.status(409).json({ message: 'Email is already registered.' });

    const user = await User.create({
      name,
      email,
      password,
      phone: phone || '',
      role:  role  || 'student',
    });

    // ── Auto-create Student transit profile when role is student ──────────────
    if (user.role === 'student') {
      try {
        // Generate a sequential student ID: STU + zero-padded count
        const count    = await Student.countDocuments();
        const studentId = `STU${String(count + 1).padStart(3, '0')}`;

        const student = await Student.create({
          studentId,
          name:        user.name,
          email:       user.email,
          phone:       phone || '',
          department:  dept  || 'Not specified',
          year:        year  || '1st Year',
          pickupPoint: boardingStop || '',
        });

        // Link student ID back to user
        user.studentId = student.studentId;
        await user.save();
      } catch (profileErr) {
        // Non-fatal: user was created; profile can be linked later by admin
        console.warn('Student profile auto-create warning:', profileErr.message);
      }
    }

    const token = generateToken(user);
    res.status(201).json({
      token,
      user: {
        id:        user._id,
        name:      user.name,
        email:     user.email,
        phone:     user.phone,
        role:      user.role,
        studentId: user.studentId,
        busId:     user.busId,
      },
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(401).json({ message: 'Invalid email or password.' });

    const isMatch = await user.matchPassword(password);
    if (!isMatch)
      return res.status(401).json({ message: 'Invalid email or password.' });

    // For drivers, resolve their assigned bus number
    let busNumber = null;
    if (user.role === 'driver') {
      const bus = await Bus.findOne({ driverId: user._id }).select('busNumber');
      busNumber = bus?.busNumber || null;
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id:        user._id,
        name:      user.name,
        email:     user.email,
        phone:     user.phone,
        role:      user.role,
        studentId: user.studentId,
        busId:     user.busId,
        busNumber,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// ── GET /api/auth/me — returns current user's profile (token validation) ──────
router.get('/me', protect, async (req, res) => {
  try {
    // req.user is already the full user doc (from protect middleware)
    let busNumber = null;
    if (req.user.role === 'driver') {
      const bus = await Bus.findOne({ driverId: req.user._id }).select('busNumber');
      busNumber = bus?.busNumber || null;
    }
    res.json({
      id:        req.user._id,
      name:      req.user.name,
      email:     req.user.email,
      phone:     req.user.phone,
      role:      req.user.role,
      studentId: req.user.studentId,
      busId:     req.user.busId,
      busNumber,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/auth/drivers — admin: list all registered drivers ────────────────
router.get('/drivers', protect, adminOnly, async (req, res) => {
  try {
    const drivers = await User.find({ role: 'driver' }).select('_id name email phone busId');
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/auth/update_profile ──────────────────────────────────────────────
router.put('/update_profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const { name, email, phone, password } = req.body;
    if (name)                        user.name  = name;
    if (email)                       user.email = email.toLowerCase();
    if (phone)                       user.phone = phone;
    if (password && password.length >= 6) user.password = password;

    await user.save();
    res.json({
      user: {
        id:        user._id,
        name:      user.name,
        email:     user.email,
        phone:     user.phone,
        role:      user.role,
        studentId: user.studentId,
        busId:     user.busId,
      },
    });
  } catch (err) {
    console.error('Update profile error:', err.message);
    res.status(500).json({ message: 'Server error during profile update.' });
  }
});

module.exports = router;
