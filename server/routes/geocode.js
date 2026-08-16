/**
 * geocode.js route
 *
 * GET  /api/geocode?q=<address>           — forward geocode (address → lat/lng)
 * GET  /api/geocode/reverse?lat=&lng=     — reverse geocode (lat/lng → address)
 *
 * Proxies Nominatim so:
 *  1. The correct User-Agent is always sent (Nominatim policy requirement)
 *  2. Rate limiting can be added server-side in future
 *  3. CORS is handled — frontend doesn't hit Nominatim directly
 */

const express = require('express');
const { protect } = require('../middleware/auth');
const { geocodeAddress, reverseGeocode } = require('../utils/geocode');

const router = express.Router();

// Simple in-memory cache — avoids re-geocoding the same string repeatedly
const cache = new Map();

// ── GET /api/geocode?q=<address> ─────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { q, region = 'in' } = req.query;
    if (!q || q.trim().length < 3) {
      return res.status(400).json({ message: 'Query must be at least 3 characters.' });
    }

    const cacheKey = `${q.toLowerCase().trim()}:${region}`;
    if (cache.has(cacheKey)) {
      return res.json({ ...cache.get(cacheKey), cached: true });
    }

    const result = await geocodeAddress(q.trim(), region);
    if (!result) {
      return res.status(404).json({ message: 'No coordinates found for this address. Try adding city/state.' });
    }

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/geocode/reverse?lat=&lng= ───────────────────────────────────────
router.get('/reverse', protect, async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ message: 'lat and lng are required.' });
    }

    const address = await reverseGeocode(parseFloat(lat), parseFloat(lng));
    if (!address) {
      return res.status(404).json({ message: 'No address found for these coordinates.' });
    }

    res.json({ address, lat: parseFloat(lat), lng: parseFloat(lng) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
