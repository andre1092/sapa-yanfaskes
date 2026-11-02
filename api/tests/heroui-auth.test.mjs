import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { createVerifier, readConfig } from '../heroui-agent/_lib/auth.mjs';
import { createHandler } from '../heroui-agent/auth-token.mjs';

const env = { AUTH0_DOMAIN: 'tenant.auth0.com', HEROUI_AGENT_ID: 'agent-configured', HEROUI_AGENT_API_KEY: 'test-secret' };
const config = readConfig(env);
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
const verifierFactory = c => createVerifier(c, createLocalJWKSet({ keys: [{ ...jwk, kid: 'test', alg: 'RS256' }] }));
async function token(overrides = {}) {
  return new SignJWT({ sub: 'auth0|verified', iss: config.issuer, aud: config.audience, exp: Math.floor(Date.now() / 1000) + 300, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(privateKey);
}
async function invoke(handler, { method = 'POST', bearer, body = { agentId: config.agentId }, raw, contentType = 'application/json', headers = {}, parsed = false } = {}) {
  const req = Readable.from([raw ?? JSON.stringify(body)]);
  req.method = method;
  req.headers = { 'content-type': contentType, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...headers };
  if (parsed) req.body = body;
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(rawResponse) { this.body = JSON.parse(rawResponse); } };
  await handler(req, response);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  return response;
}
const handler = extra => createHandler({ env, verifierFactory, exchange: async () => ({ token: 'browser-token', expiresAt: 123 }), ...extra });

test('uses verified subject and configured agent/key only', async () => {
  let options;
  const res = await invoke(handler({ exchange: async value => { options = value; return { token: 'browser-token', expiresAt: 123 }; } }), { bearer: await token(), parsed: true });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(options, { apiKey: 'test-secret', agentId: config.agentId, identity: { type: 'user', id: 'auth0|verified' } });
  assert.deepEqual(res.body, { token: 'browser-token', expiresAt: 123 });
});

test('rejects invalid signature and untrusted JWT claims', async t => {
  const cases = [ { iss: 'https://evil.example/' }, { aud: 'other' }, { exp: 1 }, { exp: undefined }, { sub: '' }, { sub: ' ' }, { sub: 'x'.repeat(257) }, { sub: undefined } ];
  for (const claims of cases) await t.test(JSON.stringify(claims), async () => {
    assert.equal((await invoke(handler(), { bearer: await token(claims) })).statusCode, 401);
  });
  const foreign = await generateKeyPair('RS256');
  const forged = await new SignJWT({ sub: 'attacker', exp: Math.floor(Date.now()/1000) + 300, iss: config.issuer, aud: config.audience }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(foreign.privateKey);
  assert.equal((await invoke(handler(), { bearer: forged })).statusCode, 401);
});

test('requires authentication, method, JSON, and bounded exact agent body', async () => {
  assert.equal((await invoke(handler())).statusCode, 401);
  const method = await invoke(handler(), { method: 'GET' });
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.Allow, 'POST');
  const bearer = await token();
  assert.equal((await invoke(handler(), { bearer, contentType: 'text/plain' })).statusCode, 415);
  for (const body of [{ agentId: 'wrong' }, { agentId: config.agentId, userId: 'attacker' }, { agentId: config.agentId, anonymousId: 'victim' }, [], null]) {
    assert.equal((await invoke(handler(), { bearer, body })).statusCode, 400);
  }
  for (const raw of ['{', 'x'.repeat(2049)]) assert.equal((await invoke(handler(), { bearer, raw })).statusCode, 400);
  assert.equal((await invoke(handler(), { bearer, headers: { 'content-length': '99999' } })).statusCode, 400);
});

test('configuration and upstream failures are sanitized', async () => {
  assert.equal((await invoke(handler({ env: {} }))).statusCode, 503);
  for (const AUTH0_DOMAIN of ['https://tenant.auth0.com', 'tenant.auth0.com/evil', 'tenant.auth0.com:443', 'user@tenant.auth0.com']) {
    assert.throws(() => readConfig({ ...env, AUTH0_DOMAIN }));
  }
  const bearer = await token();
  for (const status of [429, 401, 500, undefined]) {
    const res = await invoke(handler({ exchange: async () => { throw Object.assign(new Error('test-secret upstream details'), { status }); } }), { bearer });
    assert.equal(res.statusCode, status === 429 ? 429 : 503);
    assert.equal(JSON.stringify(res.body).includes('secret'), false);
  }
});

test('official SDK exchanges identity and validates credential using patched Zod', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ token: 'official-browser-token', expiresAt: 2000000000 }), { status: 200 });
  };
  try {
    const res = await invoke(createHandler({ env, verifierFactory }), { bearer: await token() });
    assert.equal(res.statusCode, 200);
    assert.equal(request.url, `https://api.heroui.pro/v1/agents/${config.agentId}/auth-tokens`);
    assert.deepEqual(JSON.parse(request.options.body), { identity: { type: 'user', id: 'auth0|verified' } });
    assert.equal(request.options.headers['X-HeroUI-Agent-Key'], env.HEROUI_AGENT_API_KEY);
    assert.equal(res.body.token, 'official-browser-token');
  } finally { globalThis.fetch = originalFetch; }
});
