import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import routes from './routes.js';
import { initSocket } from './socket.js';

const CLIENT = process.env.CLIENT_URL || 'http://localhost:5173';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a secure value of at least 32 characters');
}

const app = express();
app.use(cors({ origin: CLIENT }));
app.use(express.json({ limit: '10mb' }));
app.get('/health', (_, res) => res.json({ ok: true }));
app.use('/api', routes);
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CLIENT } });
initSocket(io);

const PORT = process.env.PORT || 5000;
try {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/huddle');
  console.log('MongoDB connected');
} catch (e) {
  console.error('MongoDB connection failed:', e.message);
  process.exit(1);
}
server.listen(PORT, () => console.log(`Huddle server on :${PORT}`));
