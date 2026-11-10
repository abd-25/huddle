import 'dotenv/config';
import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { connectDatabase } from './database.js';
import { initSocket } from './socket.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a secure value of at least 32 characters');
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' },
});
initSocket(io);

const PORT = process.env.PORT || 5000;
try {
  await connectDatabase();
  console.log('MongoDB connected');
} catch (e) {
  console.error('MongoDB connection failed:', e.message);
  process.exit(1);
}
server.listen(PORT, () => console.log(`Huddle server on :${PORT}`));
