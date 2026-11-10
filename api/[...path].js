import app from '../server/src/app.js';
import { connectDatabase } from '../server/src/database.js';

export default async function handler(req, res) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('JWT_SECRET must be set to a secure value of at least 32 characters');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    await connectDatabase();
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    return res.status(503).json({ error: 'Database unavailable' });
  }

  return app(req, res);
}
