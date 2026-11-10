import React, { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../state.jsx';
import { MessageSquare, Video, FileText, Presentation } from 'lucide-react';
import logo from '../logo.png';

export default function Auth() {
  const { signIn } = useApp();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      signIn(await api(`/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: form }));
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <div className="auth-hero  bg-linear-to-r from-cyan-500 to-blue-500">
        <div className="logo big"><img src={logo} alt="Huddle" /></div>
        <h1>Huddle</h1>
        <p>Chat, meet and create together — all in one calm workspace.</p>
        <ul>
          <li><MessageSquare size={18} /> Real-time chat with threads and reactions</li>
          <li><Video size={18} /> HD video meetings with screen sharing</li>
          <li><FileText size={18} /> Live collaborative documents</li>
          <li><Presentation size={18} /> Slide editor with PowerPoint export</li>
        </ul>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        {mode === 'register' && <input placeholder="Full name" value={form.name} onChange={set('name')} required />}
        <input type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
        <input type="password" placeholder="Password (6+ characters)" value={form.password} onChange={set('password')} required />
        {error && <div className="error">{error}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Sign up'}</button>
        <p className="muted center">
          {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); setError(''); setMode(mode === 'login' ? 'register' : 'login'); }}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </a>
        </p>
      </form>
    </div>
  );
}
