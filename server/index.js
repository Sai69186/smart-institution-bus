const express       = require('express');
const mongoose      = require('mongoose');
const cors          = require('cors');
const dotenv        = require('dotenv');
const seedDemoUsers = require('./seed');

dotenv.config();

const seedBoardingStops = async () => {
  const BoardingStop = require('./models/BoardingStop');
  const defaults = [
    'Vadlamudi Bus Stand',
    'Guntur Highway Gate',
    'VLITS Main Gate',
    'Tenali Road Stop',
    'Pedaparupudi Junction',
    'Chebrolu Cross Roads',
    'Kollipara Village Stop',
    'Mangalagiri Bypass',
    'Hostel Block — VLITS',
    'Amaravati Capital Stop',
    'Undavalli Junction',
    'Tadepalli Gate',
    'Guntur RTC Complex',
    'Brodipet Stop',
    'Nallapadu Gate',
  ];
  for (const name of defaults) {
    const exists = await BoardingStop.findOne({ name });
    if (!exists) await BoardingStop.create({ name, isActive: true });
  }
};
const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin:      ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  credentials: true,
}));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/students',       require('./routes/students'));
app.use('/api/buses',          require('./routes/buses').router);
app.use('/api/feedbacks',      require('./routes/feedbacks'));
app.use('/api/attendance',     require('./routes/attendance'));
app.use('/api/notifications',  require('./routes/notifications').router);
app.use('/api/emergency',      require('./routes/emergency'));
app.use('/api/predictions',    require('./routes/predictions'));
app.use('/api/reports',        require('./routes/reports'));
app.use('/api/boarding_stops', require('./routes/boardingStops'));
app.use('/api/ai',             require('./routes/ai'));
app.use('/api/allocation',    require('./routes/allocation'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'Campus Transit API is running.', version: '2.0' });
});

// ── Connect to MongoDB Atlas & start server ───────────────────────────────────
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB Atlas connected — campus_transit');
    await seedDemoUsers();
    await seedBoardingStops();
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
