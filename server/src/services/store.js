import mongoose from 'mongoose';
import { env } from '../config/env.js';

export const memory = { users: new Map(), cases: new Map() };
let mongoReady = false;
export async function connectDatabase() {
  if (env.MOCK_GEMINI) {
    mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 2000 }).then(() => { mongoReady = true; console.info('MongoDB connected.'); }).catch(() => console.info('MongoDB unavailable; using in-memory mock store.'));
    return;
  }
  await mongoose.connect(env.MONGODB_URI); mongoReady = true; console.info('MongoDB connected.');
}
export const isMongoReady = () => mongoReady;
