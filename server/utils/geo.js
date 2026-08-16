/**
 * geo.js — Shared geospatial utilities for Vignan LARA campus transit.
 * Imported by: routes/buses.js, routes/allocation.js, routes/optimizer.js
 */

// ── Vignan LARA bounding box for canvas projection ───────────────────────────
const CANVAS_W = 800, CANVAS_H = 480;
const GEO = { topLat: 16.2500, botLat: 16.2200, leftLng: 80.5400, rightLng: 80.5800 };

/** Convert GPS lat/lng to canvas x/y */
const gpsToCanvas = (lat, lng) => ({
  x: Math.round(((lng - GEO.leftLng)  / (GEO.rightLng - GEO.leftLng)) * CANVAS_W),
  y: Math.round(((lat - GEO.topLat)   / (GEO.botLat   - GEO.topLat)) * CANVAS_H),
});

// ── Known stop GPS coordinates ────────────────────────────────────────────────
const STOP_COORDS = {
  'Vadlamudi Bus Stand':       { lat: 16.2472, lng: 80.5418 },
  'Guntur Highway Gate':       { lat: 16.2420, lng: 80.5510 },
  'VLITS Main Gate':           { lat: 16.2365, lng: 80.5590 },
  'Tenali Road Stop':          { lat: 16.2488, lng: 80.5762 },
  'Pedaparupudi Junction':     { lat: 16.2440, lng: 80.5670 },
  'Chebrolu Cross Roads':      { lat: 16.2390, lng: 80.5640 },
  'Kollipara Village Stop':    { lat: 16.2318, lng: 80.5428 },
  'Mangalagiri Bypass':        { lat: 16.2350, lng: 80.5530 },
  'Hostel Block — VLITS':      { lat: 16.2355, lng: 80.5600 },
  'Vignan LARA — Main Campus': { lat: 16.2345, lng: 80.5613 },
  'Amaravati Capital Stop':    { lat: 16.2610, lng: 80.5230 },
  'Undavalli Junction':        { lat: 16.2510, lng: 80.5340 },
  'Tadepalli Gate':            { lat: 16.2455, lng: 80.5420 },
  'Guntur RTC Complex':        { lat: 16.3070, lng: 80.4370 },
  'Brodipet Stop':             { lat: 16.2890, lng: 80.4780 },
  'Nallapadu Gate':            { lat: 16.2680, lng: 80.5050 },
};

/**
 * Haversine great-circle distance in km between two {lat, lng} objects.
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @returns {number} distance in km
 */
const haversineKm = (a, b) => {
  const R    = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s    = Math.sin(dLat / 2) ** 2 +
               Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
               Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
};

/**
 * Calculate ETAs (minutes) from the bus's current GPS position to each
 * remaining stop in the route sequence.
 *
 * @param {number} busLat  — current bus latitude
 * @param {number} busLng  — current bus longitude
 * @param {string[]} stopSequence — ordered array of stop names
 * @param {number} speedKmh — current speed (default 30 km/h)
 * @returns {Object} map of stopName → minutes
 */
const calcStopETAs = (busLat, busLng, stopSequence, speedKmh = 30) => {
  if (!busLat || !busLng || !stopSequence?.length) return {};
  const busPos = { lat: busLat, lng: busLng };
  const etas   = {};
  let distKm   = 0;
  let prev     = busPos;

  for (const stopName of stopSequence) {
    const coord = STOP_COORDS[stopName];
    if (!coord) continue;
    distKm += haversineKm(prev, coord);
    etas[stopName] = Math.max(0, Math.round((distKm / speedKmh) * 60));
    prev = coord;
  }
  return etas;
};

/**
 * Nearest-neighbor route ordering + one pass of 2-opt improvement.
 * Starts at `startStop`, visits all intermediate stops, ends at campus.
 *
 * Accepts stops in two forms:
 *   - Array of stop name strings (uses STOP_COORDS lookup — legacy)
 *   - Array of { name, lat, lng } objects (dynamic coords — multi-tenant)
 *
 * @param {string[]|{name,lat,lng}[]} stops
 * @param {string} startStop — name of the first stop
 * @param {string} destination — campus stop name
 * @returns {{ ordered: string[], totalKm: number }}
 */
const nearestNeighbor2opt = (stops, startStop, destination = 'Vignan LARA — Main Campus') => {
  // Normalise: convert string array to {name,lat,lng} using STOP_COORDS fallback
  const stopObjs = stops.map(s => {
    if (typeof s === 'object' && s.lat != null && s.lng != null) return s;
    const coord = STOP_COORDS[s];
    return coord ? { name: s, lat: coord.lat, lng: coord.lng } : { name: s, lat: null, lng: null };
  });

  // Build coord lookup by name
  const coordOf = {};
  stopObjs.forEach(s => { coordOf[s.name] = s; });

  const middle = stopObjs.filter(s => s.name !== startStop && s.name !== destination);

  // Nearest-neighbor greedy tour
  let ordered = [startStop];
  const remaining = [...middle];

  while (remaining.length) {
    const last      = ordered[ordered.length - 1];
    const lastCoord = coordOf[last];
    if (!lastCoord?.lat) { ordered.push(...remaining.splice(0).map(s => s.name)); break; }

    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      if (!s.lat) continue;
      const d = haversineKm(lastCoord, s);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0].name);
  }
  ordered.push(destination);

  // 2-opt improvement on middle segment (keep start and destination fixed)
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < ordered.length - 2; i++) {
      for (let j = i + 1; j < ordered.length - 1; j++) {
        const a = coordOf[ordered[i - 1]];
        const b = coordOf[ordered[i]];
        const c = coordOf[ordered[j]];
        const d = coordOf[ordered[j + 1]];
        if (!a?.lat || !b?.lat || !c?.lat || !d?.lat) continue;
        const before = haversineKm(a, b) + haversineKm(c, d);
        const after  = haversineKm(a, c) + haversineKm(b, d);
        if (after < before - 0.001) {
          const seg = ordered.slice(i, j + 1).reverse();
          ordered   = [...ordered.slice(0, i), ...seg, ...ordered.slice(j + 1)];
          improved  = true;
        }
      }
    }
  }

  // Total route distance
  let totalKm = 0;
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = coordOf[ordered[i]];
    const b = coordOf[ordered[i + 1]];
    if (a?.lat && b?.lat) totalKm += haversineKm(a, b);
  }

  return { ordered, totalKm: Math.round(totalKm * 100) / 100 };
};

/**
 * Compute the total route distance (km) for an ordered list of stop names.
 */
const routeTotalKm = (stopSequence) => {
  let total = 0;
  for (let i = 0; i < stopSequence.length - 1; i++) {
    const a = STOP_COORDS[stopSequence[i]];
    const b = STOP_COORDS[stopSequence[i + 1]];
    if (a && b) total += haversineKm(a, b);
  }
  return Math.round(total * 100) / 100;
};

/**
 * Determine which stops in a sequence have already been passed by the bus.
 * A stop is considered "passed" if the bus has come within `radiusM` meters of it.
 *
 * Returns the remaining (not yet passed) stop names in order.
 *
 * @param {number}   busLat     — current bus latitude
 * @param {number}   busLng     — current bus longitude
 * @param {string[]} stops      — ordered stop names
 * @param {number}   radiusM    — geofence radius in meters (default 150)
 * @returns {string[]}          — stop names not yet passed
 */
const getRemainingStops = (busLat, busLng, stops, radiusM = 150) => {
  if (!busLat || !busLng || !stops?.length) return stops || [];

  const busPos = { lat: busLat, lng: busLng };
  let lastPassedIdx = -1;

  for (let i = 0; i < stops.length - 1; i++) { // never mark the destination as "passed"
    const coord = STOP_COORDS[stops[i]];
    if (!coord) continue;
    const distM = haversineKm(busPos, coord) * 1000;
    if (distM <= radiusM) {
      lastPassedIdx = i;
    }
  }

  // Return everything after the last passed stop
  return stops.slice(lastPassedIdx + 1);
};

module.exports = {
  STOP_COORDS,
  gpsToCanvas,
  haversineKm,
  calcStopETAs,
  nearestNeighbor2opt,
  routeTotalKm,
  getRemainingStops,
  CANVAS_W,
  CANVAS_H,
  GEO,
};
