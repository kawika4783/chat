import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowLeft, Camera, Check, ClipboardList, Clock3, Disc3, FileImage, FileVideo, ImagePlus, LayoutDashboard, LockKeyhole, LogOut, Menu, MessageCircle, Mic, MicOff, Monitor, Moon, Palette, Phone, PhoneOff, Play, RefreshCw, Save, Search, Send, Settings, ShieldCheck, Sparkles, Square, Sun, Upload, UserPlus, Users, Video, VideoOff, Wifi, WifiOff, X } from 'lucide-react';
import { io } from 'socket.io-client';
import { createClientId } from './clientId.js';
import { createClientBackgroundProcessor } from './clientBackground.js';

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Something went wrong');
  return body;
}

function initials(name = '?') {
  return name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

async function contactPhotoData(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP photo');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error('That photo could not be opened'));
      candidate.src = objectUrl;
    });
    const render = (size, quality) => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      canvas.getContext('2d').drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      return canvas.toDataURL('image/jpeg', quality);
    };
    const first = render(192, 0.78);
    return first.length <= 80 * 1024 ? first : render(160, 0.65);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const BUILT_IN_GIFS = [
  { id: 'hello', emoji: '👋', label: 'Hello', colors: ['#246bfe', '#53d8ff'] },
  { id: 'laugh', emoji: '😂', label: 'Laughing', colors: ['#0b8fc7', '#2f7bff'] },
  { id: 'love', emoji: '❤️', label: 'Love it', colors: ['#d93675', '#ff6b8f'] },
  { id: 'wow', emoji: '🤩', label: 'Amazing', colors: ['#7257ff', '#2f7bff'] },
  { id: 'yes', emoji: '👍', label: 'Yes', colors: ['#128a66', '#36d98a'] },
  { id: 'party', emoji: '🎉', label: 'Celebrate', colors: ['#7e4eff', '#53d8ff'] },
];

const BUILT_IN_GIF_IDS = new Set(BUILT_IN_GIFS.map(item => item.id));
const DEFAULT_MEDIA_SETTINGS = { background: 'none', customBackground: '', character: 'none' };

async function messageMediaData(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, WebP, or GIF image');
  }
  if (file.type === 'image/gif') {
    if (file.size > 1.4 * 1024 * 1024) throw new Error('GIFs must be smaller than 1.4 MB');
    return { kind: 'gif', dataUrl: await fileToDataUrl(file), name: file.name.slice(0, 120) };
  }
  const dataUrl = await resizedImageData(file, 1280, 0.82);
  if (dataUrl.length > 1.6 * 1024 * 1024) throw new Error('That image is too large after resizing');
  return { kind: 'image', dataUrl, name: file.name.slice(0, 120) };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('That file could not be opened'));
    reader.readAsDataURL(file);
  });
}

async function resizedImageData(file, maxDimension, quality) {
  const source = await fileToDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const candidate = new Image();
    candidate.onload = () => resolve(candidate);
    candidate.onerror = () => reject(new Error('That image could not be opened'));
    candidate.src = source;
  });
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function BuiltInGif({ id }) {
  const gif = BUILT_IN_GIFS.find(item => item.id === id) || BUILT_IN_GIFS[0];
  return <span className="live-built-in-gif" style={{ '--gif-a': gif.colors[0], '--gif-b': gif.colors[1] }} role="img" aria-label={gif.label}><b>{gif.emoji}</b><small>{gif.label}</small></span>;
}

function LiveAvatar({ user, size = 'md' }) {
  return <span className={`live-avatar live-avatar-${size}`} aria-hidden="true">
    {user?.avatar ? <img src={user.avatar} alt="" /> : initials(user?.name)}
    {user?.status ? <i className={`live-presence ${user.status}`} /> : null}
  </span>;
}

function LiveAuth({ onAuthenticated }) {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('+1');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [developmentCode, setDevelopmentCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const requestCode = async event => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await api('/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) });
      setDevelopmentCode(result.developmentCode || '');
      if (result.developmentCode) setCode(result.developmentCode);
      setStep('code');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async event => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, code, displayName }) });
      onAuthenticated(result.user);
    } catch (verifyError) {
      setError(verifyError.message);
    } finally {
      setBusy(false);
    }
  };

  return <main className="live-auth">
    <section className="live-auth-card">
      <div className="live-logo"><MessageCircle size={25} /><strong>Halo</strong></div>
      <p className="live-eyebrow">Persistent realtime messaging</p>
      <h1>{step === 'phone' ? 'Sign in to Halo' : 'Check your code'}</h1>
      <p className="live-muted">{step === 'phone' ? 'Use an international phone number. New numbers create an account.' : `We created a six-digit code for ${phone}.`}</p>
      <form onSubmit={step === 'phone' ? requestCode : verifyCode}>
        {step === 'phone' ? <>
          <label>Display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Your name" autoComplete="name" /></label>
          <label>Phone number<input value={phone} onChange={event => setPhone(event.target.value)} placeholder="+15551234567" autoComplete="tel" /></label>
        </> : <label>Verification code<input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" /></label>}
        {developmentCode ? <p className="live-dev-code">Development code: <strong>{developmentCode}</strong></p> : null}
        {error ? <p className="live-error" role="alert">{error}</p> : null}
        <button className="live-primary" disabled={busy}>{busy ? 'Please wait…' : step === 'phone' ? 'Send code' : 'Open Halo'}</button>
        {step === 'code' ? <button className="live-link" type="button" onClick={() => { setStep('phone'); setError(''); }}>Use a different number</button> : null}
      </form>
      <p className="live-security"><ShieldCheck size={16} /> Sessions use an HTTP-only cookie; verification codes expire after five minutes.</p>
    </section>
  </main>;
}

function ConversationButton({ conversation, active, onClick }) {
  const participant = conversation.participant;
  return <button className={`live-conversation${active ? ' active' : ''}`} onClick={onClick}>
    <LiveAvatar user={participant} />
    <span><strong>{participant?.name || 'Conversation'}</strong><small>{conversation.lastMessage?.text || 'Start the conversation'}</small></span>
    <time>{conversation.lastMessage ? new Date(conversation.lastMessage.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</time>
  </button>;
}

function emitWithAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Realtime connection is unavailable'));
    socket.timeout(8000).emit(event, payload, (error, response) => {
      if (error) return reject(new Error('The call server did not respond'));
      if (!response?.ok) return reject(new Error(response?.error || 'Call request failed'));
      resolve(response);
    });
  });
}

function useAudioAlerts() {
  const contextRef = useRef(null);
  const ringtoneTimerRef = useRef(null);

  const getContext = useCallback(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!contextRef.current) contextRef.current = new AudioContext();
    if (contextRef.current.state === 'suspended') contextRef.current.resume().catch(() => {});
    return contextRef.current;
  }, []);

  const beep = useCallback((frequency, delay = 0, duration = 0.16, volume = 0.075) => {
    const context = getContext();
    if (!context) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }, [getContext]);

  const stopRingtone = useCallback(() => {
    clearInterval(ringtoneTimerRef.current);
    ringtoneTimerRef.current = null;
  }, []);

  const startRingtone = useCallback(kind => {
    stopRingtone();
    const ring = () => {
      if (kind === 'incoming') {
        beep(659, 0, 0.22, 0.1);
        beep(784, 0.28, 0.24, 0.1);
      } else {
        beep(440, 0, 0.22, 0.055);
        beep(440, 0.34, 0.22, 0.055);
      }
    };
    ring();
    ringtoneTimerRef.current = setInterval(ring, kind === 'incoming' ? 2200 : 2800);
  }, [beep, stopRingtone]);

  const playMessage = useCallback(() => {
    beep(880, 0, 0.11, 0.055);
    beep(1175, 0.12, 0.14, 0.05);
  }, [beep]);

  useEffect(() => {
    const unlock = () => getContext();
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      stopRingtone();
      contextRef.current?.close().catch(() => {});
    };
  }, [getContext, stopRingtone]);

  return { startRingtone, stopRingtone, playMessage };
}

function useCallController(socket, user, onError, audioAlerts, mediaSettings) {
  const [call, setCall] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [recording, setRecording] = useState(null);
  const callRef = useRef(null);
  const roomRef = useRef(null);
  const videoProcessorRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => { callRef.current = call; }, [call]);
  useEffect(() => { if (localVideoRef.current) localVideoRef.current.srcObject = localStream; }, [call, localStream]);
  useEffect(() => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream; }, [call, remoteStream]);

  useEffect(() => {
    if (call?.status === 'incoming') audioAlerts.startRingtone('incoming');
    else if (call?.status === 'ringing') audioAlerts.startRingtone('outgoing');
    else audioAlerts.stopRingtone();
    return audioAlerts.stopRingtone;
  }, [audioAlerts.startRingtone, audioAlerts.stopRingtone, call?.status]);

  const cleanup = useCallback(() => {
    callRef.current = null;
    const room = roomRef.current;
    roomRef.current = null;
    videoProcessorRef.current?.destroy().catch(() => {});
    videoProcessorRef.current = null;
    room?.disconnect();
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false); setCameraOff(false); setRecording(null); setCall(null);
  }, []);

  const connectMediaRoom = useCallback(async activeCall => {
    if (roomRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support media calling');
    const [credentials, livekit] = await Promise.all([api(`/calls/${activeCall.callId}/join`), import('livekit-client')]);
    const { Room, RoomEvent, Track } = livekit;
    if (callRef.current?.callId !== activeCall.callId) throw Object.assign(new Error('Call ended while connecting'), { name: 'AbortError' });
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    remoteStreamRef.current = new MediaStream();
    room.on(RoomEvent.TrackSubscribed, track => {
      remoteStreamRef.current?.addTrack(track.mediaStreamTrack);
      setRemoteStream(new MediaStream(remoteStreamRef.current?.getTracks() || []));
    });
    room.on(RoomEvent.TrackUnsubscribed, track => {
      remoteStreamRef.current?.removeTrack(track.mediaStreamTrack);
      setRemoteStream(new MediaStream(remoteStreamRef.current?.getTracks() || []));
    });
    room.on(RoomEvent.Disconnected, () => {
      if (callRef.current?.callId === activeCall.callId) {
        socket?.emit('call:end', { callId: activeCall.callId, reason: 'media-disconnected' });
        cleanup();
      }
    });
    room.on(RoomEvent.ParticipantDisconnected, () => {
      if (callRef.current?.callId === activeCall.callId) {
        socket?.emit('call:end', { callId: activeCall.callId, reason: 'participant-disconnected' });
        cleanup();
      }
    });
    await room.connect(credentials.url, credentials.token);
    await room.localParticipant.setMicrophoneEnabled(true);
    if (activeCall.type === 'video') await room.localParticipant.setCameraEnabled(true, {
      resolution: { width: 1920, height: 1080, frameRate: 30 }, frameRate: 30, facingMode: 'user',
    }, { videoEncoding: livekit.VideoPresets.h1080.encoding, simulcast: true });
    if (callRef.current?.callId !== activeCall.callId) {
      room.disconnect();
      throw Object.assign(new Error('Call ended while media permission was pending'), { name: 'AbortError' });
    }
    const cameraTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
    if (cameraTrack && activeCall.type === 'video' && mediaSettings.background !== 'none') {
      const processor = createClientBackgroundProcessor(mediaSettings);
      await cameraTrack.setProcessor(processor, true);
      videoProcessorRef.current = processor;
    }
    const tracks = [
      room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack,
      videoProcessorRef.current?.processedTrack || cameraTrack?.mediaStreamTrack,
    ].filter(Boolean);
    setLocalStream(new MediaStream(tracks));
    setCall(current => current ? { ...current, status: 'connected', recordingAvailable: credentials.recordingAvailable } : current);
    socket.emit('call:connected', { callId: activeCall.callId });
  }, [cleanup, mediaSettings, socket]);

  const endCall = useCallback((reason = 'ended') => {
    const activeCall = callRef.current;
    if (activeCall?.callId && socket?.connected) socket.emit('call:end', { callId: activeCall.callId, reason });
    cleanup();
  }, [cleanup, socket]);

  const startCall = useCallback(async (participant, type) => {
    if (callRef.current) return;
    try {
      const response = await emitWithAck(socket, 'call:initiate', { recipientId: participant.id, type });
      const nextCall = { ...response.call, participant, direction: 'outgoing', status: 'ringing' };
      callRef.current = nextCall;
      setCall(nextCall);
    } catch (error) { onError(error.message); }
  }, [onError, socket]);

  const acceptCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall) return;
    setCall(current => ({ ...current, status: 'connecting' }));
    try {
      await emitWithAck(socket, 'call:accept', { callId: activeCall.callId });
      await connectMediaRoom(activeCall);
    } catch (error) {
      if (error.name === 'AbortError') return;
      onError(error.message);
      socket?.emit('call:reject', { callId: activeCall.callId });
      cleanup();
    }
  }, [cleanup, connectMediaRoom, onError, socket]);

  const rejectCall = useCallback(() => {
    const activeCall = callRef.current;
    if (activeCall?.callId && socket?.connected) socket.emit('call:reject', { callId: activeCall.callId });
    cleanup();
  }, [cleanup, socket]);

  useEffect(() => {
    if (!socket) return undefined;
    const onIncoming = event => {
      if (callRef.current) { socket.emit('call:reject', { callId: event.callId }); return; }
      const nextCall = { ...event, participant: event.caller, direction: 'incoming', status: 'incoming' };
      callRef.current = nextCall;
      setCall(nextCall);
    };
    const onAccepted = async event => {
      const activeCall = callRef.current;
      if (!activeCall || activeCall.callId !== event.callId) return;
      setCall(current => ({ ...current, status: 'connecting' }));
      try { await connectMediaRoom(activeCall); }
      catch (error) {
        if (error.name === 'AbortError') return;
        onError(error.message);
        endCall('media-error');
      }
    };
    const onConnected = event => {
      if (callRef.current?.callId === event.callId) setCall(current => ({ ...current, status: 'connected' }));
    };
    const onEnded = event => { if (callRef.current?.callId === event.callId) cleanup(); };
    const onRecordingStarted = event => { if (callRef.current?.callId === event.callId) setRecording(event); };
    const onRecordingStopped = event => { if (callRef.current?.callId === event.callId) setRecording(null); };
    const onRecordingFailed = event => {
      if (callRef.current?.callId !== event.callId) return;
      setRecording(null);
      onError('Video recording could not be started. The call will continue without recording.');
    };
    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:connected', onConnected);
    socket.on('call:ended', onEnded);
    socket.on('recording:started', onRecordingStarted);
    socket.on('recording:stopped', onRecordingStopped);
    socket.on('recording:failed', onRecordingFailed);
    return () => {
      socket.off('call:incoming', onIncoming); socket.off('call:accepted', onAccepted);
      socket.off('call:connected', onConnected); socket.off('call:ended', onEnded);
      socket.off('recording:started', onRecordingStarted); socket.off('recording:stopped', onRecordingStopped); socket.off('recording:failed', onRecordingFailed);
    };
  }, [cleanup, connectMediaRoom, endCall, onError, socket]);

  useEffect(() => () => cleanup(), [cleanup]);

  const toggleMute = async () => {
    const next = !muted;
    await roomRef.current?.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  };
  const toggleCamera = async () => {
    const next = !cameraOff;
    await roomRef.current?.localParticipant.setCameraEnabled(!next);
    setCameraOff(next);
  };

  const toggleRecording = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall?.callId || activeCall.status !== 'connected') return;
    try {
      await emitWithAck(socket, recording ? 'recording:stop' : 'recording:start', { callId: activeCall.callId });
    } catch (error) { onError(error.message); }
  }, [onError, recording, socket]);

  return { call, recording, startCall, acceptCall, rejectCall, endCall, muted, cameraOff, toggleMute, toggleCamera, toggleRecording, localVideoRef, remoteVideoRef, mediaSettings };
}

function LiveCallOverlay({ controller }) {
  const { call, recording, acceptCall, rejectCall, endCall, muted, cameraOff, toggleMute, toggleCamera, toggleRecording, localVideoRef, remoteVideoRef, mediaSettings } = controller;
  if (!call) return null;
  const isIncoming = call.status === 'incoming';
  const isVideo = call.type === 'video';
  return <section className={`live-call${isVideo ? ' video' : ''}`} role="dialog" aria-label={`${isIncoming ? 'Incoming' : 'Active'} ${call.type} call`}>
    {isVideo ? <video className="live-call-remote" ref={remoteVideoRef} autoPlay playsInline /> : null}
    <button className="live-call-close" onClick={() => endCall('closed')} title="End call"><X size={20} /></button>
    <div className="live-call-person"><LiveAvatar user={call.participant} size="xl" /><h1>{call.participant?.name}</h1><p>{isIncoming ? `Incoming ${call.type} call` : call.status === 'ringing' ? 'Calling…' : call.status === 'connecting' ? 'Connecting securely…' : 'Connected'}</p></div>
    {isVideo ? <div className={`live-call-local background-${mediaSettings.background}`} style={mediaSettings.background === 'custom' && mediaSettings.customBackground ? { backgroundImage: `url(${mediaSettings.customBackground})` } : undefined}><video ref={localVideoRef} muted autoPlay playsInline />{cameraOff ? <VideoOff /> : <Camera />} {mediaSettings.background !== 'none' ? <small className="live-local-processing">Browser processed</small> : null}</div> : null}
    {isVideo && recording ? <div className="live-recording-notice active" role="status"><i />This video call is being recorded by {recording.startedBy?.id === call.participant?.id ? call.participant?.name : 'you'} · Admin access only</div> : null}
    <div className="live-call-controls">
      {isIncoming ? <>
        <button className="decline" onClick={rejectCall}><PhoneOff /><span>Decline</span></button>
        <button className="accept" onClick={acceptCall}><Phone /><span>Accept</span></button>
      </> : <>
        <button onClick={toggleMute}>{muted ? <MicOff /> : <Mic />}<span>{muted ? 'Unmute' : 'Mute'}</span></button>
        {isVideo ? <button onClick={toggleCamera}>{cameraOff ? <VideoOff /> : <Video />}<span>{cameraOff ? 'Camera on' : 'Camera off'}</span></button> : null}
        {isVideo && call.recordingAvailable ? <button className={recording ? 'recording-active' : ''} onClick={toggleRecording}>{recording ? <Square /> : <Disc3 />}<span>{recording ? 'Stop record' : 'Record'}</span></button> : null}
        <button className="decline" onClick={() => endCall('hangup')}><PhoneOff /><span>End</span></button>
      </>}
    </div>
  </section>;
}

function MessageContent({ message }) {
  const media = message.media;
  if (media?.stickerId && BUILT_IN_GIF_IDS.has(media.stickerId)) return <BuiltInGif id={media.stickerId} />;
  if (media?.url || media?.dataUrl) return <figure className="live-message-media"><img src={media.url || media.dataUrl} alt={media.name || (media.kind === 'gif' ? 'Shared GIF' : 'Shared image')} /><figcaption>{message.text || (media.kind === 'gif' ? 'GIF' : 'Photo')}</figcaption></figure>;
  return message.text;
}

function MediaSettingsPanel({ settings, setSettings, onClose, onError }) {
  const backgroundInput = useRef(null);
  const chooseBackground = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const customBackground = await resizedImageData(file, 1280, 0.78);
      setSettings(current => ({ ...current, background: 'custom', customBackground }));
    } catch (error) { onError(error.message); }
  };
  return <div className="live-settings-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="live-media-settings" role="dialog" aria-modal="true" aria-label="Camera effects settings">
      <header><span><Settings size={19} /><strong>Camera effects</strong></span><button onClick={onClose} title="Close settings"><X size={19} /></button></header>
      <div className="live-settings-section"><h2>Background</h2><p>Choose what appears behind you during video calls.</p><div className="live-effect-grid">
        {[['none', 'Off'], ['studio', 'Blue studio'], ['midnight', 'Midnight'], ['blur', 'Blur']].map(([id, label]) => <button key={id} className={settings.background === id ? 'selected' : ''} onClick={() => setSettings(current => ({ ...current, background: id }))}><i className={`background-swatch ${id}`} /><span>{label}</span>{settings.background === id ? <Check size={15} /> : null}</button>)}
        <button className={settings.background === 'custom' ? 'selected' : ''} onClick={() => backgroundInput.current?.click()}><i className="background-swatch custom" style={settings.customBackground ? { backgroundImage: `url(${settings.customBackground})` } : undefined}><Upload size={18} /></i><span>Upload image</span>{settings.background === 'custom' ? <Check size={15} /> : null}</button>
      </div><input ref={backgroundInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseBackground} hidden />
      <div className="live-feature-note"><ShieldCheck size={17} /><span><strong>Processed locally in your browser</strong>Background effects stay on this device. No video frames are uploaded to a third-party service or sent to Google.</span></div></div>
      <div className="live-settings-section"><h2>Character filters</h2><p>Use an animated character that follows your face, mouth, and movement.</p><div className="live-character-grid">
        {['Robot', 'Fox', 'Space explorer'].map(label => <button key={label} disabled><Sparkles size={20} /><span>{label}</span><small>Engine required</small></button>)}
      </div><div className="live-feature-note"><LockKeyhole size={17} /><span><strong>No third-party calls</strong>This requires a dedicated self-hosted avatar engine and GPU. Real-person likenesses must be user-owned or used with verified permission.</span></div></div>
    </section>
  </div>;
}

function LiveMessenger({ user, onLogout }) {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [typingUserId, setTypingUserId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const [error, setError] = useState('');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [mediaSettings, setMediaSettings] = useState(() => {
    try { return { ...DEFAULT_MEDIA_SETTINGS, ...JSON.parse(localStorage.getItem('halo.media-settings.v1') || '{}') }; }
    catch { return DEFAULT_MEDIA_SETTINGS; }
  });
  const socketRef = useRef(null);
  const selectedIdRef = useRef(selectedId);
  const typingTimerRef = useRef(null);
  const photoInputRef = useRef(null);
  const messageMediaInputRef = useRef(null);
  const showError = useCallback(message => setError(message), []);
  const audioAlerts = useAudioAlerts();
  const callController = useCallController(socket, user, showError, audioAlerts, mediaSettings);

  useEffect(() => {
    try { localStorage.setItem('halo.media-settings.v1', JSON.stringify(mediaSettings)); } catch {}
  }, [mediaSettings]);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const loadConversations = useCallback(async () => {
    const result = await api('/conversations');
    setConversations(result.conversations);
    setSelectedId(current => current || result.conversations[0]?.id || null);
  }, []);

  useEffect(() => {
    loadConversations().catch(loadError => setError(loadError.message));
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    api(`/conversations/${selectedId}/messages`).then(result => setMessages(result.messages)).catch(loadError => setError(loadError.message));
  }, [selectedId]);

  useEffect(() => {
    const socket = io({ path: '/socket.io', withCredentials: true });
    socketRef.current = socket;
    setSocket(socket);
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', connectionError => setError(connectionError.message));
    socket.on('message:new', message => {
      if (message.sender.id !== user.id) audioAlerts.playMessage();
      if (message.conversationId === selectedIdRef.current) {
        setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message]);
      }
      loadConversations().catch(() => {});
    });
    socket.on('typing:start', event => {
      if (event.conversationId === selectedIdRef.current && event.userId !== user.id) setTypingUserId(event.userId);
    });
    socket.on('typing:stop', event => {
      if (event.conversationId === selectedIdRef.current && event.userId !== user.id) setTypingUserId(null);
    });
    socket.on('presence:update', event => {
      setConversations(current => current.map(conversation => conversation.participant?.id === event.userId
        ? { ...conversation, participant: { ...conversation.participant, status: event.status } }
        : conversation));
    });
    return () => { socket.disconnect(); socketRef.current = null; setSocket(null); };
  }, [audioAlerts.playMessage, loadConversations, user.id]);

  useEffect(() => () => clearTimeout(typingTimerRef.current), []);

  const searchUsers = async event => {
    event.preventDefault();
    setSearching(true); setError('');
    try {
      const result = await api(`/users?query=${encodeURIComponent(query)}`);
      setUsers(result.users);
    } catch (searchError) {
      setError(searchError.message);
    } finally {
      setSearching(false);
    }
  };

  const startConversation = async targetId => {
    try {
      const result = await api('/conversations/direct', { method: 'POST', body: JSON.stringify({ userId: targetId }) });
      await loadConversations();
      setSelectedId(result.conversation.id);
      setMobileChatOpen(true);
      setQuery(''); setUsers([]);
    } catch (startError) {
      setError(startError.message);
    }
  };

  const sendMessage = async event => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !selectedId) return;
    setDraft(''); setError('');
    socketRef.current?.emit('typing:stop', { conversationId: selectedId });
    try {
      await api(`/conversations/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text, clientId: createClientId() }),
      });
    } catch (sendError) {
      setDraft(text); setError(sendError.message);
    }
  };

  const sendMedia = async media => {
    if (!selectedId) return;
    setSendingMedia(true); setError(''); setGifOpen(false);
    try {
      await api(`/conversations/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: '', media, clientId: createClientId() }),
      });
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setSendingMedia(false);
    }
  };

  const uploadMessageMedia = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { await sendMedia(await messageMediaData(file)); }
    catch (mediaError) { setError(mediaError.message); }
  };

  const updateDraft = event => {
    const value = event.target.value;
    setDraft(value);
    if (!selectedId || !socketRef.current) return;
    socketRef.current.emit(value ? 'typing:start' : 'typing:stop', { conversationId: selectedId });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => socketRef.current?.emit('typing:stop', { conversationId: selectedId }), 900);
  };

  const updateContactPhoto = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selected?.participant?.id) return;
    setError('');
    try {
      const photo = await contactPhotoData(file);
      const result = await api(`/contacts/${selected.participant.id}/photo`, { method: 'PUT', body: JSON.stringify({ photo }) });
      setConversations(current => current.map(conversation => conversation.participant?.id === result.contactId
        ? { ...conversation, participant: { ...conversation.participant, avatar: result.avatar } }
        : conversation));
    } catch (photoError) {
      setError(photoError.message);
    }
  };

  const selected = conversations.find(conversation => conversation.id === selectedId);

  return <main className="live-shell">
    <aside className="live-sidebar">
      <header><div className="live-logo"><MessageCircle size={23} /><strong>Halo</strong></div><button className="live-icon" onClick={onLogout} title="Sign out"><LogOut size={18} /></button></header>
      <div className="live-me"><LiveAvatar user={{ ...user, status: connected ? 'online' : 'offline' }} /><span><strong>{user.name}</strong><small>{connected ? <><Wifi size={12} /> Realtime connected</> : <><WifiOff size={12} /> Reconnecting</>}</small></span></div>
      <form className="live-search" onSubmit={searchUsers}><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find people" /><button title="Search" disabled={searching}><UserPlus size={17} /></button></form>
      {users.length ? <div className="live-user-results">{users.map(result => <button key={result.id} onClick={() => startConversation(result.id)}><LiveAvatar user={result} size="sm" /><span><strong>{result.name}</strong><small>Halo member</small></span><MessageCircle size={17} /></button>)}</div> : null}
      <div className="live-conversation-list">{conversations.map(conversation => <ConversationButton key={conversation.id} conversation={conversation} active={conversation.id === selectedId} onClick={() => { setSelectedId(conversation.id); setMobileChatOpen(true); }} />)}</div>
    </aside>
    <section className={`live-chat${mobileChatOpen ? ' mobile-open' : ''}`}>
      {selected ? <>
        <header><button className="live-mobile-back" type="button" onClick={() => setMobileChatOpen(false)} title="Back to conversations"><ArrowLeft size={21} /></button><LiveAvatar user={selected.participant} /><span><strong>{selected.participant?.name}</strong><small>{selected.participant?.status || 'offline'}</small></span><div className="live-chat-actions"><input ref={photoInputRef} className="live-photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={updateContactPhoto} /><button title="Set contact photo" onClick={() => photoInputRef.current?.click()}><ImagePlus size={18} /></button><button title="Camera effects" onClick={() => setSettingsOpen(true)}><Settings size={18} /></button><button title="Voice call" onClick={() => callController.startCall(selected.participant, 'voice')}><Phone size={18} /></button><button title="Video call" onClick={() => callController.startCall(selected.participant, 'video')}><Video size={19} /></button></div></header>
        <div className="live-messages" aria-live="polite">
          {messages.map(message => <article className={`${message.sender.id === user.id ? 'mine' : ''}${message.media ? ' has-media' : ''}`} key={message.id}><div><MessageContent message={message} /></div><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></article>)}
          {typingUserId ? <div className="live-typing" aria-label={`${selected.participant?.name} is typing`}><i /><i /><i /></div> : null}
        </div>
        <div className="live-composer-wrap">
          {gifOpen ? <section className="live-gif-picker" aria-label="Built-in GIFs"><header><strong>GIFs</strong><small>Built in · no external service</small><button type="button" onClick={() => setGifOpen(false)}><X size={17} /></button></header><div>{BUILT_IN_GIFS.map(gif => <button type="button" key={gif.id} onClick={() => sendMedia({ kind: 'gif', stickerId: gif.id, name: gif.label })}><BuiltInGif id={gif.id} /></button>)}</div></section> : null}
          <form className="live-composer" onSubmit={sendMessage}>
            <input ref={messageMediaInputRef} className="live-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadMessageMedia} />
            <button className="live-composer-option" type="button" title="Send an image or GIF" disabled={sendingMedia} onClick={() => messageMediaInputRef.current?.click()}><FileImage size={19} /></button>
            <button className={`live-composer-option${gifOpen ? ' active' : ''}`} type="button" title="Choose a built-in GIF" disabled={sendingMedia} onClick={() => setGifOpen(current => !current)}><span className="gif-label">GIF</span></button>
            <input value={draft} onChange={updateDraft} placeholder={sendingMedia ? 'Sending media…' : `Message ${selected.participant?.name}`} aria-label="Message" />
            <button className="live-send-button" disabled={!draft.trim() || sendingMedia} title="Send message"><Send size={19} /></button>
          </form>
        </div>
      </> : <div className="live-empty"><MessageCircle size={42} /><h1>Your messages</h1><p>Search for another registered user to start a persistent conversation.</p></div>}
      {error ? <button className="live-toast" onClick={() => setError('')}>{error}</button> : null}
    </section>
    <LiveCallOverlay controller={callController} />
    {settingsOpen ? <MediaSettingsPanel settings={mediaSettings} setSettings={setMediaSettings} onClose={() => setSettingsOpen(false)} onError={showError} /> : null}
  </main>;
}

function AdminLogin({ onAuthenticated }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api('/auth/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      onAuthenticated(result.user);
    } catch (loginError) { setError(loginError.message); }
    finally { setBusy(false); }
  };
  return <main className="live-auth admin-auth"><section className="live-auth-card">
    <div className="live-logo"><LockKeyhole size={24} /><strong>Halo Admin</strong></div>
    <p className="live-eyebrow">Restricted operations</p><h1>Administrator sign in</h1>
    <p className="live-muted">Recording access is logged and links expire automatically.</p>
    <form onSubmit={submit}>
      <label>Username<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" /></label>
      <label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label>
      {error ? <p className="live-error" role="alert">{error}</p> : null}
      <button className="live-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </section></main>;
}

const ADMIN_NAV = [
  ['overview', LayoutDashboard, 'Overview'],
  ['users', Users, 'Users'],
  ['logins', Clock3, 'Login activity'],
  ['recordings', FileVideo, 'Recordings'],
  ['appearance', Palette, 'Appearance'],
  ['audit', ClipboardList, 'Audit log'],
];

function adminDate(value, fallback = 'Never') {
  return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : fallback;
}

function AdminStatus({ value }) {
  return <span className={`admin-status admin-status-${String(value).toLowerCase()}`}><i />{String(value).toLowerCase().replace(/^./, char => char.toUpperCase())}</span>;
}

function AdminEmpty({ icon: Icon = Activity, children }) {
  return <div className="admin-workspace-empty"><Icon size={28} /><p>{children}</p></div>;
}

function AdminUsersView({ users, currentUser, busy, onRefresh, onSelect }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter(item => (status === 'ALL' || item.status === status) && (!needle || [item.name, item.login, item.role].some(value => String(value || '').toLowerCase().includes(needle))));
  }, [query, status, users]);
  return <>
    <div className="admin-page-heading"><div><h1>User management</h1><p>Manage user accounts, roles, login identifiers, and access.</p></div><button className="admin-secondary" onClick={onRefresh} disabled={busy}><RefreshCw size={16} /> Refresh</button></div>
    <div className="admin-toolbar"><label><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search users" /></label><select value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="DISABLED">Disabled</option></select></div>
    <div className="admin-data-table"><table><thead><tr><th>User</th><th>Phone / login</th><th>Role</th><th>Status</th><th>Last login</th><th>Account created</th></tr></thead><tbody>{visible.map(item => <tr key={item.id} onClick={() => onSelect(item)} tabIndex="0" onKeyDown={event => { if (event.key === 'Enter') onSelect(item); }}><td><span className="admin-user-cell"><LiveAvatar user={item} size="sm" /><span><strong>{item.name}</strong><small>{item.id === currentUser.id ? 'Current administrator' : item.presence?.toLowerCase()}</small></span></span></td><td>{item.login || 'Not set'}</td><td>{item.role.replace('_', ' ')}</td><td><AdminStatus value={item.status} /></td><td>{adminDate(item.lastLoginAt)}</td><td>{adminDate(item.createdAt)}</td></tr>)}</tbody></table>{visible.length ? <footer>{visible.length} of {users.length} users</footer> : <AdminEmpty icon={Users}>No users match these filters.</AdminEmpty>}</div>
  </>;
}

function AdminUserDrawer({ user, currentUser, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ name: user.name, login: user.login || '', role: user.role, status: user.status }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isAdminAccount = ['ADMIN', 'SUPER_ADMIN'].includes(user.role);
  const save = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api(`/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      onSaved(result.user);
    } catch (saveError) { setError(saveError.message); }
    finally { setBusy(false); }
  };
  const field = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  return <aside className="admin-user-drawer" aria-label="Edit user"><div className="admin-drawer-title"><h2>Edit user</h2><button onClick={onClose} title="Close"><X size={19} /></button></div><form onSubmit={save}>
    <label>Display name<input value={form.name} onChange={field('name')} maxLength={60} /></label>
    <label>{isAdminAccount ? 'Administrator login' : 'Phone / login'}<input value={form.login} onChange={field('login')} autoCapitalize="none" /></label>
    <label>Role<select value={form.role} onChange={field('role')} disabled={isAdminAccount}><option value="USER">User</option><option value="MODERATOR">Moderator</option>{isAdminAccount ? <option value={user.role}>{user.role.replace('_', ' ')}</option> : null}</select></label>
    <label>Account status<select value={form.status} onChange={field('status')} disabled={user.id === currentUser.id}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended for 7 days</option><option value="DISABLED">Disabled</option></select></label>
    <div className="admin-account-facts"><span>Created<strong>{adminDate(user.createdAt)}</strong></span><span>Last login<strong>{adminDate(user.lastLoginAt)}</strong></span></div>
    {user.id === currentUser.id ? <p className="admin-help"><ShieldCheck size={15} /> Your current account cannot be disabled or demoted.</p> : null}
    {error ? <p className="live-error" role="alert">{error}</p> : null}
    <button className="admin-primary" disabled={busy}><Save size={16} />{busy ? 'Saving…' : 'Save changes'}</button><button className="admin-secondary full" type="button" onClick={onClose}>Cancel</button>
  </form></aside>;
}

function AdminLoginView({ logins }) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => logins.filter(item => !query.trim() || [item.user?.name, item.user?.login, item.device, item.source].some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase()))), [logins, query]);
  return <><div className="admin-page-heading"><div><h1>Login activity</h1><p>Successful session entries with private, hashed network identifiers.</p></div></div><div className="admin-toolbar"><label><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search login activity" /></label></div><div className="admin-data-table"><table><thead><tr><th>User</th><th>Date and time</th><th>Status</th><th>Device</th><th>Source</th></tr></thead><tbody>{visible.map(item => <tr key={item.id}><td><strong>{item.user?.name}</strong><small>{item.user?.login}</small></td><td>{adminDate(item.timestamp)}</td><td><AdminStatus value={item.status} /></td><td>{item.device}</td><td>{item.source}</td></tr>)}</tbody></table>{visible.length ? <footer>{visible.length} login entries</footer> : <AdminEmpty icon={Clock3}>No login entries found.</AdminEmpty>}</div></>;
}

function AdminRecordingsView({ recordings, reason, setReason, onPlay, onRefresh }) {
  return <><div className="admin-page-heading"><div><h1>Video session recordings</h1><p>Private participant-initiated recordings. Every playback request is audit logged.</p></div><button className="admin-secondary" onClick={onRefresh}><RefreshCw size={16} /> Refresh</button></div><label className="admin-playback-reason">Playback reason<input value={reason} onChange={event => setReason(event.target.value)} maxLength={240} /></label><div className="admin-data-table"><table><thead><tr><th>Call</th><th>Started</th><th>Duration</th><th>Status</th><th>Expires</th><th></th></tr></thead><tbody>{recordings.map(recording => <tr key={recording.id}><td><strong>Call {recording.callId.slice(-8)}</strong></td><td>{adminDate(recording.startedAt)}</td><td>{recording.durationSeconds == null ? 'Pending' : `${recording.durationSeconds}s`}</td><td><AdminStatus value={recording.status} /></td><td>{adminDate(recording.expiresAt)}</td><td><button className="admin-row-action" disabled={recording.status !== 'READY' || reason.trim().length < 4} onClick={() => onPlay(recording.id)}><Play size={15} /> Play</button></td></tr>)}</tbody></table>{recordings.length ? <footer>{recordings.length} recording entries</footer> : <AdminEmpty icon={FileVideo}>No video recordings yet.</AdminEmpty>}</div></>;
}

function AdminAppearance({ theme, background, setTheme, setBackground }) {
  const themes = [['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Monitor, 'System']];
  const backgrounds = [['midnight', 'Midnight'], ['ocean', 'Deep ocean'], ['carbon', 'Carbon']];
  return <><div className="admin-page-heading"><div><h1>Appearance</h1><p>Choose how this admin dashboard looks on this browser.</p></div></div><section className="admin-appearance-section"><h2>Theme</h2><div className="admin-choice-grid">{themes.map(([id, Icon, label]) => <button key={id} className={theme === id ? 'selected' : ''} onClick={() => setTheme(id)}><Icon size={22} /><strong>{label}</strong>{theme === id ? <Check size={16} /> : null}</button>)}</div><h2>Background</h2><div className="admin-background-grid">{backgrounds.map(([id, label]) => <button key={id} className={background === id ? `selected ${id}` : id} onClick={() => setBackground(id)}><i /><strong>{label}</strong>{background === id ? <Check size={16} /> : null}</button>)}</div></section></>;
}

function AdminOverview({ users, logins, recordings, onNavigate }) {
  const activeUsers = users.filter(item => item.status === 'ACTIVE').length;
  const readyRecordings = recordings.filter(item => item.status === 'READY').length;
  return <><div className="admin-page-heading"><div><h1>Overview</h1><p>Halo administration and security activity at a glance.</p></div></div><div className="admin-overview-stats"><button onClick={() => onNavigate('users')}><Users /><span><small>Total users</small><strong>{users.length}</strong></span></button><button onClick={() => onNavigate('users')}><ShieldCheck /><span><small>Active accounts</small><strong>{activeUsers}</strong></span></button><button onClick={() => onNavigate('logins')}><Clock3 /><span><small>Login entries</small><strong>{logins.length}</strong></span></button><button onClick={() => onNavigate('recordings')}><FileVideo /><span><small>Ready recordings</small><strong>{readyRecordings}</strong></span></button></div><section className="admin-recent-panel"><div><h2>Recent login activity</h2><button onClick={() => onNavigate('logins')}>View all</button></div>{logins.slice(0, 6).map(item => <article key={item.id}><LiveAvatar user={item.user} size="sm" /><span><strong>{item.user?.name}</strong><small>{item.device}</small></span><time>{adminDate(item.timestamp)}</time><AdminStatus value={item.status} /></article>)}</section></>;
}

function AdminAuditView({ events }) {
  return <><div className="admin-page-heading"><div><h1>Audit log</h1><p>Administrative actions and protected recording access events.</p></div></div><div className="admin-data-table"><table><thead><tr><th>Action</th><th>Target</th><th>Administrator</th><th>Date and time</th><th>Source</th></tr></thead><tbody>{events.map(event => <tr key={event.id}><td><strong>{event.action.replaceAll('_', ' ')}</strong></td><td>{event.targetType} · {event.targetId.slice(-10)}</td><td>{event.adminId.slice(-10)}</td><td>{adminDate(event.createdAt)}</td><td>{event.ipHash ? `Private hash ${event.ipHash.slice(0, 10)}` : 'Unavailable'}</td></tr>)}</tbody></table>{events.length ? <footer>{events.length} audit events</footer> : <AdminEmpty icon={ClipboardList}>No audit events yet.</AdminEmpty>}</div></>;
}

function AdminDashboard({ user, onLogout }) {
  const [section, setSection] = useState('overview');
  const [users, setUsers] = useState([]);
  const [logins, setLogins] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [reason, setReason] = useState('Administrative review');
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setThemeState] = useState(() => localStorage.getItem('halo-admin-theme-v2') || 'dark');
  const [background, setBackgroundState] = useState(() => localStorage.getItem('halo-admin-background-v2') || 'midnight');
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [userResult, loginResult, recordingResult, auditResult] = await Promise.all([api('/admin/users'), api('/admin/login-activity'), api('/admin/recordings'), api('/admin/audit-log')]);
      setUsers(userResult.users); setLogins(loginResult.logins); setRecordings(recordingResult.recordings); setEvents(auditResult.events);
    } catch (loadError) { setError(loadError.message); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const setTheme = value => { setThemeState(value); localStorage.setItem('halo-admin-theme-v2', value); };
  const setBackground = value => { setBackgroundState(value); localStorage.setItem('halo-admin-background-v2', value); };
  const play = async id => {
    setError('');
    try { const result = await api(`/admin/recordings/${id}/playback-token`, { method: 'POST', body: JSON.stringify({ reason }) }); setPlaybackUrl(result.playbackUrl); }
    catch (playError) { setError(playError.message); }
  };
  const navigate = next => { setSection(next); setSelectedUser(null); setNavOpen(false); };
  const saved = next => { setUsers(current => current.map(item => item.id === next.id ? next : item)); setSelectedUser(next); load().catch(() => {}); };
  let content;
  if (section === 'overview') content = <AdminOverview users={users} logins={logins} recordings={recordings} onNavigate={navigate} />;
  else if (section === 'users') content = <AdminUsersView users={users} currentUser={user} busy={busy} onRefresh={load} onSelect={setSelectedUser} />;
  else if (section === 'logins') content = <AdminLoginView logins={logins} />;
  else if (section === 'recordings') content = <AdminRecordingsView recordings={recordings} reason={reason} setReason={setReason} onPlay={play} onRefresh={load} />;
  else if (section === 'appearance') content = <AdminAppearance theme={theme} background={background} setTheme={setTheme} setBackground={setBackground} />;
  else content = <AdminAuditView events={events} />;
  return <main className={`admin-console admin-theme-${theme} admin-background-${background}`}>
    <header><button className="admin-menu-button" onClick={() => setNavOpen(true)} title="Open menu"><Menu size={20} /></button><div className="live-logo"><LockKeyhole size={22} /><strong>Halo Admin</strong></div><div><span>{user.name}</span><button className="live-icon" onClick={onLogout} title="Sign out"><LogOut size={18} /></button></div></header>
    <aside className={navOpen ? 'open' : ''}><button className="admin-nav-close" onClick={() => setNavOpen(false)}><X /></button><nav>{ADMIN_NAV.map(([id, Icon, label]) => <button key={id} className={section === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span></button>)}</nav><div className="admin-vault-link"><LockKeyhole size={18} /><strong>Private recording vault</strong><small>Access controlled and audited</small><button onClick={() => navigate('recordings')}>View recordings</button></div></aside>
    <section className="admin-workspace">{busy && !users.length ? <AdminEmpty>Loading administration data…</AdminEmpty> : content}{error ? <button className="live-toast" onClick={() => setError('')}>{error}</button> : null}</section>
    {selectedUser ? <AdminUserDrawer user={selectedUser} currentUser={user} onClose={() => setSelectedUser(null)} onSaved={saved} /> : null}
    {playbackUrl ? <section className="recording-player" role="dialog" aria-label="Recording player"><button onClick={() => setPlaybackUrl('')}><X /></button><video src={playbackUrl} controls autoPlay /></section> : null}
  </main>;
}

export default function LiveApp() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/auth/me').then(result => setUser(result.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  };

  if (loading) return <main className="live-loading"><div className="live-logo"><MessageCircle /><strong>Halo</strong></div><p>Connecting securely…</p></main>;
  const adminPath = window.location.pathname.startsWith('/admin');
  if (adminPath) {
    if (!user) return <AdminLogin onAuthenticated={setUser} />;
    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return <main className="live-auth"><section className="live-auth-card"><h1>Administrator access required</h1><p className="live-muted">This signed-in account cannot access recordings.</p><button className="live-primary" onClick={logout}>Sign out</button></section></main>;
    return <AdminDashboard user={user} onLogout={logout} />;
  }
  return user ? <LiveMessenger user={user} onLogout={logout} /> : <LiveAuth onAuthenticated={setUser} />;
}
