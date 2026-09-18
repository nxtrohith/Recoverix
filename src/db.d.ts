import mongoose from 'mongoose';

export function connectDb(): Promise<typeof mongoose.connection>;
export function getDb(): typeof mongoose.connection;
export function disconnectDb(): Promise<void>;
export { mongoose };
