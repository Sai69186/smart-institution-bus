/**
 * seedBuses.js
 * Run once: node server/seedBuses.js
 * Seeds 50 real bus records for Vignan LARA into MongoDB.
 * Each bus starts unassigned (no driver) — drivers register and claim a bus.
 */

const mongoose = require('mongoose');
const dotenv   = require('dotenv');
dotenv.config();

const Bus = require('./models/Bus');

// ── Route definitions for Vignan LARA ──────────────────────────────────────
// 5 routes × 10 buses each = 50 buses
const ROUTES = [
  {
    name:    'Route A — Vadlamudi → Vignan LARA',
    stops:   ['Vadlamudi Bus Stand', 'Guntur Highway Gate', 'VLITS Main Gate', 'Vignan LARA — Main Campus'],
    busCodes: ['A01','A02','A03','A04','A05','A06','A07','A08','A09','A10']
  },
  {
    name:    'Route B — Tenali Road → Vignan LARA',
    stops:   ['Tenali Road Stop', 'Pedaparupudi Junction', 'Chebrolu Cross Roads', 'Vignan LARA — Main Campus'],
    busCodes: ['B01','B02','B03','B04','B05','B06','B07','B08','B09','B10']
  },
  {
    name:    'Route C — Kollipara → Vignan LARA',
    stops:   ['Kollipara Village Stop', 'Mangalagiri Bypass', 'Hostel Block — VLITS', 'Vignan LARA — Main Campus'],
    busCodes: ['C01','C02','C03','C04','C05','C06','C07','C08','C09','C10']
  },
  {
    name:    'Route D — Amaravati → Vignan LARA',
    stops:   ['Amaravati Capital Stop', 'Undavalli Junction', 'Tadepalli Gate', 'Vignan LARA — Main Campus'],
    busCodes: ['D01','D02','D03','D04','D05','D06','D07','D08','D09','D10']
  },
  {
    name:    'Route E — Guntur City → Vignan LARA',
    stops:   ['Guntur RTC Complex', 'Brodipet Stop', 'Nallapadu Gate', 'Vignan LARA — Main Campus'],
    busCodes: ['E01','E02','E03','E04','E05','E06','E07','E08','E09','E10']
  }
];

const buildChecklist = (stops) => [
  { task: 'Pre-trip safety inspection completed', done: false },
  { task: 'Fuel level confirmed (>30%)',          done: false },
  { task: 'GPS transmitter activated',            done: false },
  ...stops.slice(0, -1).map((s, i) => ({ task: `Stop ${i + 1} — ${s}`, done: false })),
  { task: 'Destination — Vignan LARA Main Campus', done: false }
];

const seedBuses = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  let created = 0, skipped = 0;

  for (const route of ROUTES) {
    for (const code of route.busCodes) {
      const busNumber = `VL-${code}`;
      const exists = await Bus.findOne({ busNumber });
      if (exists) { skipped++; continue; }

      await Bus.create({
        busNumber,
        route:         route.name,
        capacity:      50,
        occupied:      0,
        status:        'Standby',
        stopSequence:  route.stops,
        driverChecklist: buildChecklist(route.stops),
        nextStop:      route.stops[0],
        etaToNextStop: 0
      });
      created++;
    }
  }

  console.log(`✅ Seeded ${created} buses, skipped ${skipped} existing.`);
  await mongoose.disconnect();
};

seedBuses().catch(err => { console.error(err); process.exit(1); });
