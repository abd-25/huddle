import jwt from 'jsonwebtoken';
import { Channel, Team, Message } from './models.js';

const SECRET = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to a secure value of at least 32 characters');
  }
  return secret;
};

export const sign = (user) => jwt.sign({ id: user._id.toString() }, SECRET(), { expiresIn: '30d' });
export const verify = (token) => jwt.verify(token, SECRET());

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    req.user = verify(h.replace('Bearer ', ''));
    next();
  } catch {
    res.status(401).json({ error: 'Not signed in' });
  }
}

// Returns the channel if the user may access it, otherwise null
export async function canAccess(userId, channelId) {
  const ch = await Channel.findById(channelId).catch(() => null);
  if (!ch) return null;
  if (ch.type === 'dm') return ch.members.some((m) => m.equals(userId)) ? ch : null;
  const team = await Team.findById(ch.team).select('members');
  return team && team.members.some((m) => m.equals(userId)) ? ch : null;
}

export async function isMember(userId, teamId) {
  const team = await Team.findById(teamId).select('members').catch(() => null);
  return !!team && team.members.some((m) => m.equals(userId));
}

export const withMessageRefs = (q) =>
  q
    .populate('sender', 'name color')
    .populate({ path: 'replyTo', select: 'text sender deleted', populate: { path: 'sender', select: 'name' } });

export const getMessage = (id) => withMessageRefs(Message.findById(id));
