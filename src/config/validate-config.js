import { DEFAULT_CONFIG } from './defaults.js';

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function mergeObjects(base, override) {
  if (!isPlainObject(override)) {
    return clone(override ?? base);
  }

  const result = clone(base);
  for (const [key, value] of Object.entries(override)) {
    const baseValue = result[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      result[key] = mergeObjects(baseValue, value);
      continue;
    }

    result[key] = clone(value);
  }

  return result;
}

function assertString(value, path) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(`${path} must be a non-empty string`);
  }
}

function assertPositiveInteger(value, path) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ConfigError(`${path} must be a positive integer`);
  }
}

function normalizeRules(value, path) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ConfigError(`${path} must be an array of [find, replace] tuples`);
  }

  return value.map((rule, index) => {
    if (!Array.isArray(rule) || rule.length !== 2) {
      throw new ConfigError(`${path}[${index}] must contain exactly two strings`);
    }

    const [find, replace] = rule;
    assertString(find, `${path}[${index}][0]`);
    assertString(replace, `${path}[${index}][1]`);
    return [find, replace];
  });
}

function deriveInboundRules(outboundRules) {
  return outboundRules.map(([find, replace]) => [replace, find]);
}

export function validateConfig(input) {
  const merged = mergeObjects(DEFAULT_CONFIG, input ?? {});

  if (!isPlainObject(merged.listen)) {
    throw new ConfigError('listen must be an object');
  }
  assertString(merged.listen.host, 'listen.host');
  assertPositiveInteger(merged.listen.port, 'listen.port');

  if (!isPlainObject(merged.upstream)) {
    throw new ConfigError('upstream must be an object');
  }
  assertString(merged.upstream.baseUrl, 'upstream.baseUrl');
  assertPositiveInteger(merged.upstream.timeoutMs, 'upstream.timeoutMs');
  assertPositiveInteger(merged.upstream.maxAttempts, 'upstream.maxAttempts');
  assertPositiveInteger(merged.upstream.retryBaseDelayMs, 'upstream.retryBaseDelayMs');
  assertPositiveInteger(merged.upstream.retryMaxDelayMs, 'upstream.retryMaxDelayMs');
  if (!Array.isArray(merged.upstream.retryOnStatuses) || merged.upstream.retryOnStatuses.some((status) => !Number.isInteger(status))) {
    throw new ConfigError('upstream.retryOnStatuses must be an array of integers');
  }
  if (!Array.isArray(merged.upstream.requiredBetas) || merged.upstream.requiredBetas.some((beta) => typeof beta !== 'string')) {
    throw new ConfigError('upstream.requiredBetas must be an array of strings');
  }

  if (!isPlainObject(merged.credentials)) {
    throw new ConfigError('credentials must be an object');
  }
  if (merged.credentials.path !== null && merged.credentials.path !== undefined) {
    assertString(merged.credentials.path, 'credentials.path');
  }
  if (!Array.isArray(merged.credentials.searchPaths) || merged.credentials.searchPaths.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw new ConfigError('credentials.searchPaths must be an array of non-empty strings');
  }

  if (!isPlainObject(merged.rewrite)) {
    throw new ConfigError('rewrite must be an object');
  }
  if (!isPlainObject(merged.rewrite.systemPreamble)) {
    throw new ConfigError('rewrite.systemPreamble must be an object');
  }
  assertString(merged.rewrite.systemPreamble.type, 'rewrite.systemPreamble.type');
  assertString(merged.rewrite.systemPreamble.text, 'rewrite.systemPreamble.text');

  const outboundRules = normalizeRules(merged.rewrite.outboundRules, 'rewrite.outboundRules') ?? [];
  const inboundRules = normalizeRules(merged.rewrite.inboundRules, 'rewrite.inboundRules') ?? deriveInboundRules(outboundRules);
  merged.rewrite.outboundRules = outboundRules;
  merged.rewrite.inboundRules = inboundRules;

  if (!isPlainObject(merged.service)) {
    throw new ConfigError('service must be an object');
  }
  assertPositiveInteger(merged.service.maxBodyBytes, 'service.maxBodyBytes');
  assertString(merged.service.logLevel, 'service.logLevel');

  return merged;
}
