import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./session.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { safeReturnTo, mapAuth0User, registerAuthSession, getSessionToken, logoutSession } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
globalThis.window = { location: { origin: 'https://sapa.example' } };

test('return path permits local routes and rejects external or ambiguous redirects', () => {
  assert.equal(safeReturnTo('/dashboard?view=rs#table'), '/dashboard?view=rs#table');
  for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '/\nevil.example', undefined]) assert.equal(safeReturnTo(path), '/');
});
test('roles require a configured HTTPS namespace and known role; identity requires sub', () => {
  assert.equal(mapAuth0User({ name: 'Local administrator' }), null);
  assert.equal(mapAuth0User({ sub: 'auth0|1', role: 'Super Admin', roles: ['Admin'] })?.role, 'viewer');
  assert.equal(mapAuth0User({ sub: 'auth0|1', roles: ['Admin'] }, 'roles')?.role, 'viewer');
  const key = 'https://sapa.example/roles';
  assert.equal(mapAuth0User({ sub: 'auth0|1', [key]: ['Admin'] }, key)?.role, 'Admin');
  assert.equal(mapAuth0User({ sub: 'auth0|1', [key]: ['owner'] }, key)?.role, 'viewer');
  assert.equal(mapAuth0User({ sub: 'auth0|1', [key]: 'Super Admin' }, key)?.role, 'viewer');
});
test('token getter fails closed outside active session and unregisters logout', async () => {
  await assert.rejects(getSessionToken());
  let loggedOut = false;
  const unregister = registerAuthSession(async () => 'sdk-token', () => { loggedOut = true; });
  assert.equal(await getSessionToken(), 'sdk-token');
  logoutSession();
  assert.equal(loggedOut, true);
  unregister();
  await assert.rejects(getSessionToken());
});
