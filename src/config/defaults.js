export const DEFAULT_REQUIRED_BETAS = [
  'claude-code-20250219',
  'oauth-2025-04-20',
  'interleaved-thinking-2025-05-14',
  'context-management-2025-06-27',
  'prompt-caching-scope-2026-01-05',
  'effort-2025-11-24',
];

export const DEFAULT_SYSTEM_PREAMBLE = {
  type: 'text',
  text: 'x-anthropic-billing-header: cc_version=2.1.80.a46; cc_entrypoint=sdk-cli; cch=00000;',
};

export const DEFAULT_CONFIG = {
  listen: {
    host: '127.0.0.1',
    port: 18801,
  },
  upstream: {
    baseUrl: 'https://api.anthropic.com',
    timeoutMs: 45_000,
    maxAttempts: 3,
    retryBaseDelayMs: 250,
    retryMaxDelayMs: 1_500,
    retryOnStatuses: [429, 500, 502, 503, 504],
    requiredBetas: DEFAULT_REQUIRED_BETAS,
  },
  credentials: {
    path: null,
    searchPaths: ['~/.claude/.credentials.json', '~/.claude/credentials.json'],
  },
  rewrite: {
    systemPreamble: DEFAULT_SYSTEM_PREAMBLE,
    outboundRules: [],
    inboundRules: undefined,
  },
  service: {
    maxBodyBytes: 1024 * 1024 * 5,
    logLevel: 'info',
  },
};
