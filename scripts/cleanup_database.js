import 'dotenv/config';
import { connectDb, disconnectDb } from '../src/db.js';

const apply = process.argv.includes('--apply');

const LEGACY_COLLECTIONS = [
  'city_coordinates_cache',
  'coordinates',
  'district_coordinates',
  'recovery_candidates',
  'recovery_options',
];

function withoutId(document) {
  const { _id, ...value } = document;
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function equal(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

async function documentsBy(collection, key) {
  const documents = await collection.find({}).toArray();
  return new Map(documents.map((document) => [document[key], document]));
}

async function preflight(db) {
  const names = new Set((await db.listCollections().toArray()).map(({ name }) => name));
  const required = [
    'locations', 'routes', 'vehicles', 'districts', 'hubs', 'telangana_nodes', 'telangana_edges',
  ];
  const missing = required.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Expected collections are missing: ${missing.join(', ')}`);

  const legacyPresence = LEGACY_COLLECTIONS.map((name) => names.has(name));
  const legacyPresent = legacyPresence.every(Boolean);
  if (!legacyPresent && legacyPresence.some(Boolean)) {
    throw new Error('Cleanup aborted; legacy collections are only partially present. Restore or inspect them before retrying.');
  }

  const [cache, coordinates, districts, districtCoordinates, candidates, options, nodes, edges, locations, routes, vehicles] = await Promise.all([
    legacyPresent ? documentsBy(db.collection('city_coordinates_cache'), 'city') : new Map(),
    legacyPresent ? documentsBy(db.collection('coordinates'), 'city') : new Map(),
    documentsBy(db.collection('districts'), 'districtId'),
    legacyPresent ? documentsBy(db.collection('district_coordinates'), 'district') : new Map(),
    legacyPresent ? documentsBy(db.collection('recovery_candidates'), 'candidateId') : new Map(),
    legacyPresent ? documentsBy(db.collection('recovery_options'), 'candidateId') : new Map(),
    documentsBy(db.collection('telangana_nodes'), 'hub_name'),
    db.collection('telangana_edges').find({}).toArray(),
    db.collection('locations').find({}).toArray(),
    db.collection('routes').find({}).toArray(),
    db.collection('vehicles').find({}).toArray(),
  ]);

  const coordinateCopiesMatch = !legacyPresent || (
    cache.size === coordinates.size
    && [...cache].every(([city, document]) => equal(withoutId(document), withoutId(coordinates.get(city))))
  );

  const districtCoordinatesRedundant = !legacyPresent || (districtCoordinates.size === districts.size
    && [...districtCoordinates].every(([districtName, coordinate]) => {
      const district = [...districts.values()].find(({ name }) => name === districtName);
      return district
        && coordinate.headquarters === district.headquarters
        && coordinate.latitude === district.latitude
        && coordinate.longitude === district.longitude;
    }));

  const recoveryCopiesMatch = !legacyPresent || (
    candidates.size === options.size
    && [...candidates].every(([candidateId, candidate]) => equal(withoutId(candidate), withoutId(options.get(candidateId))))
  );

  const locationNames = new Set(locations.map(({ name }) => name));
  const graphEdgesValid = edges.every(({ source_name, destination_name }) => nodes.has(source_name) && nodes.has(destination_name));
  const locationsMapToNodes = locations.length === nodes.size
    && locations.every(({ name, graphNodeKey }) => nodes.has(name) && graphNodeKey === name);
  const locationIds = new Set(locations.map(({ _id }) => String(_id)));
  const vehicleIds = new Set(vehicles.map(({ _id }) => String(_id)));
  const routeReferencesValid = routes.every(({ origin, destination, vehicle }) =>
    locationIds.has(String(origin)) && locationIds.has(String(destination)) && vehicleIds.has(String(vehicle)));
  const vehicleReferencesValid = vehicles.every(({ currentLocation, currentRoute }) =>
    locationIds.has(String(currentLocation)) && (!currentRoute || routes.some(({ _id }) => String(_id) === String(currentRoute))));

  return {
    coordinateCopiesMatch,
    districtCoordinatesRedundant,
    recoveryCopiesMatch,
    locationsMapToNodes,
    graphEdgesValid,
    routeReferencesValid,
    vehicleReferencesValid,
    legacyPresent,
    counts: Object.fromEntries(await Promise.all(
      [...names].sort().map(async (name) => [name, await db.collection(name).countDocuments()]),
    )),
    locationNames,
  };
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection('districts').createIndex({ districtId: 1 }, { unique: true }),
    db.collection('hubs').createIndex({ hubId: 1 }, { unique: true }),
    db.collection('hubs').createIndex({ districtId: 1 }),
    db.collection('telangana_nodes').createIndex({ hub_name: 1 }, { unique: true }),
    db.collection('telangana_edges').createIndex({ source_name: 1, destination_name: 1 }, { unique: true }),
    db.collection('locations').createIndex({ graphNodeKey: 1 }, { unique: true, sparse: true }),
  ]);
}

async function assignGraphKeys(db) {
  const nodeNames = new Set((await db.collection('telangana_nodes').find({}, { projection: { hub_name: 1 } }).toArray())
    .map(({ hub_name }) => hub_name));
  const locations = await db.collection('locations').find({}, { projection: { _id: 1, name: 1, graphNodeKey: 1 } }).toArray();
  const updates = locations
    .filter(({ name, graphNodeKey }) => nodeNames.has(name) && graphNodeKey !== name)
    .map(({ _id, name }) => ({ updateOne: { filter: { _id }, update: { $set: { graphNodeKey: name } } } }));
  if (updates.length) await db.collection('locations').bulkWrite(updates, { ordered: true });
  return updates.length;
}

async function dropLegacyCollections(db) {
  for (const name of LEGACY_COLLECTIONS) {
    await db.collection(name).drop();
  }
}

async function main() {
  const conn = await connectDb();
  const db = conn.db;
  try {
    const audit = await preflight(db);
    const failed = Object.entries(audit)
      .filter(([key, value]) => key !== 'counts' && key !== 'locationNames' && key !== 'legacyPresent' && value !== true)
      .map(([key]) => key);
    if (failed.length) {
      throw new Error(`Cleanup aborted; invariants failed: ${failed.join(', ')}`);
    }

    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', audit: { ...audit, locationNames: undefined } }, null, 2));
    if (!apply) {
      console.log(audit.legacyPresent
        ? '\nDry run passed. Re-run with --apply to remove only the verified legacy collections.'
        : '\nDatabase is already clean. Re-run with --apply only to recheck indexes and topology keys.');
      return;
    }

    const graphKeysAssigned = await assignGraphKeys(db);
    await ensureIndexes(db);
    if (audit.legacyPresent) await dropLegacyCollections(db);
    const finalCollections = (await db.listCollections().toArray()).map(({ name }) => name).sort();
    console.log(JSON.stringify({
      removed: audit.legacyPresent ? LEGACY_COLLECTIONS : [],
      graphKeysAssigned,
      finalCollections,
    }, null, 2));
  } finally {
    await disconnectDb();
  }
}

main().catch((error) => {
  console.error(`Database cleanup failed: ${error.message}`);
  process.exitCode = 1;
});
