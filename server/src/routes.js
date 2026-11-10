import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User, Team, Channel, Message, Doc, Deck } from './models.js';
import { sign, requireAuth, canAccess, isMember, withMessageRefs } from './auth.js';

const r = Router();
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#3b82f6'];
const pub = (u) => ({ id: u._id, name: u.name, email: u.email, color: u.color });
const joinAttempts = new Map();

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function allowInviteJoin(req) {
  const key = `${req.user.id}:${clientIp(req)}`;
  const now = Date.now();
  const entry = joinAttempts.get(key) || { count: 0, resetAt: now + 60_000 };

  if (now >= entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 60_000;
  }

  if (entry.count >= 5) return false;
  entry.count += 1;
  joinAttempts.set(key, entry);
  return true;
}

async function generateInviteCode() {
  for (let i = 0; i < 10; i += 1) {
    const code = crypto.randomBytes(16).toString('hex').toUpperCase();
    if (!(await Team.exists({ inviteCode: code }))) return code;
  }
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

// ---------- auth ----------
r.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'Name, email and a password of 6+ characters are required' });
  if (await User.findOne({ email: email.toLowerCase() }))
    return res.status(409).json({ error: 'That email is already registered' });
  const user = await User.create({
    name, email, password: await bcrypt.hash(password, 10),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  });
  res.json({ token: sign(user), user: pub(user) });
});

r.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: (email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(password || '', user.password)))
    return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: sign(user), user: pub(user) });
});

r.get('/auth/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  res.json(pub(user));
});

// everything below needs a signed-in user
r.use(requireAuth);

// ---------- teams ----------
r.get('/teams', async (req, res) => {
  const teams = await Team.find({ members: req.user.id }).sort({ createdAt: 1 });
  res.json(teams.map((t) => ({ id: t._id, name: t.name, inviteCode: t.inviteCode, owner: t.owner })));
});

r.post('/teams', async (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Team name is required' });
  const inviteCode = await generateInviteCode();
  const team = await Team.create({
    name, owner: req.user.id, members: [req.user.id],
    inviteCode,
  });
  await Channel.create([
    { team: team._id, name: 'general' },
    { team: team._id, name: 'random' },
  ]);
  res.json({ id: team._id, name: team.name, inviteCode: team.inviteCode, owner: team.owner });
});

r.post('/teams/join', async (req, res) => {
  const code = (req.body?.code || '').trim().toUpperCase();
  if (!allowInviteJoin(req)) return res.status(429).json({ error: 'Too many join attempts. Please try again in a minute.' });
  const team = await Team.findOne({ inviteCode: code });
  if (!team) return res.status(404).json({ error: 'No team with that invite code' });
  await Team.updateOne({ _id: team._id }, { $addToSet: { members: req.user.id } });
  res.json({ id: team._id, name: team.name, inviteCode: team.inviteCode, owner: team.owner });
});

r.get('/teams/:id/members', async (req, res) => {
  if (!(await isMember(req.user.id, req.params.id))) return res.status(403).json({ error: 'Not a member' });
  const team = await Team.findById(req.params.id).populate('members', 'name email color');
  res.json(team.members.map(pub));
});

// ---------- channels ----------
r.get('/teams/:id/channels', async (req, res) => {
  if (!(await isMember(req.user.id, req.params.id))) return res.status(403).json({ error: 'Not a member' });
  const list = await Channel.find({
    team: req.params.id,
    $or: [{ type: 'channel' }, { type: 'dm', members: req.user.id }],
  }).populate('members', 'name color').sort({ createdAt: 1 });
  res.json(list.map((c) => ({
    id: c._id, name: c.name, type: c.type,
    members: c.members.map((m) => ({ id: m._id, name: m.name, color: m.color })),
  })));
});

r.post('/teams/:id/channels', async (req, res) => {
  if (!(await isMember(req.user.id, req.params.id))) return res.status(403).json({ error: 'Not a member' });
  const name = (req.body?.name || '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40);
  if (!name) return res.status(400).json({ error: 'Channel name is required' });
  const c = await Channel.create({ team: req.params.id, name });
  res.json({ id: c._id, name: c.name, type: c.type, members: [] });
});

r.post('/teams/:id/dm', async (req, res) => {
  const { userId } = req.body || {};
  if (!(await isMember(req.user.id, req.params.id)) || !(await isMember(userId, req.params.id)))
    return res.status(403).json({ error: 'Both people must be in the team' });
  let c = await Channel.findOne({
    team: req.params.id, type: 'dm',
    members: { $all: [req.user.id, userId], $size: req.user.id === userId ? 1 : 2 },
  });
  if (!c) c = await Channel.create({ team: req.params.id, type: 'dm', members: [...new Set([req.user.id, userId])] });
  await c.populate('members', 'name color');
  res.json({
    id: c._id, name: c.name, type: c.type,
    members: c.members.map((m) => ({ id: m._id, name: m.name, color: m.color })),
  });
});

// ---------- messages ----------
r.get('/channels/:id/messages', async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.id))) return res.status(403).json({ error: 'No access' });
  const q = { channel: req.params.id };
  if (req.query.before) q.createdAt = { $lt: new Date(req.query.before) };
  const msgs = await withMessageRefs(Message.find(q).sort({ createdAt: -1 }).limit(50));
  res.json(msgs.reverse());
});

// ---------- docs & decks (same shape) ----------
function library(path, Model, field, blank) {
  r.get(`/teams/:id/${path}`, async (req, res) => {
    if (!(await isMember(req.user.id, req.params.id))) return res.status(403).json({ error: 'Not a member' });
    const items = await Model.find({ team: req.params.id }).select('title updatedAt updatedBy createdBy')
      .populate('updatedBy', 'name').sort({ updatedAt: -1 });
    res.json(items);
  });
  r.post(`/teams/:id/${path}`, async (req, res) => {
    if (!(await isMember(req.user.id, req.params.id))) return res.status(403).json({ error: 'Not a member' });
    const item = await Model.create({
      team: req.params.id, title: req.body?.title || undefined,
      [field]: blank, createdBy: req.user.id, updatedBy: req.user.id,
    });
    res.json(item);
  });
  r.get(`/${path}/:id`, async (req, res) => {
    const item = await Model.findById(req.params.id).catch(() => null);
    if (!item || !(await isMember(req.user.id, item.team))) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  });
  r.put(`/${path}/:id`, async (req, res) => {
    const item = await Model.findById(req.params.id).catch(() => null);
    if (!item || !(await isMember(req.user.id, item.team))) return res.status(404).json({ error: 'Not found' });
    if (typeof req.body.title === 'string') item.title = req.body.title.slice(0, 200) || item.title;
    if (req.body[field] !== undefined) { item[field] = req.body[field]; item.markModified(field); }
    item.updatedBy = req.user.id;
    await item.save();
    res.json({ ok: true, updatedAt: item.updatedAt });
  });
  r.delete(`/${path}/:id`, async (req, res) => {
    const item = await Model.findById(req.params.id).catch(() => null);
    if (!item || !(await isMember(req.user.id, item.team))) return res.status(404).json({ error: 'Not found' });
    await item.deleteOne();
    res.json({ ok: true });
  });
}

const blankSlides = () => [{
  id: crypto.randomUUID(), bg: '#ffffff',
  elements: [
    { id: crypto.randomUUID(), type: 'text', x: 80, y: 180, w: 800, h: 100, text: 'Presentation title', size: 56, color: '#1e1b4b', bold: true, align: 'left' },
    { id: crypto.randomUUID(), type: 'text', x: 80, y: 290, w: 800, h: 60, text: 'Click to edit subtitle', size: 26, color: '#6b7280', bold: false, align: 'left' },
  ],
}];

library('docs', Doc, 'content', null);
library('decks', Deck, 'slides', blankSlides());

export default r;
