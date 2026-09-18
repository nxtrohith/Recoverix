import mongoose from 'mongoose';

let connecting;

/**
 * Connect once and reuse the default Mongoose connection.
 * Assumes a long-running Node process (not serverless); driver pool defaults apply.
 */
export async function connectDb() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error('MONGODB_URI is missing. Copy .env.example to .env and set your Atlas URI.');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connecting) {
    return connecting;
  }

  const dbName = process.env.MONGODB_DB_NAME?.trim() || 'hackathon';
  const user = process.env.MONGODB_USERNAME?.trim();
  const pass = process.env.MONGODB_PASSWORD?.trim();

  // Only pass user/pass when both are set (useful if URI uses placeholders).
  const options = {
    dbName,
    ...(user && pass ? { user, pass } : {}),
  };

  connecting = mongoose
    .connect(uri, options)
    .then(() => {
      connecting = undefined;
      return mongoose.connection;
    })
    .catch((err) => {
      connecting = undefined;
      throw err;
    });

  return connecting;
}

export function getDb() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB is not connected. Call connectDb() first.');
  }
  return mongoose.connection;
}

export async function disconnectDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export { mongoose };
