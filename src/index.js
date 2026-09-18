import 'dotenv/config';
import { connectDb, disconnectDb, mongoose } from './db.js';

async function main() {
  const conn = await connectDb();
  const { host, name } = conn;
  console.log(`MongoDB connected via Mongoose (db=${name}, host=${host})`);
  console.log(`readyState=${mongoose.connection.readyState}`);
  await disconnectDb();
}

main().catch((err) => {
  console.error('MongoDB connection failed:', err.message);
  process.exit(1);
});
