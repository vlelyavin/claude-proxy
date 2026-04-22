import { Transform } from 'node:stream';

import { applyRulesDeep, applyRulesToString } from './rule-engine.js';
import { rewritePayloadToolNames, TOOL_NAME_REWRITE_RULES } from './json-transform.js';

function rewriteDataPayload(payload, inboundRules) {
  if (payload === '[DONE]') {
    return payload;
  }

  try {
    const parsed = JSON.parse(payload);
    const restoredToolNamesPayload = rewritePayloadToolNames(
      parsed,
      TOOL_NAME_REWRITE_RULES.inbound.exact,
      TOOL_NAME_REWRITE_RULES.inbound.prefix,
    );
    return JSON.stringify(applyRulesDeep(restoredToolNamesPayload, inboundRules));
  } catch {
    return applyRulesToString(payload, inboundRules);
  }
}

function rewriteLine(line, inboundRules) {
  const match = line.match(/^data:(\s?)(.*)$/);
  if (!match) {
    return line;
  }

  const [, separator, payload] = match;
  return `data:${separator}${rewriteDataPayload(payload, inboundRules)}`;
}

export function createSseTransform({ inboundRules = [] } = {}) {
  let buffer = '';

  return new Transform({
    decodeStrings: false,
    transform(chunk, _encoding, callback) {
      buffer += chunk.toString();
      const pieces = buffer.split('\n');
      buffer = pieces.pop() ?? '';
      for (const piece of pieces) {
        this.push(`${rewriteLine(piece, inboundRules)}\n`);
      }
      callback();
    },
    flush(callback) {
      if (buffer.length > 0) {
        this.push(rewriteLine(buffer, inboundRules));
      }
      callback();
    },
  });
}
