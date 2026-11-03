import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./assistantNavigation.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { assistantReports, resolveAssistantReport } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const session = { isAuthenticated: true, user: { sub: 'auth0|report-reader' } };

test('assistant can resolve every existing report without administration or arbitrary navigation', () => {
  const paths = Object.keys(assistantReports).map(report => resolveAssistantReport(report, session).path);
  assert.deepEqual(paths, ['/kepatuhanfkrtl', '/antrolfkrtl', '/kepatuhanfktp', '/monitoring-laras']);
  for (const report of ['user', 'integration', 'logs', '/user', 'https://example.com', '__proto__', 'constructor', null, {}]) {
    assert.throws(() => resolveAssistantReport(report, session), /tersedia/);
  }
});

test('assistant rejects a stale session and a missing subject', () => {
  assert.throws(() => resolveAssistantReport('kepatuhan_fkrtl', { isAuthenticated: false, user: session.user }), /Sesi berakhir/);
  assert.throws(() => resolveAssistantReport('kepatuhan_fkrtl', { isAuthenticated: true, user: null }), /Sesi berakhir/);
  assert.throws(() => resolveAssistantReport('kepatuhan_fkrtl', { isAuthenticated: true, user: {} }), /Sesi berakhir/);
});
