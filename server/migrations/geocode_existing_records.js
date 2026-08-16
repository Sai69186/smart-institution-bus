/**
 * geocode_existing_records.js
 * ===========================
 * One-time migration: re-geocode all institutions and boarding stops
 * that have missing or manually-estimated lat/lng coordinates.
 *
 * Run:
 *   node server/migrations/geocode_existing_records.js
 *
 * What it does:
 *   1. Loads all Institution records — geocodes campusName + city if campusLat is null
 *   2. Loads all BoardingStop records — geocodes stop name + city if lat is null
 *   3. Flags records where geocoding confidence is low (< 0.3) for manual review
 *   4. Prints a summary of what was updated vs what needs manual attention
 *
 * Rate limiting:
 *   Nominatim public server — max 1 request/second.
 *   This script adds a 1.1s delay between requests automatically.
 *
 * To re-run after adding new stops: just run again — it skips records
 * that already have coordinates (unless --force flag is passed).
 */

const mongoose  = require('mongoose');
const dotenv    = require('dotenv');
const path      = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const Institution = require(path.join(__dirname, '..', 'models', 'Institution'));
const BoardingStop = require(path.join(__dirname, '..', 'models', 'BoardingStop'));
const { geocodeAddress } = require(path.join(__dirname, '..', 'utils', 'geocode'));

const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');

// Rate limiting — 1.1s between Nominatim requests
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const stats = {
  institutionsChecked:  0,
  institutionsUpdated:  0,
  institutionsSkipped:  0,
  institutionsFailed:   0,
  stopsChecked:         0,
  stopsUpdated:         0,
  stopsSkipped:         0,
  stopsFailed:          0,
  manualReviewNeeded:   [],
};

async function geocodeWithRetry(query, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const result = await geocodeAddress(query);
    if (result) return result;
    if (i < retries) await sleep(2000);
  }
  return null;
}

async function migrateInstitutions() {
  console.log('\n── Institutions ──────────────────────────────────');
  const institutions = await Institution.find({});
  console.log(`   Found ${institutions.length} institutions`);

  for (const inst of institutions) {
    stats.institutionsChecked++;
    const alreadyHasCoords = inst.campusLat && inst.campusLng;

    if (alreadyHasCoords && !FORCE) {
      console.log(`   SKIP  ${inst.name} (already has coords: ${inst.campusLat}, ${inst.campusLng})`);
      stats.institutionsSkipped++;
      continue;
    }

    // Build geocoding query: campusName + city/address
    const query = [inst.campusName, inst.city, inst.state, 'India']
      .filter(Boolean).join(', ');

    console.log(`   GEOCODE  ${inst.name} → "${query}"`);
    await sleep(1100); // Nominatim rate limit

    const result = await geocodeWithRetry(query);

    if (!result) {
      console.log(`   FAIL  ${inst.name} — no result from Nominatim`);
      stats.institutionsFailed++;
      stats.manualReviewNeeded.push({ type: 'institution', name: inst.name, query });
      continue;
    }

    if (result.confidence < 0.3) {
      console.log(`   WARN  ${inst.name} — low confidence (${result.confidence.toFixed(2)}): ${result.displayName}`);
      stats.manualReviewNeeded.push({
        type: 'institution', name: inst.name,
        query, result: `${result.lat}, ${result.lng}`,
        confidence: result.confidence,
      });
    }

    console.log(`   OK    ${inst.name} → ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)} (conf: ${result.confidence.toFixed(2)})`);

    if (!DRY_RUN) {
      await Institution.findByIdAndUpdate(inst._id, {
        $set: { campusLat: result.lat, campusLng: result.lng },
      });
    }
    stats.institutionsUpdated++;
  }
}

async function migrateStops() {
  console.log('\n── Boarding Stops ────────────────────────────────');

  // Process in batches to be gentle on Nominatim
  const stops = await BoardingStop.find({}).populate('institutionId', 'name city state');
  console.log(`   Found ${stops.length} boarding stops`);

  for (const stop of stops) {
    stats.stopsChecked++;
    const alreadyHasCoords = stop.lat && stop.lng;

    if (alreadyHasCoords && !FORCE) {
      stats.stopsSkipped++;
      continue;
    }

    // Get city from institution if available
    const city  = stop.institutionId?.city  || '';
    const state = stop.institutionId?.state || 'Andhra Pradesh';
    const query = [stop.name, city, state, 'India'].filter(Boolean).join(', ');

    console.log(`   GEOCODE  "${stop.name}" → "${query}"`);
    await sleep(1100);

    const result = await geocodeWithRetry(query);

    if (!result) {
      console.log(`   FAIL  "${stop.name}" — no Nominatim result`);
      stats.stopsFailed++;
      stats.manualReviewNeeded.push({ type: 'stop', name: stop.name, query });
      continue;
    }

    if (result.confidence < 0.3) {
      stats.manualReviewNeeded.push({
        type: 'stop', name: stop.name,
        query, result: `${result.lat}, ${result.lng}`,
        confidence: result.confidence,
      });
    }

    console.log(`   OK    "${stop.name}" → ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}`);

    if (!DRY_RUN) {
      await BoardingStop.findByIdAndUpdate(stop._id, {
        $set: { lat: result.lat, lng: result.lng },
      });
    }
    stats.stopsUpdated++;
  }
}

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    if (DRY_RUN) console.log('ℹ  DRY RUN mode — no DB writes');
    if (FORCE)   console.log('ℹ  FORCE mode — re-geocoding all records');

    await migrateInstitutions();
    await migrateStops();

    // Print summary
    console.log('\n══════════════════════════════════════════════════');
    console.log('MIGRATION SUMMARY');
    console.log('══════════════════════════════════════════════════');
    console.log(`Institutions: ${stats.institutionsUpdated} updated, ${stats.institutionsSkipped} skipped, ${stats.institutionsFailed} failed`);
    console.log(`Stops:        ${stats.stopsUpdated} updated, ${stats.stopsSkipped} skipped, ${stats.stopsFailed} failed`);

    if (stats.manualReviewNeeded.length > 0) {
      console.log(`\n⚠  ${stats.manualReviewNeeded.length} records need manual review:`);
      stats.manualReviewNeeded.forEach(r => {
        console.log(`   [${r.type}] "${r.name}"`);
        if (r.result) console.log(`      Geocoded to: ${r.result} (confidence: ${r.confidence?.toFixed(2)})`);
        else          console.log(`      Failed to geocode — add coordinates manually in Admin UI`);
      });
    } else {
      console.log('\n✅ All records geocoded successfully.');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  }
}

main();
