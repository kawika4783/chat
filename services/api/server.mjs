import http from 'node:http';
import { createHash, createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { Server as SocketServer } from 'socket.io';
import { AccessToken, EgressClient, EgressStatus, EncodedFileOutput, EncodedFileType, S3Upload } from 'livekit-server-sdk';

const prisma = new PrismaClient();
const port = Number(process.env.PORT || 3001);
const sessionSecret = process.env.SESSION_SECRET || '';
const mockOtpCode = process.env.MOCK_OTP_CODE || '147296';
const otpMode = process.env.OTP_MODE || 'mock';
const cookieSecure = process.env.COOKIE_SECURE === 'true';
const sessionCookie = 'halo_session';
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const otpLifetimeMs = 5 * 60 * 1000;
const maxJsonBytes = 2 * 1024 * 1024;
const builtInGifIds = new Set(['hello', 'laugh', 'love', 'wow', 'yes', 'party']);
const otpRateLimit = new Map();
const onlineConnections = new Map();
const livekitApiKey = process.env.LIVEKIT_API_KEY || '';
const livekitApiSecret = process.env.LIVEKIT_API_SECRET || '';
const livekitInternalUrl = process.env.LIVEKIT_INTERNAL_URL || 'http://livekit:7880';
const livekitPublicUrl = process.env.LIVEKIT_PUBLIC_URL || 'ws://localhost:7880';
const recordingEnabled = process.env.VIDEO_RECORDING_ENABLED === 'true';
const recordingBucket = process.env.RECORDING_BUCKET || 'halo-video-recordings';
const recordingRetentionDays = Number(process.env.VIDEO_RECORDING_RETENTION_DAYS || 30);
const recordingTtlSeconds = Math.min(600, Math.max(30, Number(process.env.RECORDING_SIGNED_URL_TTL_SECONDS || 120)));
const recordingAccessKey = process.env.RECORDING_STORAGE_ACCESS_KEY || '';
const recordingSecretKey = process.env.RECORDING_STORAGE_SECRET_KEY || '';
const storageInternalEndpoint = new URL(process.env.RECORDING_STORAGE_ENDPOINT || 'http://object-storage:9000');
const recordingPublicEndpoint = new URL(process.env.RECORDING_PUBLIC_ENDPOINT || 'http://localhost:9000');
const messageMediaBucket = process.env.MESSAGE_MEDIA_BUCKET || 'halo-message-media';
const messageMediaTtlSeconds = Math.min(86400, Math.max(300, Number(process.env.MESSAGE_MEDIA_SIGNED_URL_TTL_SECONDS || 3600)));
const egressClient = livekitApiKey && livekitApiSecret
  ? new EgressClient(livekitInternalUrl, livekitApiKey, livekitApiSecret, { requestTimeout: 30000 })
  : null;
const recordingStarts = new Map();

if (process.env.NODE_ENV === 'production' && sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 characters in production');
}

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > maxJsonBytes) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Request body must be valid JSON');
    error.status = 400;
    throw error;
  }
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(value => value.trim()).filter(Boolean).map(value => {
    const index = value.indexOf('=');
    return index === -1 ? [value, ''] : [value.slice(0, index), decodeURIComponent(value.slice(index + 1))];
  }));
}

function normalizePhone(value) {
  const compact = String(value || '').replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}

function safeDisplayName(value, phone) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (name.length >= 2 && name.length <= 60) return name;
  return `Halo user ${phone.slice(-4)}`;
}

function hashToken(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest();
}

function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function presignedObjectUrl(bucket, objectKey, expiresSeconds) {
  if (!recordingAccessKey || !recordingSecretKey) throw Object.assign(new Error('Recording store is not configured'), { status: 503 });
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'us-east-1';
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const canonicalUri = `/${awsEncode(bucket)}/${objectKey.split('/').map(awsEncode).join('/')}`;
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${recordingAccessKey}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.entries(query).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`).join('&');
  const canonicalRequest = `GET\n${canonicalUri}\n${canonicalQuery}\nhost:${recordingPublicEndpoint.host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${recordingSecretKey}`, dateStamp), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return `${recordingPublicEndpoint.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function presignedRecordingUrl(objectKey, expiresSeconds) {
  return presignedObjectUrl(recordingBucket, objectKey, expiresSeconds);
}

async function putObject(bucket, objectKey, data, contentType) {
  if (!recordingAccessKey || !recordingSecretKey) throw Object.assign(new Error('Media store is not configured'), { status: 503 });
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'us-east-1';
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const canonicalUri = `/${awsEncode(bucket)}/${objectKey.split('/').map(awsEncode).join('/')}`;
  const payloadHash = createHash('sha256').update(data).digest('hex');
  const canonicalHeaders = `content-type:${contentType}\nhost:${storageInternalEndpoint.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${recordingSecretKey}`, dateStamp), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const response = await fetch(`${storageInternalEndpoint.origin}${canonicalUri}`, { method: 'PUT', headers: {
    'Content-Type': contentType,
    'X-Amz-Content-Sha256': payloadHash,
    'X-Amz-Date': amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${recordingAccessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }, body: data });
  if (!response.ok) throw Object.assign(new Error('Media could not be stored'), { status: 503 });
}

function hashOtp(phone, code) {
  return createHmac('sha256', sessionSecret || 'halo-development-only').update(`${phone}:${code}`).digest('hex');
}

function sameHash(left, right) {
  const a = Buffer.from(left || '', 'hex');
  const b = Buffer.from(right || '', 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function sessionCookieHeader(token, expiresAt) {
  return `${sessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${cookieSecure ? '; Secure' : ''}`;
}

function clearSessionCookieHeader() {
  return `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSecure ? '; Secure' : ''}`;
}

function publicUser(user, includePhone = false) {
  return {
    id: user.id,
    ...(includePhone ? { phone: user.phoneE164 } : {}),
    role: user.role,
    name: user.profile?.displayName || (user.phoneE164 ? `Halo user ${user.phoneE164.slice(-4)}` : 'Halo administrator'),
    avatar: user.profile?.avatarUrl || null,
    status: user.profile?.presence?.toLowerCase() || 'offline',
    lastSeenAt: user.profile?.lastSeenAt || null,
  };
}

function readSecret(name) {
  const file = process.env[`${name}_FILE`];
  if (file) return readFileSync(file, 'utf8').trim();
  return String(process.env[name] || '');
}

function passwordDigest(password, salt = randomBytes(16).toString('hex')) {
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, encoded) {
  const [scheme, salt, expected] = String(encoded || '').split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
}

function isAdmin(user) {
  return ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);
}

function adminUser(user) {
  const latestSession = user.sessions?.[0];
  return {
    id: user.id,
    name: user.profile?.displayName || (user.phoneE164 ? `Halo user ${user.phoneE164.slice(-4)}` : user.adminCredential?.username || 'Halo administrator'),
    phone: user.phoneE164,
    username: user.adminCredential?.username || null,
    login: user.adminCredential?.username || user.phoneE164,
    role: user.role,
    status: user.disabledAt ? 'DISABLED' : user.suspendedUntil && user.suspendedUntil > new Date() ? 'SUSPENDED' : 'ACTIVE',
    presence: user.profile?.presence || 'OFFLINE',
    lastSeenAt: user.profile?.lastSeenAt,
    lastLoginAt: latestSession?.createdAt || null,
    createdAt: user.createdAt,
  };
}

function auditMetadata(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => item === undefined ? null : item));
}

async function bootstrapAdmin() {
  if (process.env.ADMIN_BOOTSTRAP_ENABLED !== 'true') return;
  const username = String(process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim().toLowerCase();
  const password = readSecret('BOOTSTRAP_ADMIN_PASSWORD');
  if (!/^[a-z0-9_.-]{4,60}$/.test(username) || password.length < 12) throw new Error('Admin bootstrap requires a valid username and a password of at least 12 characters');
  const existing = await prisma.adminCredential.findUnique({ where: { username } });
  if (existing) return;
  await prisma.user.create({
    data: {
      role: 'ADMIN',
      profile: { create: { displayName: username, presence: 'OFFLINE' } },
      adminCredential: { create: { username, passwordHash: passwordDigest(password), mustRotatePassword: true } },
    },
  });
  console.log(`Bootstrapped administrator ${username}; rotate the password after first login`);
}

async function createSession(req, userId) {
  const rawToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);
  await prisma.session.create({ data: {
    userId,
    deviceId: String(req.headers['user-agent'] || 'web').slice(0, 120),
    refreshTokenHash: hashToken(rawToken),
    tokenFamily: randomBytes(16).toString('hex'),
    ipHash: hashToken(`${sessionSecret}:${clientIp(req)}`),
    expiresAt,
  } });
  return { rawToken, expiresAt };
}

async function requireAdmin(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  if (!isAdmin(auth.user)) {
    json(res, 403, { error: 'Administrator access required' });
    return null;
  }
  return auth;
}

function roomNameFor(callId) {
  return `halo-call-${callId}`;
}

async function issueRoomToken(call, user) {
  if (!livekitApiKey || !livekitApiSecret) throw Object.assign(new Error('Media service is not configured'), { status: 503 });
  const token = new AccessToken(livekitApiKey, livekitApiSecret, { identity: user.id, name: publicUser(user).name, ttl: '15m' });
  token.addGrant({ roomJoin: true, room: call.roomName, canPublish: true, canSubscribe: true });
  return token.toJwt();
}

function recordingState(status) {
  if (status === EgressStatus.EGRESS_COMPLETE) return 'READY';
  if (status === EgressStatus.EGRESS_FAILED || status === EgressStatus.EGRESS_ABORTED) return 'FAILED';
  if (status === EgressStatus.EGRESS_ENDING) return 'PROCESSING';
  if (status === EgressStatus.EGRESS_ACTIVE) return 'RECORDING';
  return 'STARTING';
}

async function syncRecording(recording) {
  if (!egressClient || !recording.egressId || ['READY', 'FAILED', 'DELETED'].includes(recording.status)) return recording;
  const [info] = await egressClient.listEgress({ egressId: recording.egressId });
  if (!info) return recording;
  const file = info.fileResults?.[0];
  return prisma.videoRecording.update({ where: { id: recording.id }, data: {
    status: recordingState(info.status),
    errorMessage: info.error ? String(info.error).slice(0, 1000) : null,
    sizeBytes: file?.size || undefined,
    durationSeconds: file?.duration ? Number(file.duration / 1000000000n) : undefined,
    completedAt: info.status === EgressStatus.EGRESS_COMPLETE ? new Date() : undefined,
  } });
}

async function createAutomaticRecording(call) {
  if (!recordingEnabled || call.type !== 'VIDEO' || !egressClient) return null;
  const existing = await prisma.videoRecording.findFirst({ where: { callId: call.id, status: { notIn: ['FAILED', 'DELETED'] } } });
  if (existing) return existing;
  const objectKey = `recordings/${call.id}/${Date.now()}.mp4`;
  const recording = await prisma.videoRecording.create({ data: {
    callId: call.id,
    roomName: call.roomName,
    objectKey,
    encryptionKeyRef: process.env.RECORDING_KMS_KEY_ID || 'private-object-storage',
    expiresAt: new Date(Date.now() + recordingRetentionDays * 86400000),
  } });
  try {
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: objectKey,
      output: { case: 's3', value: new S3Upload({
        accessKey: recordingAccessKey,
        secret: recordingSecretKey,
        region: 'us-east-1',
        endpoint: process.env.RECORDING_STORAGE_ENDPOINT || 'http://object-storage:9000',
        bucket: recordingBucket,
        forcePathStyle: true,
      }) },
    });
    const info = await egressClient.startRoomCompositeEgress(call.roomName, output, { layout: 'grid' });
    return prisma.videoRecording.update({ where: { id: recording.id }, data: { egressId: info.egressId, status: recordingState(info.status) } });
  } catch (error) {
    await prisma.videoRecording.update({ where: { id: recording.id }, data: { status: 'FAILED', errorMessage: String(error.message || error).slice(0, 1000) } });
    throw error;
  }
}

function startAutomaticRecording(call) {
  const active = recordingStarts.get(call.id);
  if (active) return active;
  const pending = createAutomaticRecording(call).finally(() => recordingStarts.delete(call.id));
  recordingStarts.set(call.id, pending);
  return pending;
}

async function stopAutomaticRecording(callId) {
  const recording = await prisma.videoRecording.findFirst({ where: { callId, status: { in: ['STARTING', 'RECORDING'] } }, orderBy: { startedAt: 'desc' } });
  if (!recording?.egressId || !egressClient) return;
  try {
    const info = await egressClient.stopEgress(recording.egressId);
    await prisma.videoRecording.update({ where: { id: recording.id }, data: { status: recordingState(info.status) } });
  } catch (error) {
    console.error('Unable to stop recording', error);
  }
}

async function sessionFromRequest(req) {
  const token = parseCookies(req.headers.cookie)[sessionCookie];
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: hashToken(token) },
    include: { user: { include: { profile: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.disabledAt) return null;
  return { token, session, user: session.user };
}

async function requireAuth(req, res) {
  const auth = await sessionFromRequest(req);
  if (!auth) json(res, 401, { error: 'Authentication required' });
  return auth;
}

function clientIp(req) {
  if (process.env.TRUST_PROXY === 'true') return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  return req.socket.remoteAddress || 'unknown';
}

function allowOtpRequest(key) {
  const now = Date.now();
  const recent = (otpRateLimit.get(key) || []).filter(time => now - time < 10 * 60 * 1000);
  if (recent.length >= 5) return false;
  recent.push(now);
  otpRateLimit.set(key, recent);
  return true;
}

function serializeMessage(message) {
  const content = typeof message.content === 'object' && message.content ? message.content : {};
  const storedMedia = content.media && typeof content.media === 'object' ? content.media : null;
  const media = storedMedia?.objectKey ? { ...storedMedia, url: presignedObjectUrl(messageMediaBucket, storedMedia.objectKey, messageMediaTtlSeconds) } : storedMedia;
  return {
    id: message.id,
    conversationId: message.conversationId,
    clientId: message.clientId,
    text: content.text || (media?.kind === 'gif' ? 'GIF' : media ? 'Photo' : ''),
    media,
    createdAt: message.createdAt,
    sender: publicUser(message.sender),
  };
}

function serializeConversation(conversation, viewerId, contactAvatar = null) {
  const other = conversation.members.map(member => member.user).find(user => user.id !== viewerId) || conversation.members[0]?.user;
  return {
    id: conversation.id,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    participant: other ? { ...publicUser(other), avatar: contactAvatar || publicUser(other).avatar } : null,
    lastMessage: conversation.messages?.[0] ? serializeMessage(conversation.messages[0]) : null,
  };
}

const conversationInclude = {
  members: { include: { user: { include: { profile: true } } } },
  messages: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { include: { profile: true } } } },
};

let io;

async function route(req, res) {
  const url = new URL(req.url, 'http://halo.local');
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && path === '/health') {
    await prisma.$queryRaw`SELECT 1`;
    return json(res, 200, { ok: true, phase: 5, mode: 'sfu-with-optional-recording', recordingEnabled });
  }

  if (req.method === 'POST' && path === '/auth/admin/login') {
    const body = await readJson(req);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const credential = await prisma.adminCredential.findUnique({ where: { username }, include: { user: { include: { profile: true } } } });
    if (!credential || !isAdmin(credential.user) || credential.user.disabledAt || !verifyPassword(password, credential.passwordHash)) {
      return json(res, 401, { error: 'Invalid administrator credentials' });
    }
    const { rawToken, expiresAt } = await createSession(req, credential.user.id);
    await prisma.adminAuditLog.create({ data: { adminId: credential.user.id, action: 'ADMIN_LOGIN', targetType: 'SESSION', targetId: hashToken(rawToken).slice(0, 24), ipHash: hashToken(`${sessionSecret}:${clientIp(req)}`) } });
    return json(res, 200, { user: publicUser(credential.user), mustRotatePassword: credential.mustRotatePassword }, { 'Set-Cookie': sessionCookieHeader(rawToken, expiresAt) });
  }

  if (req.method === 'POST' && path === '/auth/request-otp') {
    const body = await readJson(req);
    const phone = normalizePhone(body.phone);
    if (!phone) return json(res, 400, { error: 'Enter a valid phone number in international format, such as +15551234567' });
    if (!allowOtpRequest(`${clientIp(req)}:${phone}`)) return json(res, 429, { error: 'Too many verification requests. Try again later.' });

    const code = otpMode === 'mock' ? mockOtpCode : String(randomInt(100000, 1000000));
    await prisma.otpRequest.create({
      data: { phoneE164: phone, codeHash: hashOtp(phone, code), provider: otpMode, expiresAt: new Date(Date.now() + otpLifetimeMs) },
    });
    return json(res, 201, { ok: true, expiresInSeconds: otpLifetimeMs / 1000, ...(otpMode === 'mock' ? { developmentCode: code } : {}) });
  }

  if (req.method === 'POST' && path === '/auth/verify-otp') {
    const body = await readJson(req);
    const phone = normalizePhone(body.phone);
    const code = String(body.code || '').trim();
    if (!phone || !/^\d{6}$/.test(code)) return json(res, 400, { error: 'Phone number and six-digit code are required' });

    const otp = await prisma.otpRequest.findFirst({ where: { phoneE164: phone, consumedAt: null }, orderBy: { createdAt: 'desc' } });
    if (!otp || otp.expiresAt <= new Date() || otp.attempts >= 5) return json(res, 400, { error: 'The verification code is invalid or expired' });
    await prisma.otpRequest.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    if (!sameHash(otp.codeHash, hashOtp(phone, code))) return json(res, 400, { error: 'The verification code is invalid or expired' });

    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + sessionLifetimeMs);
    const displayName = safeDisplayName(body.displayName, phone);
    const user = await prisma.$transaction(async tx => {
      const account = await tx.user.upsert({ where: { phoneE164: phone }, update: {}, create: { phoneE164: phone } });
      await tx.profile.upsert({
        where: { userId: account.id },
        update: body.displayName ? { displayName } : {},
        create: { userId: account.id, displayName },
      });
      await tx.otpRequest.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
      await tx.session.create({
        data: {
          userId: account.id,
          deviceId: String(req.headers['user-agent'] || 'web').slice(0, 120),
          refreshTokenHash: hashToken(rawToken),
          tokenFamily: randomBytes(16).toString('hex'),
          ipHash: hashToken(`${sessionSecret}:${clientIp(req)}`),
          expiresAt,
        },
      });
      return tx.user.findUnique({ where: { id: account.id }, include: { profile: true } });
    });
    return json(res, 200, { user: publicUser(user, true) }, { 'Set-Cookie': sessionCookieHeader(rawToken, expiresAt) });
  }

  if (req.method === 'GET' && path === '/auth/me') {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    return json(res, 200, { user: publicUser(auth.user, true) });
  }

  if (req.method === 'POST' && path === '/auth/logout') {
    const auth = await sessionFromRequest(req);
    if (auth) await prisma.session.update({ where: { id: auth.session.id }, data: { revokedAt: new Date() } });
    return json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookieHeader() });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const joinMatch = path.match(/^\/calls\/([^/]+)\/join$/);
  if (req.method === 'GET' && joinMatch) {
    const call = await prisma.call.findFirst({ where: {
      id: joinMatch[1],
      OR: [{ callerId: auth.user.id }, { recipientId: auth.user.id }],
      status: { in: ['ACCEPTED', 'CONNECTED'] },
    } });
    if (!call) return json(res, 404, { error: 'Active call not found' });
    const token = await issueRoomToken(call, auth.user);
    return json(res, 200, { url: livekitPublicUrl, token, roomName: call.roomName, recordingAvailable: recordingEnabled && call.type === 'VIDEO' });
  }

  if (req.method === 'GET' && path === '/admin/recordings') {
    if (!isAdmin(auth.user)) return json(res, 403, { error: 'Administrator access required' });
    const records = await prisma.videoRecording.findMany({ orderBy: { startedAt: 'desc' }, take: 100, include: { call: true } });
    const synced = await Promise.all(records.map(record => syncRecording(record).catch(() => record)));
    return json(res, 200, { recordings: synced.map(record => ({
      id: record.id,
      callId: record.callId,
      status: record.status,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes?.toString() || null,
      durationSeconds: record.durationSeconds,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      expiresAt: record.expiresAt,
      error: record.errorMessage,
    })) });
  }

  if (req.method === 'GET' && path === '/admin/users') {
    if (!isAdmin(auth.user)) return json(res, 403, { error: 'Administrator access required' });
    const query = (url.searchParams.get('query') || '').trim();
    const role = (url.searchParams.get('role') || '').trim().toUpperCase();
    const status = (url.searchParams.get('status') || '').trim().toUpperCase();
    const conditions = [];
    if (query) conditions.push({ OR: [
        { phoneE164: { contains: query.replace(/\s/g, '') } },
        { profile: { displayName: { contains: query, mode: 'insensitive' } } },
        { adminCredential: { username: { contains: query.toLowerCase(), mode: 'insensitive' } } },
    ] });
    if (['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(role)) conditions.push({ role });
    if (status === 'DISABLED') conditions.push({ disabledAt: { not: null } });
    if (status === 'SUSPENDED') conditions.push({ suspendedUntil: { gt: new Date() }, disabledAt: null });
    if (status === 'ACTIVE') conditions.push({ disabledAt: null }, { OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: new Date() } }] });
    const where = conditions.length ? { AND: conditions } : {};
    const users = await prisma.user.findMany({
      where,
      include: { profile: true, adminCredential: true, sessions: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return json(res, 200, { users: users.map(adminUser) });
  }

  const adminUserMatch = path.match(/^\/admin\/users\/([^/]+)$/);
  if (req.method === 'PATCH' && adminUserMatch) {
    if (!isAdmin(auth.user)) return json(res, 403, { error: 'Administrator access required' });
    const targetId = adminUserMatch[1];
    const body = await readJson(req);
    const target = await prisma.user.findUnique({ where: { id: targetId }, include: { profile: true, adminCredential: true, sessions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!target) return json(res, 404, { error: 'User not found' });

    const name = String(body.name ?? target.profile?.displayName ?? '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 60) return json(res, 400, { error: 'Display name must contain 2 to 60 characters' });
    const requestedRole = String(body.role ?? target.role).toUpperCase();
    const allowedRoles = auth.user.role === 'SUPER_ADMIN' ? ['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'] : ['USER', 'MODERATOR', 'ADMIN'];
    if (!allowedRoles.includes(requestedRole)) return json(res, 400, { error: 'Invalid role' });
    if (Boolean(target.adminCredential) !== ['ADMIN', 'SUPER_ADMIN'].includes(requestedRole)) {
      return json(res, 400, { error: 'Changing administrator access requires separate credential provisioning' });
    }
    const requestedStatus = String(body.status ?? (target.disabledAt ? 'DISABLED' : 'ACTIVE')).toUpperCase();
    if (!['ACTIVE', 'SUSPENDED', 'DISABLED'].includes(requestedStatus)) return json(res, 400, { error: 'Invalid account status' });
    if (targetId === auth.user.id && (requestedStatus !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(requestedRole))) {
      return json(res, 400, { error: 'You cannot disable, suspend, or demote your current administrator account' });
    }
    if (target.role === 'SUPER_ADMIN' && auth.user.role !== 'SUPER_ADMIN') return json(res, 403, { error: 'Only a super administrator can modify this account' });

    let phone = target.phoneE164;
    let username = target.adminCredential?.username || null;
    const login = String(body.login ?? username ?? phone ?? '').trim();
    if (['ADMIN', 'SUPER_ADMIN'].includes(requestedRole)) {
      username = login.toLowerCase();
      if (!/^[a-z0-9_.-]{4,60}$/.test(username)) return json(res, 400, { error: 'Administrator login must use 4 to 60 letters, numbers, dots, dashes, or underscores' });
    } else {
      phone = normalizePhone(login);
      if (!phone) return json(res, 400, { error: 'User login must be a valid international phone number' });
    }

    const previous = adminUser(target);
    try {
      const updated = await prisma.$transaction(async tx => {
        await tx.user.update({ where: { id: targetId }, data: {
          role: requestedRole,
          phoneE164: ['ADMIN', 'SUPER_ADMIN'].includes(requestedRole) ? target.phoneE164 : phone,
          disabledAt: requestedStatus === 'DISABLED' ? target.disabledAt || new Date() : null,
          suspendedUntil: requestedStatus === 'SUSPENDED' ? new Date(Date.now() + 7 * 86400000) : null,
        } });
        await tx.profile.upsert({ where: { userId: targetId }, update: { displayName: name }, create: { userId: targetId, displayName: name } });
        if (target.adminCredential && ['ADMIN', 'SUPER_ADMIN'].includes(requestedRole)) {
          await tx.adminCredential.update({ where: { userId: targetId }, data: { username } });
        }
        if (requestedStatus !== 'ACTIVE' && targetId !== auth.user.id) {
          await tx.session.updateMany({ where: { userId: targetId, revokedAt: null }, data: { revokedAt: new Date() } });
        }
        await tx.adminAuditLog.create({ data: {
          adminId: auth.user.id,
          action: 'USER_UPDATED',
          targetType: 'USER',
          targetId,
          metadata: auditMetadata({ before: { name: previous.name, login: previous.login, role: previous.role, status: previous.status }, after: { name, login, role: requestedRole, status: requestedStatus } }),
          ipHash: hashToken(`${sessionSecret}:${clientIp(req)}`),
        } });
        return tx.user.findUnique({ where: { id: targetId }, include: { profile: true, adminCredential: true, sessions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
      });
      return json(res, 200, { user: adminUser(updated) });
    } catch (error) {
      if (error.code === 'P2002') return json(res, 409, { error: 'That login is already assigned to another user' });
      throw error;
    }
  }

  if (req.method === 'GET' && path === '/admin/login-activity') {
    if (!isAdmin(auth.user)) return json(res, 403, { error: 'Administrator access required' });
    const sessions = await prisma.session.findMany({
      include: { user: { include: { profile: true, adminCredential: true } } },
      orderBy: { createdAt: 'desc' }, take: 250,
    });
    return json(res, 200, { logins: sessions.map(session => ({
      id: session.id,
      userId: session.userId,
      user: adminUser({ ...session.user, sessions: [session] }),
      timestamp: session.createdAt,
      device: session.deviceId,
      source: session.ipHash ? `Private hash ${session.ipHash.slice(0, 10)}` : 'Unavailable',
      status: session.revokedAt ? 'REVOKED' : session.expiresAt <= new Date() ? 'EXPIRED' : 'ACTIVE',
    })) });
  }

  if (req.method === 'GET' && path === '/admin/audit-log') {
    if (!isAdmin(auth.user)) return json(res, 403, { error: 'Administrator access required' });
    const events = await prisma.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 250 });
    return json(res, 200, { events });
  }

  const playbackMatch = path.match(/^\/admin\/recordings\/([^/]+)\/playback-token$/);
  if (req.method === 'POST' && playbackMatch) {
    if (!isAdmin(auth.user)) return json(res, 403, { error: 'Administrator access required' });
    if (!recordingAccessKey || !recordingSecretKey) return json(res, 503, { error: 'Recording store is not configured' });
    const body = await readJson(req);
    const reason = String(body.reason || '').trim().slice(0, 240);
    if (reason.length < 4) return json(res, 400, { error: 'An access reason is required' });
    let recording = await prisma.videoRecording.findUnique({ where: { id: playbackMatch[1] } });
    if (!recording) return json(res, 404, { error: 'Recording not found' });
    recording = await syncRecording(recording).catch(() => recording);
    if (recording.status !== 'READY' || recording.deletedAt || recording.expiresAt <= new Date()) return json(res, 409, { error: 'Recording is not available for playback' });
    const playbackUrl = presignedRecordingUrl(recording.objectKey, recordingTtlSeconds);
    await prisma.$transaction([
      prisma.recordingAccessLog.create({ data: { recordingId: recording.id, adminId: auth.user.id, action: 'PLAYBACK_URL_ISSUED', reason, ipHash: hashToken(`${sessionSecret}:${clientIp(req)}`) } }),
      prisma.adminAuditLog.create({ data: { adminId: auth.user.id, action: 'RECORDING_PLAYBACK', targetType: 'VIDEO_RECORDING', targetId: recording.id, metadata: { reason, ttlSeconds: recordingTtlSeconds }, ipHash: hashToken(`${sessionSecret}:${clientIp(req)}`) } }),
    ]);
    return json(res, 200, { playbackUrl, expiresInSeconds: recordingTtlSeconds });
  }

  if (req.method === 'GET' && path === '/users') {
    const query = (url.searchParams.get('query') || '').trim();
    const users = await prisma.user.findMany({
      where: {
        id: { not: auth.user.id }, disabledAt: null,
        ...(query ? { OR: [{ phoneE164: { contains: query.replace(/\s/g, '') } }, { profile: { displayName: { contains: query, mode: 'insensitive' } } }] } : {}),
      },
      include: { profile: true }, orderBy: { createdAt: 'desc' }, take: 20,
    });
    return json(res, 200, { users: users.map(publicUser) });
  }

  if (req.method === 'GET' && path === '/rtc/config') {
    const iceServers = [];
    const stunUrls = String(process.env.STUN_SERVER || '').split(',').map(value => value.trim()).filter(Boolean);
    if (stunUrls.length) iceServers.push({ urls: stunUrls });
    const turnUrls = String(process.env.TURN_SERVER || '').split(',').map(value => value.trim()).filter(Boolean);
    const turnUsername = process.env.TURN_USERNAME || '';
    const turnCredential = process.env.TURN_PASSWORD || '';
    if (turnUrls.length && turnUsername && turnCredential && !turnUsername.includes('replace-me') && !turnCredential.includes('replace-me')) {
      iceServers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential });
    }
    return json(res, 200, { iceServers });
  }

  if (req.method === 'GET' && path === '/calls') {
    const calls = await prisma.call.findMany({
      where: { OR: [{ callerId: auth.user.id }, { recipientId: auth.user.id }] },
      orderBy: { startedAt: 'desc' }, take: 50,
    });
    return json(res, 200, { calls });
  }

  if (req.method === 'GET' && path === '/conversations') {
    const [memberships, contacts] = await Promise.all([
      prisma.conversationMember.findMany({
        where: { userId: auth.user.id },
        include: { conversation: { include: conversationInclude } },
        orderBy: { conversation: { updatedAt: 'desc' } },
      }),
      prisma.contact.findMany({ where: { ownerId: auth.user.id }, select: { contactId: true, customAvatarUrl: true } }),
    ]);
    const contactAvatars = new Map(contacts.map(contact => [contact.contactId, contact.customAvatarUrl]));
    return json(res, 200, { conversations: memberships.map(member => {
      const other = member.conversation.members.find(entry => entry.userId !== auth.user.id)?.user;
      return serializeConversation(member.conversation, auth.user.id, contactAvatars.get(other?.id));
    }) });
  }

  if (req.method === 'POST' && path === '/conversations/direct') {
    const body = await readJson(req);
    const targetId = String(body.userId || '');
    if (!targetId || targetId === auth.user.id) return json(res, 400, { error: 'Choose another user' });
    const target = await prisma.user.findFirst({ where: { id: targetId, disabledAt: null }, select: { id: true } });
    if (!target) return json(res, 404, { error: 'User not found' });
    const directKey = [auth.user.id, targetId].sort().join(':');
    const conversation = await prisma.$transaction(async tx => {
      const record = await tx.conversation.upsert({ where: { directKey }, update: {}, create: { directKey } });
      await tx.conversationMember.createMany({ data: [{ conversationId: record.id, userId: auth.user.id }, { conversationId: record.id, userId: targetId }], skipDuplicates: true });
      await tx.contact.createMany({ data: [{ ownerId: auth.user.id, contactId: targetId }, { ownerId: targetId, contactId: auth.user.id }], skipDuplicates: true });
      return tx.conversation.findUnique({ where: { id: record.id }, include: conversationInclude });
    });
    io.in(`user:${targetId}`).socketsJoin(`conversation:${conversation.id}`);
    io.in(`user:${auth.user.id}`).socketsJoin(`conversation:${conversation.id}`);
    return json(res, 201, { conversation: serializeConversation(conversation, auth.user.id) });
  }

  const contactPhotoMatch = path.match(/^\/contacts\/([^/]+)\/photo$/);
  if (req.method === 'PUT' && contactPhotoMatch) {
    const contactId = contactPhotoMatch[1];
    if (contactId === auth.user.id) return json(res, 400, { error: 'Choose another user' });
    const body = await readJson(req);
    const photo = String(body.photo || '');
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > 80 * 1024) {
      return json(res, 400, { error: 'Choose a JPEG, PNG, or WebP image under 60 KB after resizing' });
    }
    const contactUser = await prisma.user.findFirst({ where: { id: contactId, disabledAt: null }, select: { id: true } });
    if (!contactUser) return json(res, 404, { error: 'Contact not found' });
    const contact = await prisma.contact.upsert({
      where: { ownerId_contactId: { ownerId: auth.user.id, contactId } },
      create: { ownerId: auth.user.id, contactId, customAvatarUrl: photo },
      update: { customAvatarUrl: photo },
    });
    return json(res, 200, { contactId, avatar: contact.customAvatarUrl });
  }

  const messageMatch = path.match(/^\/conversations\/([^/]+)\/messages$/);
  if (messageMatch) {
    const conversationId = messageMatch[1];
    const membership = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: auth.user.id } } });
    if (!membership) return json(res, 404, { error: 'Conversation not found' });

    if (req.method === 'GET') {
      const messages = await prisma.message.findMany({
        where: { conversationId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 100,
        include: { sender: { include: { profile: true } } },
      });
      return json(res, 200, { messages: messages.reverse().map(serializeMessage) });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const text = String(body.text || '').trim();
      const clientId = String(body.clientId || '');
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(clientId)) return json(res, 400, { error: 'A valid clientId is required' });
      let media = null;
      if (body.media && typeof body.media === 'object') {
        const kind = body.media.kind === 'gif' ? 'gif' : body.media.kind === 'image' ? 'image' : '';
        const stickerId = String(body.media.stickerId || '');
        const dataUrl = String(body.media.dataUrl || '');
        const name = String(body.media.name || '').trim().slice(0, 120);
        if (!kind) return json(res, 400, { error: 'Unsupported media type' });
        if (stickerId) {
          if (kind !== 'gif' || !builtInGifIds.has(stickerId)) return json(res, 400, { error: 'Unknown built-in GIF' });
          media = { kind, stickerId, name: name || 'GIF' };
        } else {
          const match = dataUrl.match(/^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
          if (!match || dataUrl.length > 1.9 * 1024 * 1024) return json(res, 400, { error: 'Images and GIFs must use a supported format and be smaller than 1.5 MB' });
          if ((match[1] === 'gif') !== (kind === 'gif')) return json(res, 400, { error: 'Media type does not match the uploaded file' });
          const mime = `image/${match[1]}`;
          const bytes = Buffer.from(match[2], 'base64');
          if (!bytes.length || bytes.length > 1.5 * 1024 * 1024) return json(res, 400, { error: 'Uploaded media is empty or too large' });
          const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
          const mediaId = createHash('sha256').update(`${auth.user.id}:${clientId}`).digest('hex').slice(0, 36);
          const objectKey = `messages/${conversationId}/${auth.user.id}/${mediaId}.${extension}`;
          await putObject(messageMediaBucket, objectKey, bytes, mime);
          media = { kind, objectKey, mime, name: name || (kind === 'gif' ? 'GIF' : 'Photo') };
        }
      }
      if ((!text && !media) || text.length > 4000) return json(res, 400, { error: 'Add message text or supported media' });
      let message;
      try {
        message = await prisma.$transaction(async tx => {
          const created = await tx.message.create({
            data: { conversationId, senderId: auth.user.id, clientId, type: media ? 'IMAGE' : 'TEXT', content: { text, media } },
            include: { sender: { include: { profile: true } } },
          });
          await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
          return created;
        });
      } catch (error) {
        if (error.code !== 'P2002') throw error;
        message = await prisma.message.findUnique({
          where: { senderId_clientId: { senderId: auth.user.id, clientId } },
          include: { sender: { include: { profile: true } } },
        });
      }
      const payload = serializeMessage(message);
      io.to(`conversation:${conversationId}`).emit('message:new', payload);
      return json(res, 201, { message: payload });
    }
  }

  return json(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  route(req, res).catch(error => {
    console.error(error);
    if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
    else res.end();
  });
});

io = new SocketServer(server, { path: '/socket.io', serveClient: false, maxHttpBufferSize: 64 * 1024 });

io.use(async (socket, next) => {
  try {
    const auth = await sessionFromRequest({ headers: socket.handshake.headers });
    if (!auth) return next(new Error('Authentication required'));
    socket.data.user = publicUser(auth.user);
    next();
  } catch (error) {
    next(error);
  }
});

io.on('connection', async socket => {
  const userId = socket.data.user.id;
  socket.data.activeCalls = new Set();
  socket.join(`user:${userId}`);
  const memberships = await prisma.conversationMember.findMany({ where: { userId }, select: { conversationId: true } });
  memberships.forEach(member => socket.join(`conversation:${member.conversationId}`));

  const connectionCount = (onlineConnections.get(userId) || 0) + 1;
  onlineConnections.set(userId, connectionCount);
  if (connectionCount === 1) {
    await prisma.profile.update({ where: { userId }, data: { presence: 'ONLINE', lastSeenAt: new Date() } });
    io.emit('presence:update', { userId, status: 'online' });
  }

  const emitTyping = async (event, payload) => {
    const conversationId = String(payload?.conversationId || '');
    if (!conversationId) return;
    const membership = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } }, select: { userId: true } });
    if (membership) socket.to(`conversation:${conversationId}`).emit(event, { conversationId, userId });
  };
  socket.on('typing:start', payload => emitTyping('typing:start', payload).catch(console.error));
  socket.on('typing:stop', payload => emitTyping('typing:stop', payload).catch(console.error));

  const callForParticipant = async callId => prisma.call.findFirst({
    where: { id: String(callId || ''), OR: [{ callerId: userId }, { recipientId: userId }] },
  });

  const otherParticipantId = call => call.callerId === userId ? call.recipientId : call.callerId;

  socket.on('call:initiate', async (payload, acknowledge = () => {}) => {
    try {
      const recipientId = String(payload?.recipientId || '');
      const type = payload?.type === 'video' ? 'VIDEO' : payload?.type === 'voice' ? 'VOICE' : null;
      if (!recipientId || recipientId === userId || !type) return acknowledge({ ok: false, error: 'Invalid call request' });
      const recipient = await prisma.user.findFirst({ where: { id: recipientId, disabledAt: null }, include: { profile: true } });
      if (!recipient) return acknowledge({ ok: false, error: 'User not found' });
      const recipientSockets = await io.in(`user:${recipientId}`).fetchSockets();
      if (!recipientSockets.length) return acknowledge({ ok: false, error: 'User is offline' });
      const busyCall = await prisma.call.findFirst({
        where: {
          status: { in: ['CALLING', 'RINGING', 'ACCEPTED', 'CONNECTED'] },
          OR: [{ callerId: { in: [userId, recipientId] } }, { recipientId: { in: [userId, recipientId] } }],
        },
        select: { id: true },
      });
      if (busyCall) return acknowledge({ ok: false, error: 'One of the participants is already in a call' });
      const call = await prisma.call.create({
        data: {
          callerId: userId, recipientId, type, status: 'RINGING',
          participants: { create: [{ userId }, { userId: recipientId }] },
        },
      });
      await prisma.call.update({ where: { id: call.id }, data: { roomName: roomNameFor(call.id) } });
      const event = { callId: call.id, type: type.toLowerCase(), caller: socket.data.user, startedAt: call.startedAt };
      socket.data.activeCalls.add(call.id);
      recipientSockets.forEach(recipientSocket => recipientSocket.data.activeCalls?.add(call.id));
      io.to(`user:${recipientId}`).emit('call:incoming', event);
      acknowledge({ ok: true, call: event });
    } catch (error) {
      console.error(error);
      acknowledge({ ok: false, error: 'Unable to start call' });
    }
  });

  socket.on('call:accept', async (payload, acknowledge = () => {}) => {
    try {
      const call = await callForParticipant(payload?.callId);
      if (!call || call.recipientId !== userId || !['RINGING', 'CALLING'].includes(call.status)) return acknowledge({ ok: false, error: 'Call is no longer available' });
      const accepted = await prisma.call.update({ where: { id: call.id }, data: { status: 'ACCEPTED' } });
      socket.data.activeCalls.add(call.id);
      io.to(`user:${call.callerId}`).emit('call:accepted', { callId: call.id, acceptedAt: new Date() });
      acknowledge({ ok: true, call: { callId: accepted.id, type: accepted.type.toLowerCase() } });
    } catch (error) {
      console.error(error);
      acknowledge({ ok: false, error: 'Unable to accept call' });
    }
  });

  socket.on('call:reject', async (payload, acknowledge = () => {}) => {
    try {
      const call = await callForParticipant(payload?.callId);
      if (!call || call.recipientId !== userId || !['RINGING', 'CALLING'].includes(call.status)) return acknowledge({ ok: false, error: 'Call is no longer available' });
      await prisma.call.update({ where: { id: call.id }, data: { status: 'REJECTED', endedAt: new Date() } });
      socket.data.activeCalls.delete(call.id);
      io.to(`user:${call.callerId}`).emit('call:ended', { callId: call.id, reason: 'rejected' });
      acknowledge({ ok: true });
    } catch (error) {
      console.error(error);
      acknowledge({ ok: false, error: 'Unable to reject call' });
    }
  });

  const relayCallEvent = async (incomingEvent, outgoingEvent, payload, acknowledge = () => {}) => {
    try {
      const call = await callForParticipant(payload?.callId);
      if (!call || ['COMPLETED', 'REJECTED', 'ENDED', 'FAILED'].includes(call.status)) return acknowledge({ ok: false, error: 'Call is not active' });
      if (incomingEvent === 'rtc:ice' && JSON.stringify(payload?.candidate || {}).length > 8192) return acknowledge({ ok: false, error: 'ICE candidate is too large' });
      if (incomingEvent !== 'rtc:ice' && String(payload?.description?.sdp || '').length > 65536) return acknowledge({ ok: false, error: 'Session description is too large' });
      io.to(`user:${otherParticipantId(call)}`).emit(outgoingEvent, { callId: call.id, ...(payload.description ? { description: payload.description } : {}), ...(payload.candidate ? { candidate: payload.candidate } : {}) });
      acknowledge({ ok: true });
    } catch (error) {
      console.error(error);
      acknowledge({ ok: false, error: 'Unable to relay call signal' });
    }
  };
  socket.on('rtc:offer', (payload, acknowledge) => relayCallEvent('rtc:offer', 'rtc:offer', payload, acknowledge));
  socket.on('rtc:answer', (payload, acknowledge) => relayCallEvent('rtc:answer', 'rtc:answer', payload, acknowledge));
  socket.on('rtc:ice', (payload, acknowledge) => relayCallEvent('rtc:ice', 'rtc:ice', payload, acknowledge));

  socket.on('call:connected', async (payload, acknowledge = () => {}) => {
    try {
      const call = await callForParticipant(payload?.callId);
      if (!call || !['ACCEPTED', 'CONNECTED'].includes(call.status)) return acknowledge({ ok: false, error: 'Call is not ready' });
      const connectedAt = call.connectedAt || new Date();
      const connectedCall = call.status !== 'CONNECTED'
        ? await prisma.call.update({ where: { id: call.id }, data: { status: 'CONNECTED', connectedAt } })
        : call;
      socket.data.activeCalls.add(connectedCall.id);
      io.to(`user:${otherParticipantId(call)}`).emit('call:connected', { callId: call.id, connectedAt });
      acknowledge({ ok: true });
    } catch (error) {
      console.error(error);
      acknowledge({ ok: false, error: 'Unable to connect call' });
    }
  });

  socket.on('recording:start', async (payload, acknowledge = () => {}) => {
    try {
      if (!recordingEnabled) return acknowledge({ ok: false, error: 'Call recording is disabled on this server' });
      const call = await callForParticipant(payload?.callId);
      if (!call || call.type !== 'VIDEO' || call.status !== 'CONNECTED' || call.endedAt) return acknowledge({ ok: false, error: 'A connected video call is required' });
      const recording = await startAutomaticRecording(call);
      if (!recording) return acknowledge({ ok: false, error: 'Recording service is unavailable' });
      const event = { callId: call.id, recordingId: recording.id, startedBy: socket.data.user };
      io.to(`user:${call.callerId}`).to(`user:${call.recipientId}`).emit('recording:started', event);
      acknowledge({ ok: true, recording: event });
    } catch (error) {
      console.error('Optional recording failed', error);
      acknowledge({ ok: false, error: 'Unable to start recording' });
    }
  });

  socket.on('recording:stop', async (payload, acknowledge = () => {}) => {
    try {
      const call = await callForParticipant(payload?.callId);
      if (!call || call.type !== 'VIDEO') return acknowledge({ ok: false, error: 'Video call not found' });
      await stopAutomaticRecording(call.id);
      io.to(`user:${call.callerId}`).to(`user:${call.recipientId}`).emit('recording:stopped', { callId: call.id, stoppedBy: socket.data.user });
      acknowledge({ ok: true });
    } catch (error) {
      console.error('Unable to stop optional recording', error);
      acknowledge({ ok: false, error: 'Unable to stop recording' });
    }
  });

  socket.on('call:end', async (payload, acknowledge = () => {}) => {
    try {
      const call = await callForParticipant(payload?.callId);
      if (!call) return acknowledge({ ok: false, error: 'Call not found' });
      if (!call.endedAt) {
        const endedAt = new Date();
        const durationSeconds = call.connectedAt ? Math.max(0, Math.round((endedAt - call.connectedAt) / 1000)) : null;
        await prisma.call.update({ where: { id: call.id }, data: { status: call.connectedAt ? 'COMPLETED' : 'ENDED', endedAt, durationSeconds } });
      }
      await stopAutomaticRecording(call.id);
      socket.data.activeCalls.delete(call.id);
      io.to(`user:${otherParticipantId(call)}`).emit('call:ended', { callId: call.id, reason: String(payload?.reason || 'ended').slice(0, 40) });
      acknowledge({ ok: true });
    } catch (error) {
      console.error(error);
      acknowledge({ ok: false, error: 'Unable to end call' });
    }
  });

  socket.on('disconnect', async () => {
    const activeCallIds = [...socket.data.activeCalls];
    if (activeCallIds.length) {
      const calls = await prisma.call.findMany({ where: { id: { in: activeCallIds }, endedAt: null } });
      await Promise.all(calls.map(async call => {
        const endedAt = new Date();
        const durationSeconds = call.connectedAt ? Math.max(0, Math.round((endedAt - call.connectedAt) / 1000)) : null;
        await prisma.call.update({ where: { id: call.id }, data: { status: call.connectedAt ? 'COMPLETED' : 'ENDED', endedAt, durationSeconds } });
        await stopAutomaticRecording(call.id);
        const otherId = call.callerId === userId ? call.recipientId : call.callerId;
        io.to(`user:${otherId}`).emit('call:ended', { callId: call.id, reason: 'participant-disconnected' });
      }));
    }
    const remaining = Math.max(0, (onlineConnections.get(userId) || 1) - 1);
    if (remaining) onlineConnections.set(userId, remaining);
    else {
      onlineConnections.delete(userId);
      await prisma.profile.update({ where: { userId }, data: { presence: 'OFFLINE', lastSeenAt: new Date() } }).catch(console.error);
      io.emit('presence:update', { userId, status: 'offline' });
    }
  });
});

await bootstrapAdmin();
server.listen(port, '0.0.0.0', () => console.log(`Halo API listening on :${port}`));

async function shutdown() {
  io.close();
  server.close();
  await prisma.$disconnect();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
