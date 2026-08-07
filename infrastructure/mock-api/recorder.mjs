import http from 'node:http';
// Phase 1 contract stub. Phase 5 replaces this with an SFU-integrated recorder.
http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, phase: 1, service: 'recording-worker', mode: 'mock' }));
}).listen(3002, '0.0.0.0');
