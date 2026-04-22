import { applyRulesDeep } from './rule-engine.js';

const HIGH_RISK_SYSTEM_MARKERS = [
  'You have persistent memory across sessions.',
  'If you\'ve discovered a new way to do something, solved a problem that could be necessary later, save it as a skill',
];

const HIGH_RISK_SYSTEM_PREFIXES = [
  '# Claude Code Persona',
];

const PROXY_MCP_TOOL_PREFIX = '__hermes_proxy_mcp__';

const OUTBOUND_TOOL_NAME_PREFIX_REWRITES = [
  ['mcp_', PROXY_MCP_TOOL_PREFIX],
];

const INBOUND_TOOL_NAME_PREFIX_REWRITES = [
  [PROXY_MCP_TOOL_PREFIX, 'mcp_'],
];

const SANITIZED_SYSTEM_SUMMARY = {
  type: 'text',
  text: 'Be a direct, capable technical assistant. Match the user\'s language, prefer concrete action, use available tools when needed, and keep replies concise and grounded.',
};

function sanitizeSystemEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return entry;
  }
  if (entry.type !== 'text' || typeof entry.text !== 'string') {
    return entry;
  }
  const text = entry.text;
  const hasHighRiskPrefix = HIGH_RISK_SYSTEM_PREFIXES.some((prefix) => text.startsWith(prefix));
  const hasHighRiskMarkers = HIGH_RISK_SYSTEM_MARKERS.every((marker) => text.includes(marker));
  if (!(hasHighRiskPrefix && hasHighRiskMarkers)) {
    return entry;
  }
  return SANITIZED_SYSTEM_SUMMARY;
}

function sanitizeSystemPayload(payload) {
  const nextPayload = { ...payload };
  const currentSystem = nextPayload.system;

  if (typeof currentSystem === 'string') {
    const candidate = sanitizeSystemEntry({ type: 'text', text: currentSystem });
    nextPayload.system = candidate.text;
    return nextPayload;
  }

  if (Array.isArray(currentSystem)) {
    nextPayload.system = currentSystem.map((entry) => sanitizeSystemEntry(entry));
    return nextPayload;
  }

  if (currentSystem && typeof currentSystem === 'object') {
    nextPayload.system = sanitizeSystemEntry(currentSystem);
  }

  return nextPayload;
}

function rewriteToolNamePrefix(name, rules) {
  if (typeof name !== 'string') {
    return name;
  }
  for (const [fromPrefix, toPrefix] of rules) {
    if (name.startsWith(fromPrefix)) {
      return `${toPrefix}${name.slice(fromPrefix.length)}`;
    }
  }
  return name;
}

function rewriteToolUseBlock(block, rules) {
  if (!block || typeof block !== 'object') {
    return block;
  }
  if (block.type !== 'tool_use' || typeof block.name !== 'string') {
    return block;
  }
  return {
    ...block,
    name: rewriteToolNamePrefix(block.name, rules),
  };
}

function rewriteMessageToolNames(message, rules) {
  if (!message || typeof message !== 'object') {
    return message;
  }
  if (!Array.isArray(message.content)) {
    return message;
  }
  return {
    ...message,
    content: message.content.map((block) => rewriteToolUseBlock(block, rules)),
  };
}

export function rewritePayloadToolNames(payload, rules) {
  const nextPayload = { ...payload };

  if (Array.isArray(nextPayload.tools)) {
    nextPayload.tools = nextPayload.tools.map((tool) => {
      if (!tool || typeof tool !== 'object' || typeof tool.name !== 'string') {
        return tool;
      }
      return {
        ...tool,
        name: rewriteToolNamePrefix(tool.name, rules),
      };
    });
  }

  if (nextPayload.tool_choice && typeof nextPayload.tool_choice === 'object' && typeof nextPayload.tool_choice.name === 'string') {
    nextPayload.tool_choice = {
      ...nextPayload.tool_choice,
      name: rewriteToolNamePrefix(nextPayload.tool_choice.name, rules),
    };
  }

  if (Array.isArray(nextPayload.messages)) {
    nextPayload.messages = nextPayload.messages.map((message) => rewriteMessageToolNames(message, rules));
  }

  if (Array.isArray(nextPayload.content)) {
    nextPayload.content = nextPayload.content.map((block) => rewriteToolUseBlock(block, rules));
  }

  if (nextPayload.content_block && typeof nextPayload.content_block === 'object') {
    nextPayload.content_block = rewriteToolUseBlock(nextPayload.content_block, rules);
  }

  return nextPayload;
}

function injectSystemPreamble(payload, systemPreamble) {
  const nextPayload = { ...payload };
  const currentSystem = nextPayload.system;

  if (currentSystem === undefined) {
    nextPayload.system = [systemPreamble];
    return nextPayload;
  }

  if (typeof currentSystem === 'string') {
    nextPayload.system = [systemPreamble, { type: 'text', text: currentSystem }];
    return nextPayload;
  }

  if (Array.isArray(currentSystem)) {
    nextPayload.system = [systemPreamble, ...currentSystem];
    return nextPayload;
  }

  nextPayload.system = [systemPreamble, currentSystem];
  return nextPayload;
}

export function rewriteOutboundJson(rawBody, rewriteConfig) {
  const payload = JSON.parse(rawBody);
  const rewrittenPayload = applyRulesDeep(payload, rewriteConfig.outboundRules);
  const sanitizedPayload = sanitizeSystemPayload(rewrittenPayload);
  const toolSafePayload = rewritePayloadToolNames(sanitizedPayload, OUTBOUND_TOOL_NAME_PREFIX_REWRITES);
  return JSON.stringify(injectSystemPreamble(toolSafePayload, rewriteConfig.systemPreamble));
}

export function rewriteInboundJson(rawBody, rewriteConfig) {
  const payload = JSON.parse(rawBody);
  const restoredToolNamesPayload = rewritePayloadToolNames(payload, INBOUND_TOOL_NAME_PREFIX_REWRITES);
  return JSON.stringify(applyRulesDeep(restoredToolNamesPayload, rewriteConfig.inboundRules));
}

export const TOOL_NAME_REWRITE_RULES = {
  outbound: OUTBOUND_TOOL_NAME_PREFIX_REWRITES,
  inbound: INBOUND_TOOL_NAME_PREFIX_REWRITES,
};
