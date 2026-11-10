import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { api } from '../api.js';
import { socket } from '../socket.js';
import { Avatar } from './Layout.jsx';

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
  [{ align: [] }],
  ['blockquote', 'code-block', 'link', 'image'],
  ['clean'],
];

export default function DocEditor() {
  const { id } = useParams();
  const wrap = useRef();
  const quillRef = useRef(null);
  const titleRef = useRef('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('Saved');
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const saveTimer = useRef();

  const save = async () => {
    const q = quillRef.current;
    if (!q) return;
    try {
      await api(`/docs/${id}`, { method: 'PUT', body: { title: titleRef.current, content: q.getContents() } });
      setStatus('Saved');
    } catch { setStatus('Save failed — retrying'); saveTimer.current = setTimeout(save, 3000); }
  };
  const queueSave = () => { setStatus('Saving…'); clearTimeout(saveTimer.current); saveTimer.current = setTimeout(save, 1000); };

  useEffect(() => {
    let alive = true;
    let q;
    const onDelta = (p) => p.id === id && quillRef.current?.updateContents(p.delta, 'api');
    const onTitle = (p) => p.id === id && (titleRef.current = p.title, setTitle(p.title));
    const onUsers = (p) => p.id === id && setUsers(p.users);
    const join = () => socket.emit('doc:join', id);

    api(`/docs/${id}`).then((doc) => {
      if (!alive) return;
      titleRef.current = doc.title; setTitle(doc.title);
      const el = document.createElement('div');
      wrap.current.appendChild(el);
      q = new Quill(el, { theme: 'snow', placeholder: 'Start writing…', modules: { toolbar: TOOLBAR } });
      if (doc.content) q.setContents(doc.content);
      quillRef.current = q;
      q.on('text-change', (delta, _old, source) => {
        if (source !== 'user') return;
        socket.emit('doc:delta', { id, delta });
        queueSave();
      });
      join();
      socket.on('connect', join);
      socket.on('doc:delta', onDelta);
      socket.on('doc:title', onTitle);
      socket.on('doc:users', onUsers);
    }).catch(() => setError('This document could not be opened.'));

    return () => {
      alive = false;
      clearTimeout(saveTimer.current);
      if (quillRef.current) save();
      socket.emit('doc:leave', id);
      socket.off('connect', join);
      socket.off('doc:delta', onDelta);
      socket.off('doc:title', onTitle);
      socket.off('doc:users', onUsers);
      quillRef.current = null;
      if (wrap.current) wrap.current.innerHTML = '';
    };
  }, [id]);

  function rename(v) {
    setTitle(v); titleRef.current = v;
    socket.emit('doc:title', { id, title: v });
    queueSave();
  }

  function exportHtml() {
    const html = `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:sans-serif;max-width:800px;margin:40px auto;line-height:1.6">${quillRef.current.root.innerHTML}</body>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = `${title || 'document'}.html`;
    a.click();
  }

  if (error) return <div className="splash"><p>{error}</p><Link className="btn" to="/docs">Back to documents</Link></div>;

  return (
    <div className="editor-page">
      <header className="editor-bar">
        <Link to="/docs" className="icon" title="Back"><ArrowLeft size={20} /></Link>
        <input className="title-input" value={title} onChange={(e) => rename(e.target.value)} placeholder="Untitled document" />
        <span className="muted small">{status}</span>
        <div className="grow" />
        <div className="stack">{users.map((u) => <Avatar key={u.id} name={u.name} color={u.color} size={28} />)}</div>
        <button className="btn small" onClick={exportHtml}><Download size={15} /> Export</button>
        <button className="btn small" onClick={() => window.print()}><Printer size={15} /> Print</button>
      </header>
      <div className="doc-wrap" ref={wrap} />
    </div>
  );
}
