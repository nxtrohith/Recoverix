import 'dotenv/config';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import { connectDb, mongoose } from './db.js';
import { Location, Route, Vehicle } from './models/index.js';

const app = express();
app.use(cors());

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', dbConnected: mongoose.connection.readyState === 1 });
});

app.get('/api/vehicles', async (_req: Request, res: Response) => {
  const vehicles = await Vehicle.find({});
  res.json(vehicles);
});

app.get('/api/routes', async (_req: Request, res: Response) => {
  const routes = await Route.find({});
  res.json(routes);
});

app.get('/api/locations', async (_req: Request, res: Response) => {
  const locations = await Location.find({});
  res.json(locations);
});

app.get('/api/telangana-nodes', async (_req: Request, res: Response) => {
  const nodes = await mongoose.connection.db!.collection('telangana_nodes').find({}).toArray();
  res.json(nodes);
});

app.get('/api/telangana-edges', async (_req: Request, res: Response) => {
  const edges = await mongoose.connection.db!.collection('telangana_edges').find({}).toArray();
  res.json(edges);
});

async function main() {
  await connectDb();
  console.log(`MongoDB connected (db=${mongoose.connection.name})`);

  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

main().catch((err) => {
  console.error('Server failed to start:', err.message);
  process.exit(1);
});
