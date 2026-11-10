import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { MessageSquare, Video, FileText, Presentation, LogOut, Copy, Plus, ChevronDown } from 'lucide-react';
import { useApp } from '../state.jsx';
import { api } from '../api.js';
import logo from '../logo.png';

export function Avatar({ name = '?', color = '#6366f1', size = 32, online }) {
  return (
    <span className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}>
      {name.trim()[0]?.toUpperCase()}
      {online !== undefined && <i className={'dot ' + (online ? 'on' : '')} />}
    </span>
  );
}

function Onboarding() {
  const { loadTeams, setTeamId, user } = useApp();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function create(e) {
    e.preventDefault(); setError('');
    try { const t = await api('/teams', { method: 'POST', body: { name } }); await loadTeams(); setTeamId(t.id); }
    catch (err) { setError(err.message); }
  }
  async function join(e) {
    e.preventDefault(); setError('');
    try { const t = await api('/teams/join', { method: 'POST', body: { code } }); await loadTeams(); setTeamId(t.id); }
    catch (err) { setError(err.message); }
  }
  return (
    <div className="onboard">
      <h2>Hi {user.name.split(' ')[0]} 👋</h2>
      <p className="muted">Create a team for your group, or join one with an invite code.</p>
      {error && <div className="error">{error}</div>}
      <div className="onboard-grid">
        <form className="card" onSubmit={create}>
          <h3>Create a team</h3>
          <input placeholder="Team name (e.g. Design Squad)" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn primary">Create team</button>
        </form>
        <form className="card" onSubmit={join}>
          <h3>Join with a code</h3>
          <input placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value)} required />
          <button className="btn">Join team</button>
        </form>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, signOut, teams, team, setTeamId, loadTeams } = useApp();
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(team.inviteCode);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  async function newTeam() {
    const name = prompt('New team name');
    if (!name) return;
    const t = await api('/teams', { method: 'POST', body: { name } });
    await loadTeams(); setTeamId(t.id); setMenu(false);
  }

  const links = [
    ['/chat', MessageSquare, 'Chat'],
    ['/meet', Video, 'Meet'],
    ['/docs', FileText, 'Docs'],
    ['/slides', Presentation, 'Slides'],
  ];

  return (
    <div className="app">
      <nav className="rail">
        <div className="logo"><img src={logo} alt="Huddle" /></div>
        {links.map(([to, Icon, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => 'rail-link' + (isActive ? ' active' : '')} title={label}>
            <Icon size={22} /><span>{label}</span>
          </NavLink>
        ))}
        <div className="grow" />
        <button className="rail-link" onClick={signOut} title="Sign out"><LogOut size={20} /><span>Exit</span></button>
        <Avatar name={user.name} color={user.color} />
      </nav>
      <div className="content">
        {team && (
          <header className="topbar">
            <div className="team-switch">
              <button className="team-btn" onClick={() => setMenu(!menu)}>{team.name} <ChevronDown size={16} /></button>
              {menu && (
                <div className="menu" onMouseLeave={() => setMenu(false)}>
                  {teams.map((t) => (
                    <button key={t.id} className={t.id === team.id ? 'sel' : ''} onClick={() => { setTeamId(t.id); setMenu(false); }}>{t.name}</button>
                  ))}
                  <hr />
                  <button onClick={newTeam}><Plus size={14} /> New team</button>
                </div>
              )}
            </div>
            <button className="chip" onClick={copy} title="Share this code so others can join">
              <Copy size={14} /> {copied ? 'Copied!' : `Invite code: ${team.inviteCode}`}
            </button>
          </header>
        )}
        <main className="main">{team ? <Outlet /> : <Onboarding />}</main>
      </div>
      <nav className="tabbar">
        {links.map(([to, Icon, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}><Icon size={20} /><span>{label}</span></NavLink>
        ))}
      </nav>
    </div>
  );
}
