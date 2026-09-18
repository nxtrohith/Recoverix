import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../data');

// Simple CSV Parser
function parseCsv(filepath) {
  if (!fs.existsSync(filepath)) return [];
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = values[i];
    });
    return obj;
  });
}

function mapHubTypeToLocationType(hubType) {
  const normalized = (hubType || '').toLowerCase();
  if (normalized.includes('distribution') || normalized === 'dc') return 'distribution_center';
  if (normalized.includes('collection') || normalized === 'c') return 'origin';
  if (normalized.includes('delivery') || normalized === 'd') return 'destination';
  if (normalized.includes('warehouse')) return 'warehouse';
  return 'hub';
}

export async function pushDataToMongo() {
  console.log('Connecting to MongoDB...');
  const conn = await connectDb();
  const db = conn.db;
  console.log(`Connected to database: "${db.databaseName}"`);

  // 1. LOCATIONS (from data/telangana_nodes_geocoded.csv)
  console.log('\n--- 1. Processing Locations ---');
  const rawNodes = parseCsv(path.join(dataDir, 'telangana_nodes_geocoded.csv'));
  const locationNameToDoc = new Map();
  const locationDocs = [];

  rawNodes.forEach((node, idx) => {
    const locId = new mongoose.Types.ObjectId();
    const code = `LOC-${String(idx + 1).padStart(3, '0')}`;
    const lat = parseFloat(node.latitude) || 0;
    const lon = parseFloat(node.longitude) || 0;
    const type = mapHubTypeToLocationType(node.hub_type);
    const facility = node.facility_code ? `${node.facility_code} ` : '';

    const doc = {
      _id: locId,
      name: node.hub_name,
      code,
      type,
      address: `${facility}Logistics Facility, ${node.city}, Telangana`,
      city: node.city,
      coordinates: {
        latitude: lat,
        longitude: lon,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    locationDocs.push(doc);
    locationNameToDoc.set(node.hub_name, doc);
  });

  const locationsCol = db.collection('locations');
  await locationsCol.deleteMany({});
  if (locationDocs.length > 0) {
    await locationsCol.insertMany(locationDocs);
    console.log(`✓ Inserted ${locationDocs.length} locations into "locations" collection`);
  }

  // Raw telangana_nodes
  const telanganaNodesCol = db.collection('telangana_nodes');
  await telanganaNodesCol.deleteMany({});
  const rawNodesToInsert = rawNodes.map((n) => ({
    ...n,
    latitude: parseFloat(n.latitude),
    longitude: parseFloat(n.longitude),
  }));
  if (rawNodesToInsert.length > 0) {
    await telanganaNodesCol.insertMany(rawNodesToInsert);
    console.log(`✓ Inserted ${rawNodesToInsert.length} records into "telangana_nodes" collection`);
  }

  // 2. COORDINATES (from data/city_coordinates_cache.csv)
  console.log('\n--- 2. Processing Coordinates ---');
  const rawCities = parseCsv(path.join(dataDir, 'city_coordinates_cache.csv'));
  const coordinateDocs = rawCities.map((c) => ({
    city: c.city,
    state: 'Telangana',
    latitude: parseFloat(c.latitude),
    longitude: parseFloat(c.longitude),
    createdAt: new Date(),
  }));

  const coordinatesCol = db.collection('coordinates');
  await coordinatesCol.deleteMany({});
  if (coordinateDocs.length > 0) {
    await coordinatesCol.insertMany(coordinateDocs);
    console.log(`✓ Inserted ${coordinateDocs.length} records into "coordinates" collection`);
  }

  // Raw city_coordinates_cache
  const cityCacheCol = db.collection('city_coordinates_cache');
  await cityCacheCol.deleteMany({});
  if (coordinateDocs.length > 0) {
    await cityCacheCol.insertMany(coordinateDocs);
    console.log(`✓ Inserted ${coordinateDocs.length} records into "city_coordinates_cache" collection`);
  }

  // 3. ROUTES & VEHICLES (from data/telangana_edges.csv)
  console.log('\n--- 3. Processing Routes & Vehicles ---');
  const rawEdges = parseCsv(path.join(dataDir, 'telangana_edges.csv'));

  const vehicleDocs = [];
  const routeDocs = [];

  const vehicleConfigs = [
    { type: 'truck', cap: { weight: 5000, volume: 30 } },
    { type: 'trailer', cap: { weight: 12000, volume: 65 } },
    { type: 'container', cap: { weight: 8000, volume: 45 } },
    { type: 'van', cap: { weight: 2000, volume: 15 } },
  ];

  const now = new Date();

  rawEdges.forEach((edge, idx) => {
    const originLoc = locationNameToDoc.get(edge.source_name);
    const destLoc = locationNameToDoc.get(edge.destination_name);

    if (!originLoc || !destLoc) {
      return;
    }

    const routeId = new mongoose.Types.ObjectId();
    const vehicleId = new mongoose.Types.ObjectId();
    const routeCode = `ROUTE-${String(idx + 1).padStart(4, '0')}`;
    const vehicleNumber = `TS-09-UB-${String(1001 + idx)}`;

    const config = edge.route_types?.includes('Carting')
      ? vehicleConfigs[3] // van
      : vehicleConfigs[idx % 3]; // truck / trailer / container

    // Generate realistic load leaving available capacity for piggyback recovery
    const loadFactor = 0.4 + (idx % 35) * 0.01; // 40% - 75% load
    const currentWeight = Math.round(config.cap.weight * loadFactor);
    const currentVolume = Math.round(config.cap.volume * loadFactor);

    const distanceKm = parseFloat(edge.avg_distance_km) || 0;
    const durationMin = Math.round(parseFloat(edge.avg_time_min)) || 60;

    const departure = new Date(now.getTime() - (idx % 120) * 60 * 1000);
    const arrival = new Date(departure.getTime() + durationMin * 60 * 1000);

    // Vehicle Document
    vehicleDocs.push({
      _id: vehicleId,
      vehicleNumber,
      type: config.type,
      capacity: { ...config.cap },
      currentLoad: {
        weight: currentWeight,
        volume: currentVolume,
      },
      currentLocation: originLoc._id,
      status: 'in_transit',
      currentRoute: routeId,
      createdAt: now,
      updatedAt: now,
    });

    // Route Document
    routeDocs.push({
      _id: routeId,
      routeCode,
      origin: originLoc._id,
      destination: destLoc._id,
      stops: [],
      vehicle: vehicleId,
      distanceKm,
      estimatedDurationMinutes: durationMin,
      scheduledDeparture: departure,
      scheduledArrival: arrival,
      capacity: { ...config.cap },
      currentLoad: {
        weight: currentWeight,
        volume: currentVolume,
      },
      status: 'in_progress',
      tripCount: parseInt(edge.trip_count, 10) || 1,
      routeTypes: edge.route_types || 'FTL',
      createdAt: now,
      updatedAt: now,
    });
  });

  // Additional available fleet stationed at key hubs
  locationDocs.slice(0, 20).forEach((loc, i) => {
    const extraVehId = new mongoose.Types.ObjectId();
    const config = vehicleConfigs[i % vehicleConfigs.length];
    vehicleDocs.push({
      _id: extraVehId,
      vehicleNumber: `TS-07-AV-${String(2001 + i)}`,
      type: config.type,
      capacity: { ...config.cap },
      currentLoad: { weight: 0, volume: 0 },
      currentLocation: loc._id,
      status: 'available',
      currentRoute: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  const vehiclesCol = db.collection('vehicles');
  await vehiclesCol.deleteMany({});
  if (vehicleDocs.length > 0) {
    await vehiclesCol.insertMany(vehicleDocs);
    console.log(`✓ Inserted ${vehicleDocs.length} vehicles into "vehicles" collection`);
  }

  const routesCol = db.collection('routes');
  await routesCol.deleteMany({});
  if (routeDocs.length > 0) {
    await routesCol.insertMany(routeDocs);
    console.log(`✓ Inserted ${routeDocs.length} routes into "routes" collection`);
  }

  // Raw telangana_edges
  const telanganaEdgesCol = db.collection('telangana_edges');
  await telanganaEdgesCol.deleteMany({});
  const rawEdgesToInsert = rawEdges.map((e) => ({
    ...e,
    avg_distance_km: parseFloat(e.avg_distance_km),
    avg_time_min: parseFloat(e.avg_time_min),
    trip_count: parseInt(e.trip_count, 10),
  }));
  if (rawEdgesToInsert.length > 0) {
    await telanganaEdgesCol.insertMany(rawEdgesToInsert);
    console.log(`✓ Inserted ${rawEdgesToInsert.length} records into "telangana_edges" collection`);
  }

  // 4. DISTRICTS, DISTRICT COORDINATES, HUBS & RECOVERY CANDIDATES
  console.log('\n--- 4. Processing Core Datasets (Districts, Hubs, Recovery Candidates) ---');
  const jsonFiles = [
    { file: 'district_coordinates.json', col: 'district_coordinates' },
    { file: 'districts.json', col: 'districts' },
    { file: 'hubs.json', col: 'hubs' },
    { file: 'recovery_candidates.json', col: 'recovery_candidates' },
  ];

  for (const { file, col } of jsonFiles) {
    const fpath = path.join(dataDir, file);
    if (fs.existsSync(fpath)) {
      const items = JSON.parse(fs.readFileSync(fpath, 'utf8'));
      const targetCol = db.collection(col);
      await targetCol.deleteMany({});
      if (items.length > 0) {
        await targetCol.insertMany(items);
        console.log(`✓ Inserted ${items.length} records into "${col}" collection`);
      }
    }
  }

  // Also create alias collection 'recovery_options'
  const recoveryCandidatesPath = path.join(dataDir, 'recovery_candidates.json');
  if (fs.existsSync(recoveryCandidatesPath)) {
    const recCandidates = JSON.parse(fs.readFileSync(recoveryCandidatesPath, 'utf8'));
    const recOptionsCol = db.collection('recovery_options');
    await recOptionsCol.deleteMany({});
    if (recCandidates.length > 0) {
      await recOptionsCol.insertMany(recCandidates);
      console.log(`✓ Inserted ${recCandidates.length} records into "recovery_options" collection`);
    }
  }

  // Verification
  console.log('\n========================================');
  console.log(`=== Verification for "${db.databaseName}" ===`);
  console.log('========================================');
  const allCollections = await db.listCollections().toArray();
  for (const c of allCollections.sort((a, b) => a.name.localeCompare(b.name))) {
    const count = await db.collection(c.name).countDocuments();
    console.log(`• ${c.name.padEnd(25)} : ${count} documents`);
  }

  await disconnectDb();
  console.log('\nDatabase disconnect complete. All data successfully pushed to MongoDB!');
}

// Auto-run if executed directly
if (process.argv[1] === __filename) {
  pushDataToMongo().catch((err) => {
    console.error('Failed to push data to MongoDB:', err);
    process.exit(1);
  });
}
