import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile(fileURLToPath(new URL('../../.env.local', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw new Error('Unable to load local environment'); }
const { default: handler } = await import('../heroui-agent/auth-token.mjs');
const port = Number(process.env.PORT || 3101);
createServer((req, res) => {
  if (req.url?.split('?')[0] === '/api/heroui-agent/auth-token') return handler(req, res);
  res.writeHead(404, { 'Cache-Control': 'no-store' });
  res.end();
}).listen(port, '127.0.0.1', () => console.log(`HeroUI token endpoint listening on http://127.0.0.1:${port}`));
