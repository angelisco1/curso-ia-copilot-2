const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const script = path.join(__dirname, '../../scripts/protect-constants.sh');

function invoke(input) {
  const result = spawnSync('bash', [script], {
    input,
    encoding: 'utf8',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

function event(toolArgs, toolName = 'view') {
  return JSON.stringify({ toolName, toolArgs });
}

for (const file of [
  'CONSTANTS.js',
  './CONSTANTS.js',
  '/workspace/src/CONSTANTS.js',
  'C:\\workspace\\CONSTANTS.js',
  'src/constants.js',
  'file:///workspace/CONSTANTS.js',
]) {
  test(`deniega la ruta ${file}`, () => {
    const decision = invoke(event({ path: file }));
    assert.equal(decision.permissionDecision, 'deny');
    assert.match(decision.permissionDecisionReason, /CONSTANTS\.js/);
  });
}

for (const [toolName, args] of [
  ['bash', { command: 'cat src/CONSTANTS.js' }],
  ['powershell', { command: 'Get-Content .\\CONSTANTS.js' }],
  ['rg', { pattern: 'CONSTANTS\\.js', paths: 'src' }],
  ['view', { paths: ['src/public.js', 'src/CONSTANTS.js'] }],
  ['custom_read', { nested: { filePath: 'src/CONSTANTS.js' } }],
  ['edit', { files: { 'src/CONSTANTS.js': 'replacement' } }],
  ['view', JSON.stringify({ path: 'CONSTANTS.js' })],
]) {
  test(`deniega referencias en ${toolName}: ${JSON.stringify(args)}`, () => {
    assert.equal(invoke(event(args, toolName)).permissionDecision, 'deny');
  });
}

for (const args of [
  { path: 'src/config.js' },
  { path: 'src/CONSTANTS.json' },
  { path: 'src/MY_CONSTANTS.js' },
  { path: 'src/CONSTANTS.js.example' },
  { command: 'npm test' },
  { nested: [null, 1, true, { path: 'src/index.js' }] },
  {},
  JSON.stringify({ path: 'src/index.js' }),
]) {
  test(`no modifica los permisos normales: ${JSON.stringify(args)}`, () => {
    assert.deepEqual(invoke(event(args)), {});
  });
}

for (const input of [
  '',
  '{',
  'null',
  '[]',
  '{}',
  '{}\n{}',
  JSON.stringify({ toolName: ' \t\n', toolArgs: {} }),
  JSON.stringify({ toolName: '', toolArgs: {} }),
  JSON.stringify({ toolName: 'view' }),
  event(null),
  event([]),
  event(123),
  event('not JSON'),
  event('null'),
]) {
  test(`deniega entradas invalidas: ${input}`, () => {
    const decision = invoke(input);
    assert.equal(decision.permissionDecision, 'deny');
    assert.match(decision.permissionDecisionReason, /no valida/);
  });
}

test('no refleja los argumentos sensibles en la respuesta', () => {
  const result = invoke(event({
    command: 'cat CONSTANTS.js',
    token: 'synthetic-secret-for-test',
  }));
  assert.equal(result.permissionDecision, 'deny');
  assert.doesNotMatch(JSON.stringify(result), /synthetic-secret-for-test/);
});

test('deniega la llamada si jq no esta disponible', () => {
  const result = spawnSync('bash', ['-c', 'PATH=; source "$1"', 'hook', script], {
    input: event({ path: 'src/index.js' }),
    encoding: 'utf8',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 2);
  assert.equal(result.stderr, '');
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /requiere jq/);
});

test('la configuracion registra el script en preToolUse', () => {
  const config = require('./protect-constants.json');
  assert.equal(config.version, 1);
  assert.deepEqual(config.hooks.preToolUse, [{
    type: 'command',
    command: 'bash scripts/protect-constants.sh',
    timeoutSec: 10,
  }]);
});
