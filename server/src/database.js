import mongoose from 'mongoose';

let connectionPromise;

export function connectDatabase() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (mongoose.connection.readyState === 0) {
    connectionPromise = mongoose.connect(
      process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/huddle',
    ).then(() => undefined).catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  }
  return connectionPromise;
}
