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

test('rewriteOutboundJson sanitizes high-risk long system prompts', () => {
  const raw = JSON.stringify({
    system: [
      {
        type: 'text',
        text: '# Claude Code Persona\n\nYou have persistent memory across sessions.\nIf you\'ve discovered a new way to do something, solved a problem that could be necessary later, save it as a skill with the skill tool.',
      },
    ],
    messages: [{ role: 'user', content: 'ping' }],
  });

  const parsed = JSON.parse(rewriteOutboundJson(raw, rewriteConfig));
  assert.deepEqual(parsed.system, [
    { type: 'text', text: 'billing-header' },
    {
      type: 'text',
      text: 'Be a direct, capable technical assistant. Match the user\'s language, prefer concrete action, use available tools when needed, and keep replies concise and grounded.',
    },
  ]);
});

test('rewriteOutboundJson rewrites mcp tool names without touching normal text', () => {
  const raw = JSON.stringify({
    system: [{ type: 'text', text: 'OpenClaw control plane' }],
    tools: [
      {
        name: 'mcp_browser_back',
        description: 'Use mcp_browser_back to go back.',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
    ],
    tool_choice: {
      type: 'tool',
      name: 'mcp_browser_back',
    },
    messages: [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_123',
            name: 'mcp_browser_back',
            input: {},
          },
          {
            type: 'text',
            text: 'mcp_browser_back should stay visible in plain text.',
          },
        ],
      },
    ],
  });

  const parsed = JSON.parse(rewriteOutboundJson(raw, rewriteConfig));
  assert.equal(parsed.tools[0].name, '__hermes_proxy_mcp__browser_back');
  assert.equal(parsed.tool_choice.name, '__hermes_proxy_mcp__browser_back');
  assert.equal(parsed.messages[0].content[0].name, '__hermes_proxy_mcp__browser_back');
  assert.equal(parsed.tools[0].description, 'Use mcp_browser_back to go back.');
  assert.equal(parsed.messages[0].content[1].text, 'mcp_browser_back should stay visible in plain text.');
});

test('rewriteInboundJson restores rewritten tool_use names', () => {
  const raw = JSON.stringify({
    type: 'message',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_123',
        name: '__hermes_proxy_mcp__browser_back',
        input: {},
      },
      {
        type: 'text',
        text: '__hermes_proxy_mcp__browser_back should stay literal in plain text.',
      },
    ],
  });

  const parsed = JSON.parse(rewriteInboundJson(raw, rewriteConfig));
  assert.equal(parsed.content[0].name, 'mcp_browser_back');
  assert.equal(parsed.content[1].text, '__hermes_proxy_mcp__browser_back should stay literal in plain text.');
});
