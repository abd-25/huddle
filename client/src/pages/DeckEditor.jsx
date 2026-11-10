import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Type, Square, Circle, Image as ImageIcon, Trash2, Copy, Play, Download, Bold, AlignLeft, AlignCenter, AlignRight, X } from 'lucide-react';
import { api } from '../api.js';
import { socket } from '../socket.js';
import logo from '../logo.png';

const W = 960, H = 540;
const uid = () => Math.random().toString(36).slice(2, 10);
const BGS = ['#ffffff', '#f8fafc', '#1e1b4b', '#111827', '#312e81', '#fef3c7', '#dcfce7', '#fce7f3'];

function Slide({ slide, scale, selected, editing, onSelect, onDrag, onEdit, onText, interactive }) {
  return (
    <div className="slide" style={{ width: W, height: H, background: slide.bg, transform: `scale(${scale})` }}
      onPointerDown={() => interactive && onSelect(null)}>
      {slide.elements.map((el) => {
        const sel = interactive && selected === el.id;
        const style = { left: el.x, top: el.y, width: el.w, height: el.h };
        return (
          <div key={el.id} className={'el' + (sel ? ' sel' : '')} style={style}
            onPointerDown={(e) => interactive && editing !== el.id && onDrag(e, el, 'move')}
            onDoubleClick={() => interactive && el.type === 'text' && onEdit(el.id)}>
            {el.type === 'text' && (
              <div className="el-text" contentEditable={editing === el.id} suppressContentEditableWarning
                style={{ fontSize: el.size, color: el.color, fontWeight: el.bold ? 700 : 400, textAlign: el.align }}
                onBlur={(e) => editing === el.id && onText(el.id, e.currentTarget.innerText)}
                ref={(n) => { if (n && editing === el.id && document.activeElement !== n) { n.focus(); } }}>
                {el.text}
              </div>
            )}
            {el.type === 'rect' && <div className="el-shape" style={{ background: el.fill, borderRadius: 8 }} />}
            {el.type === 'ellipse' && <div className="el-shape" style={{ background: el.fill, borderRadius: '50%' }} />}
            {el.type === 'image' && <img src={el.src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
            {sel && editing !== el.id && <i className="handle" onPointerDown={(e) => onDrag(e, el, 'resize')} />}
          </div>
        );
      })}
    </div>
  );
}

function Thumb({ slide, index, active, onClick, onDelete, canDelete }) {
  return (
    <div className={'thumb' + (active ? ' active' : '')} onClick={onClick}>
      <span className="thumb-n">{index + 1}</span>
      <div className="thumb-box"><Slide slide={slide} scale={150 / W} /></div>
      {canDelete && <button className="icon del" onClick={(e) => { e.stopPropagation(); onDelete(); }}><X size={13} /></button>}
    </div>
  );
}

export default function DeckEditor() {
  const { id } = useParams();
  const [title, setTitle] = useState('');
  const [slides, setSlides] = useState(null);
  const [cur, setCur] = useState(0);
  const [sel, setSel] = useState(null);
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState('Saved');
  const [present, setPresent] = useState(false);
  const [error, setError] = useState('');
  const [scale, setScale] = useState(0.8);
  const stage = useRef();
  const saveTimer = useRef();
  const latest = useRef({});
  const remoteApply = useRef(false);
  latest.current = { title, slides };

  const save = useCallback(async () => {
    try { await api(`/decks/${id}`, { method: 'PUT', body: latest.current }); setStatus('Saved'); }
    catch { setStatus('Save failed — retrying'); saveTimer.current = setTimeout(save, 3000); }
  }, [id]);

  const change = useCallback((fn) => {
    setSlides((prev) => {
      const next = fn(prev);
      latest.current = { ...latest.current, slides: next };
      socket.emit('deck:update', { id, slides: next, title: latest.current.title });
      return next;
    });
    setStatus('Saving…');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 1000);
  }, [id, save]);

  useEffect(() => {
    let alive = true;
    const join = () => socket.emit('deck:join', id);
    const onUpdate = (p) => {
      if (p.id !== id) return;
      setSlides(p.slides); if (p.title) setTitle(p.title);
    };
    api(`/decks/${id}`).then((d) => {
      if (!alive) return;
      setTitle(d.title); setSlides(d.slides);
      join(); socket.on('connect', join); socket.on('deck:update', onUpdate);
    }).catch(() => setError('This presentation could not be opened.'));
    return () => {
      alive = false;
      clearTimeout(saveTimer.current);
      if (latest.current.slides) api(`/decks/${id}`, { method: 'PUT', body: latest.current }).catch(() => {});
      socket.emit('deck:leave', id);
      socket.off('connect', join); socket.off('deck:update', onUpdate);
    };
  }, [id]);

  // fit the 960x540 stage into the available space
  useLayoutEffect(() => {
    if (!stage.current) return;
    const fit = () => {
      const r = stage.current.getBoundingClientRect();
      setScale(Math.max(0.2, Math.min((r.width - 48) / W, (r.height - 48) / H)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage.current);
    return () => ro.disconnect();
  }, [slides === null]);

  const slide = slides?.[Math.min(cur, (slides?.length || 1) - 1)];
  const selected = slide?.elements.find((e) => e.id === sel);

  const patchEl = (elId, patch) =>
    change((s) => s.map((sl, i) => (i !== cur ? sl : { ...sl, elements: sl.elements.map((e) => (e.id === elId ? { ...e, ...patch } : e)) })));
  const addEl = (el) => { const e = { id: uid(), ...el }; change((s) => s.map((sl, i) => (i !== cur ? sl : { ...sl, elements: [...sl.elements, e] }))); setSel(e.id); };
  const removeEl = () => { if (!sel) return; change((s) => s.map((sl, i) => (i !== cur ? sl : { ...sl, elements: sl.elements.filter((e) => e.id !== sel) }))); setSel(null); };

  function startDrag(e, el, mode) {
    e.stopPropagation();
    setSel(el.id);
    const sx = e.clientX, sy = e.clientY, ox = el.x, oy = el.y, ow = el.w, oh = el.h;
    const move = (ev) => {
      const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
      patchEl(el.id, mode === 'move' ? { x: Math.round(ox + dx), y: Math.round(oy + dy) } : { w: Math.max(30, Math.round(ow + dx)), h: Math.max(20, Math.round(oh + dy)) });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const addSlide = () => {
    change((s) => [...s.slice(0, cur + 1), { id: uid(), bg: slide?.bg || '#ffffff', elements: [
      { id: uid(), type: 'text', x: 60, y: 50, w: 840, h: 80, text: 'Slide title', size: 44, color: slide?.bg === '#1e1b4b' || slide?.bg === '#111827' || slide?.bg === '#312e81' ? '#ffffff' : '#1e1b4b', bold: true, align: 'left' },
      { id: uid(), type: 'text', x: 60, y: 150, w: 840, h: 300, text: 'Add your content here', size: 26, color: '#6b7280', bold: false, align: 'left' },
    ] }, ...s.slice(cur + 1)]);
    setCur(cur + 1); setSel(null);
  };
  const delSlide = (i) => { change((s) => s.filter((_, k) => k !== i)); setCur(Math.max(0, i - (i <= cur ? 1 : 0))); setSel(null); };

  // keyboard: delete selected, arrows to move through slides
  useEffect(() => {
    const onKey = (e) => {
      if (present || editing || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeEl(); }
      if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function exportPptx() {
    const { default: Pptx } = await import('pptxgenjs');
    const p = new Pptx();
    p.layout = 'LAYOUT_16x9'; // 10 x 5.625 in
    const k = 10 / W;
    slides.forEach((sl) => {
      const s = p.addSlide();
      s.background = { color: sl.bg.replace('#', '') };
      sl.elements.forEach((el) => {
        const pos = { x: el.x * k, y: el.y * k, w: el.w * k, h: el.h * k };
        if (el.type === 'text') s.addText(el.text, { ...pos, fontSize: Math.round(el.size * 0.75), color: (el.color || '#000').replace('#', ''), bold: !!el.bold, align: el.align || 'left', valign: 'top', margin: 0 });
        else if (el.type === 'rect') s.addShape(p.ShapeType.roundRect, { ...pos, fill: { color: el.fill.replace('#', '') }, line: { color: el.fill.replace('#', '') } });
        else if (el.type === 'ellipse') s.addShape(p.ShapeType.ellipse, { ...pos, fill: { color: el.fill.replace('#', '') }, line: { color: el.fill.replace('#', '') } });
        else if (el.type === 'image') s.addImage({ path: el.src, ...pos });
      });
    });
    p.writeFile({ fileName: `${title || 'presentation'}.pptx` });
  }

  if (error) return <div className="splash"><p>{error}</p><Link className="btn" to="/slides">Back to presentations</Link></div>;
  if (!slides) return <div className="splash"><div className="logo big"><img src={logo} alt="Huddle" /></div></div>;

  return (
    <div className="editor-page deck">
      <header className="editor-bar">
        <Link to="/slides" className="icon" title="Back"><ArrowLeft size={20} /></Link>
        <input className="title-input" value={title} onChange={(e) => { setTitle(e.target.value); latest.current.title = e.target.value; change((s) => s); }} placeholder="Untitled presentation" />
        <span className="muted small">{status}</span>
        <div className="grow" />
        <button className="btn small" onClick={exportPptx}><Download size={15} /> .pptx</button>
        <button className="btn small primary" onClick={() => setPresent(true)}><Play size={15} /> Present</button>
      </header>

      <div className="tools">
        <button onClick={addSlide}><Plus size={16} /> Slide</button>
        <span className="sep" />
        <button onClick={() => addEl({ type: 'text', x: 120, y: 200, w: 400, h: 70, text: 'New text', size: 32, color: '#1e1b4b', bold: false, align: 'left' })}><Type size={16} /> Text</button>
        <button onClick={() => addEl({ type: 'rect', x: 200, y: 180, w: 260, h: 160, fill: '#6366f1' })}><Square size={16} /> Box</button>
        <button onClick={() => addEl({ type: 'ellipse', x: 260, y: 160, w: 200, h: 200, fill: '#ec4899' })}><Circle size={16} /> Circle</button>
        <button onClick={() => { const src = prompt('Image URL (https://…)'); if (src) addEl({ type: 'image', x: 200, y: 120, w: 360, h: 270, src }); }}><ImageIcon size={16} /> Image</button>
        <span className="sep" />
        <label className="bgpick">Background
          {BGS.map((c) => <i key={c} className={slide.bg === c ? 'on' : ''} style={{ background: c }} onClick={() => change((s) => s.map((sl, i) => (i === cur ? { ...sl, bg: c } : sl)))} />)}
        </label>
        {selected && (
          <>
            <span className="sep" />
            {selected.type === 'text' ? (
              <>
                <input type="number" className="num" min={10} max={160} value={selected.size} onChange={(e) => patchEl(selected.id, { size: +e.target.value || 12 })} title="Font size" />
                <input type="color" value={selected.color} onChange={(e) => patchEl(selected.id, { color: e.target.value })} title="Text color" />
                <button className={selected.bold ? 'on' : ''} onClick={() => patchEl(selected.id, { bold: !selected.bold })}><Bold size={16} /></button>
                <button onClick={() => patchEl(selected.id, { align: 'left' })}><AlignLeft size={16} /></button>
                <button onClick={() => patchEl(selected.id, { align: 'center' })}><AlignCenter size={16} /></button>
                <button onClick={() => patchEl(selected.id, { align: 'right' })}><AlignRight size={16} /></button>
              </>
            ) : selected.fill ? <input type="color" value={selected.fill} onChange={(e) => patchEl(selected.id, { fill: e.target.value })} title="Fill" /> : null}
            <button onClick={() => { const c = { ...selected, id: uid(), x: selected.x + 24, y: selected.y + 24 }; change((s) => s.map((sl, i) => (i !== cur ? sl : { ...sl, elements: [...sl.elements, c] }))); setSel(c.id); }} title="Duplicate"><Copy size={16} /></button>
            <button onClick={removeEl} title="Delete"><Trash2 size={16} /></button>
          </>
        )}
      </div>

      <div className="deck-body">
        <div className="thumbs">
          {slides.map((s, i) => <Thumb key={s.id} slide={s} index={i} active={i === cur} canDelete={slides.length > 1} onClick={() => { setCur(i); setSel(null); setEditing(null); }} onDelete={() => delSlide(i)} />)}
        </div>
        <div className="stage" ref={stage}>
          <div className="stage-box" style={{ width: W * scale, height: H * scale }}>
            <Slide slide={slide} scale={scale} interactive selected={sel} editing={editing}
              onSelect={(v) => { setSel(v); setEditing(null); }} onDrag={startDrag}
              onEdit={setEditing} onText={(elId, t) => { patchEl(elId, { text: t }); setEditing(null); }} />
          </div>
        </div>
      </div>

      {present && <Presenter slides={slides} start={cur} onClose={() => setPresent(false)} />}
    </div>
  );
}

function Presenter({ slides, start, onClose }) {
  const [i, setI] = useState(start);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(innerWidth / W, innerHeight / H));
    fit(); addEventListener('resize', fit);
    document.documentElement.requestFullscreen?.().catch(() => {});
    const key = (e) => {
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) setI((n) => Math.min(slides.length - 1, n + 1));
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) setI((n) => Math.max(0, n - 1));
      if (e.key === 'Escape') onClose();
    };
    addEventListener('keydown', key);
    const fs = () => !document.fullscreenElement && onClose();
    document.addEventListener('fullscreenchange', fs);
    return () => {
      removeEventListener('resize', fit); removeEventListener('keydown', key);
      document.removeEventListener('fullscreenchange', fs);
      if (document.fullscreenElement) document.exitFullscreen?.();
    };
  }, []);
  return (
    <div className="presenter" onClick={() => setI((n) => Math.min(slides.length - 1, n + 1))}>
      <div style={{ width: W * scale, height: H * scale }}><Slide slide={slides[i]} scale={scale} /></div>
      <span className="pcount">{i + 1} / {slides.length}</span>
      <button className="icon pclose" onClick={(e) => { e.stopPropagation(); onClose(); }}><X size={20} /></button>
    </div>
  );
}
