import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowLeft, Bell, BellRing, Camera, Check, CheckCheck, ChevronDown, ChevronLeft,
  Clock3, Copy, EllipsisVertical, FileText, Headphones, LogOut, Menu, MessageCircle, MessageSquare,
  Mic, MicOff, Moon, MoreHorizontal, Paperclip, Phone, PhoneCall, PhoneIncoming, PhoneOff, Plus,
  Search, Send, Settings, Shield, Smile, Sparkles, Sun, User, UserPlus, Users, Video, VideoOff,
  Volume2, X, BarChart3, ScrollText, Database, Filter, LockKeyhole, Ban, Trash2, Reply, Heart,
  Film, Play, HardDrive, Eye, Circle
} from 'lucide-react';
import { calls, people, previewStates, recordings, seedMessages } from './data';
import LiveApp from './LiveApp';

const cx = (...v) => v.filter(Boolean).join(' ');

function Logo({ admin = false }) {
  return <div className="brand"><span className="brand-mark"><MessageCircle size={21} /></span><span>Halo{admin && ' Admin'}</span></div>;
}

function Avatar({ person, size = 'md', showStatus = true }) {
  return <span className={cx('avatar', `avatar-${size}`)}>
    {person.avatar ? <img src={person.avatar} alt="" /> : person.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}
    {showStatus && <i className={cx('presence', person.status)} aria-label={person.state} />}
  </span>;
}

function IconButton({ label, children, active, danger, onClick, className }) {
  return <button className={cx('icon-button', active && 'active', danger && 'danger', className)} title={label} aria-label={label} onClick={onClick}>{children}</button>;
}

function StatusText({ person }) {
  return <span className={cx('status-text', person.status)}>{person.state === 'Offline' ? `Last seen ${person.lastSeen}` : person.state}</span>;
}

function ConversationRow({ person, selected, onClick }) {
  return <button className={cx('conversation-row', selected && 'selected')} onClick={onClick}>
    <Avatar person={person} size="lg" />
    <span className="conversation-body">
      <span className="row-top"><strong>{person.name}</strong><time>{person.time}</time></span>
      <span className="row-bottom"><span>{person.preview}</span>{person.unread > 0 && <b className="unread">{person.unread}</b>}</span>
    </span>
  </button>;
}

function SideNav({ section, setSection, mobileOpen, onClose }) {
  const items = [
    ['chat', MessageSquare, 'Chats'], ['call-history', Phone, 'Calls'], ['contacts', Users, 'Contacts'], ['settings', Settings, 'Settings']
  ];
  return <aside className={cx('side-nav', mobileOpen && 'mobile-open')}>
    <div className="mobile-nav-top"><Logo /><IconButton label="Close menu" onClick={onClose}><X size={20} /></IconButton></div>
    <div className="nav-brand"><Logo /></div>
    <nav>{items.map(([id, Icon, label]) => <button key={id} className={cx('nav-item', section === id && 'active')} onClick={() => { setSection(id); onClose?.(); }}><Icon size={21} /><span>{label}</span>{id === 'chat' && <b>3</b>}</button>)}</nav>
    <div className="my-profile"><Avatar person={{...people[1], name:'Jordan Lee'}} size="sm" /><span><strong>Jordan Lee</strong><small>Online</small></span><ChevronDown size={15} /></div>
  </aside>;
}

function ConversationList({ selected, setSelected, openChat, search, setSearch }) {
  const filtered = people.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  return <section className="conversation-list">
    <header className="list-heading"><h1>Chats</h1><IconButton label="New message"><Plus size={21} /></IconButton></header>
    <label className="search-field"><Search size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations" /><Filter size={17} /></label>
    <div className="list-scroll">{filtered.map(p => <ConversationRow key={p.id} person={p} selected={selected.id === p.id} onClick={() => { setSelected(p); openChat(); }} />)}</div>
  </section>;
}

function Notifications({ onClose }) {
  const notes = [
    [people[1], 'Sent you a message', '9:41 AM'], [people[3], 'Reacted 👍 to your message', 'Yesterday'], [people[5], 'Shared a photo', 'Mon']
  ];
  return <div className="notification-popover">
    <div className="popover-title"><strong>Notifications</strong><button onClick={onClose}>Mark all as read</button></div>
    {notes.map(([p, text, time]) => <div className="notification-row" key={p.id}><span className="notification-dot" /><Avatar person={p} size="sm" showStatus={false} /><span><strong>{p.name}</strong><small>{text}</small></span><time>{time}</time></div>)}
    <button className="view-all">View all notifications</button>
  </div>;
}

function MessageBubble({ message, person }) {
  const mine = message.from === 'me';
  return <div className={cx('message-line', mine && 'mine')}>
    {!mine && <Avatar person={person} size="xs" showStatus={false} />}
    <div className="bubble-wrap"><div className="message-bubble">{message.text}</div>{message.reaction && <button className="reaction">{message.reaction}</button>}</div>
    <time>{message.time} {mine && <CheckCheck size={14} />}</time>
  </div>;
}

function ChatPanel({ person, messages, setMessages, openCall, notificationsOpen, setNotificationsOpen, onMobileBack }) {
  const [draft, setDraft] = useState('');
  const send = () => { if (!draft.trim()) return; setMessages(m => [...m, { id: Date.now(), from: 'me', text: draft.trim(), time: 'Now', read: false }]); setDraft(''); };
  return <section className="chat-panel">
    <header className="chat-header">
      <IconButton label="Back" className="mobile-back" onClick={onMobileBack}><ArrowLeft size={21} /></IconButton>
      <Avatar person={person} size="md" />
      <div className="chat-person"><strong>{person.name}</strong><StatusText person={person} /></div>
      <div className="chat-actions">
        <IconButton label="Voice call" onClick={() => openCall('outgoing-call')}><Phone size={20} /></IconButton>
        <IconButton label="Video call" onClick={() => openCall('video-call')}><Video size={20} /></IconButton>
        <IconButton label="Conversation menu"><EllipsisVertical size={20} /></IconButton>
        <div className="notification-anchor"><IconButton label="Notifications" active={notificationsOpen} onClick={() => setNotificationsOpen(v => !v)}><Bell size={20} /><em>3</em></IconButton>{notificationsOpen && <Notifications onClose={() => setNotificationsOpen(false)} />}</div>
      </div>
    </header>
    <div className="message-scroll">
      <div className="day-divider"><span>Today</span></div>
      {messages.map(m => <MessageBubble key={m.id} message={m} person={person} />)}
      <div className="typing"><Avatar person={person} size="xs" showStatus={false} /><span><i /><i /><i /></span></div>
    </div>
    <form className="composer" onSubmit={e => { e.preventDefault(); send(); }}>
      <IconButton label="Add attachment"><Plus size={22} /></IconButton>
      <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Type a message" aria-label="Message" />
      <IconButton label="Emoji"><Smile size={20} /></IconButton><IconButton label="Voice message"><Mic size={20} /></IconButton>
      <button className="send-button" aria-label="Send"><Send size={20} /></button>
    </form>
  </section>;
}

function ContactsPage({ onAdd, onMessage }) {
  const [query, setQuery] = useState('');
  const list = people.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) || p.phone.includes(query));
  return <Page title="Contacts" subtitle="People you can message and call" action={<button className="primary small" onClick={onAdd}><UserPlus size={17} /> Add contact</button>}>
    <label className="search-field wide"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or phone number" /></label>
    <div className="contact-list">{list.map(p => <div className="contact-row" key={p.id}><Avatar person={p} size="md" /><span><strong>{p.name}</strong><small>{p.phone} · <StatusText person={p} /></small></span><button onClick={() => onMessage(p)}>Message</button><IconButton label="More"><MoreHorizontal size={19} /></IconButton></div>)}</div>
  </Page>;
}

function AddContact({ onDone }) {
  const [phone, setPhone] = useState('+1 '); const [added, setAdded] = useState(false);
  return <Page title="Add a contact" subtitle="Find someone already using Halo">
    <div className="form-card"><label>Phone number<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 415 555 0100" /></label>{phone.length > 8 && <div className="found-contact"><Avatar person={people[9]} size="md" /><span><strong>Liam Patel</strong><small>Halo member since September 2023</small></span></div>}
      <button className="primary" onClick={() => setAdded(true)}><UserPlus size={18} />{added ? 'Contact added' : 'Add to contacts'}</button>{added && <p className="success"><Check size={16} /> Liam is now in your contacts.</p>}<button className="text-button" onClick={onDone}>Back to contacts</button>
    </div>
  </Page>;
}

function CallHistory({ onCall }) {
  return <Page title="Calls" subtitle="Recent voice and video calls" action={<button className="primary small" onClick={() => onCall('outgoing-call')}><PhoneCall size={17} /> New call</button>}>
    <div className="call-list">{calls.map((c, i) => <div className="call-row" key={i}><Avatar person={{avatar:c.avatar,status:c.status==='Missed'?'offline':'online',state:c.status}} size="md" showStatus={false}/><span><strong>{c.name}</strong><small className={c.status==='Missed'?'missed':''}>{c.status} · {c.time}</small></span><span className="call-duration">{c.duration}</span><IconButton label={`Start ${c.type} call`} onClick={() => onCall(c.type==='video'?'video-call':'voice-call')}>{c.type==='video'?<Video size={20}/>:<Phone size={20}/>}</IconButton></div>)}</div>
  </Page>;
}

function Page({ title, subtitle, action, children }) { return <section className="content-page"><header><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</header><div className="page-inner">{children}</div></section>; }

function SettingsPage({ dark, setDark }) {
  const [privacy, setPrivacy] = useState({ online: 'Contacts', seen: 'Contacts', call: 'Contacts' });
  return <Page title="Settings" subtitle="Profile, privacy, notifications, and devices">
    <div className="settings-layout"><div className="profile-card"><Avatar person={{...people[1],name:'Jordan Lee'}} size="xl"/><div><h2>Jordan Lee</h2><p>Exploring, building, connecting.</p><button className="secondary">Edit profile</button></div></div>
      <div className="settings-groups"><section><h3>Appearance</h3><div className="setting-row"><span><strong>Theme</strong><small>Choose how Halo looks</small></span><button className="segmented" onClick={() => setDark(!dark)}>{dark?<><Moon size={17}/> Dark</>:<><Sun size={17}/> Light</>}</button></div></section>
      <section><h3>Privacy</h3>{[['online','Who can see my online status?'],['seen','Who can see my last seen?'],['call','Who can call me?']].map(([k,l])=><div className="setting-row" key={k}><span><strong>{l}</strong><small>Blocked users are always excluded</small></span><select value={privacy[k]} onChange={e=>setPrivacy({...privacy,[k]:e.target.value})}><option>Everyone</option><option>Contacts</option><option>Nobody</option></select></div>)}</section>
      <section><h3>Active devices</h3><div className="device-row"><span className="device-icon"><Database size={19}/></span><span><strong>MacBook Pro · Chrome</strong><small>Honolulu, HI · This device</small></span><button className="text-button">Manage</button></div><div className="device-row"><span className="device-icon"><Phone size={19}/></span><span><strong>iPhone 15 Pro</strong><small>Last active 18 minutes ago</small></span><button className="text-button danger-text">Log out</button></div></section></div>
    </div>
  </Page>;
}

function AuthScreen({ kind, onContinue }) {
  const [phone, setPhone] = useState('415 555 0142'); const [otp, setOtp] = useState(['1','4','7','2','9','6']);
  const content = {
    login: ['Welcome back', 'Continue with your phone number to open Halo.'],
    register: ['Your conversations, one tap away.', 'We’ll send a code to verify your number.'],
    otp: ['Verify your number', 'We sent a code to +1 415 555 0142'],
    'profile-setup': ['Make Halo yours', 'Add a name and photo so people recognize you.']
  }[kind] || ['Welcome to Halo', 'Private conversations, made simple.'];
  return <div className="auth-screen"><div className="auth-panel"><Logo /><div className="auth-copy"><h1>{content[0]}</h1><p>{content[1]}</p></div>
    {kind==='otp'?<><div className="otp-row">{otp.map((v,i)=><input key={i} value={v} maxLength={1} onChange={e=>{const n=[...otp];n[i]=e.target.value;n&&setOtp(n);}} aria-label={`Digit ${i+1}`}/>)}</div><p className="resend"><Clock3 size={16}/> Resend in <b>00:28</b></p><button className="primary" onClick={onContinue}>Verify & continue</button></>:
    kind==='profile-setup'?<><div className="profile-upload"><Avatar person={people[1]} size="xl" showStatus={false}/><button><Camera size={17}/> Change photo</button></div><label className="auth-label">Display name<input defaultValue="Jordan Lee"/></label><label className="auth-label">Status message<input defaultValue="Exploring, building, connecting."/></label><button className="primary" onClick={onContinue}>Open Halo</button></>:
    <><label className="auth-label">Phone number<div className="phone-input"><button>🇺🇸 +1 <ChevronDown size={15}/></button><input value={phone} onChange={e=>setPhone(e.target.value)}/></div></label><button className="primary" onClick={onContinue}>Continue</button><p className="privacy-note"><Shield size={18}/> Your phone number is used to identify your Halo account.</p></>}
    <footer>By continuing, you agree to Halo’s Terms and Privacy Policy.</footer></div><div className="auth-art"><div className="art-orbit"><MessageCircle/><span className="avatar-cloud a"><Avatar person={people[0]} size="lg"/></span><span className="avatar-cloud b"><Avatar person={people[1]} size="md"/></span><span className="avatar-cloud c"><Avatar person={people[2]} size="md"/></span></div><h2>Close, even from far away.</h2><p>Message, call, and share the little moments.</p></div></div>;
}

function CallScreen({ type, person, onEnd, setType }) {
  const active = ['voice-call','video-call'].includes(type); const video = type === 'video-call';
  const [muted,setMuted]=useState(false); const [camera,setCamera]=useState(true); const [speaker,setSpeaker]=useState(true);
  const title = type==='incoming-call'?'Incoming voice call':type==='outgoing-call'?'Calling…':active?'Connected':'Call';
  return <div className={cx('call-screen', video && 'video')} style={video&&person.avatar?{'--remote':`url(${person.avatar})`}:undefined}>
    <div className="call-top"><Logo/>{video && active && <span className="recording-indicator"><Circle size={9}/> Recording</span>}<button onClick={onEnd}><X size={21}/></button></div>{video && active && <div className="recording-notice"><Shield size={15}/> This video session is recorded automatically and available only to authorized administrators.</div>}<div className="call-center">{!video&&<Avatar person={person} size="call" showStatus={false}/>}<h1>{person.name}</h1><p>{title}{active&&<span> · 04:18</span>}</p>{type==='outgoing-call'&&<span className="ringing"><i/><i/><i/></span>}</div>
    {video&&<div className="self-view"><Camera size={18}/></div>}
    <div className="call-controls">{type==='incoming-call'?<><button className="call-control decline" onClick={onEnd}><PhoneOff/><span>Decline</span></button><button className="call-control accept" onClick={()=>setType('voice-call')}><Phone/><span>Accept</span></button></>:<><button className={cx('call-control',muted&&'control-active')} onClick={()=>setMuted(!muted)}>{muted?<MicOff/>:<Mic/>}<span>Mute</span></button>{video&&<button className={cx('call-control',!camera&&'control-active')} onClick={()=>setCamera(!camera)}>{camera?<Camera/>:<VideoOff/>}<span>Camera</span></button>}<button className={cx('call-control',speaker&&'control-active')} onClick={()=>setSpeaker(!speaker)}><Volume2/><span>Speaker</span></button><button className="call-control decline" onClick={onEnd}><PhoneOff/><span>End</span></button></>}</div>
  </div>;
}

function AdminNav({ page, setPage }) {
  const nav=[['admin',BarChart3,'Overview'],['admin-users',Users,'Users'],['admin-messages',MessageSquare,'Messages'],['admin-calls',Phone,'Calls'],['admin-recordings',Film,'Recordings'],['admin-audit',ScrollText,'Audit log']];
  return <aside className="admin-nav"><Logo admin/><nav>{nav.map(([id,I,l])=><button className={cx(page===id&&'active')} key={id} onClick={()=>setPage(id)}><I size={20}/>{l}</button>)}</nav><div className="privacy-scope"><LockKeyhole size={18}/><strong>Admin-only recordings</strong><small>Encrypted · access audited</small></div><div className="admin-profile"><span>AD</span><div><strong>Admin User</strong><small>admin@halo.app</small></div></div></aside>;
}

const summary=[['Total users','128'],['Online','32'],['Away','7'],['Busy','5'],['Offline','84'],['Suspended','2']];
function AdminOverview({ setPage }) { return <AdminPage title="Overview" subtitle="Halo operations at a glance"><div className="admin-summary">{summary.map(([l,v])=><div key={l}><small>{l}</small><strong>{v}</strong></div>)}</div><div className="overview-grid"><section><h2>Today</h2>{[['Messages','8,492'],['Calls','312'],['New registrations','24'],['Active calls','6']].map(([a,b])=><div className="metric-line" key={a}><span>{a}</span><strong>{b}</strong></div>)}</section><section><h2>System status</h2><div className="health-row"><i/> API & WebSockets <b>Operational</b></div><div className="health-row"><i/> PostgreSQL <b>Operational</b></div><div className="health-row"><i/> Redis presence <b>Operational</b></div><button className="secondary" onClick={()=>setPage('admin-users')}>Manage users</button></section></div></AdminPage>; }
function AdminPage({title,subtitle,children}){return <section className="admin-page"><header><div><h1>{title}</h1><p>{subtitle}</p></div><div className="admin-top-actions"><Search size={18}/><Bell size={18}/><span>AD</span></div></header>{children}</section>}

function UserDrawer({ user, onClose }) { return <aside className="user-drawer"><button className="drawer-close" onClick={onClose}><X size={20}/></button><div className="drawer-person"><Avatar person={user} size="xl"/><div><h2>{user.name}</h2><p>{user.phone}</p><span className="role-pill">{user.role}</span></div></div><div className="detail-list">{[['Status',user.state],['Role',user.role],['Email',user.email],['Created',user.created],['Last seen',user.lastSeen],['User ID',`usr_${user.id}_8f3a`]].map(([l,v])=><div key={l}><span>{l}</span><strong>{v}</strong></div>)}</div><h3>Devices (2)</h3><div className="device-mini"><Database/><span><strong>MacBook Pro 16”</strong><small>Chrome 124 · This device</small></span></div><div className="device-mini"><Phone/><span><strong>iPhone 15 Pro</strong><small>Halo 2.18.0</small></span></div><h3>Active sessions (2)</h3><button className="drawer-action"><MessageCircle/> View message history</button><button className="drawer-action"><LogOut/> Force logout</button><button className="drawer-action danger"><Ban/> Suspend account</button></aside> }

function AdminUsers({ openDetail }) {
  const [query,setQuery]=useState(''); const [status,setStatus]=useState('All statuses'); const [role,setRole]=useState('All roles');
  const rows=people.filter(p=>(p.name.toLowerCase().includes(query.toLowerCase())||p.phone.includes(query))&&(status==='All statuses'||p.state===status)&&(role==='All roles'||p.role===role));
  return <AdminPage title="User management" subtitle="Manage user accounts, roles, and access."><div className="admin-summary compact">{summary.map(([l,v])=><div key={l}><small>{l}</small><strong>{v}</strong></div>)}</div><div className="admin-filters"><label><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search users"/></label><select value={status} onChange={e=>setStatus(e.target.value)}><option>All statuses</option><option>Online</option><option>Away</option><option>Busy</option><option>Offline</option></select><select value={role} onChange={e=>setRole(e.target.value)}><option>All roles</option><option>USER</option><option>MODERATOR</option><option>ADMIN</option></select><button><Filter/> Filters</button></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Phone</th><th>Created</th><th>Last seen</th></tr></thead><tbody>{rows.map(p=><tr key={p.id} onClick={()=>openDetail(p)}><td><Avatar person={p} size="xs"/>{p.name}</td><td><span className="role-pill">{p.role}</span></td><td><StatusText person={p}/></td><td>{p.phone}</td><td>{p.created}</td><td>{p.lastSeen}</td></tr>)}</tbody></table><footer>{rows.length} of 128 users <span><button>1</button><button>2</button><button>3</button>…<button>16</button></span></footer></div></AdminPage>;
}

function AdminMessages(){const rows=seedMessages.slice(0,7).map((m,i)=>({id:`msg_0${i+1}`,sender:m.from==='me'?'Jordan Lee':'Maya Chen',recipient:m.from==='me'?'Maya Chen':'Jordan Lee',content:m.text,time:`2026-08-06 ${m.time}`,type:'TEXT'}));return <AdminPage title="Message history" subtitle="Review server-stored messages where deployment policy permits."><div className="policy-banner"><Shield/><span><strong>Explicit server-readable model</strong>End-to-end encryption is not enabled in this prototype. Adding E2EE would prevent normal administrator access to message contents.</span></div><div className="admin-filters"><label><Search/><input placeholder="Search keyword, user, phone, conversation"/></label><select><option>All message types</option></select><button><Filter/> Date range</button></div><div className="table-wrap message-table"><table><thead><tr><th>Sender</th><th>Recipient</th><th>Content</th><th>Type</th><th>Timestamp</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.sender}</td><td>{r.recipient}</td><td>{r.content}</td><td><span className="role-pill">{r.type}</span></td><td>{r.time}</td><td><MoreHorizontal/></td></tr>)}</tbody></table></div></AdminPage>}

function AdminRecordings(){
  const [query,setQuery]=useState(''); const [selected,setSelected]=useState(null);
  const rows=recordings.filter(r=>r.participants.some(p=>p.name.toLowerCase().includes(query.toLowerCase()))||r.id.toLowerCase().includes(query.toLowerCase()));
  return <AdminPage title="Video recordings" subtitle="Automatically captured video sessions. Playback and metadata are restricted to administrators.">
    <div className="policy-banner recording-policy"><LockKeyhole/><span><strong>Encrypted and access-controlled</strong>Every view creates an audit event. Playback uses a short-lived signed URL; exports are disabled by default.</span></div>
    <div className="admin-filters"><label><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search participant or recording ID"/></label><select><option>All statuses</option><option>Ready</option><option>Processing</option></select><button><Filter/> Date range</button></div>
    <div className="recording-list">{rows.map(r=><article className="recording-row" key={r.id}><div className="recording-thumb"><img src={r.participants[0].avatar} alt=""/><span><Film size={18}/></span></div><div className="recording-people"><strong>{r.participants.map(p=>p.name).join(' ↔ ')}</strong><small>{r.id} · {r.started}</small></div><div><small>Duration</small><strong>{r.duration}</strong></div><div><small>Storage</small><strong>{r.size}</strong></div><div><span className={cx('recording-status',r.status.toLowerCase())}>{r.status}</span><small>{r.retention}</small></div><button className="secondary" disabled={r.status!=='Ready'} onClick={()=>setSelected(r)}><Eye size={16}/> View</button></article>)}</div>
    {selected&&<div className="recording-modal" role="dialog" aria-label="Recording player"><button className="modal-close" onClick={()=>setSelected(null)}><X/></button><div className="recording-player"><button aria-label="Play recording"><Play fill="currentColor"/></button><div className="player-meta"><span>00:00 / {selected.duration}</span><i><b/></i><strong><Circle size={8}/> Recorded automatically</strong></div></div><div className="recording-modal-info"><div><h2>{selected.participants.map(p=>p.name).join(' and ')}</h2><p>{selected.started} · {selected.id}</p></div><span><Shield size={16}/> Admin access logged</span></div></div>}
  </AdminPage>
}

function AdminShell({ initial, onExit }) { const [page,setPage]=useState(initial||'admin'); const [detail,setDetail]=useState(initial==='admin-detail'?people[0]:null); return <div className="admin-shell"><AdminNav page={page} setPage={p=>{setPage(p);setDetail(null)}}/>{page==='admin'?<AdminOverview setPage={setPage}/>:page==='admin-users'||page==='admin-detail'?<AdminUsers openDetail={u=>setDetail(u)}/>:page==='admin-messages'?<AdminMessages/>:page==='admin-recordings'?<AdminRecordings/>:<AdminPage title={page==='admin-calls'?'Call metadata':'Audit log'} subtitle={page==='admin-calls'?'Voice/video call metadata and recording status.':'Administrative actions, recording access, and security events.'}><div className="empty-state"><Activity/><h2>Structured records ready</h2><p>This prototype state demonstrates the protected admin navigation and data boundary.</p></div></AdminPage>}{detail&&<UserDrawer user={detail} onClose={()=>setDetail(null)}/>}<button className="exit-admin" onClick={onExit}>Exit admin</button></div> }

function MessagingApp({ initial='chat', onAdmin, onStateChange, dark, setDark }) {
  const [section,setSection]=useState(['chats','notifications'].includes(initial)?'chat':initial); const [selected,setSelected]=useState(people[0]); const [messages,setMessages]=useState(seedMessages); const [search,setSearch]=useState(''); const [mobileChat,setMobileChat]=useState(initial==='chat'); const [notificationsOpen,setNotificationsOpen]=useState(initial==='notifications'); const [callType,setCallType]=useState(['incoming-call','outgoing-call','voice-call','video-call'].includes(initial)?initial:null); const [mobileNav,setMobileNav]=useState(false);
  useEffect(()=>{if(onStateChange)onStateChange(section)},[section]);
  if(callType) return <CallScreen type={callType} setType={setCallType} person={selected} onEnd={()=>setCallType(null)}/>;
  let content = null;
  if(section==='contacts') content=<ContactsPage onAdd={()=>setSection('add-contact')} onMessage={p=>{setSelected(p);setSection('chat');setMobileChat(true)}}/>;
  else if(section==='add-contact') content=<AddContact onDone={()=>setSection('contacts')}/>;
  else if(section==='call-history') content=<CallHistory onCall={setCallType}/>;
  else if(section==='settings') content=<SettingsPage dark={dark} setDark={setDark}/>;
  return <div className="messenger-shell"><SideNav section={section} setSection={setSection} mobileOpen={mobileNav} onClose={()=>setMobileNav(false)}/><button className="mobile-menu" onClick={()=>setMobileNav(true)}><Menu/></button>{section==='chat'?<><ConversationList selected={selected} setSelected={setSelected} openChat={()=>setMobileChat(true)} search={search} setSearch={setSearch}/><div className={cx('mobile-chat-wrap',mobileChat&&'open')}><ChatPanel person={selected} messages={messages} setMessages={setMessages} openCall={setCallType} notificationsOpen={notificationsOpen} setNotificationsOpen={setNotificationsOpen} onMobileBack={()=>setMobileChat(false)}/></div></>:content}<button className="admin-shortcut" onClick={onAdmin}><Shield size={16}/> Admin</button></div>;
}

function DesignPreview({ state, setState, dark, setDark }) {
  const render=()=>{
    if(['login','register','otp','profile-setup'].includes(state)) return <AuthScreen kind={state} onContinue={()=>setState(state==='login'||state==='register'?'otp':state==='otp'?'profile-setup':'chat')}/>;
    if(state.startsWith('admin')) return <AdminShell key={state} initial={state} onExit={()=>setState('chat')}/>;
    return <MessagingApp key={state} initial={state} dark={dark} setDark={setDark} onAdmin={()=>setState('admin')}/>;
  };
  return <div className="preview-shell"><header className="preview-bar"><span><Sparkles size={16}/> Design preview</span><label>State<select value={state} onChange={e=>setState(e.target.value)}>{previewStates.map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label><button onClick={()=>setDark(!dark)}>{dark?<Sun size={16}/>:<Moon size={16}/>}</button></header><div className="preview-stage">{render()}</div></div>;
}

export default function App(){
  const params=new URLSearchParams(location.search); const previewPath=location.pathname==='/design-preview';
  const [state,setState]=useState(params.get('state')||(previewPath?'chat':(location.pathname.startsWith('/admin')?'admin':'login'))); const [dark,setDark]=useState(true);
  useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light'},[dark]);
  useEffect(()=>{if(previewPath){const url=new URL(location.href);url.searchParams.set('state',state);history.replaceState({},'',url)}},[state]);
  if(previewPath) return <DesignPreview state={state} setState={setState} dark={dark} setDark={setDark}/>;
  return <LiveApp/>;
}
