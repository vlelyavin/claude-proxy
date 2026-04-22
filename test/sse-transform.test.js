import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createSseTransform } from '../src/rewrite/sse-transform.js';

async function readAll(stream) {
  let output = '';
  for await (const chunk of stream) {
    output += chunk.toString();
  }
  return output;
}

test('createSseTransform rewrites JSON data lines and preserves framing', async () => {
  const source = Readable.from([
    'event: content_block_delta\n',
    'data: {"delta":{"text":"WorkspaceBot task_create"}}\n\n',
    'data: [DONE]\n\n',
  ]);

  const transform = createSseTransform({
    inboundRules: [
      ['WorkspaceBot', 'OpenClaw'],
      ['task_create', 'sessions_spawn'],
    ],
  });

  const output = await readAll(source.pipe(transform));
  assert.match(output, /OpenClaw sessions_spawn/);
  assert.match(output, /data: \[DONE\]/);
  assert.match(output, /event: content_block_delta/);
});

test('createSseTransform handles chunk boundaries inside a data line', async () => {
  const source = Readable.from([
    'data: {"delta":{"text":"Workspace',
    'Bot task_create"}}\n\n',
  ]);

  const transform = createSseTransform({
    inboundRules: [
      ['WorkspaceBot', 'OpenClaw'],
      ['task_create', 'sessions_spawn'],
    ],
  });

  const output = await readAll(source.pipe(transform));
  assert.match(output, /OpenClaw sessions_spawn/);
});

test('createSseTransform restores rewritten tool_use names in JSON events', async () => {
  const source = Readable.from([
    'event: content_block_start\n',
    'data: {"type":"content_block_start","content_block":{"type":"tool_use","id":"toolu_123","name":"__hermes_proxy_mcp__browser_back","input":{}}}\n\n',
  ]);

  const transform = createSseTransform({ inboundRules: [] });
  const output = await readAll(source.pipe(transform));

  assert.match(output, /"name":"mcp_browser_back"/);
  assert.doesNotMatch(output, /__hermes_proxy_mcp__browser_back/);
});
