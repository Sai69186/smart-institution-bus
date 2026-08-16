const express  = require('express');
const multer   = require('multer');
const { parse } = require('csv-parse');
const bcrypt   = require('bcryptjs');
const Student  = require('../models/Student');
const User     = require('../models/User');
const { protect, adminOnly, tenantScope } = require('../middleware/auth');
const { validateBody } = require('../utils/validate');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ── GET /api/students/me ──────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    const filter = {
      $or: [
        { email: req.user.email },
        { studentId: req.user.studentId },
      ],
    };
    // Scope to institution if set
    if (req.user.institutionId) filter.institutionId = req.user.institutionId;

    const student = await Student.findOne(filter);
    if (!student)
      return res.status(404).json({ message: 'No student record linked to your account.' });

    const doc = student.toObject();
    doc.id = doc._id.toString();
    res.json({ student: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/students/me ──────────────────────────────────────────────────────
router.put('/me', protect, async (req, res) => {
  try {
    const { dept, year, phone, boardingStop } = req.body;
    const filter = { $or: [{ email: req.user.email }, { studentId: req.user.studentId }] };
    if (req.user.institutionId) filter.institutionId = req.user.institutionId;

    const student = await Student.findOneAndUpdate(
      filter,
      { $set: { department: dept, year, phone, pickupPoint: boardingStop } },
      { returnDocument: 'after', runValidators: true }
    );
    if (!student)
      return res.status(404).json({ message: 'No student record linked to your account.' });

    const doc = student.toObject();
    doc.id = doc._id.toString();
    res.json({ student: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/students/me/notifications ───────────────────────────────────────
router.put('/me/notifications', protect, async (req, res) => {
  try {
    const { busArrival, delays, emergency, general } = req.body;
    const filter = { $or: [{ email: req.user.email }, { studentId: req.user.studentId }] };
    if (req.user.institutionId) filter.institutionId = req.user.institutionId;

    const student = await Student.findOneAndUpdate(
      filter,
      {
        $set: {
          'notifPrefs.busArrival': busArrival ?? true,
          'notifPrefs.delays':     delays     ?? true,
          'notifPrefs.emergency':  emergency  ?? true,
          'notifPrefs.general':    general    ?? true,
        },
      },
      { returnDocument: 'after', upsert: false }
    );
    if (!student)
      return res.status(404).json({ message: 'No student record linked to your account.' });

    res.json({ message: 'Notification preferences saved.', notifPrefs: student.notifPrefs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/students/me/feedbacks ────────────────────────────────────────────
router.get('/me/feedbacks', protect, async (req, res) => {
  try {
    const Feedback = require('../models/Feedback');
    const feedbacks = await Feedback.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ feedbacks });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/students/me/feedbacks ──────────────────────────────────────────
router.post('/me/feedbacks', protect, async (req, res) => {
  try {
    const Feedback = require('../models/Feedback');
    const { category, rating, message } = req.body;
    if (!category || !rating || !message)
      return res.status(400).json({ message: 'category, rating, and message are required.' });

    const feedback = await Feedback.create({
      institutionId: req.user.institutionId || null,
      userId:        req.user._id,
      name:          req.user.name,
      category,
      rating:        Number(rating),
      message,
      date:          new Date().toISOString().split('T')[0],
    });
    res.status(201).json({ feedback });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/students — list all students (admin) ─────────────────────────────
router.get('/', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    // super_admin must always scope to a specific institution for student lists.
    // Students are institution-owned data — a super_admin browsing all
    // institutions at once would expose cross-tenant PII.
    if (req.user.role === 'super_admin' && !req.institutionFilter.institutionId) {
      return res.status(400).json({
        message: 'Please select an institution to view its students. Pass ?institutionId= in the request.'
      });
    }

    const students = await Student.find(req.institutionFilter).sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/students/my_bus — driver: students assigned to their bus ──────────
router.get('/my_bus', protect, async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ message: 'Driver access required.' });
    }
    const Bus = require('../models/Bus');
    const bus = await Bus.findOne({ driverId: req.user._id });
    if (!bus) return res.json([]);

    const students = await Student.find({
      institutionId: req.user.institutionId,
      assignedBus:   bus.busNumber,
    }).sort({ name: 1 });

    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/students/:id ─────────────────────────────────────────────────────
router.get('/:id', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const student = await Student.findOne({
      studentId: req.params.id,
      ...req.institutionFilter,
    });
    if (!student) return res.status(404).json({ message: 'Student not found.' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/students — admin creates a student ──────────────────────────────
router.post('/', protect, adminOnly, tenantScope,
  validateBody(({ studentId, name, email, phone, department, year }) => [
    { field: 'studentId',  value: studentId,  required: true, minLen: 2, maxLen: 20  },
    { field: 'name',       value: name,       required: true, minLen: 2, maxLen: 80  },
    { field: 'email',      value: email,      required: true, email: true             },
    { field: 'department', value: department, required: true, minLen: 2, maxLen: 80  },
    { field: 'year',       value: year,       required: true                          },
    { field: 'phone',      value: phone,      phone: true                             },
  ]),
  async (req, res) => {
  try {
    const {
      studentId, name, email, phone, department, year,
      address, pickupPoint, assignedBus, assignedRoute,
      generateLogin, loginPassword,
    } = req.body;

    if (!studentId || !name || !email || !department || !year)
      return res.status(400).json({ message: 'studentId, name, email, department and year are required.' });

    const institutionId = req.user.institutionId || req.body.institutionId;
    if (!institutionId) return res.status(400).json({ message: 'institutionId is required.' });

    const exists = await Student.findOne({
      institutionId,
      $or: [{ studentId }, { email }],
    });
    if (exists) return res.status(409).json({ message: 'Student ID or email already exists in this institution.' });

    const student = await Student.create({
      institutionId, studentId, name, email, phone, department, year,
      address, pickupPoint, assignedBus, assignedRoute,
    });

    // Optionally auto-create a login User account for the student
    let userCreated = null;
    if (generateLogin) {
      const userExists = await User.findOne({ email: email.toLowerCase() });
      if (!userExists) {
        const pass = loginPassword || `${studentId}@transit`;
        userCreated = await User.create({
          name, email: email.toLowerCase(), password: pass,
          role: 'student', institutionId, studentId,
          mustChangePassword: !loginPassword,
        });
        userCreated = { email: userCreated.email, tempPassword: pass };
      }
    }

    res.status(201).json({ student, userCreated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/students/:id — admin updates a student ───────────────────────────
router.put('/:id', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const student = await Student.findOneAndUpdate(
      { studentId: req.params.id, ...req.institutionFilter },
      { $set: req.body },
      { returnDocument: 'after', runValidators: true }
    );
    if (!student) return res.status(404).json({ message: 'Student not found.' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/students/:id ──────────────────────────────────────────────────
router.delete('/:id', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const student = await Student.findOneAndDelete({
      studentId: req.params.id,
      ...req.institutionFilter,
    });
    if (!student) return res.status(404).json({ message: 'Student not found.' });
    res.json({ message: `Student ${req.params.id} deleted.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/students/upload_csv — bulk import with optional login generation ─
router.post('/upload_csv', protect, adminOnly, tenantScope, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No CSV file uploaded.' });

  const institutionId = req.user.institutionId || req.body.institutionId;
  if (!institutionId) return res.status(400).json({ message: 'institutionId is required.' });

  const generateLogins = req.body.generateLogins === 'true';
  const results = [], errors = [], createdLogins = [];
  const csvText = req.file.buffer.toString('utf-8');

  parse(csvText, { columns: true, trim: true, skip_empty_lines: true }, async (err, records) => {
    if (err) return res.status(400).json({ message: 'Invalid CSV format.' });

    for (const row of records) {
      try {
        const exists = await Student.findOne({
          institutionId,
          $or: [{ studentId: row.studentId }, { email: row.email }],
        });
        if (exists) { errors.push(`${row.studentId} — already exists, skipped.`); continue; }

        await Student.create({
          institutionId,
          studentId:     row.studentId    || '',
          name:          row.name         || '',
          email:         row.email        || '',
          phone:         row.phone        || '',
          department:    row.department   || '',
          year:          row.year         || '1st Year',
          address:       row.address      || '',
          pickupPoint:   row.pickupPoint  || '',
          assignedBus:   row.assignedBus  || '',
          assignedRoute: row.assignedRoute || '',
        });
        results.push(row.studentId);

        if (generateLogins && row.email) {
          const userExists = await User.findOne({ email: row.email.toLowerCase() });
          if (!userExists) {
            const tempPass = row.password || `${row.studentId}@transit`;
            await User.create({
              name:          row.name,
              email:         row.email.toLowerCase(),
              password:      tempPass,
              role:          'student',
              institutionId,
              studentId:     row.studentId,
              mustChangePassword: true,
            });
            createdLogins.push({ studentId: row.studentId, email: row.email, tempPassword: tempPass });
          }
        }
      } catch (e) {
        errors.push(`${row.studentId} — ${e.message}`);
      }
    }

    res.json({
      imported:      results.length,
      skipped:       errors.length,
      loginsCreated: createdLogins.length,
      details:       errors,
      logins:        createdLogins,
    });
  });
});

// ── POST /api/students/bulk_generate_logins — generate logins for existing students ──
router.post('/bulk_generate_logins', protect, adminOnly, tenantScope, async (req, res) => {
  try {
    const institutionId = req.user.institutionId || req.body.institutionId;
    const students = await Student.find({ institutionId, email: { $ne: '' } });
    const created = [], skipped = [];

    for (const student of students) {
      const exists = await User.findOne({ email: student.email.toLowerCase() });
      if (exists) { skipped.push(student.studentId); continue; }

      const tempPass = `${student.studentId}@transit`;
      await User.create({
        name:          student.name,
        email:         student.email.toLowerCase(),
        password:      tempPass,
        role:          'student',
        institutionId,
        studentId:     student.studentId,
        mustChangePassword: true,
      });
      created.push({ studentId: student.studentId, email: student.email, tempPassword: tempPass });
    }

    res.json({ created: created.length, skipped: skipped.length, logins: created });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
