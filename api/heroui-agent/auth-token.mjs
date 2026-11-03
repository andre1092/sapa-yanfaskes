import { createAuthToken } from '@heroui/agent/server';
import { createVerifier, readBody, readConfig } from './_lib/auth.mjs';

export function createHandler({ env = process.env, exchange = createAuthToken, verifierFactory = createVerifier } = {}) {
  let cachedIssuer;
  let cachedAudience;
  let verify;
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const reply = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return reply(405, { error: 'Method not allowed' });
    }
    let config;
    try { config = readConfig(env); } catch { return reply(503, { error: 'Agent unavailable' }); }
    const authorization = req.headers.authorization;
    const match = typeof authorization === 'string' && /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization);
    if (!match || authorization.length > 16384) return reply(401, { error: 'Authentication required' });
    let subject;
    try {
      if (!verify || cachedIssuer !== config.issuer || cachedAudience !== config.audience) {
        verify = verifierFactory(config);
        cachedIssuer = config.issuer;
        cachedAudience = config.audience;
      }
      subject = await verify(match[1]);
    } catch { return reply(401, { error: 'Authentication required' }); }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return reply(415, { error: 'JSON required' });
    let body;
    try { body = await readBody(req); } catch { return reply(400, { error: 'Invalid request' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'agentId') || body.agentId !== config.agentId) {
      return reply(400, { error: 'Invalid agent request' });
    }
    try {
      const credential = await exchange({ apiKey: config.apiKey, agentId: config.agentId, identity: { type: 'user', id: subject } });
      return reply(200, credential);
    } catch (error) {
      return reply(error?.status === 429 ? 429 : 503, { error: 'Agent temporarily unavailable' });
    }
  };
}

export default createHandler();
