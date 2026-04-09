import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG } from '../src/config/defaults.js';
import { ConfigError, validateConfig } from '../src/config/validate-config.js';
import { loadConfig } from '../src/config/load-config.js';

test('DEFAULT_CONFIG exposes sane local relay defaults', () => {
  assert.equal(DEFAULT_CONFIG.listen.host, '127.0.0.1');
  assert.equal(DEFAULT_CONFIG.listen.port, 18801);
  assert.equal(DEFAULT_CONFIG.upstream.baseUrl, 'https://api.anthropic.com');
  assert.equal(DEFAULT_CONFIG.service.maxBodyBytes, 1024 * 1024 * 5);
  assert.ok(Array.isArray(DEFAULT_CONFIG.upstream.requiredBetas));
});

test('validateConfig rejects invalid listen port', () => {
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, listen: { ...DEFAULT_CONFIG.listen, port: 0 } }),
    ConfigError,
  );
});

test('validateConfig auto-derives inbound rules from outbound rules when omitted', () => {
  const config = validateConfig({
    ...DEFAULT_CONFIG,
    rewrite: {
      ...DEFAULT_CONFIG.rewrite,
      outboundRules: [
        ['OpenClaw', 'WorkspaceBot'],
        ['sessions_spawn', 'task_create'],
      ],
      inboundRules: undefined,
    },
  });

  assert.deepEqual(config.rewrite.inboundRules, [
    ['WorkspaceBot', 'OpenClaw'],
    ['task_create', 'sessions_spawn'],
  ]);
});

test('loadConfig reads explicit config path and merges defaults', async () => {
  const seenPaths = [];
  const config = await loadConfig({
    argv: ['node', 'src/cli.js', '--config', '/tmp/custom.json'],
    cwd: '/project',
    readFile: async (path) => {
      seenPaths.push(path);
      assert.equal(path, '/tmp/custom.json');
      return JSON.stringify({
        listen: { port: 19999 },
        rewrite: {
          outboundRules: [['OpenClaw', 'WorkspaceBot']],
        },
      });
    },
    fileExists: async (path) => path === '/tmp/custom.json',
  });

  assert.deepEqual(seenPaths, ['/tmp/custom.json']);
  assert.equal(config.listen.host, '127.0.0.1');
  assert.equal(config.listen.port, 19999);
  assert.deepEqual(config.rewrite.inboundRules, [['WorkspaceBot', 'OpenClaw']]);
});

test('loadConfig falls back to cwd config.json when present', async () => {
  const config = await loadConfig({
    argv: ['node', 'src/cli.js'],
    cwd: '/workspace',
    readFile: async (path) => {
      assert.equal(path, '/workspace/config.json');
      return JSON.stringify({ service: { maxBodyBytes: 2048 } });
    },
    fileExists: async (path) => path === '/workspace/config.json',
  });

  assert.equal(config.service.maxBodyBytes, 2048);
  assert.equal(config.listen.port, DEFAULT_CONFIG.listen.port);
});
