import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Copy, Users } from 'lucide-react';
import { socket } from '../socket.js';
import { useApp } from '../state.jsx';

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

function newRoomCode() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function meetingCode(value) {
  let path = value.trim();
  try { path = new URL(path).pathname; } catch {}
  const code = path.replace(/\/+$/, '').split('/').pop();
  return /^[a-z0-9_-]{1,64}$/i.test(code) ? code.toLowerCase() : '';
}

function Tile({ stream, name, muted, camOff, self }) {
  const ref = useRef();
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null; }, [stream]);
  return (
    <div className={'tile' + (self ? ' self' : '')}>
      <video ref={ref} autoPlay playsInline muted={self} className={camOff ? 'hidden' : ''} style={self ? { transform: 'scaleX(-1)' } : undefined} />
      {camOff && <div className="tile-off"><span>{name?.[0]?.toUpperCase()}</span></div>}
      <div className="tile-name">{muted && <MicOff size={13} />} {self ? 'You' : name}</div>
    </div>
  );
}

function Lobby() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="lobby">
      <div className="card">
        <div className="lobby-icon"><Video size={30} /></div>
        <h2>Start or join a meeting</h2>
        <p className="muted">Meet with your Huddle teammates. Share the meeting link to invite them.</p>
        <button className="btn primary wide" onClick={() => nav('/meet/' + newRoomCode())}>New meeting</button>
        <div className="or"><span>or join with a code</span></div>
        <form onSubmit={(e) => {
          e.preventDefault();
          const parsed = meetingCode(code);
          if (!parsed) return setError('Enter a valid meeting code or invite link.');
          setError('');
          nav('/meet/' + parsed);
        }} className="row">
          <input aria-label="Meeting code or link" placeholder="Meeting code or invite link" value={code} onChange={(e) => { setCode(e.target.value); setError(''); }} />
          <button className="btn">Join</button>
        </form>
        {error && <div className="error" role="alert">{error}</div>}
      </div>
    </div>
  );
}

function Room({ room }) {
  const nav = useNavigate();
  const { user } = useApp();
  const [phase, setPhase] = useState('lobby'); // lobby -> live
  const [local, setLocal] = useState(null);
  const [mediaStatus, setMediaStatus] = useState('loading');
  const [mediaWarning, setMediaWarning] = useState('');
  const [error, setError] = useState('');
  const [remote, setRemote] = useState({}); // id -> { stream, name, muted, camOff }
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const pcs = useRef({});
  const localRef = useRef(null);
  const cameraTrack = useRef(null);
  const screenTrack = useRef(null);
  const pendingCandidates = useRef({});
  const callState = useRef({ muted: false, camOff: false });

  // camera preview
  useEffect(() => {
    let stop = false;
    async function prepareMedia() {
      if (!navigator.mediaDevices?.getUserMedia) {
        callState.current = { muted: true, camOff: true };
        setMediaWarning('Camera and microphone access requires HTTPS or localhost. You can still join the meeting.');
        setMediaStatus('unavailable');
        setCamOff(true);
        setMuted(true);
        return;
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch {
        try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
        catch {
          try { stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true }); }
          catch {}
        }
      }

      if (stop) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!stream) {
        callState.current = { muted: true, camOff: true };
        setMediaWarning('Camera or microphone permission was unavailable. You can still join without them.');
        setMediaStatus('unavailable');
        setCamOff(true);
        setMuted(true);
        return;
      }
      localRef.current = stream;
      cameraTrack.current = stream.getVideoTracks()[0] || null;
      callState.current = { muted: !stream.getAudioTracks().length, camOff: !stream.getVideoTracks().length };
      setLocal(stream);
      setCamOff(!stream.getVideoTracks().length);
      setMuted(!stream.getAudioTracks().length);
      if (!stream.getVideoTracks().length || !stream.getAudioTracks().length) {
        setMediaWarning('Joining with the devices that are available.');
      }
      setMediaStatus('ready');
    }

    prepareMedia();
    return () => {
      stop = true;
      localRef.current?.getTracks().forEach((track) => track.stop());
      if (screenTrack.current) {
        screenTrack.current.onended = null;
        screenTrack.current.stop();
      }
      localRef.current = null;
      cameraTrack.current = null;
      screenTrack.current = null;
    };
  }, [room]);

  const makePeer = useCallback((id, name, initiator, initialState = {}) => {
    const pc = new RTCPeerConnection(ICE);
    pcs.current[id] = pc;
    const stream = localRef.current;
    stream?.getTracks().forEach((track) => pc.addTrack(track, stream));
    if (!stream?.getVideoTracks().length) pc.addTransceiver('video', { direction: 'sendrecv' });
    pc.ontrack = (e) => setRemote((r) => ({ ...r, [id]: { ...r[id], name, stream: e.streams[0] } }));
    pc.onicecandidate = (e) => e.candidate && socket.emit('call:signal', { to: id, data: { candidate: e.candidate } });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') setError(`Could not connect to ${name}. Try leaving and rejoining the meeting.`);
    };
    if (initiator) {
      pc.onnegotiationneeded = async () => {
        try {
          await pc.setLocalDescription(await pc.createOffer());
          socket.emit('call:signal', { to: id, data: { sdp: pc.localDescription } });
        } catch {
          setError(`Could not start a connection with ${name}.`);
        }
      };
    }
    setRemote((r) => ({ ...r, [id]: { ...r[id], ...initialState, name } }));
    return pc;
  }, []);

  const closePeer = (id) => {
    pcs.current[id]?.close(); delete pcs.current[id];
    delete pendingCandidates.current[id];
    setRemote((r) => { const n = { ...r }; delete n[id]; return n; });
  };

  function join() {
    setError('');
    setPhase('live');
  }

  useEffect(() => {
    if (phase !== 'live') return;
    const onPeers = (list) => list.forEach((p) => makePeer(p.id, p.name, true, p));
    const onJoined = ({ id, name, muted, camOff }) => setRemote((r) => ({ ...r, [id]: { ...r[id], name, muted, camOff } }));
    const onLeft = ({ id }) => closePeer(id);
    const onState = ({ id, muted, camOff }) => setRemote((r) => (r[id] ? { ...r, [id]: { ...r[id], muted, camOff } } : r));
    const onSignal = async ({ from, name, data }) => {
      let pc = pcs.current[from] || makePeer(from, name, false);
      try {
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp);
          const candidates = pendingCandidates.current[from] || [];
          delete pendingCandidates.current[from];
          for (const candidate of candidates) await pc.addIceCandidate(candidate);
          if (data.sdp.type === 'offer') {
            await pc.setLocalDescription(await pc.createAnswer());
            socket.emit('call:signal', { to: from, data: { sdp: pc.localDescription } });
          }
        } else if (data.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
          else (pendingCandidates.current[from] ||= []).push(data.candidate);
        }
      } catch {
        setError(`Could not establish a connection with ${name}. Please try rejoining.`);
      }
    };
    const onConnect = () => {
      setConnected(true);
      setError('');
      socket.emit('call:join', room);
      socket.emit('call:state', callState.current);
    };
    const onDisconnect = () => {
      setConnected(false);
      Object.keys(pcs.current).forEach(closePeer);
      setRemote({});
    };
    const onConnectError = () => setError('Could not connect to the meeting server. Reconnecting…');
    const onFull = () => { setError('This meeting is full (8 people max).'); setPhase('lobby'); };
    const onCallError = ({ error: message }) => setError(message || 'Could not join this meeting.');

    socket.on('call:peers', onPeers);
    socket.on('call:peer-joined', onJoined);
    socket.on('call:peer-left', onLeft);
    socket.on('call:state', onState);
    socket.on('call:signal', onSignal);
    socket.on('call:full', onFull);
    socket.on('call:error', onCallError);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    setConnected(socket.connected);
    if (socket.connected) onConnect();
    return () => {
      socket.emit('call:leave');
      socket.off('call:peers', onPeers);
      socket.off('call:peer-joined', onJoined);
      socket.off('call:peer-left', onLeft);
      socket.off('call:state', onState);
      socket.off('call:signal', onSignal);
      socket.off('call:full', onFull);
      socket.off('call:error', onCallError);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      Object.keys(pcs.current).forEach(closePeer);
    };
  }, [phase, makePeer]);

  const broadcast = (m, c) => {
    callState.current = { muted: m, camOff: c };
    socket.emit('call:state', callState.current);
  };

  function toggleMic() {
    const next = !muted;
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next); broadcast(next, camOff);
  }
  function toggleCam() {
    const next = !camOff;
    cameraTrack.current && (cameraTrack.current.enabled = !next);
    setCamOff(next); broadcast(muted, next);
  }

  async function swapVideo(track) {
    await Promise.all(Object.values(pcs.current).map(async (pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
        || pc.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender;
      if (sender) await sender.replaceTrack(track);
    }));
  }
  async function toggleShare() {
    if (sharing) return stopShare();
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        setError('Screen sharing is not available in this browser.');
        return;
      }
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = screen.getVideoTracks()[0];
      screenTrack.current = track;
      track.onended = stopShare;
      try { await swapVideo(track); }
      catch (err) {
        track.stop();
        screenTrack.current = null;
        throw err;
      }
      setLocal(new MediaStream([track, ...(localRef.current?.getAudioTracks() || [])]));
      setSharing(true);
      broadcast(muted, false);
      setError('');
    } catch (err) {
      if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') setError('Could not start screen sharing. Check your browser permissions and try again.');
    }
  }
  async function stopShare() {
    const track = screenTrack.current;
    screenTrack.current = null;
    if (track) {
      track.onended = null;
      track.stop();
    }
    try { await swapVideo(cameraTrack.current || null); }
    catch { setError('Screen sharing stopped, but your camera could not be restored.'); }
    setLocal(localRef.current);
    setSharing(false);
    broadcast(muted, camOff);
  }

  function leave() { nav('/meet'); }
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/meet/${room}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy the invite link. Copy the meeting code from the address bar instead.');
    }
  }

  if (phase === 'lobby') {
    return (
      <div className="lobby">
        <div className="card prejoin">
          <h2>Ready to join?</h2>
          <p className="muted">Meeting code <b>{room}</b></p>
          <div className="preview"><Tile stream={local} name={user.name} self camOff={camOff} muted={muted} /></div>
          {mediaStatus === 'loading' && <p className="muted" role="status">Preparing camera and microphone…</p>}
          {mediaWarning && <p className="media-warning" role="status">{mediaWarning}</p>}
          {error && <div className="error">{error}</div>}
          <div className="controls static">
            <button className={'ctl' + (muted ? ' off' : '')} onClick={toggleMic} disabled={!local?.getAudioTracks().length} title="Microphone unavailable">{muted ? <MicOff size={20} /> : <Mic size={20} />}</button>
            <button className={'ctl' + (camOff ? ' off' : '')} onClick={toggleCam} disabled={!cameraTrack.current} title="Camera unavailable">{camOff ? <VideoOff size={20} /> : <Video size={20} />}</button>
          </div>
          <button className="btn primary wide" onClick={join} disabled={mediaStatus === 'loading'}>{mediaStatus === 'loading' ? 'Preparing…' : 'Join now'}</button>
          <button className="btn ghost wide" onClick={leave}>Cancel</button>
        </div>
      </div>
    );
  }

  const peers = Object.entries(remote);
  const count = peers.length + 1;
  return (
    <div className="call">
      <div className="call-top">
        <span className="chip"><Users size={14} /> {count} in call · {connected ? 'Connected' : 'Reconnecting…'}</span>
        <button className="chip" onClick={copy}><Copy size={14} /> {copied ? 'Link copied' : `Copy invite link`}</button>
      </div>
      {(error || mediaWarning) && <div className="call-notice" role="status">{error || mediaWarning}</div>}
      <div className={'grid n' + Math.min(count, 6)}>
        <Tile stream={local} name={user.name} self muted={muted} camOff={camOff && !sharing} />
        {peers.map(([id, p]) => <Tile key={id} stream={p.stream} name={p.name} muted={p.muted} camOff={p.camOff} />)}
      </div>
      <div className="controls">
        <button className={'ctl' + (muted ? ' off' : '')} onClick={toggleMic} disabled={!local?.getAudioTracks().length} title={local?.getAudioTracks().length ? 'Mute' : 'Microphone unavailable'}>{muted ? <MicOff size={22} /> : <Mic size={22} />}</button>
        <button className={'ctl' + (camOff ? ' off' : '')} onClick={toggleCam} disabled={!cameraTrack.current} title={cameraTrack.current ? 'Camera' : 'Camera unavailable'}>{camOff ? <VideoOff size={22} /> : <Video size={22} />}</button>
        <button className={'ctl' + (sharing ? ' on' : '')} onClick={toggleShare} title="Share screen"><MonitorUp size={22} /></button>
        <button className="ctl end" onClick={leave} title="Leave"><PhoneOff size={22} /></button>
      </div>
    </div>
  );
}

export default function Meet() {
  const { room } = useParams();
  return room ? <Room key={room} room={room} /> : <Lobby />;
}
