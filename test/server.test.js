import test from 'node:test';
import assert from 'node:assert/strict';

import { createServer } from '../src/server/create-server.js';
import { UpstreamClientError } from '../src/upstream/upstream-client.js';

const config = {
  listen: { host: '127.0.0.1', port: 0 },
  upstream: {
    baseUrl: 'https://api.anthropic.com',
    timeoutMs: 45_000,
    maxAttempts: 3,
    retryBaseDelayMs: 250,
    retryMaxDelayMs: 1_500,
    retryOnStatuses: [429, 500, 502, 503, 504],
    requiredBetas: ['claude-code-20250219'],
  },
  credentials: { path: '/root/.claude/.credentials.json', searchPaths: [] },
  rewrite: {
    systemPreamble: { type: 'text', text: 'billing-header' },
    outboundRules: [
      ['OpenClaw', 'WorkspaceBot'],
      ['sessions_spawn', 'task_create'],
    ],
    inboundRules: [
      ['WorkspaceBot', 'OpenClaw'],
      ['task_create', 'sessions_spawn'],
    ],
  },
  service: { maxBodyBytes: 256, logLevel: 'error' },
};

const credentialStore = {
  async getSession() {
    return {
      credentialsPath: '/root/.claude/.credentials.json',
      accessToken: 'token-123',
      expiresAt: Date.now() + 60_000,
      expiresInMs: 60_000,
      isExpired: false,
      subscriptionType: 'max',
    };
  },
};

async function startServer(overrides = {}) {
  const server = createServer({
    config,
    credentialStore,
    upstreamClient: overrides.upstreamClient ?? {
      async request() {
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
    logger: overrides.logger ?? { info() {}, warn() {}, error() {}, debug() {} },
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    server,
    origin,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

test('GET /health returns runtime and credential status', async (t) => {
  const harness = await startServer();
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.origin}/health`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, 'ok');
  assert.equal(payload.credentials.subscriptionType, 'max');
});

test('proxy rewrites outbound JSON before forwarding and rewrites inbound JSON back to original terms', async (t) => {
  let seenBody;
  const harness = await startServer({
    upstreamClient: {
      async request({ body }) {
        seenBody = JSON.parse(body);
        return new Response(JSON.stringify({ delta: { text: 'WorkspaceBot will call task_create' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.origin}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system: 'OpenClaw control plane',
      messages: [{ role: 'user', content: 'sessions_spawn now' }],
    }),
  });

  assert.equal(seenBody.system[0].text, 'billing-header');
  assert.equal(seenBody.system[1].text, 'WorkspaceBot control plane');
  assert.equal(seenBody.messages[0].content, 'task_create now');

  const payload = await response.json();
  assert.equal(payload.delta.text, 'OpenClaw will call sessions_spawn');
});

test('proxy rewrites JSON requests even when the client omits a content-type header', async (t) => {
  let seenBody;
  const harness = await startServer({
    upstreamClient: {
      async request({ body }) {
        seenBody = JSON.parse(body);
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.origin}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'OpenClaw sessions_spawn' }] }),
  });

  assert.equal(response.status, 200);
  assert.equal(seenBody.messages[0].content, 'WorkspaceBot task_create');
});

test('proxy rewrites server-sent events on the way back to the client', async (t) => {
  const harness = await startServer({
    upstreamClient: {
      async request() {
        return new Response('event: message\ndata: {"delta":{"text":"WorkspaceBot task_create"}}\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      },
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.origin}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'OpenClaw' }] }),
  });

  const text = await response.text();
  assert.match(text, /OpenClaw sessions_spawn/);
});

test('proxy rejects request bodies larger than the configured maximum', async (t) => {
  let called = false;
  const harness = await startServer({
    upstreamClient: {
      async request() {
        called = true;
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.origin}/v1/messages`, {
    method: 'POST',
    body: 'x'.repeat(400),
  });

  assert.equal(response.status, 413);
  assert.equal(called, false);
});

test('proxy converts upstream client failures into 502 responses', async (t) => {
  const harness = await startServer({
    upstreamClient: {
      async request() {
        throw new UpstreamClientError('boom');
      },
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.origin}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'OpenClaw' }] }),
  });

  assert.equal(response.status, 502);
  const payload = await response.json();
  assert.match(payload.error.message, /boom/);
});

test('proxy logs upstream client failure cause and request metadata', async (t) => {
  const errors = [];
  const cause = new Error('socket hang up');
  cause.code = 'ECONNRESET';
  const harness = await startServer({
    logger: {
      info() {},
      warn() {},
      debug() {},
      error(event, metadata) {
        errors.push({ event, metadata });
      },
    },
    upstreamClient: {
      async request() {
        throw new UpstreamClientError('Upstream request failed after 1 attempt(s)', { cause });
      },
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const requestBody = JSON.stringify({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    stream: false,
    messages: [{ role: 'user', content: 'OpenClaw' }],
  });
  const response = await fetch(`${harness.origin}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: requestBody,
  });

  assert.equal(response.status, 502);
  const logEntry = errors.find((entry) => entry.event === 'upstream.failed');
  assert.ok(logEntry);
  assert.equal(logEntry.metadata.error, 'Upstream request failed after 1 attempt(s)');
  assert.equal(logEntry.metadata.causeName, 'Error');
  assert.equal(logEntry.metadata.causeMessage, 'socket hang up');
  assert.equal(logEntry.metadata.causeCode, 'ECONNRESET');
  assert.deepEqual(logEntry.metadata.causeChain, [
    { name: 'Error', message: 'socket hang up', code: 'ECONNRESET' },
  ]);
  assert.equal(logEntry.metadata.method, 'POST');
  assert.equal(logEntry.metadata.urlPath, '/v1/messages');
  assert.equal(logEntry.metadata.model, 'claude-haiku-4-5');
  assert.equal(logEntry.metadata.stream, false);
  assert.equal(logEntry.metadata.maxTokens, 512);
  assert.ok(logEntry.metadata.upstreamBodyBytes >= Buffer.byteLength(requestBody));
});

test('proxy logs nested upstream failure causes', async (t) => {
  const errors = [];
  const rootCause = new Error('connect timeout');
  rootCause.name = 'ConnectTimeoutError';
  rootCause.code = 'UND_ERR_CONNECT_TIMEOUT';
  const fetchError = new TypeError('fetch failed', { cause: rootCause });
  const harness = await startServer({
    logger: {
      info() {},
      warn() {},
      debug() {},
      error(event, metadata) {
        errors.push({ event, metadata });
      },
    },
    upstreamClient: {
      async request() {
        throw new UpstreamClientError('Upstream request failed after 1 attempt(s)', { cause: fetchError });
      },
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.origin}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5', messages: [{ role: 'user', content: 'OpenClaw' }] }),
  });

  assert.equal(response.status, 502);
  const logEntry = errors.find((entry) => entry.event === 'upstream.failed');
  assert.ok(logEntry);
  assert.equal(logEntry.metadata.causeName, 'TypeError');
  assert.equal(logEntry.metadata.causeMessage, 'fetch failed');
  assert.deepEqual(logEntry.metadata.causeChain, [
    { name: 'TypeError', message: 'fetch failed' },
    { name: 'ConnectTimeoutError', message: 'connect timeout', code: 'UND_ERR_CONNECT_TIMEOUT' },
  ]);
});

test('proxy strips query strings and redacts bearer tokens from upstream failure logs', async (t) => {
  const errors = [];
  const cause = new Error('Authorization: Bearer secret-token-1234567890 failed');
  const harness = await startServer({
    logger: {
      info() {},
      warn() {},
      debug() {},
      error(event, metadata) {
        errors.push({ event, metadata });
      },
    },
    upstreamClient: {
      async request() {
        throw new UpstreamClientError('boom', { cause });
      },
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.origin}/v1/messages?api_key=secret-query-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'OpenClaw' }] }),
  });

  assert.equal(response.status, 502);
  const logEntry = errors.find((entry) => entry.event === 'upstream.failed');
  assert.ok(logEntry);
  assert.equal(logEntry.metadata.urlPath, '/v1/messages');
  assert.doesNotMatch(JSON.stringify(logEntry.metadata), /secret-query-token/);
  assert.doesNotMatch(JSON.stringify(logEntry.metadata), /secret-token-1234567890/);
  assert.match(logEntry.metadata.causeMessage, /Bearer \[redacted\]/);
});

test('proxy sanitizes client-controlled request metadata in upstream failure logs', async (t) => {
  const errors = [];
  const harness = await startServer({
    logger: {
      info() {},
      warn() {},
      debug() {},
      error(event, metadata) {
        errors.push({ event, metadata });
      },
    },
    upstreamClient: {
      async request() {
        throw new UpstreamClientError('boom');
      },
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const secretModel = `claude\nBearer model-secret-token api_key=model-secret-key ${'x'.repeat(80)}`;
  const response = await fetch(`${harness.origin}/v1/messages/bearer/path-secret-token?ignored=query-secret`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: secretModel, messages: [{ role: 'user', content: 'OpenClaw' }] }),
  });

  assert.equal(response.status, 502);
  const logEntry = errors.find((entry) => entry.event === 'upstream.failed');
  assert.ok(logEntry);
  const serialized = JSON.stringify(logEntry.metadata);
  assert.doesNotMatch(serialized, /model-secret-token/);
  assert.doesNotMatch(serialized, /model-secret-key/);
  assert.doesNotMatch(serialized, /path-secret-token/);
  assert.doesNotMatch(serialized, /query-secret/);
  assert.ok(logEntry.metadata.model.length <= 120);
  assert.equal(logEntry.metadata.urlPath, '/v1/messages/Bearer/[redacted]');
});

test('proxy converts upstream body-read timeouts into 502 responses without crashing', async (t) => {
  const harness = await startServer({
    upstreamClient: {
      async request() {
        return {
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          async text() {
            throw new Error('The operation was aborted due to timeout');
          },
        };
      },
    },
  });
  t.after(async () => {
    await harness.close();
  });

  const response = await fetch(`${harness.origin}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'OpenClaw' }] }),
  });

  assert.equal(response.status, 502);
  const payload = await response.json();
  assert.match(payload.error.message, /Upstream response body read failed/);

  const health = await fetch(`${harness.origin}/health`);
  assert.equal(health.status, 200);
});
