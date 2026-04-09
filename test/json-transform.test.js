import test from 'node:test';
import assert from 'node:assert/strict';

import { rewriteOutboundJson, rewriteInboundJson } from '../src/rewrite/json-transform.js';

const rewriteConfig = {
  systemPreamble: {
    type: 'text',
    text: 'billing-header',
  },
  outboundRules: [
    ['OpenClaw', 'WorkspaceBot'],
    ['sessions_spawn', 'task_create'],
  ],
  inboundRules: [
    ['WorkspaceBot', 'OpenClaw'],
    ['task_create', 'sessions_spawn'],
  ],
};

test('rewriteOutboundJson injects a system preamble and rewrites nested strings', () => {
  const raw = JSON.stringify({
    system: 'OpenClaw control plane',
    messages: [
      { role: 'user', content: 'please call sessions_spawn now' },
    ],
  });

  const parsed = JSON.parse(rewriteOutboundJson(raw, rewriteConfig));
  assert.deepEqual(parsed.system, [
    { type: 'text', text: 'billing-header' },
    { type: 'text', text: 'WorkspaceBot control plane' },
  ]);
  assert.equal(parsed.messages[0].content, 'please call task_create now');
});

test('rewriteOutboundJson creates a system array when the payload does not include one', () => {
  const raw = JSON.stringify({ messages: [{ role: 'user', content: 'OpenClaw' }] });
  const parsed = JSON.parse(rewriteOutboundJson(raw, rewriteConfig));
  assert.deepEqual(parsed.system, [{ type: 'text', text: 'billing-header' }]);
  assert.equal(parsed.messages[0].content, 'WorkspaceBot');
});

test('rewriteInboundJson restores original values in structured JSON', () => {
  const raw = JSON.stringify({
    type: 'message',
    delta: { text: 'WorkspaceBot will call task_create' },
  });

  const parsed = JSON.parse(rewriteInboundJson(raw, rewriteConfig));
  assert.equal(parsed.delta.text, 'OpenClaw will call sessions_spawn');
});
