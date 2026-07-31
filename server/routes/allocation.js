/**
 * allocation.js — Automatic student → bus assignment
 *
 * POST /api/allocation/run      (admin only) — runs algorithm and saves results
 * POST /api/allocation/preview  (admin only) — dry-run, returns plan without saving
 * GET  /api/allocation/summary  (admin only) — current allocation snapshot
 */

const express = require('express');
const Student = require('../models/Student');
const Bus     = require('../models/Bus');
const { protect, adminOnly } = require('../middleware/auth');
const { STOP_COORDS, haversineKm } = require('../utils/geo');

const router = express.Router();

// ── Core allocation algorithm ─────────────────────────────────────────────────
/**
 * Assigns each student (who has a pickupPoint) to a bus whose stopSequence
 * already covers that stop, or to the nearest bus if none does.
 * Respects per-bus capacity. Returns a plan object without touching the DB.
 *
 * @param {Array} students — all student documents
 * @param {Array} buses    — all bus documents
 * @returns {{ perBus, unallocated, allocated }}
 */
const computeAllocationPlan = (students, buses) => {
  // Track how many seats are being used in this plan (starts from DB occupied count)
  const seatUsed = {};
  buses.forEach(b => { seatUsed[b.busNumber] = b.occupied || 0; });

  // perBus: busNumber → { bus doc snapshot, assignedStudents[] }
  const perBus = {};
  buses.forEach(b => {
    perBus[b.busNumber] = { busNumber: b.busNumber, route: b.route, capacity: b.capacity, students: [] };
  });

  const allocated   = [];
  const unallocated = [];

  for (const student of students) {
    const stop = student.pickupPoint;
    if (!stop) { unallocated.push({ studentId: student.studentId, reason: 'No pickup point set' }); continue; }

    // 1. Prefer buses whose stopSequence already includes the student's stop
    const coveringBuses = buses.filter(b =>
      Array.isArray(b.stopSequence) && b.stopSequence.includes(stop) &&
      seatUsed[b.busNumber] < b.capacity
    );

    // 2. If no covering bus, find the nearest bus that has remaining capacity,
    //    measured by haversine from the stop to the bus's starting point
    let candidateBuses = coveringBuses;
    if (!candidateBuses.length) {
      const stopCoord = STOP_COORDS[stop];
      candidateBuses = buses
        .filter(b => seatUsed[b.busNumber] < b.capacity)
        .map(b => {
          let dist = Infinity;
          if (stopCoord && b.startingLat && b.startingLng) {
            dist = haversineKm(stopCoord, { lat: b.startingLat, lng: b.startingLng });
          } else if (stopCoord && b.stopSequence?.length) {
            // Fallback: distance to first stop in sequence
            const firstCoord = STOP_COORDS[b.stopSequence[0]];
            if (firstCoord) dist = haversineKm(stopCoord, firstCoord);
          }
          return { bus: b, dist };
        })
        .sort((a, z) => a.dist - z.dist)
        .slice(0, 3)                        // consider up to 3 nearest
        .map(({ bus }) => bus);
    }

    if (!candidateBuses.length) {
      unallocated.push({ studentId: student.studentId, name: student.name, stop, reason: 'All buses full' });
      continue;
    }

    // Pick the bus with the most remaining capacity among candidates
    const chosen = candidateBuses.reduce((best, b) => {
      const remaining = b.capacity - seatUsed[b.busNumber];
      const bestRemaining = best.capacity - seatUsed[best.busNumber];
      return remaining > bestRemaining ? b : best;
    }, candidateBuses[0]);

    seatUsed[chosen.busNumber]++;
    perBus[chosen.busNumber].students.push({
      studentId: student.studentId,
      name:      student.name,
      stop,
      wasAlreadyOnRoute: chosen.stopSequence?.includes(stop) || false,
    });

    allocated.push({
      studentId:     student.studentId,
      name:          student.name,
      stop,
      busNumber:     chosen.busNumber,
      route:         chosen.route,
      allocationMethod: chosen.stopSequence?.includes(stop) ? 'route-match' : 'nearest-bus',
    });
  }

  return {
    allocated,
    unallocated,
    perBus: Object.values(perBus),
    summary: {
      totalStudents:     students.length,
      allocatedCount:    allocated.length,
      unallocatedCount:  unallocated.length,
      busesUsed:         Object.values(perBus).filter(b => b.students.length > 0).length,
    },
  };
};

// ── POST /api/allocation/preview — dry-run ───────────────────────────────────
router.post('/preview', protect, adminOnly, async (req, res) => {
  try {
    const [students, buses] = await Promise.all([
      Student.find({ pickupPoint: { $exists: true, $ne: '' } }),
      Bus.find(),
    ]);

    const plan = computeAllocationPlan(students, buses);
    res.json({ ...plan, saved: false });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/allocation/run — compute + save ────────────────────────────────
router.post('/run', protect, adminOnly, async (req, res) => {
  try {
    const [students, buses] = await Promise.all([
      Student.find({ pickupPoint: { $exists: true, $ne: '' } }),
      Bus.find(),
    ]);

    const plan = computeAllocationPlan(students, buses);
    const now  = new Date();

    // Bulk-update each allocated student
    const bulkOps = plan.allocated.map(({ studentId, busNumber, route, allocationMethod }) => ({
      updateOne: {
        filter: { studentId },
        update: {
          $set: {
            assignedBus:      busNumber,
            assignedRoute:    route || '',
            allocatedAt:      now,
            allocationMethod,
          },
        },
      },
    }));

    if (bulkOps.length) await Student.bulkWrite(bulkOps);

    // Mark unallocated students (clear stale assignment if any)
    if (plan.unallocated.length) {
      const unallocIds = plan.unallocated.map(u => u.studentId);
      await Student.updateMany(
        { studentId: { $in: unallocIds } },
        { $set: { assignedBus: '', assignedRoute: '', allocationMethod: 'unallocated', allocatedAt: now } }
      );
    }

    res.json({ ...plan, saved: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/allocation/summary — current snapshot ──────────────────────────
router.get('/summary', protect, adminOnly, async (req, res) => {
  try {
    const buses = await Bus.find();
    const perBusData = await Promise.all(
      buses.map(async (b) => {
        const count = await Student.countDocuments({ assignedBus: b.busNumber });
        return {
          busNumber:  b.busNumber,
          route:      b.route,
          capacity:   b.capacity,
          assigned:   count,
          loadPct:    Math.round((count / (b.capacity || 50)) * 100),
        };
      })
    );

    const totalAssigned   = await Student.countDocuments({ assignedBus: { $ne: '' } });
    const totalUnassigned = await Student.countDocuments({ assignedBus: '' });

    res.json({ perBus: perBusData, totalAssigned, totalUnassigned });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
