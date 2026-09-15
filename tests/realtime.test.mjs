import assert from 'node:assert/strict';
import test from 'node:test';
import { io } from 'socket.io-client';

const baseUrl = process.env.HALO_TEST_BASE_URL;
const mockCode = process.env.MOCK_OTP_CODE || '147296';

function createClient() {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    async request(path, options = {}) {
      const response = await fetch(`${baseUrl}/api${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const body = await response.json();
      return { response, body };
    },
  };
}

async function signIn(client, phone, displayName) {
  let result = await client.request('/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) });
  assert.equal(result.response.status, 201);
  result = await client.request('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, displayName, code: result.body.developmentCode || mockCode }) });
  assert.equal(result.response.status, 200);
  return result.body.user;
}

function connect(client) {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, { path: '/socket.io', extraHeaders: { Cookie: client.cookie }, transports: ['websocket'] });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function once(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, payload => { clearTimeout(timer); resolve(payload); });
  });
}

function emitAck(socket, event, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (error, response) => {
      if (error) return reject(error);
      if (!response?.ok) return reject(new Error(response?.error || `${event} failed`));
      resolve(response);
    });
  });
}

test('two users exchange messages, typing state, and an authorized call lifecycle', { skip: !baseUrl }, async () => {
  const suffix = String(Date.now()).slice(-7);
  const aliceClient = createClient();
  const bobClient = createClient();
  const anonymousClient = createClient();
  const alice = await signIn(aliceClient, `+1555${suffix}`, 'Alice Realtime');
  const bob = await signIn(bobClient, `+1666${suffix}`, 'Bob Realtime');

  const unauthorized = await anonymousClient.request('/conversations');
  assert.equal(unauthorized.response.status, 401);

  const [aliceSocket, bobSocket] = await Promise.all([connect(aliceClient), connect(bobClient)]);
  try {
    const direct = await aliceClient.request('/conversations/direct', { method: 'POST', body: JSON.stringify({ userId: bob.id }) });
    assert.equal(direct.response.status, 201);
    const conversationId = direct.body.conversation.id;

    const typingPromise = once(bobSocket, 'typing:start');
    aliceSocket.emit('typing:start', { conversationId });
    const typing = await typingPromise;
    assert.deepEqual(typing, { conversationId, userId: alice.id });

    const messagePromise = once(bobSocket, 'message:new');
    const sent = await aliceClient.request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ clientId: `test_${Date.now()}`, text: 'Hello from the realtime integration test' }),
    });
    assert.equal(sent.response.status, 201);
    const received = await messagePromise;
    assert.equal(received.text, 'Hello from the realtime integration test');
    assert.equal(received.sender.id, alice.id);

    const persisted = await bobClient.request(`/conversations/${conversationId}/messages`);
    assert.equal(persisted.response.status, 200);
    assert.ok(persisted.body.messages.some(message => message.id === received.id));

    const gifPromise = once(bobSocket, 'message:new');
    const sentGif = await aliceClient.request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ clientId: `gif_${Date.now()}`, text: '', media: { kind: 'gif', stickerId: 'hello', name: 'Hello' } }),
    });
    assert.equal(sentGif.response.status, 201);
    const receivedGif = await gifPromise;
    assert.equal(receivedGif.text, 'GIF');
    assert.deepEqual(receivedGif.media, { kind: 'gif', stickerId: 'hello', name: 'Hello' });

    const incomingPromise = once(bobSocket, 'call:incoming');
    const initiated = await emitAck(aliceSocket, 'call:initiate', { recipientId: bob.id, type: 'voice' });
    const incoming = await incomingPromise;
    assert.equal(incoming.callId, initiated.call.callId);
    assert.equal(incoming.caller.id, alice.id);

    const acceptedPromise = once(aliceSocket, 'call:accepted');
    await emitAck(bobSocket, 'call:accept', { callId: incoming.callId });
    assert.equal((await acceptedPromise).callId, incoming.callId);

    const roomJoin = await aliceClient.request(`/calls/${incoming.callId}/join`);
    assert.equal(roomJoin.response.status, 200);
    assert.match(roomJoin.body.url, /^wss?:\/\//);
    assert.ok(roomJoin.body.token.length > 100);
    assert.equal(roomJoin.body.recordingAvailable, false);

    const forbiddenRecordings = await aliceClient.request('/admin/recordings');
    assert.equal(forbiddenRecordings.response.status, 403);

    const offer = { type: 'offer', sdp: 'v=0\r\ns=Halo integration offer\r\n' };
    const offerPromise = once(bobSocket, 'rtc:offer');
    await emitAck(aliceSocket, 'rtc:offer', { callId: incoming.callId, description: offer });
    assert.deepEqual((await offerPromise).description, offer);

    const answer = { type: 'answer', sdp: 'v=0\r\ns=Halo integration answer\r\n' };
    const answerPromise = once(aliceSocket, 'rtc:answer');
    await emitAck(bobSocket, 'rtc:answer', { callId: incoming.callId, description: answer });
    assert.deepEqual((await answerPromise).description, answer);

    const candidate = { candidate: 'candidate:1 1 UDP 1 127.0.0.1 9999 typ host', sdpMid: '0', sdpMLineIndex: 0 };
    const icePromise = once(bobSocket, 'rtc:ice');
    await emitAck(aliceSocket, 'rtc:ice', { callId: incoming.callId, candidate });
    assert.deepEqual((await icePromise).candidate, candidate);

    const connectedPromise = once(aliceSocket, 'call:connected');
    await emitAck(bobSocket, 'call:connected', { callId: incoming.callId });
    assert.equal((await connectedPromise).callId, incoming.callId);

    const endedPromise = once(bobSocket, 'call:ended');
    await emitAck(aliceSocket, 'call:end', { callId: incoming.callId, reason: 'integration-test' });
    assert.equal((await endedPromise).reason, 'integration-test');

    const callHistory = await aliceClient.request('/calls');
    assert.equal(callHistory.response.status, 200);
    assert.ok(callHistory.body.calls.some(call => call.id === incoming.callId && call.status === 'COMPLETED'));

    const disconnectIncomingPromise = once(bobSocket, 'call:incoming');
    const disconnectCall = await emitAck(aliceSocket, 'call:initiate', { recipientId: bob.id, type: 'voice' });
    await disconnectIncomingPromise;
    const disconnectAcceptedPromise = once(aliceSocket, 'call:accepted');
    await emitAck(bobSocket, 'call:accept', { callId: disconnectCall.call.callId });
    await disconnectAcceptedPromise;
    const peerEndedPromise = once(bobSocket, 'call:ended');
    aliceSocket.disconnect();
    assert.equal((await peerEndedPromise).reason, 'participant-disconnected');
  } finally {
    aliceSocket.disconnect();
    bobSocket.disconnect();
  }
});
