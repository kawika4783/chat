import http from 'node:http';
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health') return res.end(JSON.stringify({ ok: true, phase: 1, mode: 'mock' }));
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Phase 1 mock API only' }));
});
server.listen(3001, '0.0.0.0', () => console.log('Halo mock API on :3001'));
