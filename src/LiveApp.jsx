import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, LockKeyhole, LogOut, MessageCircle, Mic, MicOff, Phone, PhoneOff, Play, RefreshCw, Search, Send, ShieldCheck, UserPlus, Video, VideoOff, Wifi, WifiOff, X } from 'lucide-react';
import { io } from 'socket.io-client';
import { createClientId } from './clientId.js';

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

function useCallController(socket, user, onError, audioAlerts) {
  const [call, setCall] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [recording, setRecording] = useState(false);
  const callRef = useRef(null);
  const roomRef = useRef(null);
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
    room?.disconnect();
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false); setCameraOff(false); setRecording(false); setCall(null);
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
      if (callRef.current?.callId === activeCall.callId) cleanup();
    });
    await room.connect(credentials.url, credentials.token);
    await room.localParticipant.setMicrophoneEnabled(true);
    if (activeCall.type === 'video') await room.localParticipant.setCameraEnabled(true);
    if (callRef.current?.callId !== activeCall.callId) {
      room.disconnect();
      throw Object.assign(new Error('Call ended while media permission was pending'), { name: 'AbortError' });
    }
    const tracks = [
      room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack,
      room.localParticipant.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack,
    ].filter(Boolean);
    setLocalStream(new MediaStream(tracks));
    setCall(current => current ? { ...current, status: 'connected', recordingRequired: credentials.recordingRequired } : current);
    socket.emit('call:connected', { callId: activeCall.callId });
  }, [cleanup, socket]);

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
    const onRecordingStarted = event => { if (callRef.current?.callId === event.callId) setRecording(true); };
    const onRecordingFailed = event => {
      if (callRef.current?.callId !== event.callId) return;
      onError('Video recording is unavailable, so the call was ended for privacy. Please try again.');
      endCall('recording-unavailable');
    };
    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:connected', onConnected);
    socket.on('call:ended', onEnded);
    socket.on('recording:started', onRecordingStarted);
    socket.on('recording:failed', onRecordingFailed);
    return () => {
      socket.off('call:incoming', onIncoming); socket.off('call:accepted', onAccepted);
      socket.off('call:connected', onConnected); socket.off('call:ended', onEnded);
      socket.off('recording:started', onRecordingStarted); socket.off('recording:failed', onRecordingFailed);
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

  return { call, recording, startCall, acceptCall, rejectCall, endCall, muted, cameraOff, toggleMute, toggleCamera, localVideoRef, remoteVideoRef };
}

function LiveCallOverlay({ controller }) {
  const { call, recording, acceptCall, rejectCall, endCall, muted, cameraOff, toggleMute, toggleCamera, localVideoRef, remoteVideoRef } = controller;
  if (!call) return null;
  const isIncoming = call.status === 'incoming';
  const isVideo = call.type === 'video';
  return <section className={`live-call${isVideo ? ' video' : ''}`} role="dialog" aria-label={`${isIncoming ? 'Incoming' : 'Active'} ${call.type} call`}>
    {isVideo ? <video className="live-call-remote" ref={remoteVideoRef} autoPlay playsInline /> : null}
    <button className="live-call-close" onClick={() => endCall('closed')} title="End call"><X size={20} /></button>
    <div className="live-call-person"><LiveAvatar user={call.participant} size="xl" /><h1>{call.participant?.name}</h1><p>{isIncoming ? `Incoming ${call.type} call` : call.status === 'ringing' ? 'Calling…' : call.status === 'connecting' ? 'Connecting securely…' : 'Connected'}</p></div>
    {isVideo ? <div className="live-call-local"><video ref={localVideoRef} muted autoPlay playsInline />{cameraOff ? <VideoOff /> : <Camera />}</div> : null}
    {isVideo && call.status === 'connected' ? <div className={`live-recording-notice${recording ? ' active' : ''}`}><i />{recording ? 'Recording in progress · Admin access only' : 'Starting required recording…'}</div> : null}
    <div className="live-call-controls">
      {isIncoming ? <>
        <button className="decline" onClick={rejectCall}><PhoneOff /><span>Decline</span></button>
        <button className="accept" onClick={acceptCall}><Phone /><span>Accept</span></button>
      </> : <>
        <button onClick={toggleMute}>{muted ? <MicOff /> : <Mic />}<span>{muted ? 'Unmute' : 'Mute'}</span></button>
        {isVideo ? <button onClick={toggleCamera}>{cameraOff ? <VideoOff /> : <Video />}<span>{cameraOff ? 'Camera on' : 'Camera off'}</span></button> : null}
        <button className="decline" onClick={() => endCall('hangup')}><PhoneOff /><span>End</span></button>
      </>}
    </div>
  </section>;
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
  const socketRef = useRef(null);
  const selectedIdRef = useRef(selectedId);
  const typingTimerRef = useRef(null);
  const showError = useCallback(message => setError(message), []);
  const audioAlerts = useAudioAlerts();
  const callController = useCallController(socket, user, showError, audioAlerts);

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

  const updateDraft = event => {
    const value = event.target.value;
    setDraft(value);
    if (!selectedId || !socketRef.current) return;
    socketRef.current.emit(value ? 'typing:start' : 'typing:stop', { conversationId: selectedId });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => socketRef.current?.emit('typing:stop', { conversationId: selectedId }), 900);
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
        <header><button className="live-mobile-back" type="button" onClick={() => setMobileChatOpen(false)} title="Back to conversations"><ArrowLeft size={21} /></button><LiveAvatar user={selected.participant} /><span><strong>{selected.participant?.name}</strong><small>{selected.participant?.status || 'offline'}</small></span><div className="live-chat-actions"><button title="Voice call" onClick={() => callController.startCall(selected.participant, 'voice')}><Phone size={18} /></button><button title="Video call" onClick={() => callController.startCall(selected.participant, 'video')}><Video size={19} /></button></div></header>
        <div className="live-messages" aria-live="polite">
          {messages.map(message => <article className={message.sender.id === user.id ? 'mine' : ''} key={message.id}><div>{message.text}</div><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></article>)}
          {typingUserId ? <div className="live-typing" aria-label={`${selected.participant?.name} is typing`}><i /><i /><i /></div> : null}
        </div>
        <form className="live-composer" onSubmit={sendMessage}><input value={draft} onChange={updateDraft} placeholder={`Message ${selected.participant?.name}`} aria-label="Message" /><button disabled={!draft.trim()}><Send size={19} /></button></form>
      </> : <div className="live-empty"><MessageCircle size={42} /><h1>Your messages</h1><p>Search for another registered user to start a persistent conversation.</p></div>}
      {error ? <button className="live-toast" onClick={() => setError('')}>{error}</button> : null}
    </section>
    <LiveCallOverlay controller={callController} />
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

function AdminRecordings({ user, onLogout }) {
  const [recordings, setRecordings] = useState([]);
  const [reason, setReason] = useState('Administrative review');
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => api('/admin/recordings').then(result => setRecordings(result.recordings)).catch(loadError => setError(loadError.message)), []);
  useEffect(() => { load(); }, [load]);
  const play = async id => {
    setError('');
    try {
      const result = await api(`/admin/recordings/${id}/playback-token`, { method: 'POST', body: JSON.stringify({ reason }) });
      setPlaybackUrl(result.playbackUrl);
    } catch (playError) { setError(playError.message); }
  };
  return <main className="admin-shell">
    <header><div className="live-logo"><LockKeyhole size={23} /><strong>Halo recording vault</strong></div><div><span>{user.name}</span><button className="live-icon" onClick={onLogout} title="Sign out"><LogOut size={18} /></button></div></header>
    <section className="admin-panel"><div className="admin-heading"><div><p className="live-eyebrow">Admin-only</p><h1>Video session recordings</h1><p>Every playback request is audit logged. Signed links expire after a short interval.</p></div><button onClick={load}><RefreshCw size={17} /> Refresh</button></div>
      <label className="admin-reason">Playback reason<input value={reason} onChange={event => setReason(event.target.value)} maxLength={240} /></label>
      {error ? <p className="live-error" role="alert">{error}</p> : null}
      <div className="recording-list">{recordings.length ? recordings.map(recording => <article key={recording.id}>
        <div><strong>Call {recording.callId.slice(-8)}</strong><small>{new Date(recording.startedAt).toLocaleString()} · {recording.durationSeconds == null ? 'Duration pending' : `${recording.durationSeconds}s`}</small></div>
        <span className={`recording-status ${recording.status.toLowerCase()}`}>{recording.status}</span>
        <button disabled={recording.status !== 'READY' || reason.trim().length < 4} onClick={() => play(recording.id)}><Play size={16} /> Play</button>
      </article>) : <div className="admin-empty"><Video size={32} /><p>No video recordings yet.</p></div>}</div>
    </section>
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
    return <AdminRecordings user={user} onLogout={logout} />;
  }
  return user ? <LiveMessenger user={user} onLogout={logout} /> : <LiveAuth onAuthenticated={setUser} />;
}
