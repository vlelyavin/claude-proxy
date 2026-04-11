import { applyRulesDeep } from './rule-engine.js';

const HIGH_RISK_SYSTEM_MARKERS = [
  'You have persistent memory across sessions.',
  'If you\'ve discovered a new way to do something, solved a problem that could be necessary later, save it as a skill',
];

const HIGH_RISK_SYSTEM_PREFIXES = [
  '# Claude Code Persona',
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
  return JSON.stringify(injectSystemPreamble(sanitizedPayload, rewriteConfig.systemPreamble));
}

export function rewriteInboundJson(rawBody, rewriteConfig) {
  const payload = JSON.parse(rawBody);
  return JSON.stringify(applyRulesDeep(payload, rewriteConfig.inboundRules));
}
