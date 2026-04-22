import { applyRulesDeep } from './rule-engine.js';

const HIGH_RISK_SYSTEM_MARKERS = [
  'You have persistent memory across sessions.',
  'If you\'ve discovered a new way to do something, solved a problem that could be necessary later, save it as a skill',
];

const HIGH_RISK_SYSTEM_PREFIXES = [
  '# Claude Code Persona',
];

const CLAUDE_CODE_MCP_TOOL_PREFIX = '__cc_mcp__';

const OUTBOUND_TOOL_NAME_PREFIX_REWRITES = [
  ['mcp_', CLAUDE_CODE_MCP_TOOL_PREFIX],
];

const INBOUND_TOOL_NAME_PREFIX_REWRITES = [
  [CLAUDE_CODE_MCP_TOOL_PREFIX, 'mcp_'],
];

const OUTBOUND_TOOL_NAME_EXACT_REWRITES = new Map([
  ['memory_search', 'cc_search_memory'],
  ['memory_get', 'cc_read_memory'],
]);

const INBOUND_TOOL_NAME_EXACT_REWRITES = new Map(
  Array.from(OUTBOUND_TOOL_NAME_EXACT_REWRITES, ([fromName, toName]) => [toName, fromName]),
);

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

function rewriteToolName(name, exactRules = new Map(), prefixRules = []) {
  if (typeof name !== 'string') {
    return name;
  }

  const exactMatch = exactRules.get(name);
  if (exactMatch) {
    return exactMatch;
  }

  for (const [fromPrefix, toPrefix] of prefixRules) {
    if (name.startsWith(fromPrefix)) {
      return `${toPrefix}${name.slice(fromPrefix.length)}`;
    }
  }
  return name;
}

function rewriteToolUseBlock(block, exactRules, prefixRules) {
  if (!block || typeof block !== 'object') {
    return block;
  }
  if (block.type !== 'tool_use' || typeof block.name !== 'string') {
    return block;
  }
  return {
    ...block,
    name: rewriteToolName(block.name, exactRules, prefixRules),
  };
}

function rewriteMessageToolNames(message, exactRules, prefixRules) {
  if (!message || typeof message !== 'object') {
    return message;
  }
  if (!Array.isArray(message.content)) {
    return message;
  }
  return {
    ...message,
    content: message.content.map((block) => rewriteToolUseBlock(block, exactRules, prefixRules)),
  };
}

export function rewritePayloadToolNames(payload, exactRules = new Map(), prefixRules = []) {
  const nextPayload = { ...payload };

  if (Array.isArray(nextPayload.tools)) {
    nextPayload.tools = nextPayload.tools.map((tool) => {
      if (!tool || typeof tool !== 'object' || typeof tool.name !== 'string') {
        return tool;
      }
      return {
        ...tool,
        name: rewriteToolName(tool.name, exactRules, prefixRules),
      };
    });
  }

  if (nextPayload.tool_choice && typeof nextPayload.tool_choice === 'object' && typeof nextPayload.tool_choice.name === 'string') {
    nextPayload.tool_choice = {
      ...nextPayload.tool_choice,
      name: rewriteToolName(nextPayload.tool_choice.name, exactRules, prefixRules),
    };
  }

  if (Array.isArray(nextPayload.messages)) {
    nextPayload.messages = nextPayload.messages.map((message) => rewriteMessageToolNames(message, exactRules, prefixRules));
  }

  if (Array.isArray(nextPayload.content)) {
    nextPayload.content = nextPayload.content.map((block) => rewriteToolUseBlock(block, exactRules, prefixRules));
  }

  if (nextPayload.content_block && typeof nextPayload.content_block === 'object') {
    nextPayload.content_block = rewriteToolUseBlock(nextPayload.content_block, exactRules, prefixRules);
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
  const toolSafePayload = rewritePayloadToolNames(sanitizedPayload, OUTBOUND_TOOL_NAME_EXACT_REWRITES, OUTBOUND_TOOL_NAME_PREFIX_REWRITES);
  return JSON.stringify(injectSystemPreamble(toolSafePayload, rewriteConfig.systemPreamble));
}

export function rewriteInboundJson(rawBody, rewriteConfig) {
  const payload = JSON.parse(rawBody);
  const restoredToolNamesPayload = rewritePayloadToolNames(payload, INBOUND_TOOL_NAME_EXACT_REWRITES, INBOUND_TOOL_NAME_PREFIX_REWRITES);
  return JSON.stringify(applyRulesDeep(restoredToolNamesPayload, rewriteConfig.inboundRules));
}

export const TOOL_NAME_REWRITE_RULES = {
  outbound: {
    exact: OUTBOUND_TOOL_NAME_EXACT_REWRITES,
    prefix: OUTBOUND_TOOL_NAME_PREFIX_REWRITES,
  },
  inbound: {
    exact: INBOUND_TOOL_NAME_EXACT_REWRITES,
    prefix: INBOUND_TOOL_NAME_PREFIX_REWRITES,
  },
};
