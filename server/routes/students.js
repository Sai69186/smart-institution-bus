const express  = require('express');
const multer   = require('multer');
const { parse } = require('csv-parse');
const Student  = require('../models/Student');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Multer — store CSV in memory
const upload = multer({ storage: multer.memoryStorage() });

// ── GET /api/students/me — logged-in student's own record ────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    const student = await Student.findOne({
      $or: [
        { email:     req.user.email },
        { studentId: req.user.studentId },
      ],
    });
    if (!student)
      return res.status(404).json({ message: 'No student record linked to your account.' });

    const doc = student.toObject();
    doc.id = doc._id.toString();
    res.json({ student: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/students/me — student updates their own transit profile ──────────
router.put('/me', protect, async (req, res) => {
  try {
    const { dept, year, phone, boardingStop } = req.body;

    const student = await Student.findOneAndUpdate(
      { $or: [{ email: req.user.email }, { studentId: req.user.studentId }] },
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

// ── PUT /api/students/me/notifications — save notification preferences ────────
router.put('/me/notifications', protect, async (req, res) => {
  try {
    const { busArrival, delays, emergency, general } = req.body;

    const student = await Student.findOneAndUpdate(
      { $or: [{ email: req.user.email }, { studentId: req.user.studentId }] },
      {
        $set: {
          'notifPrefs.busArrival': busArrival  ?? true,
          'notifPrefs.delays':     delays      ?? true,
          'notifPrefs.emergency':  emergency   ?? true,
          'notifPrefs.general':    general     ?? true,
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

// ── GET /api/students/me/feedbacks — student's own feedback history ───────────
router.get('/me/feedbacks', protect, async (req, res) => {
  try {
    const Feedback = require('../models/Feedback');
    const feedbacks = await Feedback.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ feedbacks });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/students/me/feedbacks — submit feedback ────────────────────────
router.post('/me/feedbacks', protect, async (req, res) => {
  try {
    const Feedback = require('../models/Feedback');
    const { category, rating, message } = req.body;
    if (!category || !rating || !message)
      return res.status(400).json({ message: 'category, rating, and message are required.' });

    const feedback = await Feedback.create({
      userId:   req.user._id,
      name:     req.user.name,
      category,
      rating:   Number(rating),
      message,
      date:     new Date().toISOString().split('T')[0],
    });
    res.status(201).json({ feedback });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/students — list all students (admin / driver) ────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/students/:id — single student ────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.id });
    if (!student) return res.status(404).json({ message: 'Student not found.' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/students — admin creates a student ──────────────────────────────
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { studentId, name, email, phone, department, year,
            address, pickupPoint, assignedBus, assignedRoute } = req.body;

    if (!studentId || !name || !email || !department || !year)
      return res.status(400).json({ message: 'studentId, name, email, department and year are required.' });

    const exists = await Student.findOne({ $or: [{ studentId }, { email }] });
    if (exists) return res.status(409).json({ message: 'Student ID or email already exists.' });

    const student = await Student.create({
      studentId, name, email, phone, department, year,
      address, pickupPoint, assignedBus, assignedRoute,
    });
    res.status(201).json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/students/:id — admin updates a student ───────────────────────────
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const student = await Student.findOneAndUpdate(
      { studentId: req.params.id },
      { $set: req.body },
      { returnDocument: 'after', runValidators: true }
    );
    if (!student) return res.status(404).json({ message: 'Student not found.' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/students/:id — admin deletes a student ───────────────────────
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const student = await Student.findOneAndDelete({ studentId: req.params.id });
    if (!student) return res.status(404).json({ message: 'Student not found.' });
    res.json({ message: `Student ${req.params.id} deleted.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/students/upload_csv — bulk import ───────────────────────────────
router.post('/upload_csv', protect, adminOnly, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No CSV file uploaded.' });

  const results = [];
  const errors  = [];
  const csvText = req.file.buffer.toString('utf-8');

  parse(csvText, { columns: true, trim: true, skip_empty_lines: true }, async (err, records) => {
    if (err) return res.status(400).json({ message: 'Invalid CSV format.' });

    for (const row of records) {
      try {
        const exists = await Student.findOne({
          $or: [{ studentId: row.studentId }, { email: row.email }],
        });
        if (exists) { errors.push(`${row.studentId} — already exists, skipped.`); continue; }

        await Student.create({
          studentId:    row.studentId    || '',
          name:         row.name         || '',
          email:        row.email        || '',
          phone:        row.phone        || '',
          department:   row.department   || '',
          year:         row.year         || '1st Year',
          address:      row.address      || '',
          pickupPoint:  row.pickupPoint  || '',
          assignedBus:  row.assignedBus  || '',
          assignedRoute: row.assignedRoute || '',
        });
        results.push(row.studentId);
      } catch (e) {
        errors.push(`${row.studentId} — ${e.message}`);
      }
    }

    res.json({ imported: results.length, skipped: errors.length, details: errors });
  });
});

module.exports = router;
