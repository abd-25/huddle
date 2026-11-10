import { verify, canAccess, isMember, getMessage } from './auth.js';
import { Message, User, Doc, Deck } from './models.js';

const online = new Map(); // userId -> number of open sockets
const callRooms = new Map(); // room -> Map(socketId -> participant state)

export function initSocket(io) {
  io.use(async (socket, next) => {
    try {
      const { id } = verify(socket.handshake.auth?.token || '');
      const user = await User.findById(id).select('name color');
      if (!user) throw new Error('no user');
      socket.user = { id, name: user.name, color: user.color };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  const emitDocUsers = async (docId) => {
    const sockets = await io.in('doc:' + docId).fetchSockets();
    const seen = new Map();
    sockets.forEach((s) => seen.set(s.user.id, { id: s.user.id, name: s.user.name, color: s.user.color }));
    io.to('doc:' + docId).emit('doc:users', { id: docId, users: [...seen.values()] });
  };

  const leaveCall = (socket, room) => {
    if (!room) return;
    const peers = callRooms.get(room);
    if (!peers || !peers.delete(socket.id)) {
      if (socket.data.callRoom === room) socket.data.callRoom = null;
      return;
    }
    socket.leave('call:' + room);
    socket.to('call:' + room).emit('call:peer-left', { id: socket.id });
    if (!peers.size) callRooms.delete(room);
    if (socket.data.callRoom === room) socket.data.callRoom = null;
  };

  io.on('connection', (socket) => {
    const uid = socket.user.id;
    online.set(uid, (online.get(uid) || 0) + 1);
    io.emit('presence', [...online.keys()]);
    socket.emit('presence', [...online.keys()]);

    // ----- chat -----
    socket.on('channel:join', async (channelId) => {
      if (await canAccess(uid, channelId)) socket.join('ch:' + channelId);
    });
    socket.on('channel:leave', (channelId) => socket.leave('ch:' + channelId));

    socket.on('message:send', async ({ channelId, text, replyTo } = {}, ack) => {
      text = String(text || '').trim().slice(0, 4000);
      if (!text || !(await canAccess(uid, channelId))) return ack?.({ error: 'Could not send' });

      const reply = replyTo ? await Message.findById(replyTo).select('channel deleted').catch(() => null) : null;
      if (reply && (reply.deleted || reply.channel.toString() !== String(channelId))) {
        return ack?.({ error: 'Could not send' });
      }

      const m = await Message.create({ channel: channelId, sender: uid, text, replyTo: reply ? reply._id : undefined });
      io.to('ch:' + channelId).emit('message:new', await getMessage(m._id));
      ack?.({ ok: true });
    });

    socket.on('message:edit', async ({ id, text } = {}) => {
      text = String(text || '').trim().slice(0, 4000);
      const m = await Message.findById(id);
      if (!m || !text || m.deleted || !m.sender.equals(uid)) return;
      m.text = text; m.edited = true; await m.save();
      io.to('ch:' + m.channel).emit('message:update', await getMessage(m._id));
    });

    socket.on('message:delete', async ({ id } = {}) => {
      const m = await Message.findById(id);
      if (!m || !m.sender.equals(uid)) return;
      m.deleted = true; m.text = ''; m.reactions = []; await m.save();
      io.to('ch:' + m.channel).emit('message:update', await getMessage(m._id));
    });

    socket.on('message:react', async ({ id, emoji } = {}) => {
      const m = await Message.findById(id);
      if (!m || m.deleted || !emoji || !(await canAccess(uid, m.channel))) return;
      let r = m.reactions.find((x) => x.emoji === emoji);
      if (!r) { m.reactions.push({ emoji, users: [uid] }); }
      else if (r.users.some((u) => u.equals(uid))) {
        r.users = r.users.filter((u) => !u.equals(uid));
        if (!r.users.length) m.reactions = m.reactions.filter((x) => x.emoji !== emoji);
      } else r.users.push(uid);
      await m.save();
      io.to('ch:' + m.channel).emit('message:update', await getMessage(m._id));
    });

    socket.on('typing', ({ channelId } = {}) => {
      socket.to('ch:' + channelId).emit('typing', { channelId, userId: uid, name: socket.user.name });
    });

    // ----- collaborative docs -----
    socket.on('doc:join', async (id) => {
      const doc = await Doc.findById(id).select('team').catch(() => null);
      if (!doc || !(await isMember(uid, doc.team))) return;
      socket.join('doc:' + id);
      emitDocUsers(id);
    });
    socket.on('doc:leave', (id) => { socket.leave('doc:' + id); emitDocUsers(id); });
    socket.on('doc:delta', ({ id, delta } = {}) => {
      if (socket.rooms.has('doc:' + id)) socket.to('doc:' + id).emit('doc:delta', { id, delta });
    });
    socket.on('doc:title', ({ id, title } = {}) => {
      if (socket.rooms.has('doc:' + id)) socket.to('doc:' + id).emit('doc:title', { id, title });
    });

    // ----- collaborative decks (whole-slide sync, last write wins) -----
    socket.on('deck:join', async (id) => {
      const deck = await Deck.findById(id).select('team').catch(() => null);
      if (!deck || !(await isMember(uid, deck.team))) return;
      socket.join('deck:' + id);
    });
    socket.on('deck:leave', (id) => socket.leave('deck:' + id));
    socket.on('deck:update', ({ id, slides, title } = {}) => {
      if (socket.rooms.has('deck:' + id)) socket.to('deck:' + id).emit('deck:update', { id, slides, title });
    });

    // ----- meetings: WebRTC signaling (mesh) -----
    socket.on('call:join', (room) => {
      room = String(room || '').trim().toLowerCase();
      if (!/^[a-z0-9_-]{1,64}$/.test(room)) {
        socket.emit('call:error', { error: 'Invalid meeting code.' });
        return;
      }
      if (socket.data.callRoom === room) return;
      if (socket.data.callRoom) leaveCall(socket, socket.data.callRoom);
      if (!callRooms.has(room)) callRooms.set(room, new Map());
      const peers = callRooms.get(room);
      if (peers.size >= 8) return socket.emit('call:full');
      const existing = [...peers.entries()].map(([id, p]) => ({ id, ...p }));
      peers.set(socket.id, { name: socket.user.name, muted: false, camOff: false });
      socket.join('call:' + room);
      socket.data.callRoom = room;
      socket.emit('call:peers', existing);
      socket.to('call:' + room).emit('call:peer-joined', { id: socket.id, ...peers.get(socket.id) });
    });
    socket.on('call:leave', () => leaveCall(socket, socket.data.callRoom));
    socket.on('call:signal', ({ to, data } = {}) => {
      const room = socket.data.callRoom;
      const peers = room && callRooms.get(room);
      if (
        !room ||
        typeof to !== 'string' ||
        !data ||
        typeof data !== 'object' ||
        !peers?.has(socket.id) ||
        !peers.has(to)
      ) return;
      io.to(to).emit('call:signal', { from: socket.id, name: socket.user.name, data });
    });
    socket.on('call:state', ({ muted, camOff } = {}) => {
      const room = socket.data.callRoom;
      const peer = room && callRooms.get(room)?.get(socket.id);
      if (!peer) return;
      peer.muted = Boolean(muted);
      peer.camOff = Boolean(camOff);
      socket.to('call:' + room).emit('call:state', { id: socket.id, muted: peer.muted, camOff: peer.camOff });
    });

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) if (room.startsWith('doc:')) setTimeout(() => emitDocUsers(room.slice(4)), 50);
    });
    socket.on('disconnect', () => {
      if (socket.data.callRoom) leaveCall(socket, socket.data.callRoom);
      const n = (online.get(uid) || 1) - 1;
      if (n <= 0) online.delete(uid); else online.set(uid, n);
      io.emit('presence', [...online.keys()]);
    });
  });
}
