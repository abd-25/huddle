import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Presentation, Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../state.jsx';

const META = {
  docs: { label: 'Documents', single: 'document', path: '/docs', icon: FileText, blurb: 'Write together in real time. Everything saves automatically.' },
  decks: { label: 'Presentations', single: 'presentation', path: '/slides', icon: Presentation, blurb: 'Design slides, present full screen, or export to PowerPoint.' },
};

export default function Library({ kind }) {
  const { team } = useApp();
  const nav = useNavigate();
  const m = META[kind];
  const Icon = m.icon;
  const [items, setItems] = useState(null);

  useEffect(() => {
    setItems(null);
    api(`/teams/${team.id}/${kind}`).then(setItems).catch(() => setItems([]));
  }, [team.id, kind]);

  async function create() {
    const item = await api(`/teams/${team.id}/${kind}`, { method: 'POST', body: {} });
    nav(`${m.path}/${item._id}`);
  }
  async function remove(e, item) {
    e.stopPropagation();
    if (!confirm(`Delete "${item.title}"?`)) return;
    await api(`/${kind}/${item._id}`, { method: 'DELETE' });
    setItems((p) => p.filter((x) => x._id !== item._id));
  }

  return (
    <div className="library">
      <div className="library-head">
        <div><h2>{m.label}</h2><p className="muted">{m.blurb}</p></div>
        <button className="btn primary" onClick={create}><Plus size={16} /> New {m.single}</button>
      </div>
      {items === null ? <p className="muted">Loading…</p> : (
        <div className="cards">
          <button className="file new" onClick={create}><Plus size={28} /><span>Blank {m.single}</span></button>
          {items.map((it) => (
            <div key={it._id} className="file" onClick={() => nav(`${m.path}/${it._id}`)} role="button" tabIndex={0}>
              <div className="file-thumb"><Icon size={34} /></div>
              <div className="file-info">
                <b>{it.title}</b>
                <span>Edited {new Date(it.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}{it.updatedBy?.name ? ` by ${it.updatedBy.name.split(' ')[0]}` : ''}</span>
              </div>
              <button className="icon del" onClick={(e) => remove(e, it)} title="Delete"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
