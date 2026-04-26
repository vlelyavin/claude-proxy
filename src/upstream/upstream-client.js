import { calculateRetryDelay, isRetryableStatus } from './retry-policy.js';

export class UpstreamClientError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'UpstreamClientError';
  }
}

function mergeBetaHeaders(existingValue, requiredBetas) {
  const current = new Set(
    String(existingValue ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  for (const beta of requiredBetas) {
    current.add(beta);
  }

  return Array.from(current).join(',');
}

function sanitizeHeaders(headers, token, requiredBetas) {
  const sanitized = new Headers();
  const inputHeaders = headers instanceof Headers ? headers : new Headers(headers);

  for (const [key, value] of inputHeaders.entries()) {
    const normalized = key.toLowerCase();
    if (['host', 'connection', 'content-length', 'transfer-encoding', 'authorization', 'x-api-key'].includes(normalized)) {
      continue;
    }
    sanitized.set(key, value);
  }

  sanitized.set('authorization', `Bearer ${token}`);
  sanitized.set('accept-encoding', 'identity');
  sanitized.set('anthropic-beta', mergeBetaHeaders(sanitized.get('anthropic-beta'), requiredBetas));
  return sanitized;
}

function createTimeoutSignal(timeoutMs, incomingSignal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!incomingSignal) {
    return timeoutSignal;
  }
  return AbortSignal.any([incomingSignal, timeoutSignal]);
}

async function defaultSleep(delayMs) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export class UpstreamClient {
  constructor({
    config,
    credentialStore,
    fetchImpl = fetch,
    sleep = defaultSleep,
    logger = null,
  }) {
    this.config = config;
    this.credentialStore = credentialStore;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.logger = logger;
  }

  async request({ method, urlPath, headers = {}, body = null, signal } = {}) {
    const url = new URL(urlPath, this.config.upstream.baseUrl);
    let lastError = null;

    for (let attempt = 1; attempt <= this.config.upstream.maxAttempts; attempt += 1) {
      const session = await this.credentialStore.getSession();
      const requestHeaders = sanitizeHeaders(headers, session.accessToken, this.config.upstream.requiredBetas);

      try {
        const response = await this.fetchImpl(url, {
          method,
          headers: requestHeaders,
          body,
          signal: createTimeoutSignal(this.config.upstream.timeoutMs, signal),
        });

        if (!isRetryableStatus(response.status, this.config) || attempt === this.config.upstream.maxAttempts) {
          return response;
        }

        const delayMs = calculateRetryDelay({ attempt, response, config: this.config });
        this.logger?.warn?.('upstream.retry.status', { attempt, status: response.status, delayMs });
        await this.sleep(delayMs);
      } catch (error) {
        lastError = error;
        if (attempt === this.config.upstream.maxAttempts) {
          break;
        }

        const delayMs = calculateRetryDelay({ attempt, response: null, config: this.config });
        this.logger?.warn?.('upstream.retry.error', { attempt, delayMs, error: error.message });
        await this.sleep(delayMs);
      }
    }

    throw new UpstreamClientError(`Upstream request failed after ${this.config.upstream.maxAttempts} attempt(s)`, { cause: lastError });
  }
}
