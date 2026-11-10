import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import routes from './routes.js';

const CLIENT = process.env.CLIENT_URL || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CLIENT }));
app.use(express.json({ limit: '10mb' }));
app.get('/health', (_, res) => res.json({ ok: true }));
app.get('/api/health', (_, res) => res.json({ ok: true }));
app.use('/api', routes);
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

export default app;
