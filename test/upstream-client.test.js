import test from 'node:test';
import assert from 'node:assert/strict';

import { UpstreamClient, UpstreamClientError } from '../src/upstream/upstream-client.js';

function createConfig(overrides = {}) {
  return {
    upstream: {
      baseUrl: 'https://api.anthropic.com',
      timeoutMs: 25,
      maxAttempts: 3,
      retryBaseDelayMs: 10,
      retryMaxDelayMs: 20,
      retryOnStatuses: [429, 500, 502, 503, 504],
      requiredBetas: ['claude-code-20250219', 'oauth-2025-04-20'],
      ...overrides,
    },
  };
}

const credentialStore = {
  async getSession() {
    return {
      accessToken: 'oauth-token',
      expiresAt: Date.now() + 60_000,
      isExpired: false,
      subscriptionType: 'max',
      credentialsPath: '/root/.claude/.credentials.json',
    };
  },
};

test('UpstreamClient injects auth and required betas', async () => {
  let seenHeaders;
  const client = new UpstreamClient({
    config: createConfig(),
    credentialStore,
    fetchImpl: async (_url, init) => {
      seenHeaders = new Headers(init.headers);
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
    },
    sleep: async () => {},
  });

  const response = await client.request({
    method: 'POST',
    urlPath: '/v1/messages',
    headers: { 'anthropic-beta': 'context-management-2025-06-27' },
    body: '{"ok":true}',
  });

  assert.equal(response.status, 200);
  assert.equal(seenHeaders.get('authorization'), 'Bearer oauth-token');
  assert.match(seenHeaders.get('anthropic-beta'), /claude-code-20250219/);
  assert.match(seenHeaders.get('anthropic-beta'), /oauth-2025-04-20/);
  assert.match(seenHeaders.get('anthropic-beta'), /context-management-2025-06-27/);
});

test('UpstreamClient retries retryable statuses and eventually succeeds', async () => {
  let attempts = 0;
  const sleeps = [];
  const client = new UpstreamClient({
    config: createConfig(),
    credentialStore,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response('upstream failed', { status: 500 });
      }
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
    },
    sleep: async (delayMs) => {
      sleeps.push(delayMs);
    },
  });

  const response = await client.request({ method: 'GET', urlPath: '/v1/models', headers: {}, body: null });
  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [10]);
});

test('UpstreamClient honors retry-after for 429 responses', async () => {
  let attempts = 0;
  const sleeps = [];
  const client = new UpstreamClient({
    config: createConfig(),
    credentialStore,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response('slow down', { status: 429, headers: { 'retry-after': '2' } });
      }
      return new Response('{}', { status: 200 });
    },
    sleep: async (delayMs) => {
      sleeps.push(delayMs);
    },
  });

  await client.request({ method: 'GET', urlPath: '/v1/messages', headers: {}, body: null });
  assert.deepEqual(sleeps, [2000]);
});

test('UpstreamClient aborts timed out requests', async () => {
  const client = new UpstreamClient({
    config: createConfig({ timeoutMs: 5, maxAttempts: 1 }),
    credentialStore,
    fetchImpl: async (_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    }),
    sleep: async () => {},
  });

  await assert.rejects(
    () => client.request({ method: 'GET', urlPath: '/v1/messages', headers: {}, body: null }),
    UpstreamClientError,
  );
});
