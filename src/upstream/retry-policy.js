function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(value, maximum));
}

export function calculateRetryDelay({ attempt, response, config }) {
  if (response) {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1000;
      }
    }
  }

  const delay = config.upstream.retryBaseDelayMs * (2 ** Math.max(attempt - 1, 0));
  return clamp(delay, config.upstream.retryBaseDelayMs, config.upstream.retryMaxDelayMs);
}

export function isRetryableStatus(status, config) {
  return config.upstream.retryOnStatuses.includes(status);
}
