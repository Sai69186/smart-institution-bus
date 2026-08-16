const express  = require('express');
const jwt      = require('jsonwebtoken');
const User     = require('../models/User');
const Student  = require('../models/Student');
const Bus      = require('../models/Bus');
const { protect, adminOnly } = require('../middleware/auth');
const { validateBody }       = require('../utils/validate');

const router = express.Router();

// ── In-memory OTP store — { email: { code, expiresAt } } ─────────────────────
// Keyed by lowercased email. Codes expire after 5 minutes.
// For production scale, replace with Redis.
const otpStore = new Map();

const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000));

// ── POST /api/auth/request_otp — generate and "send" a 6-digit OTP ───────────
// In production wire this to an email/SMS provider.
// For now the code is returned in the response (dev/demo mode).
router.post('/request_otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    // Always respond 200 to avoid leaking which emails are registered
    if (!user) return res.json({ message: 'If that email exists, an OTP has been sent.' });

    const code      = generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    otpStore.set(email.toLowerCase(), { code, expiresAt });

    // TODO: replace console.log with real email/SMS delivery
    console.log(`[OTP] ${email} → ${code} (expires in 5 min)`);

    res.json({
      message: 'OTP sent to your registered email.',
      // Remove the line below in production — only for demo
      devCode: process.env.NODE_ENV === 'production' ? undefined : code,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/auth/verify_otp — verify submitted OTP ────────────────────────
router.post('/verify_otp', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: 'email and code are required.' });

    const entry = otpStore.get(email.toLowerCase());
    if (!entry)                         return res.status(400).json({ message: 'No OTP requested for this email.' });
    if (Date.now() > entry.expiresAt)  { otpStore.delete(email.toLowerCase()); return res.status(400).json({ message: 'OTP has expired. Please request a new one.' }); }
    if (entry.code !== String(code))    return res.status(400).json({ message: 'Invalid OTP code.' });

    // OTP valid — delete it so it can't be reused
    otpStore.delete(email.toLowerCase());
    res.json({ message: 'OTP verified.', verified: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Generate JWT — now includes institutionId ────────────────────────────────
const generateToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role, institutionId: user.institutionId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

// ── POST /api/auth/refresh — exchange a still-valid token for a fresh one ────
// Client calls this when the token is within 24h of expiry.
// Returns a new 7-day token so the user is never interrupted mid-session.
router.post('/refresh', protect, async (req, res) => {
  try {
    const token = generateToken(req.user);
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', validateBody(({ name, email, password, phone }) => [
  { field: 'name',     value: name,     required: true, minLen: 2,  maxLen: 80  },
  { field: 'email',    value: email,    required: true, email: true             },
  { field: 'password', value: password, required: true, minLen: 6,  maxLen: 128 },
  { field: 'phone',    value: phone,    phone: true                             },
]), async (req, res) => {
  try {
    const { name, email, password, phone, role, dept, year, boardingStop, institutionId } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required.' });

    // Prevent self-registration as super_admin or institution_admin
    const safeRole = ['admin', 'student', 'driver'].includes(role) ? role : 'student';

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.status(409).json({ message: 'Email is already registered.' });

    const user = await User.create({
      name,
      email,
      password,
      phone:         phone         || '',
      role:          safeRole,
      institutionId: institutionId || null,
    });

    // ── Auto-create Student transit profile when role is student ──────────────
    if (user.role === 'student') {
      if (!institutionId) {
        // Roll back user creation and tell the client clearly
        await User.findByIdAndDelete(user._id);
        return res.status(400).json({ message: 'Institution is required for student registration.' });
      }

      // Race-safe studentId: keep retrying with a random suffix until unique
      let student = null;
      let attempts = 0;
      while (!student && attempts < 5) {
        try {
          const count     = await Student.countDocuments({ institutionId });
          const suffix    = attempts === 0 ? count + 1 : count + 1 + Math.floor(Math.random() * 100);
          const studentId = `STU${String(suffix).padStart(3, '0')}`;

          student = await Student.create({
            institutionId,
            studentId,
            name:        user.name,
            email:       user.email,
            phone:       phone || '',
            department:  dept  || 'Not specified',
            year:        year  || '1st Year',
            pickupPoint: boardingStop || '',
          });
        } catch (profileErr) {
          // E11000 duplicate key — retry with a different ID
          if (profileErr.code === 11000) { attempts++; continue; }
          // Any other error: roll back and report
          await User.findByIdAndDelete(user._id);
          return res.status(500).json({ message: 'Could not create student profile: ' + profileErr.message });
        }
      }

      if (!student) {
        await User.findByIdAndDelete(user._id);
        return res.status(500).json({ message: 'Could not generate a unique student ID. Please try again.' });
      }

      user.studentId = student.studentId;
      await user.save();
    }

    const token = generateToken(user);
    res.status(201).json({
      token,
      user: {
        id:            user._id,
        name:          user.name,
        email:         user.email,
        phone:         user.phone,
        role:          user.role,
        studentId:     user.studentId,
        busId:         user.busId,
        institutionId: user.institutionId,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', validateBody(({ email, password }) => [
  { field: 'email',    value: email,    required: true, email: true },
  { field: 'password', value: password, required: true, minLen: 1   },
]), async (req, res) => {
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

    // Resolve driver's bus number
    let busNumber = null;
    if (user.role === 'driver') {
      const bus = await Bus.findOne({ driverId: user._id }).select('busNumber');
      busNumber = bus?.busNumber || null;
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id:            user._id,
        name:          user.name,
        email:         user.email,
        phone:         user.phone,
        role:          user.role,
        studentId:     user.studentId,
        busId:         user.busId,
        busNumber,
        institutionId: user.institutionId,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    let busNumber = null;
    if (req.user.role === 'driver') {
      const bus = await Bus.findOne({ driverId: req.user._id }).select('busNumber');
      busNumber = bus?.busNumber || null;
    }
    res.json({
      id:            req.user._id,
      name:          req.user.name,
      email:         req.user.email,
      phone:         req.user.phone,
      role:          req.user.role,
      studentId:     req.user.studentId,
      busId:         req.user.busId,
      busNumber,
      institutionId: req.user.institutionId,
      mustChangePassword: req.user.mustChangePassword,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/auth/drivers — admin: drivers scoped to institution ──────────────
router.get('/drivers', protect, adminOnly, async (req, res) => {
  try {
    const filter = { role: 'driver' };
    // institution_admin sees only their own institution's drivers
    if (req.user.role !== 'super_admin' && req.user.institutionId) {
      filter.institutionId = req.user.institutionId;
    }
    const drivers = await User.find(filter).select('_id name email phone busId institutionId');
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
    if (password && password.length >= 6) {
      user.password = password;
      user.mustChangePassword = false;  // cleared on first manual change
    }

    await user.save();
    res.json({
      user: {
        id:            user._id,
        name:          user.name,
        email:         user.email,
        phone:         user.phone,
        role:          user.role,
        studentId:     user.studentId,
        busId:         user.busId,
        institutionId: user.institutionId,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (err) {
    console.error('Update profile error:', err.message);
    res.status(500).json({ message: 'Server error during profile update.' });
  }
});

// ── POST /api/auth/change_password ────────────────────────────────────────────
router.post('/change_password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: 'currentPassword and newPassword are required.' });
    if (newPassword.length < 6)
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });

    const user = await User.findById(req.user._id);
    const ok   = await user.matchPassword(currentPassword);
    if (!ok)
      return res.status(401).json({ message: 'Current password is incorrect.' });

    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
