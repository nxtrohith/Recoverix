import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDb, disconnectDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../data');

export async function pushDataToMongo() {
  console.log('Connecting to MongoDB...');
  const conn = await connectDb();
  const db = conn.db;

  // Load raw JSON files without adding or altering any data
  const districtCoordinates = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'district_coordinates.json'), 'utf8')
  );
  const districts = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'districts.json'), 'utf8')
  );
  const hubs = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'hubs.json'), 'utf8')
  );
  const recoveryCandidates = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'recovery_candidates.json'), 'utf8')
  );

  console.log(`Loaded from data files:`);
  console.log(`- District Coordinates: ${districtCoordinates.length} records`);
  console.log(`- Districts: ${districts.length} records`);
  console.log(`- Hubs: ${hubs.length} records`);
  console.log(`- Recovery Candidates: ${recoveryCandidates.length} records`);

  // Target collections
  const datasets = [
    { name: 'district_coordinates', data: districtCoordinates },
    { name: 'districts', data: districts },
    { name: 'hubs', data: hubs },
    { name: 'recovery_candidates', data: recoveryCandidates },
  ];

  for (const { name, data } of datasets) {
    const col = db.collection(name);
    // Clear any previous documents to keep data exact and idempotent
    await col.deleteMany({});
    // Insert exact records
    const result = await col.insertMany(data);
    console.log(`Inserted ${result.insertedCount} documents into collection "${name}"`);
  }

  // Verify collections and counts in MongoDB
  console.log('\n--- MongoDB Verification ---');
  const collections = await db.listCollections().toArray();
  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`- ${col.name} (${col.type || 'collection'}): ${count} documents`);
  }

  await disconnectDb();
  console.log('\nDatabase disconnect complete. Data successfully pushed.');
}

// Run directly if invoked
if (process.argv[1] === __filename) {
  pushDataToMongo().catch((err) => {
    console.error('Failed to push data to MongoDB:', err);
    process.exit(1);
  });
}
