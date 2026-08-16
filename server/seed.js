/**
 * seed.js
 * Seeds three tiers of demo data:
 *   1. Super Admin (platform level)
 *   2. Two demo institutions + their institution_admins
 *   3. Legacy demo users (admin/student/driver) attached to institution 1
 *      for backward-compat with existing frontend mock data
 */

const User        = require('./models/User');
const Student     = require('./models/Student');
const Institution = require('./models/Institution');
const Bus         = require('./models/Bus');
const PredictionLog = require('./models/PredictionLog');

// ── Demo institutions ─────────────────────────────────────────────────────────
const INSTITUTIONS = [
  {
    name:        'Vignan LARA Institute of Technology',
    address:     'Vadlamudi, Guntur',
    city:        'Guntur',
    state:       'Andhra Pradesh',
    contactEmail:'admin@vignan.edu',
    contactPhone:'+91 863 234 5678',
    campusLat:   16.2345,
    campusLng:   80.5613,
    campusName:  'Vignan LARA Main Campus',
    status:      'active',
    _seedKey:    'vignan',
  },
  {
    name:        'Sri Demo College of Engineering',
    address:     'MVP Colony, Visakhapatnam',
    city:        'Visakhapatnam',
    state:       'Andhra Pradesh',
    contactEmail:'admin@sridemo.edu',
    contactPhone:'+91 891 234 5678',
    campusLat:   17.7231,
    campusLng:   83.3013,
    campusName:  'Sri Demo Main Campus',
    status:      'active',
    _seedKey:    'sridemo',
  },
];

// ── Users to seed ─────────────────────────────────────────────────────────────
const buildUsers = (instMap) => [
  // Platform super admin — no institution
  {
    name:     'Platform Super Admin',
    email:    'superadmin@platform.com',
    password: 'super123',
    phone:    '+91 99000 00000',
    role:     'super_admin',
    institutionId: null,
  },
  // Institution admins — one per institution
  {
    name:          'Vignan Admin',
    email:         'admin@vignan.edu',
    password:      'admin123',
    phone:         '+91 99000 00001',
    role:          'institution_admin',
    institutionId: instMap['vignan'],
  },
  {
    name:          'Sri Demo Admin',
    email:         'admin@sridemo.edu',
    password:      'admin123',
    phone:         '+91 99000 00002',
    role:          'institution_admin',
    institutionId: instMap['sridemo'],
  },
  // Legacy admin (role='admin') for backward-compat
  {
    name:          'Admin (Principal Office)',
    email:         'admin@institution.edu',
    password:      'admin123',
    phone:         '+91 99000 00003',
    role:          'admin',
    institutionId: instMap['vignan'],
  },
  // Demo student
  {
    name:          'Rahul Kumar',
    email:         'rahul.kumar@student.edu',
    password:      'student123',
    phone:         '+91 98765 43210',
    role:          'student',
    studentId:     'STU001',
    institutionId: instMap['vignan'],
  },
  // Demo driver
  {
    name:          'Vikram Singh',
    email:         'vikram.singh@transit.edu',
    password:      'driver123',
    phone:         '+91 97000 10001',
    role:          'driver',
    institutionId: instMap['vignan'],
  },
];

const demoStudentProfile = (instId) => ({
  institutionId:      instId,
  studentId:          'STU001',
  name:               'Rahul Kumar',
  email:              'rahul.kumar@student.edu',
  phone:              '+91 98765 43210',
  department:         'Computer Science',
  year:               '3rd Year',
  assignedRoute:      'Route A — Vadlamudi → Vignan LARA',
  assignedBus:        'VL-A01',
  pickupPoint:        'Vadlamudi Bus Stand',
  predBoardingTime:   '07:32 AM',
  actualBoardingTime: '07:34 AM',
  attendanceStatus:   'Boarded',
});

// ── Default buses for Vignan LARA ─────────────────────────────────────────────
const VIGNAN_ROUTES = [
  {
    name:    'Route A — Vadlamudi → Vignan LARA',
    stops:   ['Vadlamudi Bus Stand', 'Guntur Highway Gate', 'VLITS Main Gate', 'Vignan LARA — Main Campus'],
    codes:   ['A01', 'A02', 'A03'],
  },
  {
    name:    'Route B — Tenali Road → Vignan LARA',
    stops:   ['Tenali Road Stop', 'Pedaparupudi Junction', 'Chebrolu Cross Roads', 'Vignan LARA — Main Campus'],
    codes:   ['B01', 'B02'],
  },
  {
    name:    'Route C — Amaravati → Vignan LARA',
    stops:   ['Amaravati Capital Stop', 'Undavalli Junction', 'Tadepalli Gate', 'Vignan LARA — Main Campus'],
    codes:   ['C01', 'C02'],
  },
];

const buildChecklist = (stops) => [
  { task: 'Pre-trip safety inspection completed', done: false },
  { task: 'Fuel level confirmed (>30%)',           done: false },
  { task: 'GPS transmitter activated',             done: false },
  ...stops.slice(0, -1).map((s, i) => ({ task: `Stop ${i + 1} — ${s}`, done: false })),
  { task: 'Destination — Main Campus',            done: false },
];

// ── Default boarding stops for Vignan LARA ────────────────────────────────────
const VIGNAN_STOPS = [
  { name: 'Vadlamudi Bus Stand',    lat: 16.2472, lng: 80.5418 },
  { name: 'Guntur Highway Gate',    lat: 16.2420, lng: 80.5510 },
  { name: 'VLITS Main Gate',        lat: 16.2365, lng: 80.5590 },
  { name: 'Tenali Road Stop',       lat: 16.2488, lng: 80.5762 },
  { name: 'Pedaparupudi Junction',  lat: 16.2440, lng: 80.5670 },
  { name: 'Chebrolu Cross Roads',   lat: 16.2390, lng: 80.5640 },
  { name: 'Kollipara Village Stop', lat: 16.2318, lng: 80.5428 },
  { name: 'Mangalagiri Bypass',     lat: 16.2350, lng: 80.5530 },
  { name: 'Amaravati Capital Stop', lat: 16.2610, lng: 80.5230 },
  { name: 'Undavalli Junction',     lat: 16.2510, lng: 80.5340 },
  { name: 'Tadepalli Gate',         lat: 16.2455, lng: 80.5420 },
  { name: 'Guntur RTC Complex',     lat: 16.3070, lng: 80.4370 },
  { name: 'Brodipet Stop',          lat: 16.2890, lng: 80.4780 },
  { name: 'Nallapadu Gate',         lat: 16.2680, lng: 80.5050 },
];

// ── Main seed function ────────────────────────────────────────────────────────
const seedDemoUsers = async () => {
  try {
    const BoardingStop = require('./models/BoardingStop');

    // 1. Seed institutions
    const instMap = {};
    for (const inst of INSTITUTIONS) {
      const { _seedKey, ...data } = inst;
      let doc = await Institution.findOne({ name: data.name });
      if (!doc) {
        doc = await Institution.create(data);
        console.log(`✅ Seeded institution: ${data.name}`);
      }
      instMap[_seedKey] = doc._id;
    }

    // 2. Seed users
    for (const demo of buildUsers(instMap)) {
      const exists = await User.findOne({ email: demo.email });
      if (!exists) {
        await new User(demo).save();
        console.log(`✅ Seeded user: ${demo.name} (${demo.role})`);
      } else {
        // Backfill institutionId on existing users if missing
        if (demo.institutionId && !exists.institutionId) {
          exists.institutionId = demo.institutionId;
          await exists.save();
        }
      }

      // Seed demo student profile
      if (demo.role === 'student') {
        const profileExists = await Student.findOne({
          institutionId: demo.institutionId,
          studentId:     'STU001',
        });
        if (!profileExists) {
          await Student.create(demoStudentProfile(demo.institutionId));
          console.log(`✅ Seeded student profile: STU001`);
        }
      }
    }

    // 3. Seed buses for Vignan LARA
    const vignanId = instMap['vignan'];
    for (const route of VIGNAN_ROUTES) {
      for (const code of route.codes) {
        const busNumber = `VL-${code}`;
        const exists = await Bus.findOne({ institutionId: vignanId, busNumber });
        if (!exists) {
          await Bus.create({
            institutionId:   vignanId,
            busNumber,
            route:           route.name,
            capacity:        40,
            occupied:        0,
            status:          'Standby',
            stopSequence:    route.stops,
            driverChecklist: buildChecklist(route.stops),
            nextStop:        route.stops[0],
            etaToNextStop:   0,
          });
          console.log(`✅ Seeded bus: ${busNumber}`);
        }
      }
    }

    // 4. Seed boarding stops for Vignan LARA
    for (const stop of VIGNAN_STOPS) {
      const exists = await BoardingStop.findOne({ institutionId: vignanId, name: stop.name });
      if (!exists) {
        await BoardingStop.create({ institutionId: vignanId, ...stop, isActive: true });
      }
    }

    console.log('✅ Seed complete.');
  } catch (err) {
    console.error('Seed error:', err.message);
  }
};

module.exports = seedDemoUsers;
