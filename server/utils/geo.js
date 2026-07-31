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
 * @param {string[]} stops — full list of stop names including start and campus
 * @param {string} startStop — name of the first stop (bus origin)
 * @param {string} destination — campus stop name
 * @returns {{ ordered: string[], totalKm: number }}
 */
const nearestNeighbor2opt = (stops, startStop, destination = 'Vignan LARA — Main Campus') => {
  const middle = stops.filter(s => s !== startStop && s !== destination);

  // Nearest-neighbor greedy tour through middle stops
  let ordered = [startStop];
  const remaining = [...middle];
  while (remaining.length) {
    const last   = ordered[ordered.length - 1];
    const lastCoord = STOP_COORDS[last];
    if (!lastCoord) { ordered.push(...remaining.splice(0)); break; }

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const coord = STOP_COORDS[remaining[i]];
      if (!coord) continue;
      const d = haversineKm(lastCoord, coord);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  ordered.push(destination);

  // 2-opt improvement on middle segment (keep start and destination fixed)
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < ordered.length - 2; i++) {
      for (let j = i + 1; j < ordered.length - 1; j++) {
        const a  = STOP_COORDS[ordered[i - 1]];
        const b  = STOP_COORDS[ordered[i]];
        const c  = STOP_COORDS[ordered[j]];
        const d  = STOP_COORDS[ordered[j + 1]];
        if (!a || !b || !c || !d) continue;
        const before = haversineKm(a, b) + haversineKm(c, d);
        const after  = haversineKm(a, c) + haversineKm(b, d);
        if (after < before - 0.001) {
          // Reverse the segment between i and j
          const seg = ordered.slice(i, j + 1).reverse();
          ordered = [...ordered.slice(0, i), ...seg, ...ordered.slice(j + 1)];
          improved = true;
        }
      }
    }
  }

  // Calculate total route distance
  let totalKm = 0;
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = STOP_COORDS[ordered[i]];
    const b = STOP_COORDS[ordered[i + 1]];
    if (a && b) totalKm += haversineKm(a, b);
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

module.exports = {
  STOP_COORDS,
  gpsToCanvas,
  haversineKm,
  calcStopETAs,
  nearestNeighbor2opt,
  routeTotalKm,
  CANVAS_W,
  CANVAS_H,
  GEO,
};
