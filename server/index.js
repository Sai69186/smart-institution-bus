const express          = require('express');
const http             = require('http');
const { Server }       = require('socket.io');
const mongoose         = require('mongoose');
const cors             = require('cors');
const dotenv           = require('dotenv');
const helmet           = require('helmet');
const rateLimit        = require('express-rate-limit');
const mongoSanitize    = require('express-mongo-sanitize');
const seedDemoUsers    = require('./seed');

dotenv.config();

// ── Startup validation ────────────────────────────────────────────────────────
const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// Warn in production if JWT_SECRET looks like the default dev value
if (process.env.NODE_ENV === 'production' &&
    process.env.JWT_SECRET === 'campus_transit_secret_key_2026') {
  console.error('❌ You must set a strong JWT_SECRET in production. Refusing to start.');
  process.exit(1);
}

const app    = express();
const server = http.createServer(app);   // wrap express in http.Server for Socket.io

// ── Security middleware ───────────────────────────────────────────────────────
// Helmet sets 14 security-related HTTP headers (XSS protection, no sniff, etc.)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow frontend to load resources
}));

// Strip $ and . from req.body/query/params to prevent NoSQL injection
app.use(mongoSanitize());

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));  // cap body size to prevent payload bombs

// ── Rate limiters ─────────────────────────────────────────────────────────────
// All limits are configurable via .env so production can tune without code changes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX  || '10',  10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX   || '300', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

const gpsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.GPS_RATE_LIMIT_MAX   || '60',  10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'GPS update rate exceeded.' },
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true },
  transports: ['websocket', 'polling'],
});

// Attach io to app so routes can emit events
app.set('io', io);

io.on('connection', (socket) => {
  // Client joins an institution room so broadcasts are scoped per tenant
  socket.on('join_institution', (institutionId) => {
    if (institutionId) {
      socket.join(`institution:${institutionId}`);
    }
  });

  socket.on('disconnect', () => {});
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',           authLimiter, require('./routes/auth'));
app.use('/api/institutions',   apiLimiter,  require('./routes/institutions'));
app.use('/api/students',       apiLimiter,  require('./routes/students'));
app.use('/api/buses',          apiLimiter,  require('./routes/buses').router);
app.use('/api/feedbacks',      apiLimiter,  require('./routes/feedbacks'));
app.use('/api/attendance',     apiLimiter,  require('./routes/attendance'));
app.use('/api/notifications',  apiLimiter,  require('./routes/notifications').router);
app.use('/api/emergency',      apiLimiter,  require('./routes/emergency'));
app.use('/api/predictions',    apiLimiter,  require('./routes/predictions'));
app.use('/api/reports',        apiLimiter,  require('./routes/reports'));
app.use('/api/boarding_stops', apiLimiter,  require('./routes/boardingStops'));
app.use('/api/ai',             apiLimiter,  require('./routes/ai'));
app.use('/api/allocation',     apiLimiter,  require('./routes/allocation'));
app.use('/api/geocode',        apiLimiter,  require('./routes/geocode'));

// GPS push gets its own tighter limiter — applied at route level in buses.js
// This export lets buses.js use it without a circular require
app.set('gpsLimiter', gpsLimiter);

// ── Health check ─────────────────────────────────────────────────────────────
// Used by load balancers (Render, Railway, etc.) and uptime monitors.
// Returns 200 when healthy, 503 when DB is disconnected.
app.get('/health', (_req, res) => {
  const dbState = mongoose.connection.readyState;
  // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';
  const healthy  = dbState === 1;

  res.status(healthy ? 200 : 503).json({
    status:    healthy ? 'ok' : 'degraded',
    version:   '4.0-realtime',
    db:        dbStatus,
    uptime:    Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV || 'development',
  });
});

// Keep root path for backwards compat
app.get('/', (_req, res) => {
  res.json({ message: 'Campus Transit API is running.', version: '4.0-realtime' });
});

// ── Global error handler — must be last, after all routes ─────────────────────
// Catches any error passed via next(err) or thrown in async routes.
// Returns JSON instead of Express's default HTML error page.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status  = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  // Don't leak stack traces in production
  const body = { error: message };
  if (process.env.NODE_ENV !== 'production') {
    body.stack = err.stack;
  }

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} → ${status}:`, message);
  res.status(status).json(body);
});

// ── Connect to MongoDB & start ────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');
    await seedDemoUsers();
    server.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`🔌 WebSocket ready on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
