import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Hash, Plus, Send, Smile, Reply, Pencil, Trash2, Search, Video, X } from 'lucide-react';
import { api } from '../api.js';
import { socket } from '../socket.js';
import { useApp } from '../state.jsx';
import { Avatar } from './Layout.jsx';

const QUICK = ['👍', '❤️', '😂', '🎉', '😮', '🙏'];
const PALETTE = ['😀', '😂', '🥹', '😍', '😎', '🤔', '😅', '🙌', '👏', '🔥', '💯', '✅', '🚀', '🎉', '👀', '💡', '❤️', '👍', '👎', '🙏', '😢', '😡', '🤝', '☕'];

function format(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s]+|@\w+)/g);
  return parts.map((p, i) => {
    if (/^\*\*.+\*\*$/.test(p)) return <b key={i}>{p.slice(2, -2)}</b>;
    if (/^`.+`$/.test(p)) return <code key={i}>{p.slice(1, -1)}</code>;
    if (/^https?:\/\//.test(p)) {
      const meet = p.includes('/meet/');
      return <a key={i} href={p} target={meet ? undefined : '_blank'} rel="noreferrer" className={meet ? 'join-link' : ''}>{meet ? '📹 Join meeting' : p}</a>;
    }
    if (/^@\w+/.test(p)) return <span key={i} className="mention">{p}</span>;
    return p;
  });
}

const timeOf = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayOf = (d) => {
  const x = new Date(d), t = new Date();
  if (x.toDateString() === t.toDateString()) return 'Today';
  t.setDate(t.getDate() - 1);
  return x.toDateString() === t.toDateString() ? 'Yesterday' : x.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
};

export default function Chat() {
  const { user, team, members, online } = useApp();
  const { channelId } = useParams();
  const nav = useNavigate();
  const [channels, setChannels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [typing, setTyping] = useState({});
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const bottom = useRef();
  const lastTyping = useRef(0);

  // load channels for the team
  useEffect(() => {
    if (!team) return;
    api(`/teams/${team.id}/channels`).then((list) => {
      setChannels(list);
      if (!channelId || !list.some((c) => c.id === channelId)) {
        const first = list.find((c) => c.type === 'channel') || list[0];
        if (first) nav('/chat/' + first.id, { replace: true });
      }
    });
  }, [team?.id]);

  const channel = channels.find((c) => c.id === channelId);
  const title = !channel ? '' : channel.type === 'dm'
    ? (channel.members.find((m) => m.id !== user.id) || channel.members[0])?.name || 'Direct message'
    : channel.name;

  // load messages + live updates for the open channel
  useEffect(() => {
    if (!channelId) return;
    setMessages([]); setReplyTo(null); setEditing(null); setTyping({}); setQuery(''); setSearching(false);
    api(`/channels/${channelId}/messages`).then(setMessages).catch(() => {});
    const join = () => socket.emit('channel:join', channelId);
    join();
    socket.on('connect', join);
    const onNew = (m) => m.channel === channelId && setMessages((p) => (p.some((x) => x._id === m._id) ? p : [...p, m]));
    const onUpd = (m) => setMessages((p) => p.map((x) => (x._id === m._id ? m : x)));
    const onTyping = ({ channelId: c, userId, name }) => {
      if (c !== channelId) return;
      setTyping((t) => ({ ...t, [userId]: { name, at: Date.now() } }));
    };
    socket.on('message:new', onNew);
    socket.on('message:update', onUpd);
    socket.on('typing', onTyping);
    return () => {
      socket.emit('channel:leave', channelId);
      socket.off('connect', join);
      socket.off('message:new', onNew);
      socket.off('message:update', onUpd);
      socket.off('typing', onTyping);
    };
  }, [channelId]);

  // expire typing indicators
  useEffect(() => {
    const t = setInterval(() => setTyping((cur) => {
      const next = Object.fromEntries(Object.entries(cur).filter(([, v]) => Date.now() - v.at < 3000));
      return Object.keys(next).length === Object.keys(cur).length ? cur : next;
    }), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, channelId]);

  function send(e) {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (editing) socket.emit('message:edit', { id: editing, text: t });
    else socket.emit('message:send', { channelId, text: t, replyTo: replyTo?._id });
    setText(''); setReplyTo(null); setEditing(null); setPicker(false);
  }

  function onType(v) {
    setText(v);
    if (Date.now() - lastTyping.current > 1500) { lastTyping.current = Date.now(); socket.emit('typing', { channelId }); }
  }

  function startMeeting() {
    const room = Math.random().toString(36).slice(2, 8);
    socket.emit('message:send', { channelId, text: `Started a meeting: ${location.origin}/meet/${room}` });
    nav('/meet/' + room);
  }

  async function addChannel() {
    const name = prompt('Channel name');
    if (!name) return;
    const c = await api(`/teams/${team.id}/channels`, { method: 'POST', body: { name } });
    setChannels((p) => [...p, c]); nav('/chat/' + c.id);
  }
  async function openDm(userId) {
    const c = await api(`/teams/${team.id}/dm`, { method: 'POST', body: { userId } });
    setChannels((p) => (p.some((x) => x.id === c.id) ? p : [...p, c]));
    nav('/chat/' + c.id);
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? messages.filter((m) => m.text.toLowerCase().includes(q) || m.sender?.name.toLowerCase().includes(q)) : messages;
  }, [messages, query]);

  const typers = Object.values(typing).map((t) => t.name);
  const others = members.filter((m) => m.id !== user.id);

  return (
    <div className="chat">
      <aside className="side">
        <div className="side-head"><span>Channels</span><button className="icon" onClick={addChannel} title="New channel"><Plus size={16} /></button></div>
        {channels.filter((c) => c.type === 'channel').map((c) => (
          <button key={c.id} className={'side-item' + (c.id === channelId ? ' active' : '')} onClick={() => nav('/chat/' + c.id)}>
            <Hash size={15} /> {c.name}
          </button>
        ))}
        <div className="side-head"><span>Direct messages</span></div>
        {others.map((m) => (
          <button key={m.id} className="side-item" onClick={() => openDm(m.id)}>
            <Avatar name={m.name} color={m.color} size={22} online={online.includes(m.id)} /> {m.name}
          </button>
        ))}
        {!others.length && <p className="muted small pad">Invite teammates with your team code to start a DM.</p>}
      </aside>

      <section className="thread">
        <div className="thread-head">
          <h3>{channel?.type === 'dm' ? '' : <Hash size={18} />}{title}</h3>
          <div className="row">
            {searching && <input autoFocus className="search" placeholder="Search messages" value={query} onChange={(e) => setQuery(e.target.value)} />}
            <button className="icon" onClick={() => { setSearching(!searching); setQuery(''); }} title="Search"><Search size={18} /></button>
            <button className="btn small primary" onClick={startMeeting}><Video size={15} /> Meet</button>
          </div>
        </div>

        <div className="messages">
          {shown.map((m, i) => {
            const prev = shown[i - 1];
            const newDay = !prev || dayOf(prev.createdAt) !== dayOf(m.createdAt);
            const grouped = !newDay && prev.sender?._id === m.sender?._id && !m.replyTo && new Date(m.createdAt) - new Date(prev.createdAt) < 5 * 60000;
            const mine = m.sender?._id === user.id;
            return (
              <React.Fragment key={m._id}>
                {newDay && <div className="day"><span>{dayOf(m.createdAt)}</span></div>}
                <div className={'msg' + (grouped ? ' grouped' : '') + (mine ? ' mine' : '')}>
                  <div className="gutter">{!grouped && <Avatar name={m.sender?.name} color={m.sender?.color} size={36} />}</div>
                  <div className="body">
                    {!grouped && <div className="meta"><b>{m.sender?.name}</b><span>{timeOf(m.createdAt)}</span></div>}
                    {m.replyTo && (
                      <div className="quote"><b>{m.replyTo.sender?.name}</b> {m.replyTo.deleted ? <i>Message deleted</i> : m.replyTo.text.slice(0, 120)}</div>
                    )}
                    {m.deleted ? <p className="deleted">This message was deleted</p> : (
                      <p>{format(m.text)}{m.edited && <em className="edited"> (edited)</em>}</p>
                    )}
                    {m.reactions?.length > 0 && (
                      <div className="reactions">
                        {m.reactions.map((r) => (
                          <button key={r.emoji} className={r.users.includes(user.id) ? 'mine' : ''} onClick={() => socket.emit('message:react', { id: m._id, emoji: r.emoji })}>
                            {r.emoji} <span>{r.users.length}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!m.deleted && (
                    <div className="actions">
                      {QUICK.map((e) => <button key={e} onClick={() => socket.emit('message:react', { id: m._id, emoji: e })}>{e}</button>)}
                      <button title="Reply" onClick={() => { setReplyTo(m); setEditing(null); }}><Reply size={15} /></button>
                      {mine && <button title="Edit" onClick={() => { setEditing(m._id); setText(m.text); setReplyTo(null); }}><Pencil size={15} /></button>}
                      {mine && <button title="Delete" onClick={() => confirm('Delete this message?') && socket.emit('message:delete', { id: m._id })}><Trash2 size={15} /></button>}
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
          {!shown.length && <div className="empty">{query ? 'No messages match your search.' : 'No messages yet — say hello 👋'}</div>}
          <div ref={bottom} />
        </div>

        <div className="typing">{typers.length ? `${typers.join(', ')} ${typers.length > 1 ? 'are' : 'is'} typing…` : ''}</div>

        <form className="composer" onSubmit={send}>
          {(replyTo || editing) && (
            <div className="composer-note">
              {editing ? 'Editing message' : <>Replying to <b>{replyTo.sender?.name}</b>: {replyTo.text.slice(0, 80)}</>}
              <button type="button" className="icon" onClick={() => { setReplyTo(null); setEditing(null); setText(''); }}><X size={14} /></button>
            </div>
          )}
          {picker && <div className="palette">{PALETTE.map((e) => <button type="button" key={e} onClick={() => setText((t) => t + e)}>{e}</button>)}</div>}
          <div className="composer-row">
            <button type="button" className="icon" onClick={() => setPicker(!picker)} title="Emoji"><Smile size={20} /></button>
            <textarea
              rows={1} value={text} placeholder={`Message ${channel?.type === 'dm' ? title : '#' + title} — **bold**, \`code\`, @mention`}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); if (e.key === 'Escape') { setReplyTo(null); setEditing(null); } }}
            />
            <button className="btn primary send" disabled={!text.trim()}><Send size={18} /></button>
          </div>
        </form>
      </section>
    </div>
  );
}
