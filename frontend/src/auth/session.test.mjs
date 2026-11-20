import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./session.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { safeReturnTo, mapAuth0User, registerAuthSession, getSessionToken, logoutSession, aturModeSesi, modeSesi, registerCookieSession, pastikanSesi, mapSesiBff } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
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

test('sesi cookie dipetakan dari label peran server; peran tak dikenal menjadi viewer', () => {
  assert.equal(mapSesiBff({ masuk: false }), null);
  assert.equal(mapSesiBff({ masuk: 'true', peran: 'admin' }), null);
  assert.equal(mapSesiBff(null), null);
  const roles = { super_admin: 'Super Admin', admin: 'Admin', viewer: 'viewer', petugas_rs: 'Petugas RS', '': 'viewer', owner: 'viewer', 'Super Admin': 'viewer' };
  for (const [peran, label] of Object.entries(roles)) assert.equal(mapSesiBff({ masuk: true, peran })?.role, label, peran);
  const user = mapSesiBff({ masuk: true, peran: 'petugas_rs', nama: '  Petugas Uji  ' });
  assert.equal(user.name, 'Petugas Uji');
  assert.equal(user.email, '');
  assert.ok(user.id && user.sub);
  assert.equal(mapSesiBff({ masuk: true, peran: 'admin' }).name, 'Pengguna SAPA');
});
test('mode bff: getSessionToken tetap gagal tertutup, keluar lewat pengendali cookie', async () => {
  aturModeSesi('bff');
  assert.equal(modeSesi(), 'bff');
  await assert.rejects(pastikanSesi());
  let keluar = 0;
  const lepas = registerCookieSession(() => { keluar += 1; });
  await pastikanSesi();
  await assert.rejects(getSessionToken(), 'tidak ada token di browser');
  logoutSession();
  assert.equal(keluar, 1);
  lepas();
  await assert.rejects(pastikanSesi());
  aturModeSesi('auth0');
  await assert.rejects(pastikanSesi());
  const lepasAuth0 = registerAuthSession(async () => 'sdk-token', () => {});
  await pastikanSesi();
  lepasAuth0();
  aturModeSesi(null);
});
