export const people = [
  { id: 'maya', name: 'Maya Chen', phone: '+1 415 555 0142', avatar: null, status: 'online', state: 'Online', preview: "Sounds perfect! I’ll bring snacks.", time: '10:24 AM', unread: 2, role: 'USER', created: 'Apr 12, 2024', lastSeen: '1 min ago', email: 'maya.chen@halo.app' },
  { id: 'alex', name: 'Alex Rivera', phone: '+1 415 555 0187', avatar: null, status: 'online', state: 'Online', preview: 'Let me know if you want to join.', time: '9:41 AM', unread: 1, role: 'MODERATOR', created: 'Mar 3, 2024', lastSeen: '5 min ago', email: 'alex.rivera@halo.app' },
  { id: 'samira', name: 'Samira Patel', phone: '+1 212 555 0198', avatar: null, status: 'online', state: 'Busy', preview: 'Here’s the playlist 🎧', time: 'Yesterday', unread: 0, role: 'USER', created: 'Feb 18, 2024', lastSeen: '2 min ago', email: 'samira@halo.app' },
  { id: 'jordan-k', name: 'Jordan Kim', phone: '+1 646 555 0123', avatar: null, status: 'away', state: 'Away', preview: 'Thanks! See you then.', time: 'Yesterday', unread: 2, role: 'ADMIN', created: 'Jan 10, 2024', lastSeen: 'Just now', email: 'jordan.kim@halo.app' },
  { id: 'taylor', name: 'Taylor Brooks', phone: '+1 310 555 0166', avatar: null, status: 'offline', state: 'Offline', preview: 'You: Absolutely!', time: 'Tue', unread: 0, role: 'USER', created: 'Jan 28, 2024', lastSeen: '2 hours ago', email: 'taylor@halo.app' },
  { id: 'chris', name: 'Chris Johnson', phone: '+1 206 555 0177', avatar: null, status: 'online', state: 'Online', preview: 'Shared a photo', time: 'Mon', unread: 1, role: 'MODERATOR', created: 'Dec 22, 2023', lastSeen: '30 min ago', email: 'chris@halo.app' },
  { id: 'priya', name: 'Priya Shah', phone: '+1 713 555 0159', avatar: null, status: 'offline', state: 'Offline', preview: 'Let’s catch up soon.', time: 'Mon', unread: 0, role: 'USER', created: 'Dec 5, 2023', lastSeen: '1 day ago', email: 'priya@halo.app' },
  { id: 'david', name: 'David Park', phone: '+1 617 555 0133', avatar: null, status: 'online', state: 'Online', preview: 'You: Thanks David!', time: 'Sun', unread: 0, role: 'ADMIN', created: 'Nov 11, 2023', lastSeen: '10 min ago', email: 'david@halo.app' },
  { id: 'nina', name: 'Nina Lopez', phone: '+1 808 555 0119', avatar: null, status: 'away', state: 'Away', preview: 'That works for me 👍', time: 'Sun', unread: 0, role: 'USER', created: 'Oct 7, 2023', lastSeen: '40 min ago', email: 'nina@halo.app' },
  { id: 'liam', name: 'Liam Patel', phone: '+1 503 555 0146', avatar: null, status: 'offline', state: 'Offline', preview: 'Sent a document', time: 'Sat', unread: 0, role: 'USER', created: 'Sep 29, 2023', lastSeen: 'Yesterday', email: 'liam@halo.app' }
];

export const seedMessages = [
  { id: 1, from: 'maya', text: 'Hey Jordan! Are we still on for tomorrow’s meetup?', time: '10:02 AM' },
  { id: 2, from: 'me', text: 'Yes! I’ve got the plan locked in.', time: '10:03 AM', read: true },
  { id: 3, from: 'maya', text: 'Great! What time should I arrive?', time: '10:03 AM' },
  { id: 4, from: 'me', text: 'How about 10:30 AM at the ferry terminal?', time: '10:04 AM', read: true },
  { id: 5, from: 'maya', text: 'Perfect. What’s the plan after that?', time: '10:04 AM' },
  { id: 6, from: 'me', text: 'Ferry to the island, coffee, then the coastal trail walk. Lunch around 1:00?', time: '10:05 AM', read: true, reaction: '❤️ 1' },
  { id: 7, from: 'maya', text: 'Sounds perfect! I’ll bring snacks and water.', time: '10:06 AM', reaction: '👍 1' },
  { id: 8, from: 'me', text: 'Awesome! See you tomorrow 😊', time: '10:06 AM', read: true, reaction: '🎉 1' }
];

export const calls = [
  { name: 'Maya Chen', type: 'video', status: 'Completed', time: 'Today, 9:18 AM', duration: '18:42', avatar: people[0].avatar },
  { name: 'Alex Rivera', type: 'voice', status: 'Missed', time: 'Yesterday, 6:04 PM', duration: '—', avatar: people[1].avatar },
  { name: 'Samira Patel', type: 'voice', status: 'Completed', time: 'Mon, 2:31 PM', duration: '06:12', avatar: people[2].avatar },
  { name: 'Chris Johnson', type: 'video', status: 'Rejected', time: 'Sun, 11:02 AM', duration: '—', avatar: people[5].avatar }
];

export const recordings = [
  { id: 'rec_01J8M4N7', participants: [people[0], people[1]], started: 'Aug 6, 2026 · 9:18 AM', duration: '18:42', size: '286 MB', status: 'Ready', retention: '29 days left' },
  { id: 'rec_01J8KZQ2', participants: [people[2], people[5]], started: 'Aug 5, 2026 · 4:31 PM', duration: '42:08', size: '612 MB', status: 'Ready', retention: '28 days left' },
  { id: 'rec_01J8JAA9', participants: [people[3], people[7]], started: 'Aug 5, 2026 · 10:06 AM', duration: '07:55', size: '124 MB', status: 'Ready', retention: '28 days left' },
  { id: 'rec_01J8G1C4', participants: [people[4], people[6]], started: 'Aug 4, 2026 · 2:47 PM', duration: '31:20', size: '471 MB', status: 'Processing', retention: '—' }
];

export const previewStates = [
  ['login', 'Login'], ['register', 'Register'], ['otp', 'OTP'], ['profile-setup', 'Create profile'],
  ['chats', 'Conversation list'], ['chat', 'Active chat'], ['contacts', 'Contacts'], ['add-contact', 'Add contact'],
  ['incoming-call', 'Incoming call'], ['outgoing-call', 'Outgoing call'], ['voice-call', 'Voice call'], ['video-call', 'Video call'],
  ['call-history', 'Call history'], ['settings', 'User settings'], ['notifications', 'Notifications'],
  ['admin', 'Admin dashboard'], ['admin-users', 'Admin users'], ['admin-detail', 'Admin user detail'], ['admin-messages', 'Admin messages'], ['admin-recordings', 'Admin recordings']
];
