import { createRemoteJWKSet, jwtVerify } from 'jose';

export function readConfig(env = process.env) {
  const domain = env.AUTH0_DOMAIN?.trim();
  const agentId = env.HEROUI_AGENT_ID?.trim();
  const apiKey = env.HEROUI_AGENT_API_KEY?.trim();
  if (!domain || !agentId || !apiKey) throw new Error('Configuration unavailable');
  // Only a configured Auth0 hostname may select the trusted issuer/JWKS.
  const issuer = new URL(`https://${domain}/`);
  if (issuer.hostname !== domain || issuer.port || issuer.username || issuer.password || issuer.pathname !== '/') {
    throw new Error('Configuration unavailable');
  }
  return { issuer: issuer.href, audience: env.AUTH0_API_AUDIENCE?.trim() || 'https://api.sapa-yanfaskes.com', agentId, apiKey };
}

export function createVerifier(config, keySet = createRemoteJWKSet(new URL('.well-known/jwks.json', config.issuer))) {
  return async token => {
    const { payload } = await jwtVerify(token, keySet, {
      issuer: config.issuer, audience: config.audience, algorithms: ['RS256'], requiredClaims: ['exp', 'sub'],
    });
    if (typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 200) throw new Error('Invalid subject');
    return payload.sub;
  };
}

export async function readBody(req) {
  const limit = 2048;
  const length = req.headers['content-length'];
  if (length !== undefined && (!/^\d+$/.test(String(length)) || Number(length) > limit)) throw new Error('Invalid body');
  // Vercel may already have parsed the bounded JSON request.
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > limit) throw new Error('Invalid body');
    return JSON.parse(raw);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error('Invalid body');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
