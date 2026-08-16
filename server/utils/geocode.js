/**
 * geocode.js
 * Nominatim (OpenStreetMap) geocoding utility.
 * 
 * Usage:
 *   const { geocodeAddress } = require('../utils/geocode');
 *   const result = await geocodeAddress('Benz Circle, Vijayawada, Andhra Pradesh');
 *   // { lat, lng, displayName, confidence }
 * 
 * Rate limit: Nominatim public server — max 1 req/sec, no bulk.
 * For production, self-host: https://nominatim.org/release-docs/develop/admin/Installation/
 */

const NOMINATIM_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

/**
 * Geocode a free-text address → { lat, lng, displayName, confidence }
 * Returns null if no result found.
 *
 * @param {string} address  — e.g. "Benz Circle, Vijayawada, Andhra Pradesh, India"
 * @param {string} region   — optional countrycodes hint (default 'in' for India)
 */
const geocodeAddress = async (address, region = 'in') => {
  try {
    const { default: fetch } = await import('node-fetch');

    const params = new URLSearchParams({
      q:              address,
      format:         'json',
      limit:          '3',
      countrycodes:   region,
      addressdetails: '1',
    });

    const res = await fetch(`${NOMINATIM_URL}/search?${params}`, {
      headers: {
        // Nominatim policy: identify your app in User-Agent
        'User-Agent': 'SmartInstitutionBus/1.0 (campus-transit-project)',
        'Accept-Language': 'en',
      },
    });

    if (!res.ok) return null;
    const results = await res.json();

    if (!results || results.length === 0) return null;

    const top = results[0];
    return {
      lat:         parseFloat(top.lat),
      lng:         parseFloat(top.lon),
      displayName: top.display_name,
      confidence:  Math.min(1, parseFloat(top.importance || 0.5)),
      rawResult:   top,
    };
  } catch (err) {
    console.error('Geocoding error:', err.message);
    return null;
  }
};

/**
 * Reverse geocode lat/lng → human-readable address
 */
const reverseGeocode = async (lat, lng) => {
  try {
    const { default: fetch } = await import('node-fetch');

    const params = new URLSearchParams({
      lat:    lat.toString(),
      lon:    lng.toString(),
      format: 'json',
    });

    const res = await fetch(`${NOMINATIM_URL}/reverse?${params}`, {
      headers: {
        'User-Agent': 'SmartInstitutionBus/1.0 (campus-transit-project)',
        'Accept-Language': 'en',
      },
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  } catch {
    return null;
  }
};

module.exports = { geocodeAddress, reverseGeocode };
