import { applyRulesDeep } from './rule-engine.js';

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
  return JSON.stringify(injectSystemPreamble(rewrittenPayload, rewriteConfig.systemPreamble));
}

export function rewriteInboundJson(rawBody, rewriteConfig) {
  const payload = JSON.parse(rawBody);
  return JSON.stringify(applyRulesDeep(payload, rewriteConfig.inboundRules));
}
